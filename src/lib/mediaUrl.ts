import { convertFileSrc } from "@tauri-apps/api/core";

/** Turn a local filesystem path into a URL the webview can load. */
export function mediaUrl(filePath: string | null | undefined): string {
  if (!filePath) return "";
  if (filePath.startsWith("http://") || filePath.startsWith("https://") || filePath.startsWith("data:")) {
    return filePath;
  }
  try {
    return convertFileSrc(filePath);
  } catch {
    return filePath;
  }
}

export function parseMediaTags(tagsJson: string): string[] {
  try {
    const parsed = JSON.parse(tagsJson) as unknown;
    return Array.isArray(parsed) ? parsed.filter((tag): tag is string => typeof tag === "string") : [];
  } catch {
    return [];
  }
}

export function formatMediaSize(bytes?: number): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
