import { beforeEach, describe, expect, it } from "vitest";
import {
  clearCorrectionMemory,
  listCorrectionEntries,
  lookupLearnedReference,
  normalizePhraseKey,
  recordCorrectionAccept,
  recordCorrectionIgnore,
  recordCorrectionOverride,
  shouldSuppressSuggestion,
} from "@/lib/transcription/correctionMemory";

describe("correctionMemory", () => {
  beforeEach(() => {
    clearCorrectionMemory();
  });

  it("normalizes phrase keys", () => {
    expect(normalizePhraseKey("  Go with Evils. 11/1 ")).toBe("go with evils 11 1");
  });

  it("reuses a phrase after accept", () => {
    recordCorrectionAccept("Go with evils. 11/1 now faith", "Hebrews 11:1");
    const hit = lookupLearnedReference("Go with evils 11/1 now faith is the substance");
    expect(hit?.reference).toBe("Hebrews 11:1");
    expect(hit?.confidence).toBeGreaterThanOrEqual(0.72);
  });

  it("does not reuse when ignores outweigh accepts", () => {
    recordCorrectionAccept("random sermon noise about mountains today", "Psalm 121:1");
    recordCorrectionIgnore("random sermon noise about mountains today", "Psalm 121:1");
    recordCorrectionIgnore("random sermon noise about mountains today", "Psalm 121:1");
    expect(lookupLearnedReference("random sermon noise about mountains today")).toBeNull();
    expect(
      shouldSuppressSuggestion("random sermon noise about mountains today", "Psalm 121:1"),
    ).toBe(true);
  });

  it("override strengthens the corrected reference", () => {
    recordCorrectionOverride(
      "Now therefore give me this mountain that day",
      "Matthew 17:20",
      "Joshua 14:12",
    );
    const hit = lookupLearnedReference("Now therefore give me this mountain that day");
    expect(hit?.reference).toBe("Joshua 14:12");
    const entries = listCorrectionEntries();
    const rejected = entries.find((e) => e.reference === "Matthew 17:20");
    expect(rejected?.ignoreCount).toBeGreaterThanOrEqual(1);
  });

  it("ignores very short phrases", () => {
    recordCorrectionAccept("yes", "John 3:16");
    expect(lookupLearnedReference("yes")).toBeNull();
    expect(listCorrectionEntries()).toHaveLength(0);
  });
});
