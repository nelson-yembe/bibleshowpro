import { describe, expect, it } from "vitest";
import { preprocessTranscriptForDetection, isNavigationPhrase } from "@/lib/transcription/transcriptPreprocess";

describe("transcriptPreprocess", () => {
  it("strips scripture prefix glued to book names", () => {
    expect(preprocessTranscriptForDetection("ScriptureJohn chapter 5, verse 2")).toBe(
      "John chapter 5 verse 2",
    );
  });

  it("fixes join mishear as john", () => {
    expect(preprocessTranscriptForDetection("Join chapter 3, verse 16")).toBe(
      "John chapter 3 verse 16",
    );
  });

  it("detects navigation phrases", () => {
    expect(isNavigationPhrase("Next verse.")).toBe(true);
    expect(isNavigationPhrase("Matthew chapter 5, verse 14")).toBe(false);
  });

  it("repairs efficient → Ephesians when a scripture cue follows", () => {
    expect(preprocessTranscriptForDetection("efficient chapter 5 verse 14")).toBe(
      "Ephesians chapter 5 verse 14",
    );
  });

  it("does not rewrite efficient without a scripture cue", () => {
    expect(preprocessTranscriptForDetection("The process was efficient and clear")).toBe(
      "The process was efficient and clear",
    );
  });

  it("repairs chapter was → verse", () => {
    expect(preprocessTranscriptForDetection("Matthew chapter 24. Was 42")).toMatch(
      /Matthew chapter 24 verse 42/i,
    );
  });

  it("collapses we begin from verse bridges", () => {
    expect(
      preprocessTranscriptForDetection("Second Peter, chapter 1. We begin from verse one."),
    ).toMatch(/2 Peter chapter 1 verse one/i);
  });

  it("normalizes 2nd ordinal book prefix", () => {
    expect(preprocessTranscriptForDetection("2nd Peter chapter 1 verse 1")).toMatch(
      /2 Peter chapter 1 verse 1/i,
    );
  });
});
