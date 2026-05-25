import { create } from "zustand";
import { api, type BibleSearchOptions, type SearchResult, type TranslationInfo, type VerseResult } from "@/lib/tauri";

interface BibleState {
  translations: TranslationInfo[];
  selectedTranslationId?: string;
  /** Up to 2 translation ids for side-by-side display (primary first) */
  selectedTranslationIds: string[];
  query: string;
  results: SearchResult | null;
  groups: VerseResult[][];
  chapterVerses: VerseResult[];
  chapterLabel: string | null;
  activeVerseIndex: number;
  lastError: string | null;
  history: string[];
  loading: boolean;
  loadTranslations: () => Promise<void>;
  setQuery: (query: string) => void;
  setTranslation: (id: string) => void;
  toggleTranslationSelection: (id: string) => void;
  search: (query?: string, searchOptions?: BibleSearchOptions) => Promise<boolean>;
  loadChapterForVerse: (verse: VerseResult) => Promise<number>;
  loadChapterByReference: (bookName: string, chapter: number, verse?: number) => Promise<VerseResult | null>;
  setActiveVerseIndex: (index: number) => void;
  getActiveVerse: () => VerseResult | null;
  addToHistory: (reference: string) => void;
}

async function fetchChapterVerses(bookName: string, chapter: number, translationId?: string) {
  const chapterRef = `${bookName} ${chapter}`;
  const response = await api.lookupReference(chapterRef, translationId);
  return { chapterRef, verses: response.search.verses };
}

function findVerseIndex(verses: VerseResult[], verseNumber?: number) {
  if (verseNumber == null) return 0;
  const idx = verses.findIndex((v) => v.verse === verseNumber);
  return idx >= 0 ? idx : 0;
}

export const useBibleStore = create<BibleState>((set, get) => ({
  translations: [],
  selectedTranslationIds: [],
  query: "",
  results: null,
  groups: [],
  chapterVerses: [],
  chapterLabel: null,
  activeVerseIndex: 0,
  lastError: null,
  history: JSON.parse(localStorage.getItem("bsp-verse-history") ?? "[]"),
  loading: false,

  loadTranslations: async () => {
    const translations = await api.getTranslations();
    const defaultId = translations.find((t) => t.is_default)?.id ?? translations[0]?.id;
    set({
      translations,
      selectedTranslationId: defaultId,
      selectedTranslationIds: defaultId ? [defaultId] : [],
    });
  },

  setQuery: (query) => set({ query }),

  setTranslation: (id) =>
    set({
      selectedTranslationId: id,
      selectedTranslationIds: [id],
    }),

  toggleTranslationSelection: (id) => {
    const { selectedTranslationIds } = get();
    const current =
      selectedTranslationIds.length > 0
        ? selectedTranslationIds
        : get().selectedTranslationId
          ? [get().selectedTranslationId!]
          : [];

    if (current.includes(id)) {
      if (current.length <= 1) return;
      const next = current.filter((x) => x !== id);
      set({ selectedTranslationIds: next, selectedTranslationId: next[0] });
      return;
    }

    if (current.length < 2) {
      const next = [...current, id];
      set({ selectedTranslationIds: next, selectedTranslationId: next[0] });
      return;
    }

    const next = [current[0], id];
    set({ selectedTranslationIds: next, selectedTranslationId: next[0] });
  },

  loadChapterForVerse: async (verse) => {
    const { chapterRef, verses } = await fetchChapterVerses(
      verse.book_name,
      verse.chapter,
      get().selectedTranslationId,
    );
    const activeVerseIndex = findVerseIndex(verses, verse.verse);
    set({
      chapterVerses: verses,
      chapterLabel: chapterRef,
      activeVerseIndex,
      lastError: verses.length === 0 ? `No verses found for ${chapterRef}` : null,
    });
    return activeVerseIndex;
  },

  loadChapterByReference: async (bookName, chapter, verseNumber) => {
    const { chapterRef, verses } = await fetchChapterVerses(bookName, chapter, get().selectedTranslationId);
    if (verses.length === 0) {
      set({
        chapterVerses: [],
        chapterLabel: chapterRef,
        activeVerseIndex: 0,
        lastError: `No text loaded for ${bookName} ${chapter}. Import this translation to enable it.`,
      });
      return null;
    }

    const activeVerseIndex = findVerseIndex(verses, verseNumber);
    set({
      chapterVerses: verses,
      chapterLabel: chapterRef,
      activeVerseIndex,
      lastError: null,
    });
    return verses[activeVerseIndex] ?? verses[0] ?? null;
  },

  setActiveVerseIndex: (index) => {
    const { chapterVerses } = get();
    if (index < 0 || index >= chapterVerses.length) return;
    set({ activeVerseIndex: index });
  },

  getActiveVerse: () => {
    const { chapterVerses, activeVerseIndex } = get();
    return chapterVerses[activeVerseIndex] ?? null;
  },

  search: async (query, searchOptions) => {
    const q = (query ?? get().query).trim();
    if (!q) return false;
    set({ loading: true, query: q, lastError: null });
    try {
      const response = await api.lookupReference(q, get().selectedTranslationId, searchOptions);
      set({ results: response.search, groups: response.groups });
      get().addToHistory(q);

      const parsed = response.search.parsed_reference;
      if (parsed) {
        const targetVerse = parsed.verse_start ?? undefined;
        const active = await get().loadChapterByReference(parsed.book_name, parsed.chapter, targetVerse);
        if (active) return true;

        if (response.search.verses.length > 0) {
          await get().loadChapterForVerse(response.search.verses[0]);
          return true;
        }

        set({
          lastError: `Passage recognized but no verses found for ${parsed.book_name} ${parsed.chapter}${targetVerse ? `:${targetVerse}` : ""}. Import Bible data for this book.`,
        });
        return false;
      }

      set({ chapterVerses: [], chapterLabel: null, activeVerseIndex: 0 });
      return response.search.verses.length > 0;
    } finally {
      set({ loading: false });
    }
  },

  addToHistory: (reference) => {
    const history = [reference, ...get().history.filter((h) => h !== reference)].slice(0, 12);
    localStorage.setItem("bsp-verse-history", JSON.stringify(history));
    set({ history });
  },
}));
