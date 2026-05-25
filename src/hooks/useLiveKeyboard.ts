import { useEffect } from "react";
import { useLiveNavigationStore } from "@/stores/liveNavigationStore";
import { usePresentationStore } from "@/stores/presentationStore";

/** Global presentation shortcuts: Space = go live, arrows = prev/next (from active screen). */
export function useLiveKeyboard() {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (event.key === " " && !event.shiftKey) {
        event.preventDefault();
        void usePresentationStore.getState().goLive();
        return;
      }

      const { handlers } = useLiveNavigationStore.getState();
      if (!handlers) return;

      if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        if (!handlers.canPrev || !handlers.onPrev) return;
        event.preventDefault();
        handlers.onPrev();
        return;
      }

      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        if (!handlers.canNext || !handlers.onNext) return;
        event.preventDefault();
        handlers.onNext();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
}
