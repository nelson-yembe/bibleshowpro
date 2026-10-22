import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

const invoke = vi.fn();

vi.mock("@/lib/tauri", () => ({ tauriInvoke: (...args: unknown[]) => invoke(...args) }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));

const { TranscriptionEnginePanel } = await import("@/modules/settings/TranscriptionEnginePanel");
const { useTranscriptionSetupStore } = await import("@/stores/transcriptionSetupStore");
const { useTranscriptionStore } = await import("@/stores/transcriptionStore");
const { EMPTY_ENGINE_CONFIG } = await import("@/lib/transcription/engineConfig");

function model(id: string, extra: Record<string, unknown> = {}) {
  const tier = id.replace(".en", "");
  const sizes: Record<string, number> = { tiny: 77_704_715, base: 147_964_211, small: 487_614_201 };
  return {
    id,
    tier,
    label: tier[0].toUpperCase() + tier.slice(1),
    filename: `ggml-${id}.bin`,
    url: "",
    sizeBytes: sizes[tier],
    sha256: "",
    ramMb: tier === "small" ? 852 : tier === "base" ? 388 : 273,
    englishOnly: id.endsWith(".en"),
    note: `${tier} note`,
    downloaded: false,
    path: `C:/models/ggml-${id}.bin`,
    partialBytes: 0,
    ...extra,
  };
}

function capabilities(supported = true) {
  return {
    profile: {
      cpuName: "Intel(R) Core(TM) i5-8350U",
      physicalCores: 4,
      logicalCores: 8,
      totalMemoryMb: 7_900,
      availableMemoryMb: 4_000,
      cpu: { supported, missing: supported ? [] : ["AVX2"] },
    },
    recommendedTier: supported ? "base" : null,
    inferenceThreads: 3,
    modelsDir: "C:/models",
    freeDiskMb: 12_000,
  };
}

function backend(options: {
  models?: ReturnType<typeof model>[];
  config?: Partial<typeof EMPTY_ENGINE_CONFIG>;
  caps?: ReturnType<typeof capabilities> | null;
  noCatalog?: boolean;
}) {
  const models = options.models ?? ["tiny.en", "base.en", "small.en", "tiny", "base", "small"].map((id) => model(id));
  invoke.mockImplementation((command: string, args?: { config?: unknown }) => {
    switch (command) {
      case "list_whisper_models":
        return options.noCatalog ? Promise.reject(new Error("no backend")) : Promise.resolve(models);
      case "get_transcription_engine_config":
        return Promise.resolve({ ...EMPTY_ENGINE_CONFIG, ...options.config });
      case "get_transcription_capabilities":
        return options.caps === null ? Promise.reject(new Error("no backend")) : Promise.resolve(options.caps ?? capabilities());
      case "save_transcription_engine_config":
        return Promise.resolve(args?.config);
      default:
        return Promise.resolve("");
    }
  });
}

describe("TranscriptionEnginePanel", () => {
  beforeEach(() => {
    invoke.mockReset();
    useTranscriptionSetupStore.setState({
      loaded: false,
      config: { ...EMPTY_ENGINE_CONFIG },
      models: [],
      capabilities: null,
      downloadingId: null,
      progress: null,
      message: null,
    });
    useTranscriptionStore.setState({ modelId: "whisper-local" });
  });

  afterEach(() => {
    cleanup();
  });

  it("puts offline Whisper first and selected by default", async () => {
    backend({});
    render(<TranscriptionEnginePanel embedded />);
    const radios = await screen.findAllByRole("radio");
    expect(radios[0]).toBeChecked();
    expect(screen.getByText("Whisper (offline) — recommended")).toBeInTheDocument();
  });

  it("lists the English models with sizes and marks the one recommended for this PC", async () => {
    backend({});
    render(<TranscriptionEnginePanel embedded />);
    await waitFor(() => expect(screen.getByText("Recommended for this PC")).toBeInTheDocument());
    expect(screen.getByText("· 148 MB")).toBeInTheDocument();
    expect(screen.getByText("· 488 MB")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Download" })).toHaveLength(3);
  });

  it("tells the operator what to download before they press Start", async () => {
    backend({});
    render(<TranscriptionEnginePanel embedded />);
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Download a speech model to start (Base · 148 MB)"),
    );
  });

  it("describes this PC and says offline transcription is supported", async () => {
    backend({});
    render(<TranscriptionEnginePanel embedded />);
    await waitFor(() => expect(screen.getByText(/offline transcription supported/)).toBeInTheDocument());
    expect(screen.getByText(/i5-8350U · 4 cores/)).toBeInTheDocument();
  });

  it("explains a processor that cannot run offline transcription instead of crashing", async () => {
    backend({ caps: capabilities(false) });
    render(<TranscriptionEnginePanel embedded />);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/lacks AVX2/));
  });

  it("offers Use and Delete for a downloaded model, and marks the one in use", async () => {
    backend({
      models: [
        model("tiny.en", { downloaded: true }),
        model("base.en", { downloaded: true }),
        model("small.en"),
      ],
      config: { whisperModelPath: "C:/models/ggml-base.en.bin" },
    });
    render(<TranscriptionEnginePanel embedded />);
    await waitFor(() => expect(screen.getByText("In use")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Use" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Delete / })).toHaveLength(2);
    expect(screen.getByRole("status")).toHaveTextContent(/Ready — Whisper Base/);
  });

  it("offers to resume an interrupted download", async () => {
    backend({ models: [model("base.en", { partialBytes: 50_000_000 })] });
    render(<TranscriptionEnginePanel embedded />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Resume" })).toBeInTheDocument());
  });

  it("shows multilingual models when the language is French", async () => {
    backend({ config: { whisperLanguage: "fr" } });
    render(<TranscriptionEnginePanel embedded />);
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Download" })).toHaveLength(3));
    expect(screen.getByText(/scripture detection is tuned for English/)).toBeInTheDocument();
  });

  it("still renders when no backend answers", async () => {
    backend({ noCatalog: true, caps: null });
    render(<TranscriptionEnginePanel embedded />);
    await waitFor(() => expect(screen.getByText(/Model list unavailable/)).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Download" })).not.toBeInTheDocument();
  });
});
