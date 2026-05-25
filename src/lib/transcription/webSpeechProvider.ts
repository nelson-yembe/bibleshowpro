import {
  getSpeechRecognitionCtor,
  type SpeechRecognitionErrorEvent,
  type SpeechRecognitionEvent,
  type SpeechRecognitionInstance,
} from "@/lib/transcription/speechTypes";

export interface TranscriptionCallbacks {
  onPartial: (text: string) => void;
  onFinal: (text: string) => void;
  onStatus: (status: "listening" | "paused" | "stopped" | "unavailable" | "reconnecting") => void;
  onError: (message: string) => void;
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

  isSupported(): boolean {
    return getSpeechRecognitionCtor() != null;
  }

  start(callbacks: TranscriptionCallbacks, options: TranscriptionEngineOptions) {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      callbacks.onStatus("unavailable");
      callbacks.onError("Speech recognition is not supported in this environment.");
      return;
    }

    this.callbacks = callbacks;
    this.paused = false;
    this.shouldRestart = true;

    const recognition = new Ctor();
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
      if (event.error === "no-speech" || event.error === "aborted") return;
      if (event.error === "network") {
        this.callbacks?.onError("Network error — check internet connection for cloud speech recognition.");
      } else {
        this.callbacks?.onError(event.message || event.error);
      }
    };

    recognition.onend = () => {
      if (this.shouldRestart && !this.paused) {
        this.callbacks?.onStatus("reconnecting");
        window.setTimeout(() => {
          if (this.shouldRestart && !this.paused) {
            try {
              recognition.start();
              this.callbacks?.onStatus("listening");
            } catch {
              this.callbacks?.onStatus("stopped");
            }
          }
        }, 250);
        return;
      }
      this.callbacks?.onStatus("stopped");
    };

    recognition.onstart = () => {
      this.callbacks?.onStatus("listening");
    };

    this.recognition = recognition;

    try {
      recognition.start();
    } catch (err) {
      this.callbacks?.onError(err instanceof Error ? err.message : "Failed to start speech recognition.");
      this.callbacks?.onStatus("unavailable");
    }
  }

  pause() {
    this.paused = true;
    this.recognition?.stop();
    this.callbacks?.onStatus("paused");
  }

  resume() {
    if (!this.recognition) return;
    this.paused = false;
    this.shouldRestart = true;
    try {
      this.recognition.start();
      this.callbacks?.onStatus("listening");
    } catch {
      this.callbacks?.onStatus("reconnecting");
    }
  }

  stop() {
    this.shouldRestart = false;
    this.paused = false;
    this.recognition?.stop();
    this.recognition = null;
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
    const constraints: MediaStreamConstraints = {
      audio: deviceId ? { deviceId: { exact: deviceId } } : true,
    };
    this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    this.context = new AudioContext();
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
  return devices.filter((d) => d.kind === "audioinput");
}
