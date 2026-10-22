export type ListeningStatus =
  | "idle"
  | "listening"
  | "paused"
  | "stopped"
  | "processing"
  | "reconnecting"
  | "unavailable";

export type DetectionType = "explicit" | "paraphrase" | "quote" | "topic" | "inferred";
export type ConfidenceLevel = "high" | "medium" | "low";
export type SuggestionStatus = "pending" | "preview" | "queued" | "ignored" | "live" | "presented";

import { ENGINE_GEMINI, ENGINE_WEB_SPEECH, ENGINE_WHISPER } from "@/lib/transcription/engine";

export interface TranscriptionModel {
  id: string;
  label: string;
  profile: "fast" | "balanced" | "accurate" | "offline";
  latencyMs: number;
  requiresInternet: boolean;
  /**
   * True when the engine emits interim text as the speaker talks. False means it only
   * returns at the end of an utterance, which the silence watchdog has to allow for.
   */
  streaming: boolean;
  description: string;
}

export interface TranscriptSegment {
  id: string;
  text: string;
  isFinal: boolean;
  offsetMs: number;
  timestamp: string;
  hasDetection?: boolean;
  /** Language the engine heard this segment in, when it reported one. */
  language?: string;
}

export interface ScriptureSuggestion {
  id: string;
  segmentId?: string;
  detectedPhrase: string;
  reference: string;
  translationId: string;
  translationAbbr: string;
  confidence: number;
  confidenceLevel: ConfidenceLevel;
  detectionType: DetectionType;
  status: SuggestionStatus;
  versePreview: string;
  verses: import("@/lib/tauri").VerseResult[];
  alternatives: string[];
  createdAt: string;
}

export interface ParsedReferenceMatch {
  matched_text: string;
  normalized_reference: string;
  parsed: {
    book_number: number;
    book_name: string;
    chapter: number;
    verse_start?: number;
    verse_end?: number;
  };
  confidence: number;
  detection_type: string;
  alternatives?: string[];
}

/** Sermon context so bare references ("verse 16") resolve to the active passage. */
export interface DetectionContext {
  bookNumber: number;
  bookName: string;
  chapter?: number;
}

/**
 * Order is the order operators see. Whisper leads because it is the one that works on
 * any supported PC with no account and no internet; browser speech comes last because the
 * installed app's WebView2 runtime usually returns nothing from it.
 */
export const TRANSCRIPTION_MODELS: TranscriptionModel[] = [
  {
    id: ENGINE_WHISPER,
    label: "Whisper (offline) — recommended",
    profile: "offline",
    latencyMs: 2500,
    requiresInternet: false,
    streaming: false,
    description:
      "Runs on this PC: no account, no internet, audio never leaves the building. Text appears at each pause rather than word by word.",
  },
  {
    id: ENGINE_GEMINI,
    label: "Gemini (online)",
    profile: "accurate",
    latencyMs: 300,
    requiresInternet: true,
    streaming: true,
    description:
      "Google's cloud transcription: word-by-word and very accurate, but needs a paid-tier API key and a steady internet connection. Audio leaves the building.",
  },
  {
    id: ENGINE_WEB_SPEECH,
    label: "Browser speech (experimental)",
    profile: "fast",
    latencyMs: 400,
    requiresInternet: true,
    streaming: true,
    description:
      "Depends on Microsoft's WebView2 runtime, which usually returns nothing in the installed app. Kept only for machines where it happens to work.",
  },
];

export function confidenceLevel(score: number): ConfidenceLevel {
  if (score >= 0.85) return "high";
  if (score >= 0.65) return "medium";
  return "low";
}

export function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export interface TranscriptionSessionSummary {
  id: string;
  title: string;
  service_plan_id?: string | null;
  status: string;
  model_id: string;
  started_at: string;
  ended_at?: string | null;
  segment_count: number;
  detection_count: number;
}

export interface TranscriptionSessionDetail {
  id: string;
  title: string;
  service_plan_id?: string | null;
  status: string;
  model_id: string;
  audio_device_id?: string | null;
  started_at: string;
  ended_at?: string | null;
  segments: Array<{
    id: string;
    session_id: string;
    text: string;
    is_final: boolean;
    offset_ms: number;
    created_at: string;
  }>;
  detections: Array<{
    id: string;
    session_id: string;
    transcript_segment_id?: string | null;
    detected_phrase: string;
    suggested_reference: string;
    translation_id?: string | null;
    confidence: number;
    detection_type: string;
    status: string;
    verse_preview?: string | null;
    created_at: string;
  }>;
}
