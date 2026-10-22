import { tauriInvoke } from "@/lib/tauri";
import { ENGINE_GEMINI, ENGINE_WHISPER, type TranscriptionEngineConfig } from "@/lib/transcription/engine";

export type WhisperLanguage = "en" | "fr" | "auto";

/** Mirrors the Rust `TranscriptionEngineConfig` stored in the app database. */
export interface StoredEngineConfig {
  geminiApiKey: string;
  geminiModel: string;
  whisperModelPath: string;
  whisperLanguage: WhisperLanguage;
}

export const EMPTY_ENGINE_CONFIG: StoredEngineConfig = {
  geminiApiKey: "",
  geminiModel: "",
  whisperModelPath: "",
  whisperLanguage: "en",
};

export function normalizeLanguage(value: unknown): WhisperLanguage {
  return value === "fr" || value === "auto" ? value : "en";
}

/**
 * BCP-47 locales for the spoken-language setting. Online engines asked to detect the
 * language unaided pick from about a hundred, and turned unclear phrases into Hindi and
 * Korean; naming the service's languages keeps them to English and French.
 */
export function speechLocales(language: WhisperLanguage): string[] {
  switch (language) {
    case "fr":
      return ["fr-FR"];
    case "auto":
      return ["en-US", "fr-FR"];
    default:
      return ["en-US"];
  }
}

function normalize(stored: Partial<StoredEngineConfig> | null | undefined): StoredEngineConfig {
  return {
    geminiApiKey: typeof stored?.geminiApiKey === "string" ? stored.geminiApiKey : "",
    geminiModel: typeof stored?.geminiModel === "string" ? stored.geminiModel : "",
    whisperModelPath: typeof stored?.whisperModelPath === "string" ? stored.whisperModelPath : "",
    whisperLanguage: normalizeLanguage(stored?.whisperLanguage),
  };
}

/** Falls back to empty outside Tauri so the browser dev server still runs. */
export async function loadStoredEngineConfig(): Promise<StoredEngineConfig> {
  try {
    return normalize(await tauriInvoke<StoredEngineConfig>("get_transcription_engine_config"));
  } catch {
    return { ...EMPTY_ENGINE_CONFIG };
  }
}

export async function saveStoredEngineConfig(
  config: StoredEngineConfig,
): Promise<StoredEngineConfig> {
  const saved = await tauriInvoke<StoredEngineConfig>("save_transcription_engine_config", {
    config: normalize(config),
  });
  return normalize(saved);
}

/** Blank strings become undefined, so engines can test presence rather than emptiness. */
export function toEngineConfig(stored: StoredEngineConfig): TranscriptionEngineConfig {
  return {
    geminiApiKey: stored.geminiApiKey.trim() || undefined,
    geminiModel: stored.geminiModel.trim() || undefined,
    whisperModelPath: stored.whisperModelPath.trim() || undefined,
    whisperLanguage: normalizeLanguage(stored.whisperLanguage),
    languageCodes: speechLocales(normalizeLanguage(stored.whisperLanguage)),
  };
}

/** Whether the operator has supplied what the chosen engine needs to start. */
export function engineConfigError(modelId: string, stored: StoredEngineConfig): string | null {
  if (modelId === ENGINE_GEMINI && !stored.geminiApiKey.trim()) {
    return "Add a Gemini API key in Settings → Transcription Engine before using this engine.";
  }
  if (modelId === ENGINE_WHISPER && !stored.whisperModelPath.trim()) {
    return "Download a Whisper model in Settings → Transcription Engine before using this engine.";
  }
  return null;
}
