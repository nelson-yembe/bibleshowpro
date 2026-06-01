import {
  audioWarningForLevel,
  getAudioInputConstraints,
  mapGetUserMediaError,
} from "@/lib/transcription/audioInput";

export class AudioLevelMonitor {
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private raf = 0;
  private onLevel: ((level: number) => void) | null = null;
  private onWarning: ((warning: string | null) => void) | null = null;
  private scratch: Uint8Array | null = null;
  private lastWarning: string | null = null;

  async start(
    deviceId: string | null,
    onLevel: (level: number) => void,
    onWarning?: (warning: string | null) => void,
  ) {
    await this.stop();
    this.onLevel = onLevel;
    this.onWarning = onWarning ?? null;
    this.lastWarning = null;

    let lastError: unknown;
    for (const constraints of getAudioInputConstraints(deviceId)) {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia(constraints);
        break;
      } catch (err) {
        lastError = err;
      }
    }

    if (!this.stream) {
      throw mapGetUserMediaError(lastError);
    }

    this.context = new AudioContext();
    if (this.context.state === "suspended") {
      await this.context.resume().catch(() => undefined);
    }
    const source = this.context.createMediaStreamSource(this.stream);
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 512;
    source.connect(this.analyser);
    this.scratch = new Uint8Array(this.analyser.fftSize);

    const tick = () => {
      if (!this.analyser || !this.scratch) return;
      this.analyser.getByteTimeDomainData(this.scratch);
      let sum = 0;
      for (let i = 0; i < this.scratch.length; i += 1) {
        const sample = (this.scratch[i] - 128) / 128;
        sum += sample * sample;
      }
      const level = Math.min(1, Math.sqrt(sum / this.scratch.length) * 4);
      this.onLevel?.(level);

      const nextWarning = audioWarningForLevel(level, this.lastWarning);
      if (nextWarning !== this.lastWarning) {
        this.lastWarning = nextWarning;
        this.onWarning?.(nextWarning);
      }

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
    this.scratch = null;
    this.onLevel = null;
    this.onWarning = null;
    this.lastWarning = null;
  }
}
