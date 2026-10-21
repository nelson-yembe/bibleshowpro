/** Rolling live-caption buffer shared by the console and the output window. */

/** Clear the overlay after this long with no update, so dead text never sticks on screen. */
export const CAPTION_STALE_MS = 8000;

export const CAPTION_MIN_LINES = 1;
export const CAPTION_MAX_LINES = 4;
export const CAPTION_MIN_SCALE = 0.6;
export const CAPTION_MAX_SCALE = 2;

export type CaptionPosition = "top" | "bottom";

export interface CaptionSettings {
  enabled: boolean;
  position: CaptionPosition;
  /** Multiplier on the viewport-relative base size, so captions scale with the projector. */
  fontScale: number;
  maxLines: number;
}

export const DEFAULT_CAPTION_SETTINGS: CaptionSettings = {
  enabled: false,
  position: "bottom",
  fontScale: 1,
  maxLines: 2,
};

export function normalizeCaptionText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function clampMaxLines(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_CAPTION_SETTINGS.maxLines;
  return Math.min(CAPTION_MAX_LINES, Math.max(CAPTION_MIN_LINES, Math.round(value)));
}

export function clampFontScale(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_CAPTION_SETTINGS.fontScale;
  return Math.min(CAPTION_MAX_SCALE, Math.max(CAPTION_MIN_SCALE, value));
}

/** Append a finalized line, dropping the oldest once the buffer exceeds maxLines. */
export function appendFinalLine(lines: string[], text: string, maxLines: number): string[] {
  const clean = normalizeCaptionText(text);
  if (!clean) return lines;
  return [...lines, clean].slice(-clampMaxLines(maxLines));
}

/** Lines to draw: finalized history plus the in-flight partial, newest last. */
export function composeCaptionLines(
  finalLines: string[],
  partial: string,
  maxLines: number,
): string[] {
  const clean = normalizeCaptionText(partial);
  const all = clean ? [...finalLines, clean] : [...finalLines];
  return all.slice(-clampMaxLines(maxLines));
}

/** True when the last update is old enough that the overlay should blank itself. */
export function isCaptionStale(
  lastUpdateAt: number | null,
  now: number,
  staleMs: number = CAPTION_STALE_MS,
): boolean {
  if (lastUpdateAt == null) return true;
  return now - lastUpdateAt >= staleMs;
}

export function sanitizeCaptionSettings(patch: Partial<CaptionSettings>): CaptionSettings {
  return {
    enabled: patch.enabled ?? DEFAULT_CAPTION_SETTINGS.enabled,
    position: patch.position === "top" ? "top" : "bottom",
    fontScale: clampFontScale(patch.fontScale ?? DEFAULT_CAPTION_SETTINGS.fontScale),
    maxLines: clampMaxLines(patch.maxLines ?? DEFAULT_CAPTION_SETTINGS.maxLines),
  };
}
