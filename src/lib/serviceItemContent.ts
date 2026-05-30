import type { VerseResult } from "@/lib/tauri";

export interface ServiceItemContent {
  reference?: string;
  verses?: VerseResult[];
  translationId?: string;
  songId?: string;
  slideIndex?: number;
  filePath?: string;
  mediaId?: string;
  imagePath?: string;
  videoPath?: string;
  audioPath?: string;
  body?: string;
  countdownSeconds?: number;
  speakerName?: string;
  speakerTitle?: string;
  source?: string;
}

export function parseServiceItemContent(json: string): ServiceItemContent {
  try {
    return JSON.parse(json || "{}") as ServiceItemContent;
  } catch {
    return {};
  }
}

export function stringifyServiceItemContent(content: ServiceItemContent): string {
  return JSON.stringify(content);
}

export function defaultContentForType(type: string): ServiceItemContent {
  switch (type) {
    case "countdown":
      return { countdownSeconds: 300 };
    case "announcement":
      return { body: "Announcement text" };
    case "sermon_note":
      return { body: "Sermon notes for the operator" };
    case "speaker_lower_third":
      return { speakerName: "Speaker Name", speakerTitle: "Role or title" };
    case "logo":
      return { body: "Bible Show Pro" };
    default:
      return {};
  }
}
