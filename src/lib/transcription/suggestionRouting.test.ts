import { describe, expect, it } from "vitest";
import {
  detectionRank,
  isExplicitScripture,
  isOperatorVerifyOnly,
  pickAutoOutputSuggestion,
  rankSuggestions,
} from "@/lib/transcription/suggestionRouting";
import type { ConfidenceLevel, DetectionType } from "@/lib/transcription/types";

function hit(
  detectionType: DetectionType,
  confidence = 0.8,
  confidenceLevel: ConfidenceLevel = "high",
) {
  return { detectionType, confidence, confidenceLevel };
}

describe("suggestion routing", () => {
  it("only lets confident explicit citations reach live projection", () => {
    expect(isExplicitScripture(hit("explicit"))).toBe(true);
    expect(isExplicitScripture(hit("explicit", 0.4, "low"))).toBe(false);
    expect(isExplicitScripture(hit("inferred"))).toBe(false);
    expect(isExplicitScripture(hit("quote"))).toBe(false);
    expect(isExplicitScripture(hit("paraphrase"))).toBe(false);
  });

  it("holds speculative hits for operator verification", () => {
    expect(isOperatorVerifyOnly(hit("quote"))).toBe(true);
    expect(isOperatorVerifyOnly(hit("paraphrase"))).toBe(true);
    expect(isOperatorVerifyOnly(hit("topic"))).toBe(true);
    expect(isOperatorVerifyOnly(hit("explicit"))).toBe(false);
    expect(isOperatorVerifyOnly(hit("inferred"))).toBe(false);
  });

  it("ranks explicit above inferred above speculative regardless of confidence", () => {
    expect(detectionRank(hit("explicit", 0))).toBeGreaterThan(detectionRank(hit("inferred", 1)));
    expect(detectionRank(hit("inferred", 0))).toBeGreaterThan(detectionRank(hit("paraphrase", 1)));
    expect(detectionRank(hit("paraphrase", 0))).toBeGreaterThan(detectionRank(hit("quote", 1)));
    expect(detectionRank(hit("quote", 0))).toBeGreaterThan(detectionRank(hit("topic", 1)));
  });

  it("uses confidence only to break ties within a type", () => {
    expect(detectionRank(hit("explicit", 0.9))).toBeGreaterThan(detectionRank(hit("explicit", 0.4)));
  });

  it("does not let a confident quote outrank a weaker explicit citation", () => {
    const ranked = rankSuggestions([hit("quote", 0.99), hit("explicit", 0.55)]);
    expect(ranked[0].detectionType).toBe("explicit");
  });

  it("stages a repaired or learned reference when no explicit hit exists", () => {
    const ranked = rankSuggestions([hit("quote", 0.9), hit("inferred", 0.7)]);
    expect(pickAutoOutputSuggestion(ranked)?.detectionType).toBe("inferred");
  });

  it("prefers the explicit citation when both are present", () => {
    const ranked = rankSuggestions([hit("inferred", 0.95), hit("explicit", 0.6)]);
    expect(pickAutoOutputSuggestion(ranked)?.detectionType).toBe("explicit");
  });

  it("stages nothing when only quotes and paraphrases were detected", () => {
    const ranked = rankSuggestions([hit("quote", 0.95), hit("paraphrase", 0.9), hit("topic", 0.9)]);
    expect(pickAutoOutputSuggestion(ranked)).toBeNull();
  });
});
