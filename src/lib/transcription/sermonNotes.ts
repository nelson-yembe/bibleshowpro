import type { NotesReference, VerseResult } from "@/lib/tauri";
import type { ScriptureSuggestion } from "@/lib/transcription/types";

type Detection = Omit<ScriptureSuggestion, "id" | "segmentId" | "status" | "createdAt">;

/** Confidence a heard reference gets when the preacher wrote that passage in the notes. */
export const NOTES_CONFIDENCE = 0.95;

/** The notes passage these verses fall in: same chapter, overlapping verses. */
export function notesPassageFor(
  verses: Pick<VerseResult, "book_number" | "chapter" | "verse">[],
  passages: NotesReference[],
): NotesReference | undefined {
  const first = verses[0];
  if (!first) return undefined;
  const last = verses[verses.length - 1] ?? first;
  return passages.find((p) => {
    if (p.bookNumber !== first.book_number || p.chapter !== first.chapter) return false;
    if (p.verseStart == null) return true;
    const end = p.verseEnd ?? p.verseStart;
    return first.verse <= end && last.verse >= p.verseStart;
  });
}

/**
 * A detection the notes back up is trusted more: a quote of a planned passage is
 * no longer speculative, so it may stage like an inferred reference.
 */
export function withNotesSupport<T extends Detection>(detection: T, passages: NotesReference[]): T {
  if (passages.length === 0 || !notesPassageFor(detection.verses, passages)) return detection;
  return {
    ...detection,
    confidence: Math.max(detection.confidence, NOTES_CONFIDENCE),
    confidenceLevel: "high",
    detectionType: detection.detectionType === "explicit" ? "explicit" : "inferred",
    notes: "heard",
  };
}

/** Notes references still waiting in the queue, not yet heard or shown. */
export function isWaitingNotesReference(suggestion: Pick<ScriptureSuggestion, "notes" | "status">): boolean {
  return suggestion.notes === "planned" && suggestion.status === "queued";
}

/** The line the reference was written on, shown where a heard phrase would be. */
export function notesContext(passage: NotesReference): string {
  return passage.context.trim() || passage.reference;
}
