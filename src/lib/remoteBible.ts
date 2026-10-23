import { listen } from "@tauri-apps/api/event";
import { BIBLE_BOOKS, getBookVerseCounts } from "@/lib/bibleBooks";
import {
  goToBiblePassage,
  runBibleSearch,
  selectBibleSearchResult,
  selectBibleVerse,
  stepBibleVerse,
  takeStagedBibleLive,
  toggleBibleTranslation,
} from "@/lib/bibleSession";
import { api } from "@/lib/tauri";
import { useBibleStagingStore } from "@/stores/bibleStagingStore";
import { useBibleStore } from "@/stores/bibleStore";
import { usePresentationStore } from "@/stores/presentationStore";

/** The Bible page as the phone remote draws it. */
export interface RemoteBibleState {
  translations: { id: string; abbreviation: string; name: string }[];
  /** Primary first, then the compare translation. */
  selected: string[];
  query: string;
  loading: boolean;
  error: string | null;
  chapter: {
    label: string;
    bookNumber: number;
    book: string;
    chapter: number;
    verses: { n: number; text: string }[];
  } | null;
  /** Verse number selected in the chapter. */
  activeVerse: number | null;
  results: { reference: string; translation: string; text: string }[];
  /** Reference staged for the next take. */
  staged: string | null;
  /** The projector follows Bible selections, so a pick goes straight to the screen. */
  onAir: boolean;
}

/** Search results the remote lists; the Bible page lists them all, a phone needs fewer. */
const MAX_REMOTE_RESULTS = 60;

export function remoteBibleState(): RemoteBibleState {
  const bible = useBibleStore.getState();
  const staged = useBibleStagingStore.getState().stagedScene;
  const presentation = usePresentationStore.getState();
  const first = bible.chapterVerses[0];
  const active = bible.chapterVerses[bible.activeVerseIndex];
  return {
    translations: bible.translations.map((t) => ({ id: t.id, abbreviation: t.abbreviation, name: t.name })),
    selected:
      bible.selectedTranslationIds.length > 0
        ? bible.selectedTranslationIds
        : bible.selectedTranslationId
          ? [bible.selectedTranslationId]
          : [],
    query: bible.query,
    loading: bible.loading,
    error: bible.lastError,
    chapter: first
      ? {
          label: bible.chapterLabel ?? `${first.book_name} ${first.chapter}`,
          bookNumber: first.book_number,
          book: first.book_name,
          chapter: first.chapter,
          verses: bible.chapterVerses.map((v) => ({ n: v.verse, text: v.text })),
        }
      : null,
    activeVerse: active?.verse ?? null,
    results:
      bible.chapterVerses.length > 0
        ? []
        : bible.groups
            .flat()
            .slice(0, MAX_REMOTE_RESULTS)
            .map((v) => ({ reference: v.reference, translation: v.translation_abbr, text: v.text })),
    staged: staged?.content.reference ?? null,
    onAir: Boolean(presentation.liveFollow && presentation.program && presentation.program.type !== "blackout"),
  };
}

/** Book names and verse counts for the remote's Book / Ch / V picker, as the page has them. */
export function remoteBibleBooks() {
  return BIBLE_BOOKS.map((book) => ({
    name: book.name,
    number: book.number,
    verses: getBookVerseCounts(book.name) ?? Array.from({ length: book.chapters }, () => 1),
  }));
}

export type RemoteBibleAction =
  | { action: "search"; query: string }
  | { action: "open"; book: string; chapter: number; verse: number }
  | { action: "verse"; verse: number }
  | { action: "result"; index: number }
  | { action: "step"; delta: number }
  | { action: "translation"; id: string }
  | { action: "live" };

/** Search options the Bible page starts with. */
const SEARCH_OPTIONS = { exactPhrase: true, matchAllWords: true };

/** Do what the remote asked, through the same calls as the Bible page. */
export async function runRemoteBibleAction(request: RemoteBibleAction): Promise<void> {
  switch (request.action) {
    case "search": {
      const query = request.query.trim();
      if (!query) return;
      useBibleStore.getState().setQuery(query);
      await runBibleSearch(query, SEARCH_OPTIONS);
      return;
    }
    case "open":
      await goToBiblePassage(request.book, request.chapter, request.verse, SEARCH_OPTIONS);
      return;
    case "verse": {
      const index = useBibleStore.getState().chapterVerses.findIndex((v) => v.verse === request.verse);
      if (index >= 0) selectBibleVerse(index);
      return;
    }
    case "result": {
      const verse = useBibleStore.getState().groups.flat()[request.index];
      if (verse) await selectBibleSearchResult(verse);
      return;
    }
    case "step":
      stepBibleVerse(request.delta < 0 ? -1 : 1);
      return;
    case "translation":
      await toggleBibleTranslation(request.id);
      return;
    case "live":
      await takeStagedBibleLive();
      return;
  }
}

/**
 * Keep the remote's copy of the Bible page current, and run what it asks. Started once in
 * the main window; returns the stop function.
 */
export function startRemoteBibleSync(): () => void {
  let stopped = false;
  let timer: number | undefined;
  let last = "";

  const publish = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      if (stopped) return;
      const state = remoteBibleState();
      const json = JSON.stringify(state);
      if (json === last) return;
      last = json;
      void api.publishRemoteBible(state).catch(() => {});
    }, 80);
  };

  const unsubscribers = [
    useBibleStore.subscribe(publish),
    useBibleStagingStore.subscribe(publish),
    usePresentationStore.subscribe((state, previous) => {
      if (state.liveFollow !== previous.liveFollow || state.program !== previous.program) publish();
    }),
  ];

  void api.publishRemoteBibleBooks(remoteBibleBooks()).catch(() => {});
  if (useBibleStore.getState().translations.length === 0) {
    void useBibleStore.getState().loadTranslations().catch(() => {});
  }
  publish();

  let unlisten: (() => void) | undefined;
  listen<RemoteBibleAction>("remote-bible", (event) => {
    void runRemoteBibleAction(event.payload);
  })
    .then((stop) => {
      if (stopped) stop();
      else unlisten = stop;
    })
    .catch(() => {
      // Browser dev server: no remote.
    });

  return () => {
    stopped = true;
    window.clearTimeout(timer);
    unsubscribers.forEach((unsubscribe) => unsubscribe());
    unlisten?.();
  };
}
