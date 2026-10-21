import type { ScriptureSuggestion } from "@/lib/transcription/types";

type RoutableSuggestion = Pick<ScriptureSuggestion, "detectionType">;
type LiveGate = Pick<ScriptureSuggestion, "detectionType" | "confidenceLevel">;
type Rankable = Pick<ScriptureSuggestion, "detectionType" | "confidence">;

/** Book/chapter citations the preacher announced — safe for automatic projection. */
export function isExplicitScripture(suggestion: LiveGate): boolean {
  return suggestion.detectionType === "explicit" && suggestion.confidenceLevel !== "low";
}

/**
 * Speculative hits stay in the suggestion queue until the operator Previews or
 * presses Go live. They must never auto-move onto the projector.
 */
export function isOperatorVerifyOnly(suggestion: RoutableSuggestion): boolean {
  return (
    suggestion.detectionType === "quote" ||
    suggestion.detectionType === "paraphrase" ||
    suggestion.detectionType === "topic"
  );
}

/**
 * Higher = more trustworthy for auto preview / live. Detection type always
 * dominates: no amount of confidence in a quote may outrank a real citation.
 * Confidence only breaks ties within a type.
 */
export function detectionRank(s: Rankable): number {
  const typeScore =
    s.detectionType === "explicit"
      ? 400
      : s.detectionType === "inferred"
        ? 300
        : s.detectionType === "paraphrase"
          ? 200
          : s.detectionType === "quote"
            ? 100
            : 0;
  return typeScore + Math.min(Math.max(s.confidence, 0), 1);
}

export function rankSuggestions<T extends Rankable>(suggestions: T[]): T[] {
  return [...suggestions].sort((a, b) => detectionRank(b) - detectionRank(a));
}

/**
 * The suggestion that may be staged automatically. Explicit citations and
 * repaired/learned references both qualify; quotes and paraphrases never do,
 * so they stay in the queue for the operator to verify.
 */
export function pickAutoOutputSuggestion<T extends Rankable>(ranked: T[]): T | null {
  return ranked.find((s) => !isOperatorVerifyOnly(s)) ?? null;
}
