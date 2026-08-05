import { open } from "@tauri-apps/plugin-dialog";
import type { DragEvent } from "react";

export type MediaPickKind = "all" | "image" | "video" | "audio";

export const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"] as const;
export const VIDEO_EXTENSIONS = ["mp4", "webm", "mov", "mkv", "avi", "m4v"] as const;
export const AUDIO_EXTENSIONS = ["mp3", "wav", "ogg", "m4a", "aac", "flac"] as const;

const ALL_EXTENSIONS = [...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS, ...AUDIO_EXTENSIONS];

const KIND_EXTENSIONS: Record<MediaPickKind, readonly string[]> = {
  all: ALL_EXTENSIONS,
  image: IMAGE_EXTENSIONS,
  video: VIDEO_EXTENSIONS,
  audio: AUDIO_EXTENSIONS,
};

const KIND_FILTER_LABEL: Record<MediaPickKind, string> = {
  all: "Media files",
  image: "Images",
  video: "Videos",
  audio: "Audio",
};

function extensionsFor(kind: MediaPickKind = "all"): string[] {
  return [...KIND_EXTENSIONS[kind]];
}

export function extensionOfPath(path: string): string {
  const base = path.split(/[/\\]/).pop() ?? path;
  const dot = base.lastIndexOf(".");
  if (dot < 0) return "";
  return base.slice(dot + 1).toLowerCase();
}

export function pathMatchesKind(path: string, kind: MediaPickKind = "all"): boolean {
  const ext = extensionOfPath(path);
  if (!ext) return false;
  if (kind === "all") return ALL_EXTENSIONS.includes(ext as (typeof ALL_EXTENSIONS)[number]);
  return KIND_EXTENSIONS[kind].includes(ext);
}

/** Resolve a real filesystem path from a browser/Tauri File object when possible. */
export function fileSystemPath(file: File): string | null {
  const withPath = file as File & { path?: string };
  if (typeof withPath.path === "string" && withPath.path.length > 0) {
    return withPath.path;
  }
  return null;
}

export function pathsFromFileList(files: FileList | File[], kind: MediaPickKind = "all"): string[] {
  return Array.from(files)
    .map((file) => fileSystemPath(file))
    .filter((path): path is string => Boolean(path))
    .filter((path) => pathMatchesKind(path, kind));
}

export async function pickMediaFiles(kind: MediaPickKind = "all"): Promise<string[]> {
  const extensions = extensionsFor(kind);
  try {
    const selected = await open({
      multiple: true,
      title:
        kind === "image"
          ? "Import images"
          : kind === "video"
            ? "Import videos"
            : kind === "audio"
              ? "Import audio"
              : "Import media files",
      filters: [{ name: KIND_FILTER_LABEL[kind], extensions }],
    });
    if (!selected) return [];
    const paths = Array.isArray(selected) ? selected : [selected];
    return paths.filter((path) => pathMatchesKind(path, kind));
  } catch (error) {
    console.warn("Native media dialog failed; cannot fall back without filesystem paths.", error);
    return [];
  }
}

export function isMediaDragEvent(event: DragEvent): boolean {
  return Array.from(event.dataTransfer.types).includes("Files");
}
