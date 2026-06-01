import {
  mapSpeechRecognitionError,
  openAudioInputStream,
} from "@/lib/transcription/audioInput";
import {
  getSpeechRecognitionCtor,
  isSpeechRecognitionSupported,
  type SpeechRecognitionErrorEvent,
  type SpeechRecognitionEvent,
  type SpeechRecognitionInstance,
} from "@/lib/transcription/speechTypes";

export {
  ensureMicrophoneAccess,
  listAudioInputDevices,
  pickValidAudioDeviceId,
  openAudioInputStream,
  mapSpeechRecognitionError,
} from "@/lib/transcription/audioInput";
export { AudioLevelMonitor } from "@/lib/transcription/audioLevelMonitor";

export interface TranscriptionCallbacks {
  onPartial: (text: string) => void;
  onFinal: (text: string) => void;
  onStatus: (status: "listening" | "paused" | "stopped" | "unavailable" | "reconnecting") => void;
  onError: (message: string) => void;
  onAudioActivity?: (level: number) => void;
}

export interface TranscriptionEngineOptions {
  modelId: string;
  language?: string;
}

export class WebSpeechTranscriptionEngine {
  private recognition: SpeechRecognitionInstance | null = null;
  private paused = false;
  private shouldRestart = false;
  private callbacks: TranscriptionCallbacks | null = null;
  private lastOptions: TranscriptionEngineOptions | null = null;
  private restartTimer: number | undefined;
  private primingStream: MediaStream | null = null;

  isSupported(): boolean {
    return isSpeechRecognitionSupported();
  }

  async start(callbacks: TranscriptionCallbacks, options: TranscriptionEngineOptions, deviceId?: string | null) {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      callbacks.onStatus("unavailable");
      callbacks.onError("Speech recognition is not supported in this environment.");
      return;
    }

    await this.primeAudioInput(deviceId ?? null);

    this.callbacks = callbacks;
    this.lastOptions = options;
    this.paused = false;
    this.shouldRestart = true;
    window.clearTimeout(this.restartTimer);

    this.attachRecognition(new Ctor(), options, true);
  }

  /** Hold the selected input open so capture routes consistently on Windows/WebView2. */
  private async primeAudioInput(deviceId: string | null) {
    this.releasePrimingStream();
    try {
      this.primingStream = await openAudioInputStream(deviceId);
    } catch {
      this.primingStream = null;
    }
  }

  private releasePrimingStream() {
    this.primingStream?.getTracks().forEach((track) => track.stop());
    this.primingStream = null;
  }

  private disposeRecognition() {
    if (!this.recognition) return;
    try {
      this.recognition.onresult = null;
      this.recognition.onerror = null;
      this.recognition.onend = null;
      this.recognition.onstart = null;
      this.recognition.onsoundstart = null;
      this.recognition.onsoundend = null;
      this.recognition.abort();
    } catch {
      // ignore
    }
    this.recognition = null;
  }

  private startRecognition(recognition: SpeechRecognitionInstance) {
    try {
      recognition.start();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to start speech recognition.";
      if (/already started/i.test(message)) return;
      this.callbacks?.onError(message);
      this.callbacks?.onStatus("unavailable");
    }
  }

  private attachRecognition(
    recognition: SpeechRecognitionInstance,
    options: TranscriptionEngineOptions,
    autoStart: boolean,
  ) {
    this.disposeRecognition();

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = options.language ?? "en-US";
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const transcript = result[0]?.transcript?.trim() ?? "";
        if (!transcript) continue;
        if (result.isFinal) finalText += `${transcript} `;
        else interim += `${transcript} `;
      }
      if (interim.trim()) this.callbacks?.onPartial(interim.trim());
      if (finalText.trim()) this.callbacks?.onFinal(finalText.trim());
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === "aborted") return;
      if (event.error === "no-speech") {
        this.callbacks?.onError(mapSpeechRecognitionError(event.error, event.message).message);
        return;
      }
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        this.callbacks?.onError(mapSpeechRecognitionError(event.error, event.message).message);
        this.shouldRestart = false;
        this.callbacks?.onStatus("unavailable");
        return;
      }
      if (event.error === "audio-capture") {
        this.callbacks?.onError(mapSpeechRecognitionError(event.error, event.message).message);
        this.shouldRestart = false;
        this.callbacks?.onStatus("unavailable");
        return;
      }
      if (event.error === "network") {
        this.callbacks?.onError(mapSpeechRecognitionError(event.error, event.message).message);
        return;
      }
      this.callbacks?.onError(mapSpeechRecognitionError(event.error, event.message).message);
    };

    recognition.onend = () => {
      if (this.shouldRestart && !this.paused) {
        this.callbacks?.onStatus("reconnecting");
        window.clearTimeout(this.restartTimer);
        this.restartTimer = window.setTimeout(() => {
          if (!this.shouldRestart || this.paused) return;
          const Ctor = getSpeechRecognitionCtor();
          if (!Ctor || !this.lastOptions) {
            this.callbacks?.onStatus("stopped");
            return;
          }
          try {
            this.attachRecognition(new Ctor(), this.lastOptions, true);
          } catch {
            this.callbacks?.onStatus("stopped");
          }
        }, 300);
        return;
      }
      this.callbacks?.onStatus("stopped");
    };

    recognition.onstart = () => {
      this.callbacks?.onStatus("listening");
    };

    this.recognition = recognition;

    if (autoStart) {
      this.startRecognition(recognition);
    }
  }

  pause() {
    this.paused = true;
    this.shouldRestart = false;
    window.clearTimeout(this.restartTimer);
    try {
      this.recognition?.stop();
    } catch {
      // ignore
    }
    this.callbacks?.onStatus("paused");
  }

  resume() {
    if (!this.lastOptions) return;
    this.paused = false;
    this.shouldRestart = true;
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      this.callbacks?.onStatus("unavailable");
      return;
    }
    try {
      this.attachRecognition(new Ctor(), this.lastOptions, true);
    } catch {
      this.callbacks?.onStatus("reconnecting");
    }
  }

  stop() {
    this.shouldRestart = false;
    this.paused = false;
    window.clearTimeout(this.restartTimer);
    this.disposeRecognition();
    this.releasePrimingStream();
    this.lastOptions = null;
    this.callbacks?.onStatus("stopped");
    this.callbacks = null;
  }
}
