import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { RemoteStatus } from "@/lib/tauri";

const off: RemoteStatus = { running: false, port: 4316, phoneUrls: [], pin: null, qrSvg: null };
const on: RemoteStatus = {
  running: true,
  port: 4316,
  phoneUrls: ["http://192.168.1.20:4316/", "http://10.0.0.5:4316/"],
  pin: "042917",
  qrSvg: "<svg/>",
};

const api = vi.hoisted(() => ({
  getRemoteStatus: vi.fn(),
  startRemoteServer: vi.fn(),
  stopRemoteServer: vi.fn(),
  writePhoneQrSlide: vi.fn(async () => "C:/Users/x/AppData/Roaming/com.bibleshowpro.app/phone-view-qr.svg"),
}));
vi.mock("@/lib/tauri", () => ({ api, tauriInvoke: vi.fn() }));

const { PhoneViewPanel } = await import("@/modules/settings/PhoneViewPanel");
const { usePresentationStore } = await import("@/stores/presentationStore");

describe("PhoneViewPanel", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it("turns the server on and shows where phones connect, with the PIN", async () => {
    api.getRemoteStatus.mockResolvedValue(off);
    api.startRemoteServer.mockResolvedValue(on);
    render(<PhoneViewPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Turn on" }));
    expect(await screen.findByText("http://192.168.1.20:4316/")).toBeInTheDocument();
    expect(screen.getByText("http://192.168.1.20:4316/remote")).toBeInTheDocument();
    expect(screen.getByText("042917")).toBeInTheDocument();
    expect(screen.getByText(/Also: http:\/\/10\.0\.0\.5:4316\//)).toBeInTheDocument();
  });

  it("stages the QR slide in preview rather than putting it on air", async () => {
    api.getRemoteStatus.mockResolvedValue(on);
    const previewScene = vi.fn();
    usePresentationStore.setState({ previewScene });
    render(<PhoneViewPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Stage the QR code in preview" }));
    await vi.waitFor(() => expect(previewScene).toHaveBeenCalled());
    expect(previewScene.mock.calls[0][0]).toMatchObject({ type: "image", content: { imagePath: expect.stringContaining("phone-view-qr.svg") } });
    expect(previewScene.mock.calls[0][1]).toBe("media");
  });

  it("says when phones cannot reach this PC", async () => {
    api.getRemoteStatus.mockResolvedValue({ ...on, phoneUrls: [], qrSvg: null });
    render(<PhoneViewPanel />);
    expect(await screen.findByText(/not on a local network/)).toBeInTheDocument();
  });
});
