import { open } from "@tauri-apps/plugin-dialog";

const MEDIA_EXTENSIONS = [
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "svg",
  "mp4",
  "webm",
  "mov",
  "mkv",
  "avi",
  "mp3",
  "wav",
  "ogg",
  "m4a",
  "aac",
  "flac",
];

export async function pickMediaFiles(): Promise<string[]> {
  try {
    const selected = await open({
      multiple: true,
      filters: [{ name: "Media files", extensions: MEDIA_EXTENSIONS }],
    });
    if (!selected) return [];
    return Array.isArray(selected) ? selected : [selected];
  } catch {
    return pickMediaFilesViaInput();
  }
}

function pickMediaFilesViaInput(): Promise<string[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = MEDIA_EXTENSIONS.map((ext) => `.${ext}`).join(",");
    input.onchange = () => {
      const files = Array.from(input.files ?? []);
      resolve(files.map((file) => file.name));
    };
    input.click();
  });
}

export function isMediaDragEvent(event: React.DragEvent): boolean {
  return Array.from(event.dataTransfer.types).includes("Files");
}
