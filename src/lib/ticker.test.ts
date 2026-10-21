import { describe, expect, it } from "vitest";
import {
  captionEdgeOffsetPct,
  clampTickerSpeed,
  DEFAULT_TICKER_SETTINGS,
  isTickerVisible,
  normalizeTickerText,
  sanitizeTickerSettings,
  TICKER_BAR_HEIGHT_PCT,
  TICKER_MIN_DURATION_S,
  tickerDurationSeconds,
  type TickerSettings,
} from "@/lib/ticker";

function settings(overrides: Partial<TickerSettings> = {}): TickerSettings {
  return { ...DEFAULT_TICKER_SETTINGS, ...overrides };
}

describe("ticker text", () => {
  it("collapses whitespace and trims", () => {
    expect(normalizeTickerText("  Welcome   to\n church ")).toBe("Welcome to church");
  });
});

describe("ticker speed", () => {
  it("clamps to the supported range", () => {
    expect(clampTickerSpeed(0)).toBe(1);
    expect(clampTickerSpeed(99)).toBe(5);
    expect(clampTickerSpeed(Number.NaN)).toBe(3);
  });

  it("rounds fractional speeds", () => {
    expect(clampTickerSpeed(2.4)).toBe(2);
  });
});

describe("ticker duration", () => {
  it("never dips below the floor, however short the message", () => {
    expect(tickerDurationSeconds("hi", 5)).toBe(TICKER_MIN_DURATION_S);
  });

  it("falls back to the floor for empty text", () => {
    expect(tickerDurationSeconds("   ", 3)).toBe(TICKER_MIN_DURATION_S);
  });

  it("scrolls longer text for longer at the same speed", () => {
    const short = tickerDurationSeconds("a".repeat(60), 3);
    const long = tickerDurationSeconds("a".repeat(400), 3);
    expect(long).toBeGreaterThan(short);
  });

  it("finishes sooner at a higher speed", () => {
    const slow = tickerDurationSeconds("a".repeat(400), 1);
    const fast = tickerDurationSeconds("a".repeat(400), 5);
    expect(fast).toBeLessThan(slow);
  });
});

describe("ticker visibility", () => {
  it("stays hidden when disabled", () => {
    expect(isTickerVisible(settings({ enabled: false, text: "Welcome" }))).toBe(false);
  });

  it("stays hidden when enabled with no message", () => {
    expect(isTickerVisible(settings({ enabled: true, text: "   " }))).toBe(false);
  });

  it("shows when enabled with a message", () => {
    expect(isTickerVisible(settings({ enabled: true, text: "Welcome" }))).toBe(true);
  });
});

describe("caption offset around the ticker", () => {
  const visible = (position: "top" | "bottom") =>
    settings({ enabled: true, text: "Welcome", position });

  it("moves captions aside when both sit on the same edge", () => {
    expect(captionEdgeOffsetPct("bottom", visible("bottom"))).toBe(TICKER_BAR_HEIGHT_PCT);
  });

  it("leaves captions alone on the opposite edge", () => {
    expect(captionEdgeOffsetPct("top", visible("bottom"))).toBe(0);
  });

  it("leaves captions alone when the ticker is not drawn", () => {
    expect(captionEdgeOffsetPct("bottom", settings({ enabled: false, text: "Welcome" }))).toBe(0);
    expect(captionEdgeOffsetPct("bottom", settings({ enabled: true, text: "" }))).toBe(0);
  });
});

describe("ticker settings clamping", () => {
  it("falls back to bottom for an unknown position", () => {
    const result = sanitizeTickerSettings({ position: "middle" as unknown as "top" });
    expect(result.position).toBe("bottom");
  });

  it("fills defaults for an empty patch", () => {
    expect(sanitizeTickerSettings({})).toEqual(DEFAULT_TICKER_SETTINGS);
  });

  it("keeps operator text verbatim, including inner spacing", () => {
    expect(sanitizeTickerSettings({ text: "  Youth   meeting  " }).text).toBe("  Youth   meeting  ");
  });
});
