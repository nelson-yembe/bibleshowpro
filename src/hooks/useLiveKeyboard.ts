import { useEffect, useRef } from "react";
import { useShortcutSheetStore } from "@/components/layout/ShortcutSheet";
import { keyTargetOf, resolveLiveShortcut } from "@/lib/liveShortcuts";
import { operatorSuggestionLayout } from "@/lib/transcription/transcriptionLiveFollow";
import { useLiveNavigationStore } from "@/stores/liveNavigationStore";
import { usePresentationStore } from "@/stores/presentationStore";
import { useTranscriptionStore } from "@/stores/transcriptionStore";

/** Global live shortcuts; the key map lives in `lib/liveShortcuts`. */
export function useLiveKeyboard(pathname: string) {
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const action = resolveLiveShortcut({
        key: event.key,
        shiftKey: event.shiftKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        metaKey: event.metaKey,
        target: keyTargetOf(event.target),
        onListenPage: pathRef.current.startsWith("/listen"),
      });
      if (!action) return;

      const presentation = usePresentationStore.getState();
      const transcription = useTranscriptionStore.getState();
      const { handlers } = useLiveNavigationStore.getState();

      switch (action.type) {
        case "go-live":
          event.preventDefault();
          if (presentation.previewSource === "transcription") {
            void transcription.goLiveSelectedSuggestion();
          } else {
            void presentation.goLive();
          }
          return;
        case "prev":
          if (!handlers?.canPrev || !handlers.onPrev) return;
          event.preventDefault();
          handlers.onPrev();
          return;
        case "next":
          if (!handlers?.canNext || !handlers.onNext) return;
          event.preventDefault();
          handlers.onNext();
          return;
        case "accept-next":
        case "accept": {
          const layout = operatorSuggestionLayout(transcription.suggestions);
          const target = action.type === "accept-next" ? layout.next : layout.others[action.index];
          if (!target) return;
          event.preventDefault();
          void transcription.selectAndPresentSuggestion(target);
          return;
        }
        case "blackout":
          event.preventDefault();
          void presentation.blackout();
          return;
        case "clear":
          event.preventDefault();
          presentation.clear();
          return;
        case "help":
          event.preventDefault();
          useShortcutSheetStore.getState().toggle();
          return;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
}
