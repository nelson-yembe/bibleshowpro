/** Downloadable whisper.cpp models and the PC facts used to choose between them. */

import type { WhisperLanguage } from "@/lib/transcription/engineConfig";

export interface WhisperModelInfo {
  id: string;
  /** "tiny" | "base" | "small" */
  tier: string;
  label: string;
  filename: string;
  url: string;
  sizeBytes: number;
  sha256: string;
  ramMb: number;
  /** English-only models are more accurate for English; the others also handle French. */
  englishOnly: boolean;
  note: string;
}

export interface WhisperModelListing extends WhisperModelInfo {
  downloaded: boolean;
  path: string;
  /** Bytes left behind by an interrupted download; Download resumes from here. */
  partialBytes: number;
}

export interface SystemProfile {
  cpuName: string;
  physicalCores: number;
  logicalCores: number;
  totalMemoryMb: number;
  availableMemoryMb: number;
  cpu: { supported: boolean; missing: string[] };
}

export interface TranscriptionCapabilities {
  profile: SystemProfile;
  /** null when offline transcription cannot run on this PC at all. */
  recommendedTier: string | null;
  inferenceThreads: number;
  modelsDir: string;
  freeDiskMb: number | null;
}

export interface WhisperDownloadProgress {
  modelId: string;
  received: number;
  total: number;
  phase?: "downloading" | "verifying" | "done";
}

export const WHISPER_DOWNLOAD_EVENT = "whisper-download-progress";

export const LANGUAGE_OPTIONS: { value: WhisperLanguage; label: string }[] = [
  { value: "en", label: "English" },
  { value: "fr", label: "Français" },
  { value: "auto", label: "Detect automatically (mixed services)" },
];

/** English uses the English-only models; anything else needs a multilingual one. */
export function modelsForLanguage<T extends WhisperModelInfo>(models: T[], language: WhisperLanguage): T[] {
  return models.filter((m) => (language === "en" ? m.englishOnly : !m.englishOnly));
}

/** An English-only model will mistranscribe French, so it does not count as usable. */
export function isUsableForLanguage(model: WhisperModelInfo, language: WhisperLanguage): boolean {
  return language === "en" || !model.englishOnly;
}

export function recommendedModelId(
  models: WhisperModelInfo[],
  tier: string | null,
  language: WhisperLanguage,
): string | null {
  if (!tier) return null;
  return modelsForLanguage(models, language).find((m) => m.tier === tier)?.id ?? null;
}

function fileNameOf(path: string): string {
  return path.split(/[\\/]/).pop()?.toLowerCase() ?? "";
}

/** The catalog model the configured path points at, if it is one. */
export function selectedModel<T extends WhisperModelInfo>(models: T[], path: string): T | null {
  const name = fileNameOf(path.trim());
  if (!name) return null;
  return models.find((m) => m.filename.toLowerCase() === name) ?? null;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
  const mb = bytes / 1_000_000;
  if (mb < 1000) return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
  return `${(mb / 1000).toFixed(2)} GB`;
}

export function formatMemory(mb: number): string {
  if (!Number.isFinite(mb) || mb <= 0) return "unknown";
  return mb >= 1024 ? `${Math.round(mb / 1024)} GB` : `${Math.round(mb)} MB`;
}

/** Whole percent, clamped — a progress bar should never run past its track. */
export function downloadPercent(received: number, total: number): number {
  if (!Number.isFinite(received) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((received / total) * 100)));
}

export function downloadStatusText(progress: WhisperDownloadProgress | null): string | null {
  if (!progress) return null;
  if (progress.phase === "verifying") return "Checking the file is intact…";
  if (progress.phase === "done") return "Ready.";
  const percent = downloadPercent(progress.received, progress.total);
  return `${percent}% — ${formatBytes(progress.received)} of ${formatBytes(progress.total)}`;
}
