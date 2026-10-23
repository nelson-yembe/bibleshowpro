import { startPcmCapture, type PcmCapture } from "@/lib/transcription/audioCapture";
import type {
  TranscriptionCallbacks,
  TranscriptionEngine,
  TranscriptionEngineOptions,
} from "@/lib/transcription/engine";
import { encodePcmBase64 } from "@/lib/transcription/pcm";
import {
  appendBacklog,
  DEFAULT_SEGMENTER_CONFIG,
  SpeechSegmenter,
} from "@/lib/transcription/speechSegmenter";
import { cleanWhisperText } from "@/lib/transcription/whisperText";
import { tauriInvoke } from "@/lib/tauri";

const SAMPLE_RATE = DEFAULT_SEGMENTER_CONFIG.sampleRate;

function messageOf(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string" && err.trim()) return err;
  return fallback;
}

/**
 * Offline transcription through whisper.cpp, which runs in a separate worker process so a
 * native fault cannot take the presentation down (see transcription/worker.rs).
 *
 * Whisper transcribes a finished buffer rather than a stream, so audio is cut at pauses by
 * {@link SpeechSegmenter} and each segment is sent whole: every emission is a final.
 */
export class WhisperTranscriptionEngine implements TranscriptionEngine {
  private capture: PcmCapture | null = null;
  private callbacks: TranscriptionCallbacks | null = null;
  private segmenter = new SpeechSegmenter();
  private modelPath = "";
  private language = "en";
  private paused = false;
  private stopping = false;
  /** Whisper is CPU-bound, so one segment runs at a time. */
  private busy = false;
  /** Speech that arrived while a segment was running — joined, never dropped. */
  private backlog: Float32Array | null = null;

  isSupported(): boolean {
    return (
      typeof AudioContext !== "undefined" &&
      typeof navigator !== "undefined" &&
      Boolean(navigator.mediaDevices)
    );
  }

  async start(
    callbacks: TranscriptionCallbacks,
    options: TranscriptionEngineOptions,
    deviceId?: string | null,
  ): Promise<void> {
    this.callbacks = callbacks;
    this.stopping = false;
    this.paused = false;
    this.busy = false;
    this.backlog = null;
    this.segmenter = new SpeechSegmenter();

    if (!this.isSupported()) {
      callbacks.onStatus("unavailable");
      callbacks.onError("This PC cannot capture audio for offline transcription.");
      return;
    }

    const modelPath = options.config?.whisperModelPath?.trim();
    if (!modelPath) {
      callbacks.onStatus("unavailable");
      callbacks.onError("Download a Whisper model in Settings → Transcription Engine to use offline transcription.");
      return;
    }
    this.modelPath = modelPath;
    this.language = options.config?.whisperLanguage?.trim() || "en";

    // Model loading can take seconds; say so rather than look frozen.
    callbacks.onStatus("processing");
    try {
      await tauriInvoke<string>("load_whisper_model", { modelPath });
    } catch (err) {
      callbacks.onStatus("unavailable");
      callbacks.onError(messageOf(err, "Could not load the Whisper model."));
      return;
    }
    if (this.stopping) return;

    try {
      this.capture = await startPcmCapture({
        deviceId: deviceId ?? null,
        targetRate: SAMPLE_RATE,
        onFrames: (frames) => this.onFrames(frames),
        onError: (message) => callbacks.onError(message),
      });
    } catch (err) {
      void this.releaseModel();
      callbacks.onStatus("unavailable");
      callbacks.onError(messageOf(err, "Could not open the selected microphone."));
      return;
    }

    callbacks.onStatus("listening");
  }

  pause(): void {
    this.paused = true;
    this.segmenter.reset();
    this.callbacks?.onStatus("paused");
  }

  resume(): void {
    this.paused = false;
    this.callbacks?.onStatus(this.busy ? "processing" : "listening");
  }

  stop(): void {
    this.stopping = true;
    this.backlog = null;
    this.segmenter.reset();
    this.capture?.stop();
    this.capture = null;
    this.callbacks?.onStatus("stopped");
    this.callbacks = null;
    // Give the model's memory back between services; an in-flight segment simply fails.
    if (!this.busy) void this.releaseModel();
  }

  private onFrames(frames: Float32Array): void {
    if (this.stopping || this.paused) return;
    const segment = this.segmenter.push(frames);
    if (!segment) return;
    if (this.busy) {
      this.backlog = appendBacklog(this.backlog, segment);
      return;
    }
    void this.transcribe(segment);
  }

  private async transcribe(segment: Float32Array): Promise<void> {
    this.busy = true;
    if (!this.stopping && !this.paused) this.callbacks?.onStatus("processing");
    try {
      const heard = await tauriInvoke<{ text: string; language?: string | null }>("transcribe_audio_segment", {
        modelPath: this.modelPath,
        sampleRate: SAMPLE_RATE,
        pcmBase64: encodePcmBase64(segment),
        language: this.language,
      });
      const spoken = cleanWhisperText(heard?.text ?? "");
      if (spoken && !this.stopping) {
        this.callbacks?.onFinal(spoken, { language: heard?.language ?? undefined });
      }
    } catch (err) {
      // The worker restarts itself on the next request, so keep listening: one bad
      // segment should not end a service's captions.
      if (!this.stopping) this.callbacks?.onError(messageOf(err, "Whisper could not transcribe."));
    } finally {
      this.busy = false;
      const next = this.backlog;
      this.backlog = null;
      if (this.stopping) {
        void this.releaseModel();
      } else if (next) {
        void this.transcribe(next);
      } else if (!this.paused) {
        this.callbacks?.onStatus("listening");
      }
    }
  }

  private async releaseModel(): Promise<void> {
    try {
      await tauriInvoke("release_whisper_model");
    } catch {
      // Nothing to release, or no backend.
    }
  }
}
