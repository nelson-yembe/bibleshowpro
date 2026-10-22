import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const invoke = vi.fn();

vi.mock("@/lib/tauri", () => ({ tauriInvoke: (...args: unknown[]) => invoke(...args) }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));

const { ListenSetupStrip } = await import("@/modules/transcription/ListenSetupStrip");
const { useTranscriptionSetupStore } = await import("@/stores/transcriptionSetupStore");
const { useTranscriptionStore } = await import("@/stores/transcriptionStore");
const { useCaptionStore } = await import("@/stores/captionStore");
const { EMPTY_ENGINE_CONFIG } = await import("@/lib/transcription/engineConfig");

function model(id: string, downloaded: boolean) {
  const tier = id.replace(".en", "");
  return {
    id,
    tier,
    label: tier[0].toUpperCase() + tier.slice(1),
    filename: `ggml-${id}.bin`,
    url: "",
    sizeBytes: 147_964_211,
    sha256: "",
    ramMb: 388,
    englishOnly: id.endsWith(".en"),
    note: "",
    downloaded,
    path: `C:/models/ggml-${id}.bin`,
    partialBytes: 0,
  };
}

function backend(config: Partial<typeof EMPTY_ENGINE_CONFIG>, models = [model("base.en", true), model("base", false)]) {
  invoke.mockImplementation((command: string, args?: { config?: unknown }) => {
    switch (command) {
      case "list_whisper_models":
        return Promise.resolve(models);
      case "get_transcription_engine_config":
        return Promise.resolve({ ...EMPTY_ENGINE_CONFIG, ...config });
      case "get_transcription_capabilities":
        return Promise.resolve({
          profile: {
            cpuName: "Test CPU",
            physicalCores: 4,
            logicalCores: 8,
            totalMemoryMb: 8_000,
            availableMemoryMb: 4_000,
            cpu: { supported: true, missing: [] },
          },
          recommendedTier: "base",
          inferenceThreads: 3,
          modelsDir: "C:/models",
          freeDiskMb: 10_000,
        });
      case "save_transcription_engine_config":
        return Promise.resolve(args?.config);
      default:
        return Promise.resolve("");
    }
  });
}

function renderStrip(disabled = false) {
  return render(
    <MemoryRouter>
      <ListenSetupStrip disabled={disabled} />
    </MemoryRouter>,
  );
}

describe("ListenSetupStrip", () => {
  beforeEach(() => {
    invoke.mockReset();
    localStorage.clear();
    useTranscriptionSetupStore.setState({
      loaded: false,
      config: { ...EMPTY_ENGINE_CONFIG },
      models: [],
      capabilities: null,
      downloadingId: null,
      progress: null,
      message: null,
    });
    useTranscriptionStore.setState({
      modelId: "whisper-local",
      heardLanguage: null,
      audioWarning: null,
      preflightStatus: "idle",
      preflightMessage: null,
    });
    useCaptionStore.setState((s) => ({ settings: { ...s.settings, enabled: false } }));
  });

  afterEach(() => {
    cleanup();
  });

  it("folds a ready setup into one line, with no controls showing", async () => {
    backend({ whisperModelPath: "C:/models/ggml-base.en.bin" });
    renderStrip();
    expect(await screen.findByText("Whisper (offline) · English · Base")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("opens to the engine, language and model switches", async () => {
    backend({ whisperModelPath: "C:/models/ggml-base.en.bin" });
    renderStrip();
    fireEvent.click(await screen.findByRole("button", { expanded: false }));
    expect(screen.getAllByRole("combobox")).toHaveLength(3);
    expect(localStorage.getItem("bsp-listen-setup-expanded")).toBe("1");
  });

  it("shows a problem and its fix even while folded", async () => {
    backend({}, [model("base.en", false)]);
    renderStrip();
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/Download a speech model/));
    expect(screen.getByRole("button", { name: /Download Base/ })).toBeInTheDocument();
  });

  it("turns captions on and off without opening anything", async () => {
    backend({ whisperModelPath: "C:/models/ggml-base.en.bin" });
    renderStrip();
    fireEvent.click(await screen.findByRole("checkbox", { name: /Captions/ }));
    expect(useCaptionStore.getState().settings.enabled).toBe(true);
  });

  it("says which language a bilingual service is in right now", async () => {
    backend({ whisperLanguage: "auto", whisperModelPath: "C:/models/ggml-base.bin" }, [model("base", true)]);
    useTranscriptionStore.setState({ heardLanguage: "fr" });
    renderStrip();
    expect(await screen.findByText(/English \+ French · now Français/)).toBeInTheDocument();
  });

  it("points a microphone problem at the microphone settings", async () => {
    backend({ whisperModelPath: "C:/models/ggml-base.en.bin" });
    useTranscriptionStore.setState({ audioWarning: "Still no audio on the selected input." });
    renderStrip();
    expect(await screen.findByText(/Still no audio/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Microphone settings" })).toBeInTheDocument();
  });
});
