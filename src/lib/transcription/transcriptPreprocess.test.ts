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

  it("repairs Numbers are the N", () => {
    expect(preprocessTranscriptForDetection("Numbers are the 14 again")).toMatch(/Numbers 14/i);
  });

  it("joins chapter then bare verse digit", () => {
    expect(preprocessTranscriptForDetection("Joshua chapter 14. 12.")).toMatch(
      /Joshua chapter 14 verse 12/i,
    );
  });

  it("repairs slash refs and evils → Hebrews", () => {
    expect(preprocessTranscriptForDetection("Go with evils. 11/1")).toMatch(/Hebrews 11:1/i);
  });

  it("strips go to navigation cue", () => {
    expect(preprocessTranscriptForDetection("Go to Joshua chapter 14")).toMatch(
      /^Joshua chapter 14/i,
    );
  });

  it("does not wipe earlier scripture when later look at is ordinary speech", () => {
    const out = preprocessTranscriptForDetection(
      "Go to Joshua chapter 14. Now therefore give me this mountain. When I look at them I said",
    );
    expect(out).toMatch(/Joshua chapter 14/i);
    expect(out).toMatch(/look at them/i);
  });

  it("keeps mid-sentence go to when the tail announces a book/chapter", () => {
    const out = preprocessTranscriptForDetection(
      "Caleb had courage. Go to Joshua chapter 14 verse 12",
    );
    expect(out).toMatch(/Joshua chapter 14 verse 12/i);
  });
});
