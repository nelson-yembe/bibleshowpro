import { api } from "@/lib/tauri";
import {
  confidenceLevel,
  type ConfidenceLevel,
  type DetectionType,
  type ParsedReferenceMatch,
  type ScriptureSuggestion,
} from "@/lib/transcription/types";

const recentReferences = new Map<string, number>();
const DEDUPE_MS = 45_000;
const CONTEXT_SEGMENT_LIMIT = 8;

function shouldSkipReference(reference: string): boolean {
  const last = recentReferences.get(reference.toLowerCase());
  if (last && Date.now() - last < DEDUPE_MS) return true;
  recentReferences.set(reference.toLowerCase(), Date.now());
  return false;
}

export function clearReferenceDedupeCache() {
  recentReferences.clear();
}

export function buildDetectionContext(
  segments: { text: string }[],
  partialText = "",
  limit = CONTEXT_SEGMENT_LIMIT,
): string {
  const recent = segments.slice(-limit).map((s) => s.text.trim()).filter(Boolean);
  const parts = [...recent, partialText.trim()].filter(Boolean);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

export async function detectScriptureFromText(
  text: string,
  translationId: string,
  options?: {
    paraphraseEnabled?: boolean;
    existingReferences?: string[];
  },
): Promise<Omit<ScriptureSuggestion, "id" | "segmentId" | "status" | "createdAt">[]> {
  const trimmed = text.trim();
  if (trimmed.length < 4) return [];

  const existing = new Set((options?.existingReferences ?? []).map((r) => r.toLowerCase()));
  let matches: ParsedReferenceMatch[] = [];

  try {
    matches = await api.detectScriptureInText(trimmed);
  } catch {
    matches = clientSideDetect(trimmed);
  }

  if (matches.length === 0) {
    matches = clientSideDetect(trimmed);
  }

  const suggestions: Omit<ScriptureSuggestion, "id" | "segmentId" | "status" | "createdAt">[] = [];

  for (const match of matches) {
    if (existing.has(match.normalized_reference.toLowerCase())) continue;
    const built = await buildSuggestionFromMatch(match, trimmed, translationId);
    if (built && !shouldSkipReference(built.reference)) {
      suggestions.push(built);
    }
  }

  if (options?.paraphraseEnabled && trimmed.split(/\s+/).length >= 6) {
    const paraphrase = await detectParaphrase(trimmed, translationId);
    for (const item of paraphrase) {
      if (existing.has(item.reference.toLowerCase())) continue;
      if (!shouldSkipReference(item.reference)) suggestions.push(item);
    }
  }

  return suggestions;
}

/** Fallback when the native command is unavailable or returns nothing. */
function clientSideDetect(text: string): ParsedReferenceMatch[] {
  const patterns = [
    /(?:\b(?:turn(?:\s+with\s+me)?\s+to|read(?:ing)?(?:\s+from)?|in|from)\s+)?((?:[1-3]|first|second|third)\s+)?[a-z]+(?:\s+of\s+[a-z]+)?\.?\s+\d+\s*:\s*\d+(?:\s*(?:-|through|to)\s*\d+)?/gi,
    /(?:\b(?:turn(?:\s+with\s+me)?\s+to|read(?:ing)?(?:\s+from)?|in|from)\s+)?((?:[1-3]|first|second|third)\s+)?[a-z]+(?:\s+of\s+[a-z]+)?\.?\s+\d+\s+\d+(?:\s*(?:-|through|to)\s*\d+)?/gi,
    /((?:[1-3]|first|second|third)\s+)?[a-z]+(?:\s+of\s+[a-z]+)?\s+chapter\s+\d+\s+(?:verse|verses)\s+\d+/gi,
    /((?:[1-3]|first|second|third)\s+)?[a-z]+(?:\s+of\s+[a-z]+)?\.?\s+\d+\s+(?:verse|verses)\s+\d+/gi,
  ];

  const hits: ParsedReferenceMatch[] = [];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const raw = match[0].trim();
      const normalized = raw
        .replace(/\s+chapter\s+/i, " ")
        .replace(/\s+(?:verse|verses)\s+/i, ":")
        .replace(/\s+(\d+)\s+(\d+)(?!\s*:)/i, " $1:$2")
        .replace(/first/i, "1")
        .replace(/second/i, "2")
        .replace(/third/i, "3")
        .replace(/\s+/g, " ")
        .trim();
      hits.push({
        matched_text: raw,
        normalized_reference: normalized,
        parsed: {
          book_name: normalized.split(/\d/)[0]?.trim() ?? "",
          book_number: 0,
          chapter: 0,
        },
        confidence: 0.75,
        detection_type: "explicit",
      });
    }
  }
  return hits;
}

async function buildSuggestionFromMatch(
  match: ParsedReferenceMatch,
  detectedPhrase: string,
  translationId: string,
) {
  try {
    const ref = normalizeReferenceForLookup(match.normalized_reference);
    const lookup = await api.lookupReference(ref, translationId);
    const verses = lookup.search.verses;
    if (verses.length === 0) return null;

    const reference = lookup.search.parsed_reference
      ? formatReferenceFromParsed(lookup.search.parsed_reference)
      : ref;

    const confidence = match.confidence;
    return {
      detectedPhrase,
      reference,
      translationId,
      translationAbbr: verses[0]?.translation_abbr ?? "",
      confidence,
      confidenceLevel: confidenceLevel(confidence),
      detectionType: (match.detection_type === "explicit" ? "explicit" : "quote") as DetectionType,
      versePreview: verses[0]?.text ?? "",
      verses,
      alternatives: lookup.search.suggestions.filter((s) => s !== reference).slice(0, 3),
    };
  } catch {
    return null;
  }
}

function normalizeReferenceForLookup(input: string): string {
  return input
    .replace(/\s+chapter\s+/gi, " ")
    .replace(/\s+(?:verse|verses)\s+/gi, ":")
    .replace(/\b(first|second|third)\b/gi, (_, ord: string) =>
      ord.toLowerCase() === "first" ? "1" : ord.toLowerCase() === "second" ? "2" : "3",
    )
    .replace(/\s+(\d+)\s+(\d+)\b/g, " $1:$2")
    .replace(/\s+/g, " ")
    .trim();
}

function formatReferenceFromParsed(parsed: {
  book_name: string;
  chapter: number;
  verse_start?: number;
  verse_end?: number;
}): string {
  if (parsed.verse_start) {
    if (parsed.verse_end && parsed.verse_end !== parsed.verse_start) {
      return `${parsed.book_name} ${parsed.chapter}:${parsed.verse_start}-${parsed.verse_end}`;
    }
    return `${parsed.book_name} ${parsed.chapter}:${parsed.verse_start}`;
  }
  return `${parsed.book_name} ${parsed.chapter}`;
}

async function detectParaphrase(
  text: string,
  translationId: string,
): Promise<Omit<ScriptureSuggestion, "id" | "segmentId" | "status" | "createdAt">[]> {
  const quoteMatch = text.match(/(?:says|said|reads?|tells us)\s+(.{12,120})/i);
  const phrase = (quoteMatch?.[1] ?? text).replace(/[.!?]+$/, "").trim();
  if (phrase.length < 12) return [];

  try {
    const search = await api.searchBible(phrase, translationId, { exactPhrase: false, matchAllWords: false });
    if (search.verses.length === 0) return [];

    const top = search.verses[0];
    const confidence = 0.45;
    return [
      {
        detectedPhrase: text,
        reference: top.reference,
        translationId,
        translationAbbr: top.translation_abbr,
        confidence,
        confidenceLevel: confidenceLevel(confidence) as ConfidenceLevel,
        detectionType: "paraphrase",
        versePreview: top.text,
        verses: search.verses.slice(0, 3),
        alternatives: search.suggestions.slice(0, 3),
      },
    ];
  } catch {
    return [];
  }
}

export function exportTranscriptText(segments: { text: string; isFinal: boolean; timestamp: string }[]): string {
  return segments
    .filter((s) => s.isFinal)
    .map((s) => `[${s.timestamp}] ${s.text}`)
    .join("\n");
}

export function exportScriptureList(
  suggestions: Pick<ScriptureSuggestion, "reference" | "confidenceLevel" | "detectionType" | "createdAt">[],
): string {
  return suggestions
    .filter((s) => s.detectionType !== "topic")
    .map((s) => `${s.createdAt}\t${s.reference}\t${s.detectionType}\t${s.confidenceLevel}`)
    .join("\n");
}
