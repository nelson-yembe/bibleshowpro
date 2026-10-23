import { useShortcutSheetStore } from "@/components/layout/ShortcutSheet";
import type { LiveShortcut } from "@/lib/liveShortcuts";
import { operatorSuggestionLayout } from "@/lib/transcription/transcriptionLiveFollow";
import { useLiveNavigationStore } from "@/stores/liveNavigationStore";
import { usePresentationStore } from "@/stores/presentationStore";
import { useTranscriptionStore } from "@/stores/transcriptionStore";
import { useThemeStore } from "@/stores/themeStore";
import type { VerseResult } from "@/lib/tauri";

/**
 * Carry out a live action from the keyboard or the phone remote. Returns false when there
 * was nothing to do (no next verse, no suggestion waiting), so the key can do its usual job.
 */
export function runLiveAction(action: LiveShortcut): boolean {
  const presentation = usePresentationStore.getState();
  const transcription = useTranscriptionStore.getState();
  const { handlers } = useLiveNavigationStore.getState();

  switch (action.type) {
    case "go-live":
      if (presentation.previewSource === "transcription") {
        void transcription.goLiveSelectedSuggestion();
      } else {
        void presentation.goLive();
      }
      return true;
    case "prev":
      if (!handlers?.canPrev || !handlers.onPrev) return false;
      handlers.onPrev();
      return true;
    case "next":
      if (!handlers?.canNext || !handlers.onNext) return false;
      handlers.onNext();
      return true;
    case "accept-next":
    case "accept": {
      const layout = operatorSuggestionLayout(transcription.suggestions);
      const target = action.type === "accept-next" ? layout.next : layout.others[action.index];
      if (!target) return false;
      void transcription.selectAndPresentSuggestion(target);
      return true;
    }
    case "blackout":
      void presentation.blackout();
      return true;
    case "clear":
      presentation.clear();
      return true;
    case "help":
      useShortcutSheetStore.getState().toggle();
      return true;
  }
}

/** Verses chosen on the phone remote: into preview, and on air when it asked for live. */
export async function showRemoteScripture(verses: VerseResult[], live: boolean): Promise<void> {
  if (verses.length === 0) return;
  const presentation = usePresentationStore.getState();
  presentation.previewVerses(verses, useThemeStore.getState().activeTheme, "fullscreen");
  if (live) await usePresentationStore.getState().goLive();
}

const REMOTE_ACTIONS: Record<string, LiveShortcut> = {
  prev: { type: "prev" },
  next: { type: "next" },
  "go-live": { type: "go-live" },
  "accept-next": { type: "accept-next" },
  blackout: { type: "blackout" },
  clear: { type: "clear" },
};

/** The action a phone remote asked for, or null for anything the remote may not do. */
export function remoteAction(name: string): LiveShortcut | null {
  return Object.prototype.hasOwnProperty.call(REMOTE_ACTIONS, name) ? REMOTE_ACTIONS[name] : null;
}
