import { describe, expect, it } from "vitest";
import { ENGINE_GEMINI, ENGINE_WEB_SPEECH, ENGINE_WHISPER } from "@/lib/transcription/engine";
import { EMPTY_ENGINE_CONFIG, type StoredEngineConfig } from "@/lib/transcription/engineConfig";
import { engineReadiness, migrateEngineChoice } from "@/lib/transcription/engineReadiness";
import type { TranscriptionCapabilities, WhisperModelListing } from "@/lib/transcription/whisperModels";

function listing(id: string, downloaded: boolean): WhisperModelListing {
  const tier = id.replace(".en", "");
  return {
    id,
    tier,
    label: tier[0].toUpperCase() + tier.slice(1),
    filename: `ggml-${id}.bin`,
    url: "",
    sizeBytes: tier === "small" ? 487_614_201 : tier === "base" ? 147_964_211 : 77_704_715,
    sha256: "",
    ramMb: 388,
    englishOnly: id.endsWith(".en"),
    note: "",
    downloaded,
    path: `C:/models/ggml-${id}.bin`,
    partialBytes: 0,
  };
}

const MODELS = ["tiny.en", "base.en", "small.en", "tiny", "base", "small"].map((id) => listing(id, false));

function caps(supported: boolean, tier: string | null = "base"): TranscriptionCapabilities {
  return {
    profile: {
      cpuName: "Test CPU",
      physicalCores: 4,
      logicalCores: 8,
      totalMemoryMb: 8000,
      availableMemoryMb: 4000,
      cpu: { supported, missing: supported ? [] : ["AVX2"] },
    },
    recommendedTier: supported ? tier : null,
    inferenceThreads: 3,
    modelsDir: "C:/models",
    freeDiskMb: 10_000,
  };
}

function config(overrides: Partial<StoredEngineConfig> = {}): StoredEngineConfig {
  return { ...EMPTY_ENGINE_CONFIG, ...overrides };
}

const ready = (engineId: string, cfg: StoredEngineConfig, models = MODELS, c = caps(true)) =>
  engineReadiness({ engineId, desktop: true, config: cfg, models, capabilities: c });

describe("engineReadiness — Whisper", () => {
  it("asks for the model recommended for this PC when none is chosen", () => {
    const result = ready(ENGINE_WHISPER, config(), MODELS, caps(true, "base"));
    expect(result).toMatchObject({ kind: "needs-model", modelId: "base.en" });
    expect(result.message).toMatch(/Base · 148 MB/);
  });

  it("recommends a multilingual model when the language is French", () => {
    const result = ready(ENGINE_WHISPER, config({ whisperLanguage: "fr" }), MODELS, caps(true, "tiny"));
    expect(result).toMatchObject({ kind: "needs-model", modelId: "tiny" });
  });

  it("refuses up front on a processor that cannot run it", () => {
    const result = ready(ENGINE_WHISPER, config(), MODELS, caps(false));
    expect(result.kind).toBe("unsupported");
    expect(result.message).toMatch(/AVX2/);
    expect(result.message).toMatch(/Gemini/);
  });

  it("notices a chosen model that has since been deleted", () => {
    const result = ready(ENGINE_WHISPER, config({ whisperModelPath: "C:/models/ggml-base.en.bin" }));
    expect(result).toMatchObject({ kind: "needs-model", modelId: "base.en" });
  });

  it("will not call an English-only model ready for French", () => {
    const models = MODELS.map((m) => (m.id === "base.en" ? { ...m, downloaded: true } : m));
    const result = ready(
      ENGINE_WHISPER,
      config({ whisperModelPath: "C:/models/ggml-base.en.bin", whisperLanguage: "fr" }),
      models,
    );
    expect(result.kind).toBe("needs-model");
    expect(result.message).toMatch(/only understands English/);
  });

  it("is ready once a suitable model is on disk", () => {
    const models = MODELS.map((m) => (m.id === "base.en" ? { ...m, downloaded: true } : m));
    const result = ready(ENGINE_WHISPER, config({ whisperModelPath: "C:\\models\\ggml-base.en.bin" }), models);
    expect(result.kind).toBe("ready");
    expect(result.message).toMatch(/Base/);
  });

  it("accepts a custom model file it does not recognise", () => {
    const result = ready(ENGINE_WHISPER, config({ whisperModelPath: "D:/mine/custom.bin" }));
    expect(result.kind).toBe("ready");
  });

  it("falls back to a sensible recommendation without PC facts", () => {
    const result = engineReadiness({
      engineId: ENGINE_WHISPER,
      desktop: false,
      config: config(),
      models: MODELS,
      capabilities: null,
    });
    expect(result).toMatchObject({ kind: "needs-model", modelId: "base.en" });
  });
});

describe("engineReadiness — other engines", () => {
  it("asks Gemini for a key, then calls it ready", () => {
    expect(ready(ENGINE_GEMINI, config()).kind).toBe("needs-key");
    expect(ready(ENGINE_GEMINI, config({ geminiApiKey: "k" })).kind).toBe("ready");
  });

  it("warns that browser speech is unreliable in the installed app", () => {
    expect(ready(ENGINE_WEB_SPEECH, config()).kind).toBe("unreliable");
  });

  it("lets browser speech be ready in an actual browser", () => {
    const result = engineReadiness({
      engineId: ENGINE_WEB_SPEECH,
      desktop: false,
      config: config(),
      models: MODELS,
      capabilities: null,
    });
    expect(result.kind).toBe("ready");
  });
});

describe("migrateEngineChoice", () => {
  it("moves desktop users off browser speech once", () => {
    expect(migrateEngineChoice("web-speech", true, false)).toEqual({
      modelId: ENGINE_WHISPER,
      migrated: true,
    });
  });

  it("treats the removed duplicate browser engine the same way", () => {
    expect(migrateEngineChoice("web-speech-offline", true, false).modelId).toBe(ENGINE_WHISPER);
  });

  it("respects someone who switched back after the migration", () => {
    expect(migrateEngineChoice("web-speech", true, true)).toEqual({
      modelId: ENGINE_WEB_SPEECH,
      migrated: false,
    });
  });

  it("gives new desktop installs Whisper", () => {
    expect(migrateEngineChoice(null, true, false).modelId).toBe(ENGINE_WHISPER);
  });

  it("leaves a deliberate Gemini choice alone", () => {
    expect(migrateEngineChoice(ENGINE_GEMINI, true, false)).toEqual({
      modelId: ENGINE_GEMINI,
      migrated: false,
    });
  });

  it("recovers from an engine id that no longer exists", () => {
    expect(migrateEngineChoice("something-old", true, true).modelId).toBe(ENGINE_WHISPER);
    expect(migrateEngineChoice("something-old", false, true).modelId).toBe(ENGINE_WEB_SPEECH);
  });
});
