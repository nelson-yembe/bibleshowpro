import type { LyricSlide, SongDetail, SongThemeSettings } from "@/lib/songTypes";
import { copyrightLine, parseSongTheme } from "@/lib/songTypes";
import type { ThemeConfig } from "@/lib/tauri";
import { mergeThemeConfig } from "@/lib/themeConfig";
import type { LowerThirdOverrides } from "@/lib/lowerThird";
import { mergeLowerThirdTheme } from "@/lib/lowerThird";
import { broadcastProgramReliable } from "@/engine/broadcast";
import { persistSnapshot } from "@/engine/previewProgram";
import { sceneFromServiceItem, type Scene } from "@/engine/scene";
import {
  isPresentationOnAir,
  outputProgram,
  usePresentationStore,
} from "@/stores/presentationStore";

export function isSongLowerThirdMode(settings: SongThemeSettings): boolean {
  return settings.mode === "lower_third" || settings.mode === "clean";
}

export function buildSongProjectionTheme(
  baseTheme: ThemeConfig | undefined,
  songTheme: SongThemeSettings,
  lowerThirdOverrides?: LowerThirdOverrides,
): ThemeConfig {
  let theme = mergeThemeConfig(baseTheme);
  const isLowerThird = isSongLowerThirdMode(songTheme);

  if (isLowerThird) {
    theme = mergeLowerThirdTheme(theme, {
      enabled: true,
      ...(songTheme.mode === "clean"
        ? { transparentOutput: true, barOpacity: 0, textOutline: true }
        : {}),
      ...lowerThirdOverrides,
    });
    theme = {
      ...theme,
      textColor: songTheme.textColor ?? theme.textColor,
      textShadow: songTheme.textShadow ?? theme.textShadow,
      lowerThird: {
        ...theme.lowerThird,
        textSize: songTheme.fontSize ?? theme.lowerThird.textSize,
        fontFamily: songTheme.fontFamily ?? theme.lowerThird.fontFamily,
        textShadow: songTheme.textShadow ?? theme.lowerThird.textShadow,
      },
    };
  } else {
    theme = {
      ...theme,
      fontSize: songTheme.fontSize ?? theme.fontSize,
      fontFamily: songTheme.fontFamily ?? theme.fontFamily,
      textColor: songTheme.textColor ?? theme.textColor,
      lineHeight: songTheme.lineSpacing ?? theme.lineHeight,
      textShadow: songTheme.textShadow ?? theme.textShadow,
      backgroundColor:
        songTheme.backgroundType === "transparent"
          ? "transparent"
          : songTheme.backgroundValue ?? theme.backgroundColor,
    };
  }

  return theme;
}

export function sceneFromLyricSlide(
  slide: LyricSlide,
  song: SongDetail,
  theme?: ThemeConfig,
  songTheme?: SongThemeSettings,
  lowerThirdOverrides?: LowerThirdOverrides,
): Scene {
  const settings = songTheme ?? parseSongTheme(song.theme_json);
  const copyright = copyrightLine(song.copyright);
  const isLowerThird = isSongLowerThirdMode(settings);
  const mergedTheme = buildSongProjectionTheme(theme, settings, lowerThirdOverrides);
  const sectionLabel = slide.section_label ?? "Lyrics";

  return {
    id: `song-${song.id}-${slide.id}`,
    type: "song_lyrics",
    content: {
      title: song.title,
      body: slide.text,
      reference: isLowerThird
        ? `${song.title} · ${sectionLabel}`
        : settings.showCopyrightFooter !== false
          ? copyright || undefined
          : undefined,
      layout: isLowerThird ? "lower_third" : "fullscreen",
    },
    theme: mergedTheme,
    transition: "fade",
  };
}

function commitSongScene(scene: Scene, toProgram: boolean) {
  usePresentationStore.setState((state) => {
    const onAir = toProgram || isPresentationOnAir(state);
    if (!onAir) {
      if (
        state.preview?.id === scene.id &&
        state.preview?.content.body === scene.content.body &&
        state.previewSource === "song"
      ) {
        return state;
      }
      const next = {
        ...state,
        preview: scene,
        previewSource: "song" as const,
      };
      persistSnapshot(next);
      return next;
    }

    if (
      state.program?.id === scene.id &&
      state.program?.content.body === scene.content.body &&
      state.preview?.id === scene.id
    ) {
      return state;
    }

    const next = {
      ...state,
      preview: scene,
      program: scene,
      history: state.program ? [state.program, ...state.history].slice(0, 20) : state.history,
      previewSource: "song" as const,
      liveFollow: true,
    };

    persistSnapshot(next);
    void broadcastProgramReliable(outputProgram(scene, true));
    return next;
  });
}

export async function previewSongSlide(
  slide: LyricSlide,
  song: SongDetail,
  theme?: ThemeConfig,
  songTheme?: SongThemeSettings,
  lowerThirdOverrides?: LowerThirdOverrides,
) {
  const scene = sceneFromLyricSlide(slide, song, theme, songTheme, lowerThirdOverrides);
  commitSongScene(scene, false);
}

export async function takeSongSlideLive(
  slide: LyricSlide,
  song: SongDetail,
  theme?: ThemeConfig,
  songTheme?: SongThemeSettings,
  lowerThirdOverrides?: LowerThirdOverrides,
) {
  const scene = sceneFromLyricSlide(slide, song, theme, songTheme, lowerThirdOverrides);
  const state = usePresentationStore.getState();

  if (isPresentationOnAir(state)) {
    commitSongScene(scene, true);
    return;
  }

  commitSongScene(scene, false);
  await usePresentationStore.getState().goLive();
}

/** @deprecated Use takeSongSlideLive */
export async function presentSongSlide(
  slide: LyricSlide,
  song: SongDetail,
  theme?: ThemeConfig,
  songTheme?: SongThemeSettings,
) {
  await takeSongSlideLive(slide, song, theme, songTheme);
}

export function serviceItemContentFromSong(songId: string, slideIndex: number): string {
  return JSON.stringify({ songId, slideIndex });
}

export function sceneFromSongServiceItem(
  title: string,
  contentJson: string,
  theme?: ThemeConfig,
): Scene | null {
  if (!JSON.parse(contentJson || "{}").songId) return null;
  return sceneFromServiceItem("song", title, contentJson, theme);
}
