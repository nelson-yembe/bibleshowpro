import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { remoteAction, runLiveAction } from "@/lib/liveActions";
import { startRemoteBibleSync } from "@/lib/remoteBible";
import { keyTargetOf, resolveLiveShortcut } from "@/lib/liveShortcuts";

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
      if (action && runLiveAction(action)) event.preventDefault();
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
}

/** Commands from the phone remote run exactly like the operator's keys. */
export function useRemoteCommands() {
  useEffect(() => {
    const stops: (() => void)[] = [];
    let cancelled = false;
    const keep = (unlisten: () => void) => {
      if (cancelled) unlisten();
      else stops.push(unlisten);
    };
    listen<string>("remote-command", (event) => {
      const action = remoteAction(event.payload);
      if (action) runLiveAction(action);
    })
      .then(keep)
      .catch(() => {
        // Browser dev server: no remote.
      });
    // Scripture on the remote is the Bible page itself, kept in step both ways.
    stops.push(startRemoteBibleSync());
    return () => {
      cancelled = true;
      stops.forEach((stop) => stop());
    };
  }, []);
}
