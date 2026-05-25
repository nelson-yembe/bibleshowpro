/** Display labels for Bible catalog language codes. */
export const BIBLE_LANGUAGE_LABELS: Record<string, string> = {
  en: "English",
  fr: "French",
  es: "Spanish",
  de: "German",
  pt: "Portuguese",
  ru: "Russian",
  zh: "Chinese",
  ar: "Arabic",
  ko: "Korean",
  vi: "Vietnamese",
  ro: "Romanian",
  el: "Greek",
  fi: "Finnish",
};

export function bibleLanguageLabel(code: string): string {
  return BIBLE_LANGUAGE_LABELS[code] ?? code.toUpperCase();
}

export function groupCatalogByLanguage<T extends { language: string }>(
  entries: T[],
): Array<{ language: string; label: string; entries: T[] }> {
  const order = Object.keys(BIBLE_LANGUAGE_LABELS);
  const groups = new Map<string, T[]>();

  for (const entry of entries) {
    const list = groups.get(entry.language) ?? [];
    list.push(entry);
    groups.set(entry.language, list);
  }

  const sortedKeys = [...groups.keys()].sort((a, b) => {
    const ai = order.indexOf(a);
    const bi = order.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  return sortedKeys.map((language) => ({
    language,
    label: bibleLanguageLabel(language),
    entries: groups.get(language) ?? [],
  }));
}
