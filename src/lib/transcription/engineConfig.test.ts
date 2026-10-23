import { describe, expect, it } from "vitest";
import {
  EMPTY_ENGINE_CONFIG,
  engineConfigError,
  toEngineConfig,
  type StoredEngineConfig,
} from "@/lib/transcription/engineConfig";
import { ENGINE_GEMINI, ENGINE_WHISPER } from "@/lib/transcription/engine";

function stored(overrides: Partial<StoredEngineConfig> = {}): StoredEngineConfig {
  return { ...EMPTY_ENGINE_CONFIG, ...overrides };
}

describe("toEngineConfig", () => {
  it("turns blank fields into undefined so engines can test presence", () => {
    const config = toEngineConfig(stored());
    expect(config.geminiApiKey).toBeUndefined();
    expect(config.geminiModel).toBeUndefined();
    expect(config.whisperModelPath).toBeUndefined();
  });

  it("treats whitespace-only values as absent", () => {
    const config = toEngineConfig(stored({ geminiApiKey: "   " }));
    expect(config.geminiApiKey).toBeUndefined();
  });

  it("trims real values through", () => {
    const config = toEngineConfig(stored({ geminiApiKey: " abc123 ", whisperModelPath: " C:/m.bin " }));
    expect(config.geminiApiKey).toBe("abc123");
    expect(config.whisperModelPath).toBe("C:/m.bin");
  });

  it("tells online engines which languages to listen for instead of letting them guess", () => {
    expect(toEngineConfig(stored()).languageCodes).toEqual(["en-US"]);
    expect(toEngineConfig(stored({ whisperLanguage: "fr" })).languageCodes).toEqual(["fr-FR"]);
    expect(toEngineConfig(stored({ whisperLanguage: "auto" })).languageCodes).toEqual(["en-US", "fr-FR"]);
  });
});

describe("engineConfigError", () => {
  it("blocks Gemini without a key", () => {
    expect(engineConfigError(ENGINE_GEMINI, stored())).toMatch(/API key/i);
  });

  it("allows Gemini once a key is present", () => {
    expect(engineConfigError(ENGINE_GEMINI, stored({ geminiApiKey: "abc" }))).toBeNull();
  });

  it("blocks Whisper until a model is downloaded", () => {
    expect(engineConfigError(ENGINE_WHISPER, stored())).toMatch(/Download a Whisper model/);
  });

  it("allows Whisper once a path is present", () => {
    expect(engineConfigError(ENGINE_WHISPER, stored({ whisperModelPath: "m.bin" }))).toBeNull();
  });

  it("has nothing to say about an engine it does not configure", () => {
    expect(engineConfigError("some-engine", stored())).toBeNull();
  });
});
