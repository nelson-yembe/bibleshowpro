import { describe, expect, it } from "vitest";
import { parseVoiceCommands, isLikelyVoiceCommand } from "@/lib/transcription/voiceCommands";
import { createVerseSessionFromSuggestion, stepVerseSession } from "@/lib/transcription/verseSession";
import type { TranslationInfo } from "@/lib/tauri";

const translations: TranslationInfo[] = [
  { id: "kjv", name: "King James Version", abbreviation: "KJV", language: "en", is_default: true },
  { id: "niv", name: "New International Version", abbreviation: "NIV", language: "en", is_default: false },
  { id: "amp", name: "Amplified Bible", abbreviation: "AMP", language: "en", is_default: false },
];

describe("voiceCommands", () => {
  it("detects next and previous verse phrases", () => {
    expect(parseVoiceCommands("next verse", translations).type).toBe("next_verse");
    expect(parseVoiceCommands("go to the next verse", translations).type).toBe("next_verse");
    expect(parseVoiceCommands("previous verse", translations).type).toBe("prev_verse");
    expect(parseVoiceCommands("go back", translations).type).toBe("prev_verse");
    expect(isLikelyVoiceCommand("next verse")).toBe(true);
  });

  it("detects translation switches", () => {
    expect(parseVoiceCommands("switch to NIV", translations).type).toBe("switch_translation");
    expect(parseVoiceCommands("read in King James", translations).type).toBe("switch_translation");
    expect(parseVoiceCommands("amplified", translations).type).toBe("switch_translation");
  });

  it("ignores unrelated speech", () => {
    expect(parseVoiceCommands("John chapter 3 verse 16", translations).type).toBe("none");
  });
});

describe("verseSession", () => {
  it("steps one verse at a time within a passage", () => {
    const session = createVerseSessionFromSuggestion({
      id: "s1",
      reference: "John 1:1-3",
      translationId: "kjv",
      translationAbbr: "KJV",
      verses: [
        { id: 1, translation_id: "kjv", translation_abbr: "KJV", book_number: 43, book_name: "John", chapter: 1, verse: 1, text: "a", reference: "John 1:1" },
        { id: 2, translation_id: "kjv", translation_abbr: "KJV", book_number: 43, book_name: "John", chapter: 1, verse: 2, text: "b", reference: "John 1:2" },
        { id: 3, translation_id: "kjv", translation_abbr: "KJV", book_number: 43, book_name: "John", chapter: 1, verse: 3, text: "c", reference: "John 1:3" },
      ],
    });

    const next = stepVerseSession(session, 1);
    expect(next?.verseIndex).toBe(1);
    expect(stepVerseSession(session, -1)).toBeNull();
    const last = stepVerseSession(session, 2);
    expect(last?.verseIndex).toBe(2);
    expect(stepVerseSession(last!, 1)).toBeNull();
  });
});
