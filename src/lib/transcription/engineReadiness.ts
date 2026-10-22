/**
 * Whether the chosen engine can run right now, and the single thing to do if not.
 *
 * Every failure an operator has hit so far reached them as a puzzle mid-service. This
 * answers the question before they press Start, in one sentence with one action.
 */

import { ENGINE_GEMINI, ENGINE_WEB_SPEECH, ENGINE_WHISPER } from "@/lib/transcription/engine";
import type { StoredEngineConfig, WhisperLanguage } from "@/lib/transcription/engineConfig";
import {
  formatBytes,
  isUsableForLanguage,
  recommendedModelId,
  selectedModel,
  type TranscriptionCapabilities,
  type WhisperModelListing,
} from "@/lib/transcription/whisperModels";

export type Readiness =
  | { kind: "ready"; message: string }
  /** `modelId` is what to download (or re-download) to fix it. */
  | { kind: "needs-model"; message: string; modelId: string | null }
  | { kind: "needs-key"; message: string }
  | { kind: "unsupported"; message: string }
  | { kind: "unreliable"; message: string };

const LANGUAGE_NAMES: Record<WhisperLanguage, string> = {
  en: "English",
  fr: "French",
  auto: "auto-detected language",
};

export function isDesktopApp(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function engineReadiness(args: {
  engineId: string;
  desktop: boolean;
  config: StoredEngineConfig;
  models: WhisperModelListing[];
  capabilities: TranscriptionCapabilities | null;
}): Readiness {
  const { engineId, desktop, config, models, capabilities } = args;

  if (engineId === ENGINE_GEMINI) {
    return config.geminiApiKey.trim()
      ? { kind: "ready", message: "Ready — Gemini (online)." }
      : { kind: "needs-key", message: "Add a Gemini API key in Settings to use online transcription." };
  }

  if (engineId === ENGINE_WEB_SPEECH) {
    return desktop
      ? {
          kind: "unreliable",
          message:
            "Browser speech recognition depends on Microsoft's WebView2 runtime and usually returns nothing in the installed app. Use Whisper (offline) instead.",
        }
      : { kind: "ready", message: "Ready — browser speech recognition." };
  }

  if (engineId !== ENGINE_WHISPER) {
    return { kind: "unsupported", message: "Unknown transcription engine. Choose one in Settings." };
  }

  if (capabilities && !capabilities.profile.cpu.supported) {
    const missing = capabilities.profile.cpu.missing.join(", ");
    return {
      kind: "unsupported",
      message: `This PC's processor can't run offline transcription (it lacks ${missing}). Use Gemini (online) instead.`,
    };
  }

  const language = config.whisperLanguage;
  const tier = capabilities?.recommendedTier ?? "base";
  const recommended = recommendedModelId(models, tier, language);
  const describe = (id: string | null) => {
    const model = models.find((m) => m.id === id);
    return model ? `${model.label} · ${formatBytes(model.sizeBytes)}` : "a model";
  };

  const path = config.whisperModelPath.trim();
  if (!path) {
    return {
      kind: "needs-model",
      message: `Download a speech model to start (${describe(recommended)}).`,
      modelId: recommended,
    };
  }

  const chosen = selectedModel(models, path);
  if (chosen && !chosen.downloaded) {
    return {
      kind: "needs-model",
      message: `The ${chosen.label} model is no longer on this PC. Download it again.`,
      modelId: chosen.id,
    };
  }
  if (chosen && !isUsableForLanguage(chosen, language)) {
    return {
      kind: "needs-model",
      message: `The selected model only understands English. Download a multilingual model for ${LANGUAGE_NAMES[language]} (${describe(recommended)}).`,
      modelId: recommended,
    };
  }

  return {
    kind: "ready",
    message: chosen
      ? `Ready — Whisper ${chosen.label}, ${LANGUAGE_NAMES[language]}, offline.`
      : "Ready — custom Whisper model, offline.",
  };
}

/** Bumped when the default changes, so each change migrates people exactly once. */
export const ENGINE_MIGRATION_KEY = "bsp-engine-default-v2";

const KNOWN_ENGINES = new Set([ENGINE_WHISPER, ENGINE_GEMINI, ENGINE_WEB_SPEECH]);

export function defaultEngine(desktop: boolean): string {
  return desktop ? ENGINE_WHISPER : ENGINE_WEB_SPEECH;
}

/**
 * The engine to use at startup.
 *
 * Browser speech was the old default, and in the installed app it silently returns
 * nothing — so people who never chose anything were left on a broken engine. Desktop
 * users still on it are moved to Whisper once. Anyone who switches back afterwards keeps
 * their choice.
 */
export function migrateEngineChoice(
  persisted: string | null | undefined,
  desktop: boolean,
  alreadyMigrated: boolean,
): { modelId: string; migrated: boolean } {
  // "web-speech-offline" was a duplicate of browser speech and no longer exists.
  const normalized = persisted === "web-speech-offline" ? ENGINE_WEB_SPEECH : persisted;
  if (desktop && !alreadyMigrated && (!normalized || normalized === ENGINE_WEB_SPEECH)) {
    return { modelId: ENGINE_WHISPER, migrated: true };
  }
  if (!normalized || !KNOWN_ENGINES.has(normalized)) {
    return { modelId: defaultEngine(desktop), migrated: false };
  }
  return { modelId: normalized, migrated: false };
}
