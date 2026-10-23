import { Channel } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { tauriInvoke } from "@/lib/tauri";
import { isDesktopApp } from "@/lib/transcription/engineReadiness";

/** Where the microphone is read: Windows audio directly, or the web view's capture. */
export type CaptureSource = "windows" | "webview";

const SOURCE_KEY = "bsp-audio-capture";

export function captureSource(): CaptureSource {
  if (!isDesktopApp()) return "webview";
  try {
    return localStorage.getItem(SOURCE_KEY) === "webview" ? "webview" : "windows";
  } catch {
    return "windows";
  }
}

export function setCaptureSource(source: CaptureSource) {
  try {
    localStorage.setItem(SOURCE_KEY, source);
  } catch {
    // Falls back to the default next time.
  }
}

export interface NativeInput {
  name: string;
  isDefault: boolean;
}

export function listNativeInputs(): Promise<NativeInput[]> {
  return tauriInvoke<NativeInput[]>("list_audio_inputs");
}

export interface NativeCapture {
  readonly device: string;
  readonly deviceRate: number;
  stop(): void;
}

/** Mono f32 frames at `targetRate`, every 100 ms, from the named input or the Windows default. */
export async function startNativeCapture(options: {
  deviceName: string | null;
  targetRate: number;
  onFrames: (frames: Float32Array) => void;
  onError?: (message: string) => void;
}): Promise<NativeCapture> {
  let stopped = false;
  const frames = new Channel<ArrayBuffer>();
  frames.onmessage = (buffer) => {
    if (!stopped && buffer.byteLength >= 4) options.onFrames(new Float32Array(buffer));
  };

  const info = await tauriInvoke<{ id: number; device: string; deviceRate: number }>("start_audio_capture", {
    device: options.deviceName,
    sampleRate: options.targetRate,
    frames,
  });

  let unlisten: (() => void) | undefined;
  void listen<{ id: number; message: string }>("audio-capture-error", (event) => {
    if (event.payload.id === info.id && !stopped) options.onError?.(event.payload.message);
  })
    .then((stop) => {
      if (stopped) stop();
      else unlisten = stop;
    })
    .catch(() => {});

  return {
    device: info.device,
    deviceRate: info.deviceRate,
    stop() {
      if (stopped) return;
      stopped = true;
      unlisten?.();
      void tauriInvoke("stop_audio_capture", { id: info.id }).catch(() => {});
    },
  };
}

/**
 * Loudness 0–1 on the web meter's scale: the web meter reads ~10 ms windows, so this is the
 * loudest 10 ms block (160 samples at 16 kHz) rather than an average over the whole chunk.
 */
export function levelOf(frames: Float32Array, block = 160): number {
  let loudest = 0;
  for (let start = 0; start < frames.length; start += block) {
    const end = Math.min(frames.length, start + block);
    let sum = 0;
    for (let i = start; i < end; i += 1) sum += frames[i] * frames[i];
    loudest = Math.max(loudest, Math.sqrt(sum / (end - start)));
  }
  return Math.min(1, loudest * 4);
}
