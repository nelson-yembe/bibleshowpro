import { describe, expect, it } from "vitest";
import { operatorSuggestionLayout } from "@/lib/transcription/transcriptionLiveFollow";
import type { ScriptureSuggestion, SuggestionStatus } from "@/lib/transcription/types";

function suggestion(id: string, status: SuggestionStatus, createdAt: string): ScriptureSuggestion {
  return {
    id,
    detectedPhrase: id,
    reference: id,
    translationId: "kjv",
    translationAbbr: "KJV",
    confidence: 0.9,
    confidenceLevel: "high",
    detectionType: "explicit",
    status,
    versePreview: "",
    verses: [],
    alternatives: [],
    createdAt,
  };
}

const offAir = { program: null, liveFollow: false };

describe("operatorSuggestionLayout", () => {
  it("lets Enter take the newest suggestion not yet shown, even below shown ones", () => {
    const layout = operatorSuggestionLayout(
      [
        suggestion("John 3:16", "presented", "2026-10-23T10:00:00Z"),
        suggestion("Romans 8:28", "pending", "2026-10-23T10:01:00Z"),
        suggestion("Psalms 23", "pending", "2026-10-23T10:02:00Z"),
      ],
      offAir,
    );
    expect(layout.others.map((s) => s.id)[0]).toBe("John 3:16");
    expect(layout.next?.id).toBe("Psalms 23");
  });

  it("puts the suggestion on air first and keeps it out of the numbered list", () => {
    const layout = operatorSuggestionLayout(
      [suggestion("John 3:16", "live", "2026-10-23T10:00:00Z"), suggestion("Romans 8:28", "pending", "2026-10-23T10:01:00Z")],
      offAir,
    );
    expect(layout.live?.id).toBe("John 3:16");
    expect(layout.others.map((s) => s.id)).toEqual(["Romans 8:28"]);
    expect(layout.next?.id).toBe("Romans 8:28");
  });

  it("has nothing for Enter when every suggestion has been shown or ignored", () => {
    const layout = operatorSuggestionLayout(
      [suggestion("John 3:16", "presented", "2026-10-23T10:00:00Z"), suggestion("Acts 2:38", "ignored", "2026-10-23T10:01:00Z")],
      offAir,
    );
    expect(layout.next).toBeNull();
    expect(layout.others.map((s) => s.id)).toEqual(["John 3:16"]);
  });

  it("lists notes passages below what was heard, and offers them in written order once nothing is waiting", () => {
    const planned = (id: string): ScriptureSuggestion => ({
      ...suggestion(id, "queued", "2026-10-23T09:00:00Z"),
      notes: "planned",
    });
    const heard = suggestion("Acts 2:38", "pending", "2026-10-23T10:00:00Z");
    const notes = [planned("Isaiah 40:31"), planned("Hebrews 11:1")];

    const layout = operatorSuggestionLayout([heard, ...notes], offAir);
    expect(layout.others.map((s) => s.id)).toEqual(["Acts 2:38", "Isaiah 40:31", "Hebrews 11:1"]);
    expect(layout.next?.id).toBe("Acts 2:38");

    const afterHeard = operatorSuggestionLayout([{ ...heard, status: "presented" }, ...notes], offAir);
    expect(afterHeard.next?.id).toBe("Isaiah 40:31");
  });
});
