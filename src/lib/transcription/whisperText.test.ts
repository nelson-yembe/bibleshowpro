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

  it("drops subtitle credits Whisper invents on unclear audio", () => {
    expect(cleanWhisperText("Thanks for watching!")).toBe("");
    expect(cleanWhisperText("Sous-titres réalisés par la communauté d'Amara.org")).toBe("");
    expect(cleanWhisperText("Merci d'avoir regardé cette vidéo")).toBe("");
  });

  it("keeps thanks that a congregation actually says", () => {
    expect(cleanWhisperText("Thank you.")).toBe("Thank you.");
    expect(cleanWhisperText("Thank you Lord for watching over us")).toBe("Thank you Lord for watching over us");
  });

  it("handles empty input", () => {
    expect(cleanWhisperText("")).toBe("");
    expect(cleanWhisperText("   ")).toBe("");
  });
});
