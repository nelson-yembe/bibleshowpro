import { describe, expect, it } from "vitest";
import { buildCorpusCase } from "@/lib/transcription/corpusExport";

describe("buildCorpusCase", () => {
  const segments = [
    { id: "a", text: " Turn to John 3:16. ", isFinal: true, language: "en" },
    { id: "b", text: "Mark my words.", isFinal: true, language: "en" },
    { id: "c", text: "verse seventeen", isFinal: false, language: "en" },
    { id: "d", text: "Romans 8:28 and Psalm 23.", isFinal: true, language: "en" },
  ];
  const suggestions = [
    { segmentId: "a", reference: "John 3:16", status: "presented" as const },
    { segmentId: "b", reference: "Mark 1", status: "ignored" as const },
    { segmentId: "d", reference: "Romans 8:28", status: "live" as const },
    { segmentId: "d", reference: "Psalms 23", status: "pending" as const },
    { reference: "Acts 2:38", status: "live" as const },
    { segmentId: "d", reference: "Isaiah 40:31", status: "queued" as const, notes: "planned" as const },
  ];

  it("labels final segments by what the operator showed, and flags the rest for review", () => {
    const parsed = JSON.parse(buildCorpusCase(segments, suggestions, new Date("2026-10-25T11:00:00Z")));
    expect(parsed).toMatchObject({ id: "service-2026-10-25", language: "en", reviewed: false });
    expect(parsed.segments).toEqual([
      { text: "Turn to John 3:16.", expect: ["John 3:16"] },
      { text: "Mark my words.", expect: [], rejected: ["Mark 1"] },
      { text: "Romans 8:28 and Psalm 23.", expect: ["Romans 8:28"], unconfirmed: ["Psalms 23"] },
    ]);
  });

  it("calls a mostly French service French", () => {
    const french = segments.map((s) => ({ ...s, language: "fr" }));
    expect(JSON.parse(buildCorpusCase(french, [], new Date())).language).toBe("fr");
  });
});
