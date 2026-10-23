import { startPcmCapture, type PcmCapture } from "@/lib/transcription/audioCapture";
import type {
  TranscriptionCallbacks,
  TranscriptionEngine,
  TranscriptionEngineOptions,
} from "@/lib/transcription/engine";
import {
  buildAudioMessage,
  buildLiveUrl,
  buildSetupMessage,
  DEFAULT_GEMINI_MODEL,
  encodeBase64,
  floatTo16BitPcm,
  GEMINI_CHUNK_FRAMES,
  GEMINI_SAMPLE_RATE,
  parseServerMessage,
  supportsCustomVocabulary,
} from "@/lib/transcription/geminiProtocol";
import { normalizeLanguage } from "@/lib/transcription/engineConfig";
import { scriptureVocabulary } from "@/lib/transcription/scriptureVocabulary";

const MAX_RECONNECTS = 3;
const RECONNECT_DELAY_MS = 1200;

/**
 * Streams microphone audio to the Gemini Live API and reports transcripts.
 *
 * Audio leaves the building, so this belongs on a paid-tier key: free-tier traffic is
 * used for product improvement and may be read by human reviewers, which is wrong for
 * sermon and congregation audio.
 */
export class GeminiTranscriptionEngine implements TranscriptionEngine {
  private socket: WebSocket | null = null;
  private capture: PcmCapture | null = null;
  private callbacks: TranscriptionCallbacks | null = null;
  private options: TranscriptionEngineOptions | null = null;
  private deviceId: string | null = null;
  private pending: Float32Array[] = [];
  private pendingFrames = 0;
  private ready = false;
  private paused = false;
  private stopping = false;
  private reconnects = 0;
  private reconnectTimer: number | undefined;

  isSupported(): boolean {
    return (
      typeof WebSocket !== "undefined" &&
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
    this.options = options;
    this.deviceId = deviceId ?? null;
    this.stopping = false;
    this.paused = false;
    this.reconnects = 0;

    if (!this.isSupported()) {
      callbacks.onStatus("unavailable");
      callbacks.onError("This build cannot reach the Gemini Live API.");
      return;
    }

    const apiKey = options.config?.geminiApiKey?.trim();
    if (!apiKey) {
      callbacks.onStatus("unavailable");
      callbacks.onError("Add a Gemini API key in Settings to use this engine.");
      return;
    }

    try {
      await this.openAudio();
    } catch (err) {
      callbacks.onStatus("unavailable");
      callbacks.onError(
        err instanceof Error ? err.message : "Could not open the selected microphone.",
      );
      return;
    }

    this.openSocket(apiKey);
  }

  pause(): void {
    this.paused = true;
    this.discardPending();
    this.callbacks?.onStatus("paused");
  }

  resume(): void {
    this.paused = false;
    this.callbacks?.onStatus(this.ready ? "listening" : "reconnecting");
  }

  stop(): void {
    this.stopping = true;
    window.clearTimeout(this.reconnectTimer);
    this.closeSocket();
    this.closeAudio();
    this.discardPending();
    this.ready = false;
    this.callbacks?.onStatus("stopped");
    this.callbacks = null;
    this.options = null;
  }

  private async openAudio(): Promise<void> {
    this.capture = await startPcmCapture({
      deviceId: this.deviceId,
      targetRate: GEMINI_SAMPLE_RATE,
      onFrames: (frames) => this.enqueue(frames),
      onError: (message) => this.callbacks?.onError(message),
    });
  }

  private openSocket(apiKey: string): void {
    const socket = new WebSocket(buildLiveUrl(apiKey));
    this.socket = socket;
    this.ready = false;

    socket.onopen = () => {
      const model = this.options?.config?.geminiModel?.trim() || DEFAULT_GEMINI_MODEL;
      const languages = this.options?.config?.languageCodes ?? [];
      const vocabulary = supportsCustomVocabulary(model)
        ? scriptureVocabulary(normalizeLanguage(this.options?.config?.whisperLanguage))
        : [];
      socket.send(buildSetupMessage(model, languages, vocabulary));
    };

    socket.onmessage = (event: MessageEvent) => {
      void this.handleFrame(event.data);
    };

    socket.onerror = () => {
      this.callbacks?.onError("Lost contact with the Gemini Live API.");
    };

    socket.onclose = () => {
      this.ready = false;
      if (this.stopping) return;
      this.scheduleReconnect(apiKey);
    };
  }

  private async handleFrame(data: unknown): Promise<void> {
    const raw =
      typeof data === "string"
        ? data
        : data instanceof Blob
          ? await data.text()
          : data instanceof ArrayBuffer
            ? new TextDecoder().decode(data)
            : null;
    if (raw == null) return;

    const event = parseServerMessage(raw);
    switch (event.kind) {
      case "setupComplete":
        this.ready = true;
        this.reconnects = 0;
        this.callbacks?.onStatus(this.paused ? "paused" : "listening");
        break;
      case "partial":
        if (!this.paused) this.callbacks?.onPartial(event.text);
        break;
      case "final":
        if (!this.paused) this.callbacks?.onFinal(event.text);
        break;
      case "error":
        this.callbacks?.onError(event.message);
        break;
      case "ignored":
        break;
    }
  }

  private scheduleReconnect(apiKey: string): void {
    if (this.reconnects >= MAX_RECONNECTS) {
      this.callbacks?.onStatus("unavailable");
      this.callbacks?.onError("Gemini Live kept dropping the connection. Check the network and key.");
      return;
    }
    this.reconnects += 1;
    this.callbacks?.onStatus("reconnecting");
    this.reconnectTimer = window.setTimeout(() => {
      if (!this.stopping) this.openSocket(apiKey);
    }, RECONNECT_DELAY_MS);
  }

  private enqueue(frames: Float32Array): void {
    if (this.stopping || this.paused || !this.ready) return;
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    this.pending.push(frames);
    this.pendingFrames += frames.length;
    if (this.pendingFrames < GEMINI_CHUNK_FRAMES) return;

    const merged = new Float32Array(this.pendingFrames);
    let offset = 0;
    for (const chunk of this.pending) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    this.discardPending();
    this.socket.send(buildAudioMessage(encodeBase64(floatTo16BitPcm(merged))));
  }

  private discardPending(): void {
    this.pending = [];
    this.pendingFrames = 0;
  }

  private closeSocket(): void {
    if (!this.socket) return;
    this.socket.onopen = null;
    this.socket.onmessage = null;
    this.socket.onerror = null;
    this.socket.onclose = null;
    if (
      this.socket.readyState === WebSocket.OPEN ||
      this.socket.readyState === WebSocket.CONNECTING
    ) {
      this.socket.close();
    }
    this.socket = null;
  }

  private closeAudio(): void {
    this.capture?.stop();
    this.capture = null;
  }
}
