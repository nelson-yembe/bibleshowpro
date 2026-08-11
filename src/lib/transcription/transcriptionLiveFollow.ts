import type { Scene } from "@/engine/scene";
import type { ScriptureSuggestion } from "@/lib/transcription/types";
import { usePresentationStore } from "@/stores/presentationStore";

/** True when transcription content is currently on program output. */
export function isTranscriptionOnAir(): boolean {
  const { program, liveFollow, previewSource } = usePresentationStore.getState();
  if (!liveFollow || previewSource !== "transcription") return false;
  if (!program || program.type === "blackout") return false;
  return true;
}

function normalizeRef(value: string | undefined | null): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Whether a suggestion matches the scripture currently on program. */
export function suggestionMatchesProgram(
  suggestion: ScriptureSuggestion,
  program: Scene | null | undefined,
): boolean {
  if (!program) return false;
  if (
    program.type !== "scripture_fullscreen" &&
    program.type !== "scripture_lower_third" &&
    program.type !== "scripture_comparison"
  ) {
    return false;
  }

  const programRef = normalizeRef(program.content.reference);
  const suggestionRef = normalizeRef(suggestion.reference);
  if (programRef && suggestionRef && programRef === suggestionRef) return true;

  const programVerses = program.content.verses ?? [];
  if (programVerses.length === 0 || suggestion.verses.length === 0) return false;

  const programKeys = new Set(
    programVerses.map((v) => `${v.book_number}:${v.chapter}:${v.verse}`),
  );
  return suggestion.verses.some((v) => programKeys.has(`${v.book_number}:${v.chapter}:${v.verse}`));
}

export function isSuggestionLiveOnAir(suggestion: ScriptureSuggestion): boolean {
  const { program, liveFollow } = usePresentationStore.getState();
  if (!liveFollow || !program || program.type === "blackout") return false;
  return suggestionMatchesProgram(suggestion, program);
}

/**
 * Live scripture first, then previously presented history, then the rest
 * (newest within each group).
 */
export function sortSuggestionsForOperator(
  suggestions: ScriptureSuggestion[],
  options?: { program?: Scene | null; liveFollow?: boolean },
): ScriptureSuggestion[] {
  const store = usePresentationStore.getState();
  const program = options?.program ?? store.program;
  const liveFollow = options?.liveFollow ?? store.liveFollow;
  const onAir = Boolean(liveFollow && program && program.type !== "blackout");

  const rank = (s: ScriptureSuggestion): number => {
    if (onAir && suggestionMatchesProgram(s, program)) return 0;
    if (s.status === "live") return 0;
    if (s.status === "presented") return 1;
    if (s.status === "preview") return 2;
    if (s.status === "queued") return 3;
    return 4;
  };

  return [...suggestions].sort((a, b) => {
    const rankDiff = rank(a) - rank(b);
    if (rankDiff !== 0) return rankDiff;
    return b.createdAt.localeCompare(a.createdAt);
  });
}
