import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ translateCaption: vi.fn() }));
vi.mock("@/lib/tauri", () => ({ api }));
vi.mock("@tauri-apps/api/event", () => ({ emit: vi.fn(async () => {}), listen: vi.fn(async () => () => {}) }));

const { useCaptionStore } = await import("@/stores/captionStore");
const { DEFAULT_CAPTION_SETTINGS } = await import("@/lib/captions");

describe("caption translation", () => {
  beforeEach(() => {
    api.translateCaption.mockReset();
    useCaptionStore.setState({
      settings: { ...DEFAULT_CAPTION_SETTINGS, enabled: true, translateTo: "other" },
      finalLines: [],
      partial: "",
      translatedLines: [],
      translationError: null,
      revision: 0,
    });
  });

  it("translates each finished line into the other language", async () => {
    api.translateCaption.mockResolvedValue("Car Dieu a tant aimé le monde");
    useCaptionStore.getState().pushFinal("For God so loved the world", "en");
    expect(api.translateCaption).toHaveBeenCalledWith("For God so loved the world", "en", "fr");
    await vi.waitFor(() => expect(useCaptionStore.getState().translatedLines).toEqual(["Car Dieu a tant aimé le monde"]));
  });

  it("keeps the original captions going when translation fails, and says why", async () => {
    api.translateCaption.mockRejectedValue(new Error("Caption translation needs a Gemini API key."));
    useCaptionStore.getState().pushFinal("Amen", "en");
    await vi.waitFor(() => expect(useCaptionStore.getState().translationError).toMatch(/Gemini API key/));
    expect(useCaptionStore.getState().finalLines).toEqual(["Amen"]);
  });

  it("drops a translation that arrives after translation was turned off", async () => {
    let finish: (text: string) => void = () => {};
    api.translateCaption.mockReturnValue(new Promise<string>((resolve) => (finish = resolve)));
    useCaptionStore.getState().pushFinal("Grace and peace", "en");
    useCaptionStore.getState().updateSettings({ translateTo: "off" });
    finish("Grâce et paix");
    await Promise.resolve();
    expect(useCaptionStore.getState().translatedLines).toEqual([]);
  });
});
