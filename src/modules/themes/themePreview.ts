import { logoScene, sceneFromVerses, type Scene } from "@/engine/scene";
import type { ThemeConfig } from "@/lib/themeConfig";
import type { VerseResult } from "@/lib/tauri";

const SAMPLE_VERSE: VerseResult = {
  id: 1,
  translation_id: "kjv",
  translation_abbr: "KJV",
  book_number: 45,
  book_name: "Romans",
  chapter: 8,
  verse: 28,
  text: "And we know that all things work together for good to them that love God, to them who are the called according to his purpose.",
  reference: "Romans 8:28",
};

export type PreviewTab =
  | "Scripture"
  | "Song Lyric"
  | "Announcement"
  | "Lower Third"
  | "Blank / Logo";

export function previewSceneForTab(tab: PreviewTab, theme: ThemeConfig): Scene {
  switch (tab) {
    case "Song Lyric":
      return {
        id: "preview-song",
        type: "song_lyrics",
        content: {
          title: "Amazing Grace",
          body: "Amazing grace, how sweet the sound\nThat saved a wretch like me\nI once was lost, but now am found\nWas blind, but now I see",
        },
        theme,
      };
    case "Announcement":
      return {
        id: "preview-announcement",
        type: "announcement",
        content: {
          title: "Welcome",
          body: "Join us for fellowship after the service.\nRefreshments in the fellowship hall.",
        },
        theme,
      };
    case "Lower Third": {
      const base = sceneFromVerses([SAMPLE_VERSE], theme);
      return { ...base, id: "preview-lower-third", type: "scripture_lower_third" };
    }
    case "Blank / Logo": {
      const scene = logoScene("Bible Show Pro");
      return { ...scene, theme };
    }
    default:
      return sceneFromVerses([SAMPLE_VERSE], theme);
  }
}

export function themeSwatchStyle(configJson: string): string {
  try {
    const parsed = JSON.parse(configJson) as Partial<ThemeConfig>;
    if (parsed.backgroundType === "gradient" && parsed.backgroundGradient) {
      const g = parsed.backgroundGradient;
      return `linear-gradient(${g.angle ?? 160}deg, ${g.from ?? "#0f172a"}, ${g.to ?? "#1e293b"})`;
    }
    return parsed.backgroundColor ?? "#0f172a";
  } catch {
    return "#0f172a";
  }
}
