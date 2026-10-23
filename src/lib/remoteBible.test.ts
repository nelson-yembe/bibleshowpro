import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VerseResult } from "@/lib/tauri";

/** A tiny Bible: John 3 in the KJV, Jean 3 in Louis Segond. */
const BOOK: Record<string, { name: string; tid: string }> = {
  john: { name: "John", tid: "kjv" },
  jean: { name: "Jean", tid: "lsg" },
};

function verse(tid: string, n: number): VerseResult {
  const name = tid === "lsg" ? "Jean" : "John";
  return {
    id: (tid === "lsg" ? 1000 : 0) + n,
    translation_id: tid,
    translation_abbr: tid.toUpperCase(),
    book_number: 43,
    book_name: name,
    chapter: 3,
    verse: n,
    text: `${name} 3:${n} text`,
    reference: `${name} 3:${n}`,
  };
}

function lookup(query: string, translationId = "kjv") {
  const match = /^(john|jean) 3(?::(\d+))?/i.exec(query.trim());
  if (!match) {
    const found = query.includes("love") ? [verse(translationId, 16), verse(translationId, 35)] : [];
    return { groups: found.map((v) => [v]), search: { verses: found, suggestions: [] } };
  }
  const n = match[2] ? Number(match[2]) : undefined;
  const all = Array.from({ length: 36 }, (_, i) => verse(translationId, i + 1));
  const verses = n ? all.filter((v) => v.verse === n) : all;
  return {
    groups: [verses],
    search: {
      verses,
      parsed_reference: { book_number: 43, book_name: BOOK[match[1].toLowerCase()].name, chapter: 3, verse_start: n },
      suggestions: [],
    },
  };
}

const published: unknown[] = [];
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (command: string, args?: { query?: string; translationId?: string; state?: unknown }) => {
    if (command === "lookup_bible_reference") return lookup(args?.query ?? "", args?.translationId);
    if (command === "get_translations")
      return [
        { id: "kjv", name: "King James Version", abbreviation: "KJV", language: "en", is_default: true },
        { id: "lsg", name: "Louis Segond", abbreviation: "LSG", language: "fr", is_default: false },
      ];
    if (command === "publish_remote_bible") published.push(args?.state);
    return null;
  }),
}));

const { remoteBibleState, runRemoteBibleAction } = await import("@/lib/remoteBible");
const { useBibleStore } = await import("@/stores/bibleStore");
const { useBibleStagingStore } = await import("@/stores/bibleStagingStore");
const { useBibleViewStore } = await import("@/stores/bibleViewStore");
const { usePresentationStore } = await import("@/stores/presentationStore");

const staged = () => useBibleStagingStore.getState().stagedScene;

describe("the remote drives the Bible page", () => {
  beforeEach(async () => {
    localStorage.clear();
    useBibleStore.setState({ chapterVerses: [], groups: [], query: "", activeVerseIndex: 0, lastError: null });
    useBibleStagingStore.setState({ stagedScene: null });
    usePresentationStore.setState({ liveFollow: false, program: null });
    await useBibleStore.getState().loadTranslations();
  });

  it("opens a passage exactly as the page's Go does, and the page shows it", async () => {
    await runRemoteBibleAction({ action: "open", book: "John", chapter: 3, verse: 16 });
    const bible = useBibleStore.getState();
    expect(bible.query).toBe("John 3:16");
    expect(bible.chapterVerses).toHaveLength(36);
    expect(bible.getActiveVerse()?.verse).toBe(16);
    expect(useBibleViewStore.getState().selectedVerseId).toBe(16);
    await vi.waitFor(() => expect(staged()?.content.reference).toBe("John 3:16"));
  });

  it("steps and picks verses the way the page's slides do", async () => {
    await runRemoteBibleAction({ action: "open", book: "John", chapter: 3, verse: 16 });
    await runRemoteBibleAction({ action: "step", delta: 1 });
    await vi.waitFor(() => expect(staged()?.content.reference).toBe("John 3:17"));
    await runRemoteBibleAction({ action: "verse", verse: 30 });
    expect(useBibleStore.getState().getActiveVerse()?.verse).toBe(30);
    await vi.waitFor(() => expect(staged()?.content.reference).toBe("John 3:30"));
  });

  it("searches words and opens a result in its chapter", async () => {
    await runRemoteBibleAction({ action: "search", query: "love" });
    expect(remoteBibleState().results.map((r) => r.reference)).toEqual(["John 3:16", "John 3:35"]);
    await runRemoteBibleAction({ action: "result", index: 1 });
    expect(useBibleStore.getState().chapterVerses).toHaveLength(36);
    expect(useBibleStore.getState().getActiveVerse()?.verse).toBe(35);
  });

  it("adds a compare translation, staging both side by side", async () => {
    await runRemoteBibleAction({ action: "open", book: "John", chapter: 3, verse: 16 });
    await runRemoteBibleAction({ action: "translation", id: "lsg" });
    expect(useBibleStore.getState().selectedTranslationIds).toEqual(["kjv", "lsg"]);
    await vi.waitFor(() => expect(staged()?.type).toBe("scripture_comparison"));
  });

  it("takes the staged verse live without asking the open page to restage", async () => {
    const pushSceneLive = vi.fn();
    const beforeGoLive = vi.fn();
    usePresentationStore.setState({ outputOpen: true, pushSceneLive });
    const { useLiveNavigationStore } = await import("@/stores/liveNavigationStore");
    useLiveNavigationStore.getState().register({ beforeGoLive, label: "Songs" });

    await runRemoteBibleAction({ action: "open", book: "John", chapter: 3, verse: 16 });
    await vi.waitFor(() => expect(staged()).not.toBeNull());
    await runRemoteBibleAction({ action: "live" });
    expect(pushSceneLive).toHaveBeenCalledWith(expect.objectContaining({ type: "scripture_fullscreen" }), "bible");
    expect(beforeGoLive).not.toHaveBeenCalled();
    useLiveNavigationStore.getState().unregister();
  });

  it("describes the page for the remote: chapter, verse, staged passage, and whether the screen follows", async () => {
    await runRemoteBibleAction({ action: "open", book: "John", chapter: 3, verse: 16 });
    await vi.waitFor(() => expect(staged()).not.toBeNull());
    usePresentationStore.setState({ liveFollow: true, program: staged() });
    const state = remoteBibleState();
    expect(state.chapter).toMatchObject({ label: "John 3", bookNumber: 43, chapter: 3 });
    expect(state.chapter?.verses[15]).toEqual({ n: 16, text: "John 3:16 text" });
    expect(state.activeVerse).toBe(16);
    expect(state.staged).toBe("John 3:16");
    expect(state.onAir).toBe(true);
    expect(state.translations.map((t) => t.abbreviation)).toEqual(["KJV", "LSG"]);
  });
});
