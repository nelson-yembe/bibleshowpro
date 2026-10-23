import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const api = vi.hoisted(() => ({
  setProjectorDisplay: vi.fn(async () => {}),
  openSideScreen: vi.fn(async () => {}),
  closeSideScreen: vi.fn(async () => {}),
  listSideScreens: vi.fn(async () => [] as string[]),
  listDisplays: vi.fn(async () => []),
  getOutputStatus: vi.fn(async () => ({ open: true, active_display: null, displays: [] })),
}));
vi.mock("@/lib/tauri", () => ({ api, tauriInvoke: vi.fn(async () => {}) }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => () => {}) }));

const { ScreensPanel } = await import("@/modules/settings/ScreensPanel");
const { usePresentationStore } = await import("@/stores/presentationStore");
const { useScreensStore } = await import("@/stores/screensStore");
const { useStageStore } = await import("@/stores/stageStore");

const display = (id: string, name: string, is_primary = false) => ({
  id,
  name,
  width: 1920,
  height: 1080,
  x: 0,
  y: 0,
  scale_factor: 1,
  is_primary,
});

describe("ScreensPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePresentationStore.setState({ displays: [display("laptop", "Laptop", true), display("hdmi", "Projector"), display("tv", "Lobby TV")], syncOutputStatus: async () => {} });
    useScreensStore.setState({ roles: {}, openSide: [], error: null });
  });
  afterEach(cleanup);

  it("pins the main projector to the chosen screen", async () => {
    render(<ScreensPanel />);
    fireEvent.change(screen.getByLabelText("Role for Projector"), { target: { value: "projector" } });
    await vi.waitFor(() => expect(api.setProjectorDisplay).toHaveBeenLastCalledWith("hdmi"));
    expect(useScreensStore.getState().roles).toEqual({ hdmi: "projector" });
  });

  it("opens a copy straight away while the projector is open", async () => {
    render(<ScreensPanel />);
    fireEvent.change(screen.getByLabelText("Role for Lobby TV"), { target: { value: "side" } });
    await vi.waitFor(() => expect(api.openSideScreen).toHaveBeenCalledWith("tv"));
  });

  it("closes a copy whose screen is given another role", async () => {
    useScreensStore.setState({ roles: { tv: "side" }, openSide: ["tv"] });
    render(<ScreensPanel />);
    fireEvent.change(screen.getByLabelText("Role for Lobby TV"), { target: { value: "stage" } });
    await vi.waitFor(() => expect(api.closeSideScreen).toHaveBeenCalledWith("tv"));
    expect(useStageStore.getState().displayId).toBe("tv");
  });
});
