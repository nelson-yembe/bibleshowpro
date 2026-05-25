import { sceneFromServiceItem, type Scene } from "@/engine/scene";
import type { MediaRecord, ThemeConfig } from "@/lib/tauri";
import { usePresentationStore } from "@/stores/presentationStore";

export function sceneFromMediaRecord(item: MediaRecord, theme?: ThemeConfig): Scene {
  if (item.media_type === "video") {
    return {
      id: crypto.randomUUID(),
      type: "video",
      content: {
        title: item.name,
        videoPath: item.file_path,
      },
      theme,
      transition: "fade",
    };
  }

  if (item.media_type === "image") {
    return {
      id: crypto.randomUUID(),
      type: "image",
      content: {
        title: item.name,
        imagePath: item.file_path,
      },
      theme,
      transition: "fade",
    };
  }

  return sceneFromServiceItem(
    "announcement",
    item.name,
    JSON.stringify({ body: item.name, audioPath: item.file_path }),
    theme,
  );
}

export function serviceItemContentFromMedia(item: MediaRecord): string {
  if (item.media_type === "video") {
    return JSON.stringify({ filePath: item.file_path, videoPath: item.file_path, mediaId: item.id });
  }
  if (item.media_type === "image") {
    return JSON.stringify({ filePath: item.file_path, imagePath: item.file_path, mediaId: item.id });
  }
  return JSON.stringify({ filePath: item.file_path, audioPath: item.file_path, mediaId: item.id, body: item.name });
}

export async function previewMediaItem(item: MediaRecord, theme?: ThemeConfig) {
  const scene = sceneFromMediaRecord(item, theme);
  usePresentationStore.getState().previewScene(scene, "media");
}

export async function presentMediaItem(item: MediaRecord, theme?: ThemeConfig) {
  await previewMediaItem(item, theme);
  await usePresentationStore.getState().goLive();
}
