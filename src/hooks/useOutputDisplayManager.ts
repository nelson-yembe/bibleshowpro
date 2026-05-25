import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import type { DisplayInfo } from "@/lib/tauri";
import { usePresentationStore } from "@/stores/presentationStore";

/** Keeps projection output in sync with connected displays. */
export function useOutputDisplayManager() {
  const syncOutputStatus = usePresentationStore((s) => s.syncOutputStatus);
  const setDisplays = usePresentationStore((s) => s.setDisplays);

  useEffect(() => {
    let cancelled = false;
    const unlisteners: Array<Promise<() => void>> = [];

    const bootstrap = async () => {
      await syncOutputStatus();

      unlisteners.push(
        listen<DisplayInfo[]>("display-changed", (event) => {
          if (cancelled) return;
          setDisplays(event.payload);
          void syncOutputStatus();
        }),
      );

      unlisteners.push(
        listen<DisplayInfo>("output-opened", () => {
          if (cancelled) return;
          void syncOutputStatus();
        }),
      );

      unlisteners.push(
        listen("output-closed", () => {
          if (cancelled) return;
          usePresentationStore.setState({ outputOpen: false, activeDisplay: null });
          void syncOutputStatus();
        }),
      );
    };

    void bootstrap();

    return () => {
      cancelled = true;
      void Promise.all(unlisteners).then((fns) => fns.forEach((fn) => fn()));
    };
  }, [setDisplays, syncOutputStatus]);
}
