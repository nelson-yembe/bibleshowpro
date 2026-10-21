/** Downloadable whisper.cpp models, mirroring the Rust catalog. */

export interface WhisperModelInfo {
  id: string;
  label: string;
  filename: string;
  url: string;
  sizeBytes: number;
  note: string;
}

export interface WhisperDownloadProgress {
  modelId: string;
  received: number;
  total: number;
}

export const WHISPER_DOWNLOAD_EVENT = "whisper-download-progress";

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
  const mb = bytes / 1_000_000;
  if (mb < 1000) return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
  return `${(mb / 1000).toFixed(2)} GB`;
}

/** Whole percent, clamped — a progress bar should never run past its track. */
export function downloadPercent(received: number, total: number): number {
  if (!Number.isFinite(received) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((received / total) * 100)));
}

export function downloadStatusText(progress: WhisperDownloadProgress | null): string | null {
  if (!progress) return null;
  const percent = downloadPercent(progress.received, progress.total);
  return `${percent}% — ${formatBytes(progress.received)} of ${formatBytes(progress.total)}`;
}
