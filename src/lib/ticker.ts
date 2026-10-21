/** Scrolling ticker bar drawn over the live output. */

export const TICKER_MIN_SPEED = 1;
export const TICKER_MAX_SPEED = 5;
/** Never scroll faster than this, however short the message. */
export const TICKER_MIN_DURATION_S = 6;
/** Bar height as a percentage of output height — also what captions step aside by. */
export const TICKER_BAR_HEIGHT_PCT = 7;

/** Characters cleared per second at speed 1. */
const BASE_CHARS_PER_SECOND = 6;
/** Extra travel so the message fully crosses an empty screen before repeating. */
const VIEWPORT_CHAR_ALLOWANCE = 40;

export type TickerPosition = "top" | "bottom";

export interface TickerSettings {
  enabled: boolean;
  text: string;
  position: TickerPosition;
  speed: number;
}

export const DEFAULT_TICKER_SETTINGS: TickerSettings = {
  enabled: false,
  text: "",
  position: "bottom",
  speed: 3,
};

export function normalizeTickerText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function clampTickerSpeed(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_TICKER_SETTINGS.speed;
  return Math.min(TICKER_MAX_SPEED, Math.max(TICKER_MIN_SPEED, Math.round(value)));
}

/** One full pass, so a longer message scrolls for longer at the same reading pace. */
export function tickerDurationSeconds(text: string, speed: number): number {
  const chars = normalizeTickerText(text).length;
  if (chars === 0) return TICKER_MIN_DURATION_S;
  const perSecond = BASE_CHARS_PER_SECOND * clampTickerSpeed(speed);
  return Math.max(TICKER_MIN_DURATION_S, (chars + VIEWPORT_CHAR_ALLOWANCE) / perSecond);
}

/** Enabled on its own is not enough — an empty message draws no bar. */
export function isTickerVisible(settings: TickerSettings): boolean {
  return settings.enabled && normalizeTickerText(settings.text).length > 0;
}

/**
 * How far captions must move off their edge to clear the ticker bar.
 * Zero unless both are visible on the same edge.
 */
export function captionEdgeOffsetPct(
  captionPosition: TickerPosition,
  ticker: TickerSettings,
): number {
  if (!isTickerVisible(ticker)) return 0;
  return ticker.position === captionPosition ? TICKER_BAR_HEIGHT_PCT : 0;
}

export function sanitizeTickerSettings(patch: Partial<TickerSettings>): TickerSettings {
  return {
    enabled: patch.enabled ?? DEFAULT_TICKER_SETTINGS.enabled,
    text: typeof patch.text === "string" ? patch.text : DEFAULT_TICKER_SETTINGS.text,
    position: patch.position === "top" ? "top" : "bottom",
    speed: clampTickerSpeed(patch.speed ?? DEFAULT_TICKER_SETTINGS.speed),
  };
}
