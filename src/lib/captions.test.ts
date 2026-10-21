import { describe, expect, it } from "vitest";
import {
  appendFinalLine,
  CAPTION_STALE_MS,
  clampFontScale,
  clampMaxLines,
  composeCaptionLines,
  isCaptionStale,
  normalizeCaptionText,
  sanitizeCaptionSettings,
} from "@/lib/captions";

describe("caption text normalisation", () => {
  it("collapses runs of whitespace and trims", () => {
    expect(normalizeCaptionText("  the   Lord  is\n my  shepherd ")).toBe(
      "the Lord is my shepherd",
    );
  });

  it("treats whitespace-only text as empty", () => {
    expect(normalizeCaptionText("   \n\t ")).toBe("");
  });
});

describe("caption line buffer", () => {
  it("appends a finalized line", () => {
    expect(appendFinalLine([], "first line", 2)).toEqual(["first line"]);
  });

  it("drops the oldest line once the buffer is full", () => {
    const lines = ["one", "two"];
    expect(appendFinalLine(lines, "three", 2)).toEqual(["two", "three"]);
  });

  it("ignores empty finalized text rather than pushing a blank line", () => {
    const lines = ["one"];
    expect(appendFinalLine(lines, "   ", 2)).toBe(lines);
  });

  it("does not mutate the array it is given", () => {
    const lines = ["one", "two"];
    appendFinalLine(lines, "three", 2);
    expect(lines).toEqual(["one", "two"]);
  });
});

describe("composing visible caption lines", () => {
  it("shows the in-flight partial after the finalized lines", () => {
    expect(composeCaptionLines(["settled"], "in progress", 2)).toEqual([
      "settled",
      "in progress",
    ]);
  });

  it("omits the partial when it is blank", () => {
    expect(composeCaptionLines(["settled"], "  ", 2)).toEqual(["settled"]);
  });

  it("keeps only the newest lines when over budget", () => {
    expect(composeCaptionLines(["a", "b", "c"], "d", 2)).toEqual(["c", "d"]);
  });

  it("returns nothing when there is no text at all", () => {
    expect(composeCaptionLines([], "", 2)).toEqual([]);
  });
});

describe("caption staleness", () => {
  it("is stale before the first update ever arrives", () => {
    expect(isCaptionStale(null, 1000)).toBe(true);
  });

  it("is fresh while updates keep arriving", () => {
    expect(isCaptionStale(1000, 1000 + CAPTION_STALE_MS - 1)).toBe(false);
  });

  it("goes stale once the window has elapsed", () => {
    expect(isCaptionStale(1000, 1000 + CAPTION_STALE_MS)).toBe(true);
  });
});

describe("caption settings clamping", () => {
  it("keeps line count within bounds", () => {
    expect(clampMaxLines(0)).toBe(1);
    expect(clampMaxLines(99)).toBe(4);
    expect(clampMaxLines(Number.NaN)).toBe(2);
  });

  it("keeps font scale within bounds", () => {
    expect(clampFontScale(0.1)).toBe(0.6);
    expect(clampFontScale(5)).toBe(2);
    expect(clampFontScale(Number.NaN)).toBe(1);
  });

  it("falls back to bottom for an unknown position", () => {
    const settings = sanitizeCaptionSettings({
      position: "middle" as unknown as "top",
    });
    expect(settings.position).toBe("bottom");
  });

  it("fills defaults for an empty patch", () => {
    expect(sanitizeCaptionSettings({})).toEqual({
      enabled: false,
      position: "bottom",
      fontScale: 1,
      maxLines: 2,
    });
  });
});
