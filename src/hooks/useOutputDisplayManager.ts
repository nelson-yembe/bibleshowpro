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
          // #region agent log
          {
            const __g = globalThis as unknown as { __ooCount?: number };
            __g.__ooCount = (__g.__ooCount ?? 0) + 1;
            fetch('http://127.0.0.1:7738/ingest/e670e04f-991d-4bfa-a718-ab18cda6626f',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'1b94a6'},body:JSON.stringify({sessionId:'1b94a6',hypothesisId:'F',location:'useOutputDisplayManager.ts:output-opened',message:'output-opened received (watcher refresh)',data:{count:__g.__ooCount},timestamp:Date.now()})}).catch(()=>{});
          }
          // #endregion
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
