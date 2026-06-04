import { describe, expect, it } from "vitest";
import { sceneFromVersesWithLayout } from "@/engine/scene";
import {
  LOWER_THIRD_LAYOUT_DEFAULTS,
  STANDARD_LOWER_THIRD_BAR_HEIGHT,
  buildLowerThirdTheme,
  resolveVerseLayout,
} from "@/lib/lowerThird";
import { mergeThemeConfig } from "@/lib/themeConfig";
import type { VerseResult } from "@/lib/tauri";
import { sceneFromLyricSlide } from "@/lib/songLive";
import type { LyricSlide, SongDetail } from "@/lib/songTypes";

const sampleVerse: VerseResult = {
  id: 1,
  translation_id: "kjv",
  translation_abbr: "KJV",
  book_number: 43,
  book_name: "John",
  chapter: 3,
  verse: 16,
  text: "For God so loved the world.",
  reference: "John 3:16",
};

describe("buildLowerThirdTheme", () => {
  it("preserves custom bar height over layout defaults", () => {
    const customHeight = 160;
    const theme = mergeThemeConfig({
      lowerThird: { ...mergeThemeConfig().lowerThird, barHeight: customHeight, template: "glass" },
    });
    const merged = buildLowerThirdTheme(theme);
    expect(merged.lowerThird.barHeight).toBe(customHeight);
    expect(merged.lowerThird.template).toBe("glass");
  });

  it("does not let activeTheme overwrite pattern reset custom settings", () => {
    const theme = mergeThemeConfig({
      lowerThird: { ...mergeThemeConfig().lowerThird, barHeight: 160, template: "glass" },
    });
    const wrongMerge = { ...theme.lowerThird, ...LOWER_THIRD_LAYOUT_DEFAULTS };
    expect(wrongMerge.barHeight).toBe(STANDARD_LOWER_THIRD_BAR_HEIGHT);
    const correctMerge = { ...LOWER_THIRD_LAYOUT_DEFAULTS, ...theme.lowerThird };
    expect(correctMerge.barHeight).toBe(160);
  });
});

describe("resolveVerseLayout", () => {
  it("honors explicit lower_third projection mode regardless of theme.enabled", () => {
    const theme = mergeThemeConfig({ lowerThird: { ...mergeThemeConfig().lowerThird, enabled: false } });
    expect(resolveVerseLayout(theme, "lower_third")).toBe("lower_third");
  });
});

describe("sceneFromVersesWithLayout", () => {
  it("uses scripture_lower_third when lower_third layout is requested", () => {
    const theme = mergeThemeConfig({ lowerThird: { ...mergeThemeConfig().lowerThird, enabled: false } });
    const scene = sceneFromVersesWithLayout([sampleVerse], theme, "lower_third");
    expect(scene.type).toBe("scripture_lower_third");
  });
});

describe("sceneFromLyricSlide", () => {
  const slide: LyricSlide = {
    id: "s1",
    song_id: "song-1",
    slide_order: 0,
    text: "Line one",
    section_label: "Verse 1",
  };
  const song: SongDetail = {
    id: "song-1",
    title: "Test Song",
    tags_json: "[]",
    favorite: false,
    theme_json: JSON.stringify({ mode: "lower_third" }),
    created_at: "",
    updated_at: "",
    sections: [],
    arrangements: [],
    slides: [slide],
  };

  it("uses lower_third layout when song projection mode is lower_third", () => {
    const theme = mergeThemeConfig({ lowerThird: { ...mergeThemeConfig().lowerThird, enabled: false } });
    const scene = sceneFromLyricSlide(slide, song, theme);
    expect(scene.content.layout).toBe("lower_third");
  });
});
