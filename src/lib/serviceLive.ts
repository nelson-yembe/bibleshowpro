import { sceneFromServiceItem } from "@/engine/scene";
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

export async function previewServiceItem(item: ServiceItem, theme?: ThemeConfig) {
  const store = usePresentationStore.getState();

  if (item.item_type === "song") {
    const content = JSON.parse(item.content_json || "{}") as ServiceItemContent;
    if (content.songId) {
      const song = await api.getSong(content.songId);
      const slideIndex = content.slideIndex ?? 0;
      const songTheme = parseSongTheme(song.theme_json);
      const slides = song.slides.length > 0 ? song.slides : buildSlidesFromSong(song, 4);
      const slide = slides[slideIndex] ?? slides[0];
      if (slide) {
        const scene = sceneFromLyricSlide(slide, song, theme, songTheme);
        store.previewScene(scene, "song");
        return;
      }
    }
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
  await previewServiceItem(item, theme);
  await usePresentationStore.getState().goLive();
}
