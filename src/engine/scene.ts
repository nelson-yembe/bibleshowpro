import { mergeThemeConfig, DEFAULT_THEME, type ThemeConfig } from "@/lib/themeConfig";
import type { VerseResult } from "@/lib/tauri";
import { resolveVerseLayout, themeForLowerThirdLayout } from "@/lib/lowerThird";
import type { ServiceItemContent } from "@/lib/serviceItemContent";

export { DEFAULT_THEME };

export type SceneType =
  | "scripture_fullscreen"
  | "scripture_lower_third"
  | "scripture_comparison"
  | "song_lyrics"
  | "announcement"
  | "image"
  | "video"
  | "countdown"
  | "speaker_lower_third"
  | "blank"
  | "blackout"
  | "logo";

export interface SceneContent {
  title?: string;
  body?: string;
  reference?: string;
  verses?: VerseResult[];
  translationAbbr?: string;
  comparisonVerse?: VerseResult;
  comparisonBody?: string;
  imagePath?: string;
  videoPath?: string;
  countdownSeconds?: number;
  speakerName?: string;
  speakerTitle?: string;
  layout?: "fullscreen" | "lower_third";
  /** Operator presentation overlays — travel with the scene to the output window. */
  highlightPhrase?: string;
  highlightColor?: string;
  emphasis?: "none" | "bold" | "glow";
  backgroundPreset?: "theme" | "ridge-dark" | "hymnal" | "plain-black";
}

export interface Scene {
  id: string;
  type: SceneType;
  content: SceneContent;
  theme?: ThemeConfig;
  transition?: "fade" | "none";
}

/**
 * Structural equality for scenes, ignoring the volatile random `id`.
 * Used to suppress redundant re-stages / output broadcasts.
 */
export function sceneContentEqual(a: Scene | null, b: Scene | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.type !== b.type) return false;
  if (JSON.stringify(a.content) !== JSON.stringify(b.content)) return false;
  const themeA = mergeThemeConfig(a.theme ?? undefined);
  const themeB = mergeThemeConfig(b.theme ?? undefined);
  return JSON.stringify(themeA) === JSON.stringify(themeB);
}

export function sceneFromVerses(verses: VerseResult[], theme?: ThemeConfig): Scene {
  const reference =
    verses.length === 1
      ? verses[0].reference
      : `${verses[0].reference.split(":")[0]}:${verses[0].verse}-${verses[verses.length - 1].verse}`;

  const body = verses
    .map((v) => (theme?.showVerseNumbers ?? true ? `[${v.verse}] ${v.text}` : v.text))
    .join("\n");

  return {
    id: crypto.randomUUID(),
    type: "scripture_fullscreen",
    content: {
      body,
      reference,
      verses,
      translationAbbr: verses[0]?.translation_abbr,
    },
    theme,
    transition: "fade",
  };
}

export type VerseLayout = "fullscreen" | "lower_third";

export function sceneFromVersesWithLayout(
  verses: VerseResult[],
  theme?: ThemeConfig,
  layout: VerseLayout = "fullscreen",
): Scene {
  const scene = sceneFromVerses(verses, theme);
  const effectiveLayout = resolveVerseLayout(theme, layout);
  if (effectiveLayout === "lower_third") {
    const mergedTheme = themeForLowerThirdLayout(scene.theme, "lower_third");
    return { ...scene, type: "scripture_lower_third", theme: mergedTheme };
  }
  return scene;
}

/** Bake live operator overlays into a scene so the projector can render them. */
export function sceneWithPresentationOverlays(
  scene: Scene,
  overlays: {
    highlightPhrase?: string;
    highlightColor?: string;
    emphasis?: "none" | "bold" | "glow";
    backgroundPreset?: "theme" | "ridge-dark" | "hymnal" | "plain-black";
  },
): Scene {
  const phrase = overlays.highlightPhrase?.trim() ?? "";
  return {
    ...scene,
    content: {
      ...scene.content,
      highlightPhrase: phrase || undefined,
      highlightColor: overlays.highlightColor,
      emphasis: overlays.emphasis,
      backgroundPreset: overlays.backgroundPreset,
    },
  };
}

export function sceneFromVerseComparison(
  primary: VerseResult,
  secondary: VerseResult,
  theme?: ThemeConfig,
  layout: VerseLayout = "fullscreen",
): Scene {
  const showNums = theme?.showVerseNumbers ?? true;
  const primaryBody = showNums ? `[${primary.verse}] ${primary.text}` : primary.text;
  const secondaryBody = showNums ? `[${secondary.verse}] ${secondary.text}` : secondary.text;

  const effectiveLayout = resolveVerseLayout(theme, layout);
  const type =
    effectiveLayout === "lower_third" ? "scripture_lower_third" : ("scripture_comparison" as SceneType);

  const mergedTheme =
    effectiveLayout === "lower_third" ? themeForLowerThirdLayout(theme, "lower_third") : theme;

  return {
    id: crypto.randomUUID(),
    type,
    content: {
      body: primaryBody,
      reference: primary.reference,
      verses: [primary],
      translationAbbr: primary.translation_abbr,
      comparisonVerse: secondary,
      comparisonBody: secondaryBody,
    },
    theme: mergedTheme,
    transition: "fade",
  };
}

export function sceneFromServiceItem(itemType: string, title: string, contentJson: string, theme?: ThemeConfig): Scene {
  const content = JSON.parse(contentJson || "{}") as SceneContent & ServiceItemContent & {
    filePath?: string;
    mediaId?: string;
    audioPath?: string;
  };

  const filePath = content.filePath ?? content.imagePath ?? content.videoPath ?? content.audioPath;

  const typeMap: Record<string, SceneType> = {
    scripture: "scripture_fullscreen",
    song: "song_lyrics",
    announcement: "announcement",
    image: "image",
    video: "video",
    countdown: "countdown",
    speaker_lower_third: "speaker_lower_third",
    blank: "blank",
    blackout: "blackout",
    logo: "logo",
    sermon_note: "announcement",
    section: "blank",
  };

  const sceneType = typeMap[itemType] ?? "announcement";
  const isSpeakerLowerThird = sceneType === "speaker_lower_third";
  const speakerName = content.speakerName?.trim();
  const speakerTitle = content.speakerTitle?.trim();
  const speakerBody = isSpeakerLowerThird
    ? speakerName || content.body || title
    : content.body ?? title;
  const speakerReference = isSpeakerLowerThird
    ? speakerTitle || undefined
    : content.reference;

  const mergedTheme = isSpeakerLowerThird ? themeForLowerThirdLayout(theme, "lower_third") : theme;

  return {
    id: crypto.randomUUID(),
    type: sceneType,
    content: {
      title,
      body: speakerBody,
      reference: speakerReference,
      imagePath: content.imagePath ?? (itemType === "image" ? filePath : undefined),
      videoPath: content.videoPath ?? (itemType === "video" ? filePath : undefined),
      countdownSeconds: content.countdownSeconds,
      speakerName: content.speakerName,
      speakerTitle: content.speakerTitle,
    },
    theme: mergedTheme,
    transition: "fade",
  };
}

export function blackoutScene(): Scene {
  return {
    id: crypto.randomUUID(),
    type: "blackout",
    content: {},
    transition: "none",
  };
}

export function blankScene(): Scene {
  return {
    id: crypto.randomUUID(),
    type: "blank",
    content: {},
    transition: "fade",
  };
}

export function logoScene(title = "Bible Show Pro"): Scene {
  return {
    id: crypto.randomUUID(),
    type: "logo",
    content: { title },
    transition: "fade",
  };
}
