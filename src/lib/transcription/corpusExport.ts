import type { ScriptureSuggestion, TranscriptSegment } from "@/lib/transcription/types";

/** One segment of a corpus case, in the shape `src-tauri/src/bible/corpus.rs` reads. */
interface CorpusSegment {
  text: string;
  /** Shown on screen by the operator: the best evidence of what was said. */
  expect: string[];
  /** Suggested but never shown: the reviewer decides. */
  unconfirmed?: string[];
  /** Dismissed by the operator. */
  rejected?: string[];
}

/**
 * The service's final transcript as a corpus case, labelled by what the operator did.
 * It still needs a person to check it: the operator may have shown a verse late, or
 * never shown one that was said.
 */
export function buildCorpusCase(
  segments: Pick<TranscriptSegment, "id" | "text" | "isFinal" | "language">[],
  suggestions: Pick<ScriptureSuggestion, "segmentId" | "reference" | "status" | "notes">[],
  exportedAt: Date,
): string {
  const heard = suggestions.filter((s) => s.segmentId && s.notes !== "planned");
  const references = (segmentId: string, statuses: ScriptureSuggestion["status"][]) => [
    ...new Set(heard.filter((s) => s.segmentId === segmentId && statuses.includes(s.status)).map((s) => s.reference)),
  ];

  const final = segments.filter((s) => s.isFinal && s.text.trim());
  const caseSegments: CorpusSegment[] = final.map((seg) => {
    const segment: CorpusSegment = { text: seg.text.trim(), expect: references(seg.id, ["live", "presented"]) };
    const unconfirmed = references(seg.id, ["pending", "preview", "queued"]);
    const rejected = references(seg.id, ["ignored"]);
    if (unconfirmed.length) segment.unconfirmed = unconfirmed;
    if (rejected.length) segment.rejected = rejected;
    return segment;
  });

  const languages = final.map((s) => s.language).filter(Boolean);
  const language = languages.filter((l) => l === "fr").length > languages.length / 2 ? "fr" : "en";
  const day = exportedAt.toISOString().slice(0, 10);

  return JSON.stringify(
    {
      id: `service-${day}`,
      language,
      source: `Exported from Live Listen on ${day}. Not reviewed: check every segment's references, and have consent before sharing the transcript.`,
      reviewed: false,
      segments: caseSegments,
    },
    null,
    2,
  );
}
