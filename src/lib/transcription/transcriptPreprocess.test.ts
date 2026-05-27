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
});
