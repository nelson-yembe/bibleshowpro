import type { ThemeConfig, VerseResult } from "@/lib/tauri";
import { DEFAULT_THEME, mergeThemeConfig } from "@/lib/themeConfig";

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
}

export interface Scene {
  id: string;
  type: SceneType;
  content: SceneContent;
  theme?: ThemeConfig;
  transition?: "fade" | "none";
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
  if (layout === "lower_third") {
    const mergedTheme = mergeThemeConfig({
      ...scene.theme,
      lowerThird: { ...mergeThemeConfig(scene.theme).lowerThird, enabled: true },
    });
    return { ...scene, type: "scripture_lower_third", theme: mergedTheme };
  }
  return scene;
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

  const type =
    layout === "lower_third" ? "scripture_lower_third" : ("scripture_comparison" as SceneType);

  const mergedTheme =
    layout === "lower_third"
      ? mergeThemeConfig({
          ...theme,
          lowerThird: { ...mergeThemeConfig(theme).lowerThird, enabled: true },
        })
      : theme;

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
  const content = JSON.parse(contentJson || "{}") as SceneContent & {
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
  };

  return {
    id: crypto.randomUUID(),
    type: typeMap[itemType] ?? "announcement",
    content: {
      title,
      body: content.body ?? title,
      reference: content.reference,
      imagePath: content.imagePath ?? (itemType === "image" ? filePath : undefined),
      videoPath: content.videoPath ?? (itemType === "video" ? filePath : undefined),
      countdownSeconds: content.countdownSeconds,
      speakerName: content.speakerName,
      speakerTitle: content.speakerTitle,
    },
    theme,
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
