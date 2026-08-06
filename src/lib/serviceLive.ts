import { sceneFromServiceItem } from "@/engine/scene";
import { sceneFromMediaRecord } from "@/lib/mediaLive";
import { api, type ServiceItem, type ThemeConfig, type VerseResult } from "@/lib/tauri";
import { buildSlidesFromSong, parseSongTheme } from "@/lib/songTypes";
import { sceneFromLyricSlide } from "@/lib/songLive";
import { usePresentationStore } from "@/stores/presentationStore";

interface ServiceItemContent {
  reference?: string;
  verses?: VerseResult[];
  translationId?: string;
  body?: string;
  songId?: string;
  slideIndex?: number;
  mediaId?: string;
  filePath?: string;
  imagePath?: string;
  videoPath?: string;
}

export async function resolveServiceItemVerses(item: ServiceItem): Promise<VerseResult[] | null> {
  if (item.item_type !== "scripture") return null;

  const content = JSON.parse(item.content_json || "{}") as ServiceItemContent;
  if (content.verses?.length) return content.verses;

  const reference = content.reference ?? item.title;
  if (!reference.trim()) return null;

  try {
    const result = await api.lookupReference(reference, content.translationId);
    const verses = result.groups.flat();
    return verses.length > 0 ? verses : null;
  } catch {
    return null;
  }
}

async function resolveLinkedMediaScene(item: ServiceItem, theme?: ThemeConfig) {
  if (item.item_type !== "image" && item.item_type !== "video") return null;

  const content = JSON.parse(item.content_json || "{}") as ServiceItemContent;

  if (content.mediaId) {
    try {
      const media = await api.listMedia();
      const linked = media.find((entry) => entry.id === content.mediaId);
      if (linked?.file_path) {
        return sceneFromMediaRecord(linked, theme);
      }
    } catch {
      // fall through
    }
  }

  const path = content.imagePath ?? content.videoPath ?? content.filePath;
  if (path) {
    return sceneFromServiceItem(item.item_type, item.title, item.content_json, theme);
  }

  return null;
}

function countdownScene(item: ServiceItem, theme?: ThemeConfig, start = false) {
  const parsed = JSON.parse(item.content_json || "{}") as Record<string, unknown>;
  const contentJson = JSON.stringify({
    ...parsed,
    countdownStartedAt: start ? Date.now() : undefined,
  });
  return sceneFromServiceItem(item.item_type, item.title, contentJson, theme);
}

export async function previewServiceItem(item: ServiceItem, theme?: ThemeConfig) {
  if (item.item_type === "section") return;

  const store = usePresentationStore.getState();

  if (item.item_type === "countdown") {
    store.previewScene(countdownScene(item, theme, false), "service");
    return;
  }

  if (item.item_type === "song") {
    const content = JSON.parse(item.content_json || "{}") as ServiceItemContent;
    if (content.songId) {
      const song = await api.getSong(content.songId);
      const slideIndex = content.slideIndex ?? 0;
      const songTheme = parseSongTheme(song.theme_json);
      const slides = buildSlidesFromSong(song, 4);
      const slide = slides[slideIndex] ?? slides[0];
      if (slide) {
        const scene = sceneFromLyricSlide(slide, song, theme, songTheme);
        store.previewScene(scene, "song");
        return;
      }
    }
  }

  const mediaScene = await resolveLinkedMediaScene(item, theme);
  if (mediaScene) {
    store.previewScene(mediaScene, "service");
    return;
  }

  const verses = await resolveServiceItemVerses(item);

  if (verses) {
    store.previewVerses(verses, theme, "fullscreen");
  } else {
    const scene = sceneFromServiceItem(item.item_type, item.title, item.content_json, theme);
    store.previewScene(scene, "service");
    return;
  }

  usePresentationStore.setState({ previewSource: "service" });
}

export async function presentServiceItem(item: ServiceItem, theme?: ThemeConfig) {
  if (item.item_type === "countdown") {
    const store = usePresentationStore.getState();
    store.previewScene(countdownScene(item, theme, true), "service");
    await store.goLive();
    return;
  }

  await previewServiceItem(item, theme);
  await usePresentationStore.getState().goLive();
}
