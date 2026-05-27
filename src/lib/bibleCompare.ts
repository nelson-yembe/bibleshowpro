import { api, type VerseResult } from "@/lib/tauri";

/** Fetch the same book/chapter/verse in another translation. */
export async function lookupVerseInTranslation(
  verse: VerseResult,
  translationId: string,
): Promise<VerseResult | null> {
  const ref = `${verse.book_name} ${verse.chapter}:${verse.verse}`;
  const response = await api.lookupReference(ref, translationId);
  const match =
    response.search.verses.find((v) => v.verse === verse.verse) ?? response.search.verses[0];
  return match ?? null;
}

/** Resolve primary and compare verses for the selected translation pair. */
export async function lookupVersePairInTranslations(
  verse: VerseResult,
  primaryTranslationId: string,
  secondaryTranslationId: string,
): Promise<{ primary: VerseResult | null; secondary: VerseResult | null }> {
  const [primary, secondary] = await Promise.all([
    lookupVerseInTranslation(verse, primaryTranslationId),
    lookupVerseInTranslation(verse, secondaryTranslationId),
  ]);
  return { primary, secondary };
}

export function formatComparisonBody(verse: VerseResult, showVerseNumbers: boolean): string {
  return showVerseNumbers ? `[${verse.verse}] ${verse.text}` : verse.text;
}
