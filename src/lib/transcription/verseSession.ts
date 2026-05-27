import type { VerseResult } from "@/lib/tauri";
import type { ScriptureSuggestion } from "@/lib/transcription/types";

export interface ActiveVerseSession {
  passageReference: string;
  verses: VerseResult[];
  verseIndex: number;
  translationId: string;
  translationAbbr: string;
  suggestionId?: string;
}

export function createVerseSessionFromSuggestion(
  suggestion: Pick<
    ScriptureSuggestion,
    "id" | "reference" | "verses" | "translationId" | "translationAbbr"
  >,
): ActiveVerseSession {
  return {
    passageReference: suggestion.reference,
    verses: suggestion.verses,
    verseIndex: 0,
    translationId: suggestion.translationId,
    translationAbbr: suggestion.translationAbbr,
    suggestionId: suggestion.id,
  };
}

export function getCurrentVerse(session: ActiveVerseSession): VerseResult | null {
  return session.verses[session.verseIndex] ?? null;
}

export function canStepVerse(session: ActiveVerseSession, delta: number): boolean {
  const next = session.verseIndex + delta;
  return next >= 0 && next < session.verses.length;
}

export function stepVerseSession(session: ActiveVerseSession, delta: number): ActiveVerseSession | null {
  if (!canStepVerse(session, delta)) return null;
  return { ...session, verseIndex: session.verseIndex + delta };
}

export function sessionProgressLabel(session: ActiveVerseSession): string {
  const verse = getCurrentVerse(session);
  if (!verse) return session.passageReference;
  return `${verse.reference} · ${session.translationAbbr} (${session.verseIndex + 1}/${session.verses.length})`;
}

export function singleVerseReference(verse: VerseResult): string {
  return verse.reference;
}
