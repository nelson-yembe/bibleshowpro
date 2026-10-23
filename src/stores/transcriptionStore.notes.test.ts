import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NotesReference, VerseResult } from "@/lib/tauri";

const BOOKS: Record<string, number> = { John: 43, Romans: 45 };

function lookup(query: string) {
  const m = /^(John|Romans) (\d+):(\d+)$/.exec(query.trim());
  // Neither book has more than 21 chapters.
  if (!m || Number(m[2]) > 21) return { groups: [], search: { verses: [], suggestions: [] } };
  const [, book, chapter, verse] = m;
  const result: VerseResult = {
    id: 1,
    translation_id: "kjv",
    translation_abbr: "KJV",
    book_number: BOOKS[book],
    book_name: book,
    chapter: Number(chapter),
    verse: Number(verse),
    text: `${book} ${chapter}:${verse} text`,
    reference: query,
  };
  return {
    groups: [[result]],
    search: {
      verses: [result],
      parsed_reference: { book_number: BOOKS[book], book_name: book, chapter: Number(chapter), verse_start: Number(verse) },
      suggestions: [],
    },
  };
}

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (command: string, args?: { query?: string }) => {
    if (command === "lookup_bible_reference") return lookup(args?.query ?? "");
    if (command === "detect_scripture_in_text") return [];
    return null;
  }),
}));

const { useTranscriptionStore } = await import("@/stores/transcriptionStore");
const { useBibleStore } = await import("@/stores/bibleStore");

const notes: NotesReference[] = [
  { reference: "John 3:16", bookNumber: 43, chapter: 3, verseStart: 16, verseEnd: null, context: "Love: John 3:16" },
  { reference: "Romans 5:8", bookNumber: 45, chapter: 5, verseStart: 8, verseEnd: null, context: "Rom 5:8" },
  { reference: "Romans 99:1", bookNumber: 45, chapter: 99, verseStart: 1, verseEnd: null, context: "typo" },
];

describe("sermon notes in the transcription store", () => {
  beforeEach(() => {
    useBibleStore.setState({ selectedTranslationIds: ["kjv"], selectedTranslationId: "kjv" });
    useTranscriptionStore.setState({ suggestions: [], sermonNotes: [], minConfidence: "low" });
  });

  it("queues the passages the Bible holds, in the order written", async () => {
    const queued = await useTranscriptionStore.getState().loadSermonNotes(notes);
    expect(queued).toBe(2);
    const { suggestions, sermonNotes } = useTranscriptionStore.getState();
    expect(sermonNotes).toHaveLength(3);
    expect(suggestions.map((s) => [s.reference, s.status, s.notes, s.detectedPhrase])).toEqual([
      ["John 3:16", "queued", "planned", "Love: John 3:16"],
      ["Romans 5:8", "queued", "planned", "Rom 5:8"],
    ]);
  });

  it("takes up a planned passage when it is called, instead of listing it twice", async () => {
    await useTranscriptionStore.getState().loadSermonNotes(notes);
    await useTranscriptionStore.getState().lookupManualReference("John 3:16");
    const john = useTranscriptionStore.getState().suggestions.filter((s) => s.reference === "John 3:16");
    expect(john).toHaveLength(1);
    expect(john[0].notes).toBe("heard");
    expect(john[0].detectedPhrase).toBe("John 3:16");
  });

  it("keeps planned passages when the workspace is reset, and clears them on request", async () => {
    await useTranscriptionStore.getState().loadSermonNotes(notes);
    useTranscriptionStore.getState().resetListeningWorkspace();
    expect(useTranscriptionStore.getState().suggestions).toHaveLength(2);
    useTranscriptionStore.getState().clearSermonNotes();
    expect(useTranscriptionStore.getState().suggestions).toHaveLength(0);
    expect(useTranscriptionStore.getState().sermonNotes).toHaveLength(0);
  });
});
