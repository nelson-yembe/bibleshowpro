import type { VerseResult } from "@/lib/tauri";
import {
  DEFAULT_COUNTDOWN_CONFIG,
  type CountdownColors,
  type CountdownEndBehavior,
  type CountdownStyle,
} from "@/lib/countdownConfig";

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
  warningSeconds?: number;
  criticalSeconds?: number;
  endBehavior?: CountdownEndBehavior;
  style?: CountdownStyle;
  colors?: Partial<CountdownColors>;
  showProgress?: boolean;
  showTitle?: boolean;
  flashOnCritical?: boolean;
  displayScale?: number;
  showClockAfterZero?: boolean;
  countdownStartedAt?: number;
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
      return {
        countdownSeconds: DEFAULT_COUNTDOWN_CONFIG.countdownSeconds,
        warningSeconds: DEFAULT_COUNTDOWN_CONFIG.warningSeconds,
        criticalSeconds: DEFAULT_COUNTDOWN_CONFIG.criticalSeconds,
        endBehavior: DEFAULT_COUNTDOWN_CONFIG.endBehavior,
        style: DEFAULT_COUNTDOWN_CONFIG.style,
        colors: { ...DEFAULT_COUNTDOWN_CONFIG.colors },
        showProgress: DEFAULT_COUNTDOWN_CONFIG.showProgress,
        showTitle: DEFAULT_COUNTDOWN_CONFIG.showTitle,
        flashOnCritical: DEFAULT_COUNTDOWN_CONFIG.flashOnCritical,
        displayScale: DEFAULT_COUNTDOWN_CONFIG.displayScale,
        showClockAfterZero: DEFAULT_COUNTDOWN_CONFIG.showClockAfterZero,
      };
    case "announcement":
      return { body: "Announcement text" };
    case "sermon_note":
      return { body: "Sermon notes for the operator" };
    case "speaker_lower_third":
      return { speakerName: "Speaker Name", speakerTitle: "Role or title" };
    case "logo":
      return { body: "Bible Show Pro" };
    case "section":
      return {};
    default:
      return {};
  }
}
