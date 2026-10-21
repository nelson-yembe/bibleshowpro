import { openAudioInputStream } from "@/lib/transcription/audioInput";
import type {
  TranscriptionCallbacks,
  TranscriptionEngine,
  TranscriptionEngineOptions,
} from "@/lib/transcription/engine";
import {
  encodePcmBase64,
  PCM_WORKLET_PROCESSOR,
  PCM_WORKLET_URL,
} from "@/lib/transcription/pcm";
import {
  DEFAULT_SEGMENTER_CONFIG,
  SpeechSegmenter,
} from "@/lib/transcription/speechSegmenter";
import { tauriInvoke } from "@/lib/tauri";

const SAMPLE_RATE = DEFAULT_SEGMENTER_CONFIG.sampleRate;

/**
 * Offline transcription through a local whisper.cpp model in the Rust backend.
 *
 * Whisper transcribes a finished buffer rather than a stream, so audio is cut at pauses
 * by {@link SpeechSegmenter} and each segment is sent whole. That means no interim
 * results — every emission is a final.
 */
export class WhisperTranscriptionEngine implements TranscriptionEngine {
  private audioContext: AudioContext | null = null;
  private worklet: AudioWorkletNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private stream: MediaStream | null = null;
  private callbacks: TranscriptionCallbacks | null = null;
  private segmenter = new SpeechSegmenter();
  private modelPath = "";
  private paused = false;
  private stopping = false;
  /** One segment at a time: whisper is CPU-bound and queueing would fall behind. */
  private busy = false;

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
    this.segmenter.reset();

    if (!this.isSupported()) {
      callbacks.onStatus("unavailable");
      callbacks.onError("This build cannot capture audio for offline transcription.");
      return;
    }

    const modelPath = options.config?.whisperModelPath?.trim();
    if (!modelPath) {
      callbacks.onStatus("unavailable");
      callbacks.onError("Choose a Whisper model file in Settings to use offline transcription.");
      return;
    }
    this.modelPath = modelPath;

    try {
      await tauriInvoke<string>("load_whisper_model", { modelPath });
    } catch (err) {
      callbacks.onStatus("unavailable");
      callbacks.onError(
        err instanceof Error ? err.message : String(err ?? "Could not load the Whisper model."),
      );
      return;
    }

    try {
      await this.openAudio(deviceId ?? null);
    } catch (err) {
      callbacks.onStatus("unavailable");
      callbacks.onError(
        err instanceof Error ? err.message : "Could not open the selected microphone.",
      );
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
    this.callbacks?.onStatus("listening");
  }

  stop(): void {
    this.stopping = true;
    const tail = this.segmenter.flush();
    if (tail) void this.transcribe(tail);
    this.closeAudio();
    this.callbacks?.onStatus("stopped");
    this.callbacks = null;
  }

  private async openAudio(deviceId: string | null): Promise<void> {
    this.stream = await openAudioInputStream(deviceId);
    this.audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
    await this.audioContext.audioWorklet.addModule(PCM_WORKLET_URL);
    this.source = this.audioContext.createMediaStreamSource(this.stream);
    this.worklet = new AudioWorkletNode(this.audioContext, PCM_WORKLET_PROCESSOR);
    this.worklet.port.onmessage = (event: MessageEvent<Float32Array>) => {
      if (this.stopping || this.paused) return;
      const segment = this.segmenter.push(event.data);
      if (segment) void this.transcribe(segment);
    };
    this.source.connect(this.worklet);
  }

  private async transcribe(segment: Float32Array): Promise<void> {
    // Drop rather than queue: a backlog would put stale words on the projector.
    if (this.busy) return;
    this.busy = true;
    try {
      const text = await tauriInvoke<string>("transcribe_audio_segment", {
        modelPath: this.modelPath,
        sampleRate: SAMPLE_RATE,
        pcmBase64: encodePcmBase64(segment),
      });
      const trimmed = text?.trim();
      if (trimmed && !this.stopping) this.callbacks?.onFinal(trimmed);
    } catch (err) {
      this.callbacks?.onError(
        err instanceof Error ? err.message : String(err ?? "Whisper could not transcribe."),
      );
    } finally {
      this.busy = false;
    }
  }

  private closeAudio(): void {
    this.worklet?.port.close();
    this.worklet?.disconnect();
    this.source?.disconnect();
    this.stream?.getTracks().forEach((track) => track.stop());
    void this.audioContext?.close().catch(() => {});
    this.worklet = null;
    this.source = null;
    this.stream = null;
    this.audioContext = null;
  }
}
