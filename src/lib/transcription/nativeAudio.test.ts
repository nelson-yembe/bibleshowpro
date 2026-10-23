import { afterEach, describe, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn());
const channels: { onmessage?: (buffer: ArrayBuffer) => void }[] = [];
vi.mock("@tauri-apps/api/core", () => ({
  invoke,
  Channel: class {
    onmessage?: (buffer: ArrayBuffer) => void;
    constructor() {
      channels.push(this);
    }
  },
}));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => () => {}) }));

const { captureSource, levelOf, startNativeCapture } = await import("@/lib/transcription/nativeAudio");

describe("startNativeCapture", () => {
  afterEach(() => {
    invoke.mockReset();
    channels.length = 0;
  });

  it("turns Windows frames into float samples and stops the capture it started", async () => {
    invoke.mockImplementation(async (command: string) =>
      command === "start_audio_capture" ? { id: 7, device: "Desk mic", deviceRate: 48000 } : undefined,
    );
    const received: number[][] = [];
    const capture = await startNativeCapture({
      deviceName: "Desk mic",
      targetRate: 16000,
      onFrames: (frames) => received.push(Array.from(frames)),
    });
    expect(invoke).toHaveBeenCalledWith("start_audio_capture", expect.objectContaining({ device: "Desk mic", sampleRate: 16000 }));
    expect(capture.deviceRate).toBe(48000);

    channels[0].onmessage?.(new Float32Array([0.5, -0.25]).buffer);
    expect(received).toEqual([[0.5, -0.25]]);

    capture.stop();
    channels[0].onmessage?.(new Float32Array([1]).buffer);
    expect(received).toHaveLength(1);
    expect(invoke).toHaveBeenCalledWith("stop_audio_capture", { id: 7 });
  });
});

describe("levelOf", () => {
  it("reads the loudest 10 ms block, so a short word is not averaged away", () => {
    const frames = new Float32Array(1600);
    frames.fill(0.2, 0, 160);
    expect(levelOf(frames)).toBeCloseTo(0.8);
    expect(levelOf(new Float32Array(1600))).toBe(0);
  });
});

it("uses the web view outside the desktop app", () => {
  expect(captureSource()).toBe("webview");
});
