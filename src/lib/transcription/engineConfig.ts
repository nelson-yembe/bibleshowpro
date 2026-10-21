import { tauriInvoke } from "@/lib/tauri";
import type { TranscriptionEngineConfig } from "@/lib/transcription/engine";

/** Mirrors the Rust `TranscriptionEngineConfig` stored in the app database. */
export interface StoredEngineConfig {
  geminiApiKey: string;
  geminiModel: string;
  whisperModelPath: string;
}

export const EMPTY_ENGINE_CONFIG: StoredEngineConfig = {
  geminiApiKey: "",
  geminiModel: "",
  whisperModelPath: "",
};

/** Falls back to empty outside Tauri so the browser dev server still runs. */
export async function loadStoredEngineConfig(): Promise<StoredEngineConfig> {
  try {
    const stored = await tauriInvoke<StoredEngineConfig>("get_transcription_engine_config");
    return { ...EMPTY_ENGINE_CONFIG, ...stored };
  } catch {
    return { ...EMPTY_ENGINE_CONFIG };
  }
}

export async function saveStoredEngineConfig(
  config: StoredEngineConfig,
): Promise<StoredEngineConfig> {
  const saved = await tauriInvoke<StoredEngineConfig>("save_transcription_engine_config", {
    config,
  });
  return { ...EMPTY_ENGINE_CONFIG, ...saved };
}

/** Blank strings become undefined, so engines can test presence rather than emptiness. */
export function toEngineConfig(stored: StoredEngineConfig): TranscriptionEngineConfig {
  return {
    geminiApiKey: stored.geminiApiKey.trim() || undefined,
    geminiModel: stored.geminiModel.trim() || undefined,
    whisperModelPath: stored.whisperModelPath.trim() || undefined,
    languageCodes: [],
  };
}

/** Whether the operator has supplied what the chosen engine needs to start. */
export function engineConfigError(modelId: string, stored: StoredEngineConfig): string | null {
  if (modelId === "gemini-transcribe-live" && !stored.geminiApiKey.trim()) {
    return "Add a Gemini API key in Settings before using this engine.";
  }
  if (modelId === "whisper-local" && !stored.whisperModelPath.trim()) {
    return "Choose a Whisper model file in Settings before using this engine.";
  }
  return null;
}
