export type ListeningStatus =
  | "idle"
  | "listening"
  | "paused"
  | "stopped"
  | "processing"
  | "reconnecting"
  | "unavailable";

export type DetectionType = "explicit" | "paraphrase" | "quote" | "topic";
export type ConfidenceLevel = "high" | "medium" | "low";
export type SuggestionStatus = "pending" | "preview" | "queued" | "ignored" | "live";

export interface TranscriptionModel {
  id: string;
  label: string;
  profile: "fast" | "balanced" | "accurate" | "offline";
  latencyMs: number;
  requiresInternet: boolean;
  description: string;
}

export interface TranscriptSegment {
  id: string;
  text: string;
  isFinal: boolean;
  offsetMs: number;
  timestamp: string;
  hasDetection?: boolean;
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
}

export const TRANSCRIPTION_MODELS: TranscriptionModel[] = [
  {
    id: "web-speech",
    label: "Web Speech (Browser)",
    profile: "fast",
    latencyMs: 400,
    requiresInternet: true,
    description: "Built-in browser speech recognition. Fast setup, requires internet in most browsers.",
  },
  {
    id: "web-speech-offline",
    label: "Web Speech (Local hint)",
    profile: "balanced",
    latencyMs: 600,
    requiresInternet: false,
    description: "Browser recognition with offline preference when supported by your browser.",
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
