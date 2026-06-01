export type AudioInputErrorCode =
  | "unsupported"
  | "permission_denied"
  | "no_device"
  | "device_unavailable"
  | "device_not_found"
  | "no_signal"
  | "unknown";

export class AudioInputError extends Error {
  readonly code: AudioInputErrorCode;

  constructor(code: AudioInputErrorCode, message: string) {
    super(message);
    this.name = "AudioInputError";
    this.code = code;
  }
}

const SIGNAL_THRESHOLD = 0.018;
const CLIP_THRESHOLD = 0.94;

export function audioInputLabel(
  devices: MediaDeviceInfo[],
  deviceId: string | null | undefined,
): string {
  if (!deviceId) return "System default microphone";
  const match = devices.find((d) => d.deviceId === deviceId);
  if (match?.label) return match.label;
  if (match) return `Microphone ${deviceId.slice(0, 8)}`;
  return "System default microphone";
}

export function getAudioInputConstraints(deviceId: string | null | undefined): MediaStreamConstraints[] {
  if (!deviceId) return [{ audio: true }];
  return [
    { audio: { deviceId: { exact: deviceId } } },
    { audio: { deviceId: { ideal: deviceId } } },
    { audio: true },
  ];
}

export function mapGetUserMediaError(err: unknown): AudioInputError {
  if (err instanceof AudioInputError) return err;

  const name = err instanceof DOMException ? err.name : "";
  const message = err instanceof Error ? err.message : String(err);

  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return new AudioInputError(
      "permission_denied",
      "Microphone permission denied — open Windows Settings → Privacy → Microphone and allow desktop apps, then allow Bible Show Pro.",
    );
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return new AudioInputError(
      "device_not_found",
      "Selected microphone not found — click Refresh mics or choose another input.",
    );
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return new AudioInputError(
      "device_unavailable",
      "Microphone is in use by another app or unavailable — close other apps using the mic and try again.",
    );
  }
  if (name === "SecurityError") {
    return new AudioInputError(
      "permission_denied",
      "Microphone blocked by system policy — run the installed Bible Show Pro app (not a browser tab).",
    );
  }

  return new AudioInputError(
    "unknown",
    message || "Could not open the selected microphone.",
  );
}

export async function openAudioInputStream(
  deviceId: string | null | undefined,
): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new AudioInputError(
      "unsupported",
      "Microphone access is not available in this environment — use the installed Bible Show Pro desktop app.",
    );
  }

  let lastError: unknown;
  for (const constraints of getAudioInputConstraints(deviceId)) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      lastError = err;
    }
  }

  throw mapGetUserMediaError(lastError);
}

/** Prompt for mic permission so device labels/IDs are available. */
export async function ensureMicrophoneAccess(deviceId?: string | null): Promise<void> {
  const stream = await openAudioInputStream(deviceId);
  stream.getTracks().forEach((track) => track.stop());
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

function measureStreamLevel(analyser: AnalyserNode, scratch: Uint8Array): number {
  analyser.getByteTimeDomainData(scratch);
  let sum = 0;
  for (let i = 0; i < scratch.length; i += 1) {
    const sample = (scratch[i] - 128) / 128;
    sum += sample * sample;
  }
  return Math.min(1, Math.sqrt(sum / scratch.length) * 4);
}

export interface AudioPreflightResult {
  ok: boolean;
  deviceId: string | null;
  deviceLabel: string;
  peakLevel: number;
  hasSignal: boolean;
  clipping: boolean;
  error: AudioInputError | null;
  /** Web Speech may still follow the OS default input on some systems. */
  webSpeechUsesOsDefault: boolean;
}

export async function preflightAudioInput(
  deviceId: string | null | undefined,
  devices: MediaDeviceInfo[],
  options?: { sampleMs?: number },
): Promise<AudioPreflightResult> {
  const sampleMs = options?.sampleMs ?? 1400;
  const resolvedId = pickValidAudioDeviceId(devices, deviceId);
  const deviceLabel = audioInputLabel(devices, resolvedId);

  if (devices.length === 0) {
    return {
      ok: false,
      deviceId: resolvedId,
      deviceLabel,
      peakLevel: 0,
      hasSignal: false,
      clipping: false,
      error: new AudioInputError(
        "no_device",
        "No microphone detected — plug in a mic or enable an input in Windows Sound settings, then click Refresh mics.",
      ),
      webSpeechUsesOsDefault: true,
    };
  }

  let stream: MediaStream | null = null;
  let context: AudioContext | null = null;

  try {
    stream = await openAudioInputStream(resolvedId);
    context = new AudioContext();
    if (context.state === "suspended") {
      await context.resume().catch(() => undefined);
    }

    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);

    const scratch = new Uint8Array(analyser.fftSize);
    const started = performance.now();
    let peakLevel = 0;

    while (performance.now() - started < sampleMs) {
      const level = measureStreamLevel(analyser, scratch);
      peakLevel = Math.max(peakLevel, level);
      await new Promise<void>((resolve) => window.setTimeout(resolve, 80));
    }

    const hasSignal = peakLevel >= SIGNAL_THRESHOLD;
    const clipping = peakLevel >= CLIP_THRESHOLD;

    return {
      ok: true,
      deviceId: resolvedId,
      deviceLabel,
      peakLevel,
      hasSignal,
      clipping,
      error: hasSignal
        ? null
        : new AudioInputError(
            "no_signal",
            `No audio detected on “${deviceLabel}” — check Windows input level, cable, or choose another device. Speak or play audio into the mic during the test.`,
          ),
      webSpeechUsesOsDefault: true,
    };
  } catch (err) {
    return {
      ok: false,
      deviceId: resolvedId,
      deviceLabel,
      peakLevel: 0,
      hasSignal: false,
      clipping: false,
      error: mapGetUserMediaError(err),
      webSpeechUsesOsDefault: true,
    };
  } finally {
    stream?.getTracks().forEach((track) => track.stop());
    if (context) {
      await context.close().catch(() => undefined);
    }
  }
}

export function mapSpeechRecognitionError(error: string, message?: string): AudioInputError {
  switch (error) {
    case "not-allowed":
    case "service-not-allowed":
      return new AudioInputError(
        "permission_denied",
        "Speech recognition blocked — allow microphone access for Bible Show Pro in Windows privacy settings.",
      );
    case "audio-capture":
      return new AudioInputError(
        "device_unavailable",
        "Speech engine cannot capture audio — confirm the selected mic works in the preflight test and is set as Windows default input.",
      );
    case "network":
      return new AudioInputError(
        "unknown",
        "Network error — the Web Speech model requires internet on this PC.",
      );
    case "no-speech":
      return new AudioInputError(
        "no_signal",
        "No speech detected — speak closer to the mic or raise input gain in Windows Sound settings.",
      );
    default:
      return new AudioInputError("unknown", message || error || "Speech recognition error.");
  }
}

export function audioWarningForLevel(level: number, previous?: string | null): string | null {
  if (level >= CLIP_THRESHOLD) return "Input clipping — lower gain in Windows or your mixer.";
  if (previous === "Input clipping — lower gain in Windows or your mixer." && level < CLIP_THRESHOLD - 0.08) {
    return null;
  }
  return previous ?? null;
}

export { SIGNAL_THRESHOLD, CLIP_THRESHOLD };
