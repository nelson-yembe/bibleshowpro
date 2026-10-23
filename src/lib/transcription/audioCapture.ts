import { openAudioInputStream } from "@/lib/transcription/audioInput";
import { captureSource, startNativeCapture } from "@/lib/transcription/nativeAudio";
import { PCM_WORKLET_PROCESSOR, PCM_WORKLET_URL } from "@/lib/transcription/pcm";
import { StreamingResampler } from "@/lib/transcription/resampler";

export type CaptureMethod = "windows" | "worklet" | "script-processor";

export interface PcmCapture {
  readonly method: CaptureMethod;
  /** The microphone's own rate, before conversion — useful when diagnosing a device. */
  readonly deviceRate: number;
  stop(): void;
}

/**
 * Microphone → mono float frames at `targetRate`, on as many machines as possible.
 *
 * - Windows audio first (see `src-tauri/src/audio.rs`); the web view's capture below is
 *   the fallback when that fails, and the only path outside the desktop app.
 * - The context runs at the device's native rate and audio is resampled here. Asking the
 *   browser for 16 kHz directly fails on some drivers and Bluetooth headsets.
 * - AudioWorklet first; ScriptProcessorNode if the worklet cannot load. The fallback is
 *   deprecated but available everywhere, and a working fallback beats no transcription.
 * - The tap is routed to the output through a muted gain node. A node the audio graph is
 *   not pulling towards the speakers is not guaranteed to be processed at all, which can
 *   leave the level meter moving while the engine receives nothing.
 */
export async function startPcmCapture(options: {
  deviceId: string | null;
  targetRate: number;
  onFrames: (frames: Float32Array) => void;
  /** The microphone failed after starting (unplugged, disabled). */
  onError?: (message: string) => void;
}): Promise<PcmCapture> {
  if (captureSource() === "windows") {
    try {
      const native = await startNativeCapture({
        deviceName: options.deviceId,
        targetRate: options.targetRate,
        onFrames: options.onFrames,
        onError: options.onError,
      });
      return { method: "windows", deviceRate: native.deviceRate, stop: () => native.stop() };
    } catch (err) {
      console.warn("[audio] Windows capture failed; using the web view's capture.", err);
    }
  }
  return startWebCapture(options);
}

async function startWebCapture(options: {
  deviceId: string | null;
  targetRate: number;
  onFrames: (frames: Float32Array) => void;
}): Promise<PcmCapture> {
  const stream = await openAudioInputStream(options.deviceId);
  const releaseStream = () => stream.getTracks().forEach((track) => track.stop());

  let context: AudioContext;
  try {
    context = new AudioContext({ latencyHint: "interactive" });
  } catch {
    releaseStream();
    throw new Error("This PC could not start audio processing for transcription.");
  }

  // Created after awaits, the context can start suspended under the autoplay policy.
  if (context.state === "suspended") {
    try {
      await context.resume();
    } catch {
      // Checked just below.
    }
  }
  if (context.state !== "running") {
    releaseStream();
    void context.close().catch(() => {});
    throw new Error("Windows did not let the app start audio processing. Press Start listening again.");
  }

  const resampler = new StreamingResampler(context.sampleRate, options.targetRate);
  const deliver = (raw: Float32Array) => {
    const frames = resampler.process(raw);
    if (frames.length > 0) options.onFrames(frames);
  };

  const source = context.createMediaStreamSource(stream);
  const mute = context.createGain();
  mute.gain.value = 0;
  mute.connect(context.destination);

  let node: AudioWorkletNode | ScriptProcessorNode;
  let method: CaptureMethod;
  try {
    await context.audioWorklet.addModule(PCM_WORKLET_URL);
    const worklet = new AudioWorkletNode(context, PCM_WORKLET_PROCESSOR);
    worklet.port.onmessage = (event: MessageEvent<Float32Array>) => deliver(event.data);
    node = worklet;
    method = "worklet";
  } catch {
    const processor = context.createScriptProcessor(4096, 1, 1);
    processor.onaudioprocess = (event) => deliver(event.inputBuffer.getChannelData(0).slice(0));
    node = processor;
    method = "script-processor";
  }

  source.connect(node);
  node.connect(mute);

  let stopped = false;
  return {
    method,
    deviceRate: context.sampleRate,
    stop() {
      if (stopped) return;
      stopped = true;
      if (node instanceof AudioWorkletNode) {
        node.port.onmessage = null;
        node.port.close();
      } else {
        node.onaudioprocess = null;
      }
      try {
        source.disconnect();
        node.disconnect();
        mute.disconnect();
      } catch {
        // Already torn down.
      }
      releaseStream();
      void context.close().catch(() => {});
    },
  };
}
