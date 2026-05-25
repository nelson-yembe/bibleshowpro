import { useEffect, useState } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { createRoot } from "react-dom/client";
import { SceneRenderer } from "@/components/presentation/SceneRenderer";
import type { Scene } from "@/engine/scene";
import { logoScene } from "@/engine/scene";
import { api } from "@/lib/tauri";
import "../index.css";

function useOutputWakeLock() {
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      if (cancelled || !("wakeLock" in navigator)) return;
      try {
        lock = await navigator.wakeLock.request("screen");
        lock.addEventListener("release", () => {
          if (!cancelled) void acquire();
        });
      } catch {
        // Wake Lock unavailable in this environment
      }
    };

    void acquire();

    const onVisible = () => {
      if (document.visibilityState === "visible") void acquire();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release();
    };
  }, []);
}

function OutputApp() {
  const isPreviewFeed = new URLSearchParams(window.location.search).get("ndi") === "preview";
  const [scene, setScene] = useState<Scene | null>(() => logoScene());
  useOutputWakeLock();

  useEffect(() => {
    const hydrate = async () => {
      try {
        const stored = (await (isPreviewFeed ? Promise.resolve(null) : api.getProgramOutput())) as Scene | null;
        if (stored) setScene(stored);
      } catch {
        // Browser/dev without Tauri
      }
    };

    void hydrate();

    const onUpdate = (event: Event) => {
      const detail = (event as CustomEvent<Scene | null>).detail;
      if (detail) setScene(detail);
    };
    window.addEventListener("bsp-program-update", onUpdate);

    let cancelled = false;
    const eventName = isPreviewFeed ? "preview-update" : "program-update";
    void listen<Scene | null>(eventName, (event) => {
      if (!cancelled) setScene(event.payload ?? logoScene());
    }).then(() => {
      if (!cancelled && !isPreviewFeed) void emit("output-ready");
    });

    return () => {
      cancelled = true;
      window.removeEventListener("bsp-program-update", onUpdate);
    };
  }, [isPreviewFeed]);

  return (
    <div className="h-screen w-screen overflow-hidden bg-black">
      <SceneRenderer scene={scene} className="h-full w-full" label="" />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<OutputApp />);
