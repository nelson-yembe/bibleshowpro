import { describe, expect, it } from "vitest";
import type { NotesReference, VerseResult } from "@/lib/tauri";
import {
  isWaitingNotesReference,
  notesPassageFor,
  withNotesSupport,
} from "@/lib/transcription/sermonNotes";

const passage = (reference: string, bookNumber: number, chapter: number, verseStart: number | null, verseEnd: number | null = null): NotesReference => ({
  reference,
  bookNumber,
  chapter,
  verseStart,
  verseEnd,
  context: "",
});

const verse = (book_number: number, chapter: number, n: number): VerseResult => ({
  id: n,
  translation_id: "kjv",
  translation_abbr: "KJV",
  book_number,
  book_name: "",
  chapter,
  verse: n,
  text: "",
  reference: "",
});

const notes = [passage("John 3:16-18", 43, 3, 16, 18), passage("Psalm 23", 19, 23, null), passage("Romans 8:28", 45, 8, 28)];

describe("notesPassageFor", () => {
  it("matches a verse inside a written range", () => {
    expect(notesPassageFor([verse(43, 3, 17)], notes)?.reference).toBe("John 3:16-18");
  });

  it("matches any verse of a chapter written without verses", () => {
    expect(notesPassageFor([verse(19, 23, 4)], notes)?.reference).toBe("Psalm 23");
  });

  it("matches a whole chapter that holds the written verse", () => {
    const romans8 = Array.from({ length: 39 }, (_, i) => verse(45, 8, i + 1));
    expect(notesPassageFor(romans8, notes)?.reference).toBe("Romans 8:28");
  });

  it("does not match a neighbouring verse or chapter", () => {
    expect(notesPassageFor([verse(43, 3, 19)], notes)).toBeUndefined();
    expect(notesPassageFor([verse(43, 4, 16)], notes)).toBeUndefined();
  });
});

describe("withNotesSupport", () => {
  const detection = {
    detectedPhrase: "for god so loved the world",
    reference: "John 3:16",
    translationId: "kjv",
    translationAbbr: "KJV",
    confidence: 0.55,
    confidenceLevel: "medium" as const,
    detectionType: "quote" as const,
    versePreview: "",
    verses: [verse(43, 3, 16)],
    alternatives: [],
  };

  it("trusts a quote of a planned passage like an inferred reference", () => {
    expect(withNotesSupport(detection, notes)).toMatchObject({
      confidence: 0.95,
      confidenceLevel: "high",
      detectionType: "inferred",
      notes: "heard",
    });
  });

  it("keeps an explicit citation explicit", () => {
    expect(withNotesSupport({ ...detection, detectionType: "explicit" }, notes).detectionType).toBe("explicit");
  });

  it("leaves passages outside the notes alone", () => {
    const other = { ...detection, verses: [verse(1, 1, 1)] };
    expect(withNotesSupport(other, notes)).toBe(other);
  });
});

it("treats only still-queued notes references as waiting", () => {
  expect(isWaitingNotesReference({ notes: "planned", status: "queued" })).toBe(true);
  expect(isWaitingNotesReference({ notes: "planned", status: "preview" })).toBe(false);
  expect(isWaitingNotesReference({ notes: "heard", status: "queued" })).toBe(false);
});
