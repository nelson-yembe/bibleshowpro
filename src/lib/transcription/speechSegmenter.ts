/**
 * Splits a continuous microphone stream into utterance-sized segments.
 *
 * Whisper transcribes a finished buffer rather than a live stream, so something has to
 * decide where one utterance ends. Cutting on a fixed clock would slice words in half;
 * cutting on a pause follows the speaker instead.
 */

export interface SegmenterConfig {
  sampleRate: number;
  /** Mean amplitude below this counts as silence. */
  silenceRms: number;
  /** Silence this long closes the segment. */
  silenceHoldMs: number;
  /** Hard cap, so an unbroken talker still produces output. */
  maxSegmentMs: number;
  /** Shorter than this is a cough, not an utterance. */
  minSegmentMs: number;
}

export const DEFAULT_SEGMENTER_CONFIG: SegmenterConfig = {
  sampleRate: 16000,
  silenceRms: 0.012,
  silenceHoldMs: 600,
  maxSegmentMs: 12000,
  minSegmentMs: 400,
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

  constructor(config: Partial<SegmenterConfig> = {}) {
    this.config = { ...DEFAULT_SEGMENTER_CONFIG, ...config };
  }

  /** Returns a segment when one has just closed, otherwise null. */
  push(frames: Float32Array): Float32Array | null {
    if (frames.length === 0) return null;
    this.buffered.push(frames);
    this.bufferedFrames += frames.length;

    if (rmsOf(frames) < this.config.silenceRms) {
      this.silentFrames += frames.length;
    } else {
      this.silentFrames = 0;
      this.voicedFrames += frames.length;
    }

    const { sampleRate, silenceHoldMs, maxSegmentMs, minSegmentMs } = this.config;
    const bufferedMs = framesToMs(this.bufferedFrames, sampleRate);
    const silentMs = framesToMs(this.silentFrames, sampleRate);
    const voicedMs = framesToMs(this.voicedFrames, sampleRate);

    if (bufferedMs >= maxSegmentMs) return this.take();
    if (silentMs >= silenceHoldMs && voicedMs >= minSegmentMs) return this.take();
    return null;
  }

  /** Close whatever is buffered, e.g. when the operator stops listening. */
  flush(): Float32Array | null {
    const voicedMs = framesToMs(this.voicedFrames, this.config.sampleRate);
    if (voicedMs < this.config.minSegmentMs) {
      this.reset();
      return null;
    }
    return this.take();
  }

  reset(): void {
    this.buffered = [];
    this.bufferedFrames = 0;
    this.silentFrames = 0;
    this.voicedFrames = 0;
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
