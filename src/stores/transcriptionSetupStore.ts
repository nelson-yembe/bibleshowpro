import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import { tauriInvoke } from "@/lib/tauri";
import {
  EMPTY_ENGINE_CONFIG,
  loadStoredEngineConfig,
  normalizeLanguage,
  saveStoredEngineConfig,
  type StoredEngineConfig,
  type WhisperLanguage,
} from "@/lib/transcription/engineConfig";
import {
  WHISPER_DOWNLOAD_EVENT,
  type TranscriptionCapabilities,
  type WhisperDownloadProgress,
  type WhisperModelListing,
} from "@/lib/transcription/whisperModels";

function messageOf(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string" && err.trim()) return err;
  return fallback;
}

/**
 * Engine setup shared by Settings and the Live Listen page, so a model downloaded in one
 * is immediately usable in the other.
 */
interface TranscriptionSetupState {
  loaded: boolean;
  config: StoredEngineConfig;
  models: WhisperModelListing[];
  capabilities: TranscriptionCapabilities | null;
  downloadingId: string | null;
  progress: WhisperDownloadProgress | null;
  /** Last outcome worth telling the operator about. */
  message: string | null;

  load: () => Promise<void>;
  refreshModels: () => Promise<void>;
  saveConfig: (patch: Partial<StoredEngineConfig>) => Promise<void>;
  setLanguage: (language: WhisperLanguage) => Promise<void>;
  useModel: (model: WhisperModelListing) => Promise<void>;
  download: (modelId: string) => Promise<void>;
  cancelDownload: () => Promise<void>;
  deleteModel: (modelId: string) => Promise<void>;
}

let progressListening = false;

export const useTranscriptionSetupStore = create<TranscriptionSetupState>((set, get) => ({
  loaded: false,
  config: { ...EMPTY_ENGINE_CONFIG },
  models: [],
  capabilities: null,
  downloadingId: null,
  progress: null,
  message: null,

  load: async () => {
    if (!progressListening) {
      progressListening = true;
      void listen<WhisperDownloadProgress>(WHISPER_DOWNLOAD_EVENT, (event) => {
        if (get().downloadingId === event.payload.modelId) set({ progress: event.payload });
      }).catch(() => {
        progressListening = false;
      });
    }
    const [config, capabilities] = await Promise.all([
      loadStoredEngineConfig(),
      tauriInvoke<TranscriptionCapabilities>("get_transcription_capabilities").catch(() => null),
    ]);
    set({ config, capabilities });
    await get().refreshModels();
    set({ loaded: true });
  },

  refreshModels: async () => {
    try {
      set({ models: await tauriInvoke<WhisperModelListing[]>("list_whisper_models") });
    } catch {
      set({ models: [] });
    }
  },

  saveConfig: async (patch) => {
    const next = { ...get().config, ...patch };
    set({ config: next });
    try {
      // Not written back into state: fields like the API key save per keystroke, and a
      // slow earlier reply landing after a newer keystroke would erase characters.
      await saveStoredEngineConfig(next);
    } catch (err) {
      set({ message: messageOf(err, "Could not save the transcription settings.") });
    }
  },

  setLanguage: async (language) => {
    await get().saveConfig({ whisperLanguage: normalizeLanguage(language) });
  },

  useModel: async (model) => {
    if (!model.downloaded) return;
    await get().saveConfig({ whisperModelPath: model.path });
    set({ message: `Using ${model.label}.` });
  },

  download: async (modelId) => {
    if (get().downloadingId) return;
    const model = get().models.find((m) => m.id === modelId);
    set({
      downloadingId: modelId,
      message: null,
      progress: model
        ? { modelId, received: model.partialBytes, total: model.sizeBytes, phase: "downloading" }
        : null,
    });
    try {
      const path = await tauriInvoke<string>("download_whisper_model", { modelId });
      // Select it at once — a downloaded model nobody pointed at helps no one.
      await get().saveConfig({ whisperModelPath: path });
      set({ message: `${model?.label ?? "Model"} downloaded and selected.` });
    } catch (err) {
      set({ message: messageOf(err, "The download failed.") });
    } finally {
      set({ downloadingId: null, progress: null });
      await get().refreshModels();
    }
  },

  cancelDownload: async () => {
    try {
      await tauriInvoke("cancel_whisper_download");
    } catch {
      // Nothing running.
    }
  },

  deleteModel: async (modelId) => {
    const model = get().models.find((m) => m.id === modelId);
    try {
      await tauriInvoke("delete_whisper_model", { modelId });
      if (model && get().config.whisperModelPath === model.path) {
        await get().saveConfig({ whisperModelPath: "" });
      }
      set({ message: `${model?.label ?? "Model"} removed from this PC.` });
    } catch (err) {
      set({ message: messageOf(err, "Could not remove the model.") });
    } finally {
      await get().refreshModels();
    }
  },
}));
