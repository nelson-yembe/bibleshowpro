import type { MediaRecord } from "@/lib/tauri";
import type { ThemeConfig } from "@/lib/themeConfig";

/** Build a ThemeConfig patch that uses a media-library file as the projection background. */
export function themePatchFromMedia(item: MediaRecord): Partial<ThemeConfig> | null {
  if (!item.file_exists) return null;
  if (item.media_type === "image") {
    return {
      backgroundType: "image",
      backgroundImage: item.file_path,
      backgroundVideo: undefined,
    };
  }
  if (item.media_type === "video") {
    return {
      backgroundType: "video",
      backgroundVideo: item.file_path,
      backgroundImage: undefined,
    };
  }
  return null;
}

/** Short label for a stored background path (file name). */
export function mediaBackgroundLabel(path?: string | null): string {
  if (!path) return "No media selected";
  if (path.startsWith("blob:")) return "Temporary file (not saved to library)";
  const base = path.split(/[/\\]/).pop();
  return base && base.length > 0 ? base : path;
}
