import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

const invoke = vi.fn();

vi.mock("@/lib/tauri", () => ({ tauriInvoke: (...args: unknown[]) => invoke(...args) }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));

const { TranscriptionEnginePanel } = await import(
  "@/modules/settings/TranscriptionEnginePanel"
);

const CATALOG = [
  {
    id: "tiny.en",
    label: "Tiny (fastest)",
    filename: "ggml-tiny.en.bin",
    url: "https://example.test/ggml-tiny.en.bin",
    sizeBytes: 77_704_715,
    note: "Lowest accuracy.",
  },
  {
    id: "base.en",
    label: "Base (recommended)",
    filename: "ggml-base.en.bin",
    url: "https://example.test/ggml-base.en.bin",
    sizeBytes: 147_964_211,
    note: "The usual starting point.",
  },
];

describe("TranscriptionEnginePanel — Whisper models", () => {
  beforeEach(() => {
    invoke.mockReset();
    invoke.mockImplementation((command: string) => {
      if (command === "list_whisper_models") return Promise.resolve(CATALOG);
      if (command === "get_transcription_engine_config") {
        return Promise.resolve({ geminiApiKey: "", geminiModel: "", whisperModelPath: "" });
      }
      return Promise.resolve("");
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("lists the downloadable models with their sizes", async () => {
    render(<TranscriptionEnginePanel embedded />);
    await waitFor(() => expect(screen.getByText("Tiny (fastest)")).toBeInTheDocument());
    expect(screen.getByText("Base (recommended)")).toBeInTheDocument();
    expect(screen.getByText("· 78 MB")).toBeInTheDocument();
    expect(screen.getByText("· 148 MB")).toBeInTheDocument();
  });

  it("offers a download button per model", async () => {
    render(<TranscriptionEnginePanel embedded />);
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Download" })).toHaveLength(2));
  });

  it("marks the model already in use instead of offering it again", async () => {
    invoke.mockImplementation((command: string) => {
      if (command === "list_whisper_models") return Promise.resolve(CATALOG);
      if (command === "get_transcription_engine_config") {
        return Promise.resolve({
          geminiApiKey: "",
          geminiModel: "",
          whisperModelPath: "C:/models/ggml-base.en.bin",
        });
      }
      return Promise.resolve("");
    });

    render(<TranscriptionEnginePanel embedded />);
    await waitFor(() => expect(screen.getByText("In use")).toBeInTheDocument());
    expect(screen.getAllByRole("button", { name: "Download" })).toHaveLength(1);
  });

  it("degrades to the file picker when the backend has no catalog", async () => {
    invoke.mockImplementation((command: string) => {
      if (command === "list_whisper_models") return Promise.reject(new Error("no backend"));
      if (command === "get_transcription_engine_config") {
        return Promise.resolve({ geminiApiKey: "", geminiModel: "", whisperModelPath: "" });
      }
      return Promise.resolve("");
    });

    render(<TranscriptionEnginePanel embedded />);
    // Settling on the loaded config proves both startup effects have run.
    await waitFor(() =>
      expect(screen.getByPlaceholderText("Paste a paid-tier API key")).toBeInTheDocument(),
    );
    expect(screen.queryByRole("button", { name: "Download" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Browse…" })).toBeInTheDocument();
  });
});
