import {
  getSpeechRecognitionCtor,
  isSpeechRecognitionSupported,
  type SpeechRecognitionErrorEvent,
  type SpeechRecognitionEvent,
  type SpeechRecognitionInstance,
} from "@/lib/transcription/speechTypes";

export interface TranscriptionCallbacks {
  onPartial: (text: string) => void;
  onFinal: (text: string) => void;
  onStatus: (status: "listening" | "paused" | "stopped" | "unavailable" | "reconnecting") => void;
  onError: (message: string) => void;
  /** Lightweight mic activity from the speech engine (avoids a second getUserMedia stream). */
  onAudioActivity?: (level: number) => void;
}

export interface TranscriptionEngineOptions {
  modelId: string;
  language?: string;
}

/** Prompt for mic permission so device labels/IDs are available. */
export async function ensureMicrophoneAccess(): Promise<void> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Microphone access is not available in this environment.");
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  stream.getTracks().forEach((track) => track.stop());
}

export class WebSpeechTranscriptionEngine {
  private recognition: SpeechRecognitionInstance | null = null;
  private paused = false;
  private shouldRestart = false;
  private callbacks: TranscriptionCallbacks | null = null;
  private lastOptions: TranscriptionEngineOptions | null = null;
  private restartTimer: number | undefined;

  isSupported(): boolean {
    return isSpeechRecognitionSupported();
  }

  start(callbacks: TranscriptionCallbacks, options: TranscriptionEngineOptions) {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      callbacks.onStatus("unavailable");
      callbacks.onError("Speech recognition is not supported in this environment.");
      return;
    }

    this.callbacks = callbacks;
    this.lastOptions = options;
    this.paused = false;
    this.shouldRestart = true;
    window.clearTimeout(this.restartTimer);

    this.attachRecognition(new Ctor(), options, true);
  }

  private disposeRecognition() {
    if (!this.recognition) return;
    try {
      this.recognition.onresult = null;
      this.recognition.onerror = null;
      this.recognition.onend = null;
      this.recognition.onstart = null;
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

    recognition.onsoundstart = () => {
      this.callbacks?.onAudioActivity?.(0.55);
    };
    recognition.onsoundend = () => {
      this.callbacks?.onAudioActivity?.(0.04);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === "no-speech" || event.error === "aborted") return;
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        this.callbacks?.onError("Microphone permission denied — allow mic access for Bible Show Pro.");
        this.shouldRestart = false;
        this.callbacks?.onStatus("unavailable");
        return;
      }
      if (event.error === "audio-capture") {
        this.callbacks?.onError("No microphone detected — check your audio input device.");
        this.shouldRestart = false;
        this.callbacks?.onStatus("unavailable");
        return;
      }
      if (event.error === "network") {
        this.callbacks?.onError("Network error — Web Speech requires internet on this system.");
      } else {
        this.callbacks?.onError(event.message || event.error);
      }
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
    this.lastOptions = null;
    this.callbacks?.onStatus("stopped");
    this.callbacks = null;
  }
}

export class AudioLevelMonitor {
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private raf = 0;
  private onLevel: ((level: number) => void) | null = null;

  async start(deviceId: string | null, onLevel: (level: number) => void) {
    await this.stop();
    this.onLevel = onLevel;

    const attempts: MediaStreamConstraints[] = deviceId
      ? [{ audio: { deviceId: { ideal: deviceId } } }, { audio: true }]
      : [{ audio: true }];

    let lastError: unknown;
    for (const constraints of attempts) {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia(constraints);
        break;
      } catch (err) {
        lastError = err;
      }
    }

    if (!this.stream) {
      throw lastError instanceof Error ? lastError : new Error("Could not open microphone for level meter.");
    }

    this.context = new AudioContext();
    if (this.context.state === "suspended") {
      await this.context.resume().catch(() => undefined);
    }
    const source = this.context.createMediaStreamSource(this.stream);
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 256;
    source.connect(this.analyser);

    const data = new Uint8Array(this.analyser.frequencyBinCount);
    const tick = () => {
      if (!this.analyser) return;
      this.analyser.getByteFrequencyData(data);
      const avg = data.reduce((sum, v) => sum + v, 0) / data.length;
      const level = Math.min(1, avg / 128);
      this.onLevel?.(level);
      this.raf = requestAnimationFrame(tick);
    };
    tick();
  }

  async stop() {
    cancelAnimationFrame(this.raf);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.context) {
      await this.context.close().catch(() => undefined);
    }
    this.context = null;
    this.analyser = null;
    this.onLevel = null;
  }
}

export async function listAudioInputDevices(): Promise<MediaDeviceInfo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((d) => d.kind === "audioinput" && d.deviceId.length > 0);
}

export function pickValidAudioDeviceId(
  devices: MediaDeviceInfo[],
  preferredId: string | null | undefined,
): string | null {
  if (preferredId && devices.some((d) => d.deviceId === preferredId)) {
    return preferredId;
  }
  return devices[0]?.deviceId ?? null;
}
