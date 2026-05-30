import { api, type VerseResult } from "@/lib/tauri";
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

/** Load the full chapter so prev/next can step verse-by-verse within the passage. */
export async function createExpandedVerseSessionFromSuggestion(
  suggestion: Pick<
    ScriptureSuggestion,
    "id" | "reference" | "verses" | "translationId" | "translationAbbr"
  >,
): Promise<ActiveVerseSession> {
  const anchor = suggestion.verses[0];
  if (!anchor) {
    return createVerseSessionFromSuggestion(suggestion);
  }

  try {
    const chapterRef = `${anchor.book_name} ${anchor.chapter}`;
    const lookup = await api.lookupReference(chapterRef, suggestion.translationId);
    const chapterVerses = lookup.search.verses;
    if (chapterVerses.length === 0) {
      return createVerseSessionFromSuggestion(suggestion);
    }

    const verseIndex = chapterVerses.findIndex(
      (verse) =>
        verse.book_number === anchor.book_number &&
        verse.chapter === anchor.chapter &&
        verse.verse === anchor.verse,
    );

    return {
      passageReference: suggestion.reference,
      verses: chapterVerses,
      verseIndex: verseIndex >= 0 ? verseIndex : 0,
      translationId: suggestion.translationId,
      translationAbbr: anchor.translation_abbr ?? suggestion.translationAbbr,
      suggestionId: suggestion.id,
    };
  } catch {
    return createVerseSessionFromSuggestion(suggestion);
  }
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
  return `${verse.reference} · ${session.translationAbbr}`;
}

export function singleVerseReference(verse: VerseResult): string {
  return verse.reference;
}
