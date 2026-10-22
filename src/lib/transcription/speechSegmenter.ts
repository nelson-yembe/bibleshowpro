/**
 * Splits a continuous microphone stream into utterance-sized segments.
 *
 * Whisper transcribes a finished buffer rather than a stream, so something has to decide
 * where one utterance ends. Cutting on a fixed clock slices words in half; cutting on a
 * pause follows the speaker.
 *
 * "Pause" is relative to the room. A fixed loudness threshold either hears a quiet laptop
 * microphone as silence or a noisy hall as speech, so the threshold follows a measured
 * noise floor instead.
 */

export interface SegmenterConfig {
  sampleRate: number;
  /** Below this the audio is silence however quiet the room is. */
  minSilenceRms: number;
  /** Ceiling on the adaptive threshold, so a loud room cannot make speech "silent". */
  maxSilenceRms: number;
  /** Speech must be this many times louder than the measured noise floor. */
  noiseMultiplier: number;
  /** Silence this long closes the segment. */
  silenceHoldMs: number;
  /** Hard cap, so an unbroken talker still produces output. */
  maxSegmentMs: number;
  /** Less speech than this is a cough, not an utterance. */
  minSegmentMs: number;
  /** Silence kept ahead of speech so the first syllable is not clipped. */
  preRollMs: number;
}

export const DEFAULT_SEGMENTER_CONFIG: SegmenterConfig = {
  sampleRate: 16000,
  minSilenceRms: 0.004,
  maxSilenceRms: 0.05,
  noiseMultiplier: 2.5,
  silenceHoldMs: 700,
  maxSegmentMs: 10000,
  minSegmentMs: 400,
  preRollMs: 300,
};

export function rmsOf(frames: Float32Array): number {
  if (frames.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < frames.length; i += 1) sum += frames[i] * frames[i];
  return Math.sqrt(sum / frames.length);
}

function framesToMs(frames: number, sampleRate: number): number {
  return (frames / sampleRate) * 1000;
}

export class SpeechSegmenter {
  private readonly config: SegmenterConfig;
  private buffered: Float32Array[] = [];
  private bufferedFrames = 0;
  private silentFrames = 0;
  private voicedFrames = 0;
  private noiseFloor: number | null = null;

  constructor(config: Partial<SegmenterConfig> = {}) {
    this.config = { ...DEFAULT_SEGMENTER_CONFIG, ...config };
  }

  /** Current loudness a frame must reach to count as speech. */
  threshold(): number {
    const { minSilenceRms, maxSilenceRms, noiseMultiplier } = this.config;
    const floor = this.noiseFloor ?? 0;
    return Math.min(maxSilenceRms, Math.max(minSilenceRms, floor * noiseMultiplier));
  }

  /** Returns a segment when one has just closed, otherwise null. */
  push(frames: Float32Array): Float32Array | null {
    if (frames.length === 0) return null;
    const rms = rmsOf(frames);

    // Judged before the floor learns from it. Before any floor exists the minimum
    // applies, so a session that starts mid-sentence still hears it; a noisy first frame
    // is merely a blip that the minimum-length rule then drops.
    const voiced = rms >= this.threshold();
    this.trackNoiseFloor(rms);

    this.buffered.push(frames);
    this.bufferedFrames += frames.length;
    if (voiced) {
      this.silentFrames = 0;
      this.voicedFrames += frames.length;
    } else {
      this.silentFrames += frames.length;
    }

    const { sampleRate, silenceHoldMs, maxSegmentMs, minSegmentMs } = this.config;
    if (this.voicedFrames === 0) {
      this.trimToPreRoll();
      return null;
    }

    const voicedMs = framesToMs(this.voicedFrames, sampleRate);
    if (framesToMs(this.bufferedFrames, sampleRate) >= maxSegmentMs) {
      // Mostly silence is not worth sending: Whisper invents text for empty audio.
      if (voicedMs < minSegmentMs) {
        this.reset();
        return null;
      }
      return this.take();
    }
    if (framesToMs(this.silentFrames, sampleRate) >= silenceHoldMs) {
      if (voicedMs >= minSegmentMs) return this.take();
      // A blip followed by a pause: drop it and go back to waiting for speech.
      this.reset();
    }
    return null;
  }

  /** Close whatever is buffered, e.g. when the operator stops listening. */
  flush(): Float32Array | null {
    if (framesToMs(this.voicedFrames, this.config.sampleRate) < this.config.minSegmentMs) {
      this.reset();
      return null;
    }
    return this.take();
  }

  /** Forget buffered audio. The noise floor is kept: the room has not changed. */
  reset(): void {
    this.buffered = [];
    this.bufferedFrames = 0;
    this.silentFrames = 0;
    this.voicedFrames = 0;
  }

  private trackNoiseFloor(rms: number): void {
    if (this.noiseFloor === null) {
      this.noiseFloor = rms;
      return;
    }
    // Fall fast, rise slowly: the gaps between words pull the floor down at once, while
    // sustained speech only nudges it, so talking cannot raise the bar on itself.
    const rate = rms < this.noiseFloor ? 0.2 : 0.002;
    this.noiseFloor += (rms - this.noiseFloor) * rate;
  }

  private trimToPreRoll(): void {
    const keep = (this.config.preRollMs / 1000) * this.config.sampleRate;
    while (this.buffered.length > 1 && this.bufferedFrames - this.buffered[0].length >= keep) {
      this.bufferedFrames -= this.buffered.shift()!.length;
    }
    this.silentFrames = this.bufferedFrames;
  }

  private take(): Float32Array {
    const merged = new Float32Array(this.bufferedFrames);
    let offset = 0;
    for (const chunk of this.buffered) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    this.reset();
    return merged;
  }
}

/** Audio that queued while a segment was being transcribed, capped to the newest. */
export const MAX_BACKLOG_SECONDS = 30;

/**
 * Join a segment onto the backlog rather than dropping it. On a PC slower than real time
 * this coalesces speech into larger segments instead of losing whole sentences; past the
 * cap the oldest audio goes, since captions about to appear should be current ones.
 */
export function appendBacklog(
  backlog: Float32Array | null,
  segment: Float32Array,
  sampleRate = DEFAULT_SEGMENTER_CONFIG.sampleRate,
): Float32Array {
  const limit = MAX_BACKLOG_SECONDS * sampleRate;
  const existing = backlog ?? new Float32Array(0);
  const joined = new Float32Array(existing.length + segment.length);
  joined.set(existing, 0);
  joined.set(segment, existing.length);
  return joined.length > limit ? joined.slice(joined.length - limit) : joined;
}
