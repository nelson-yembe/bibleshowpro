import { describe, expect, it } from "vitest";
import { cleanWhisperText } from "@/lib/transcription/whisperText";

describe("cleanWhisperText", () => {
  it("drops a silent segment entirely", () => {
    expect(cleanWhisperText("[BLANK_AUDIO]")).toBe("");
    expect(cleanWhisperText("  (blank)  ")).toBe("");
  });

  it("drops non-speech annotations", () => {
    expect(cleanWhisperText("[Music]")).toBe("");
    expect(cleanWhisperText("(upbeat music)")).toBe("");
  });

  it("keeps real speech untouched", () => {
    expect(cleanWhisperText("Blessed are the pure in heart")).toBe(
      "Blessed are the pure in heart",
    );
  });

  it("strips an annotation sitting beside real speech", () => {
    expect(cleanWhisperText("[BLANK_AUDIO] turn with me to James four")).toBe(
      "turn with me to James four",
    );
    expect(cleanWhisperText("turn with me to James four (music)")).toBe(
      "turn with me to James four",
    );
  });

  it("collapses the whitespace an annotation leaves behind", () => {
    expect(cleanWhisperText("the Lord [cough] is my shepherd")).toBe("the Lord is my shepherd");
  });

  it("handles empty input", () => {
    expect(cleanWhisperText("")).toBe("");
    expect(cleanWhisperText("   ")).toBe("");
  });
});
