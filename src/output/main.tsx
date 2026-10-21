import { useEffect, useState } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { createRoot } from "react-dom/client";
import { CaptionOverlay } from "@/components/presentation/CaptionOverlay";
import { SceneRenderer } from "@/components/presentation/SceneRenderer";
import { TickerOverlay } from "@/components/presentation/TickerOverlay";
import type { Scene } from "@/engine/scene";
import { logoScene } from "@/engine/scene";
import { isTransparentLowerThirdOutput } from "@/lib/lowerThird";
import { api } from "@/lib/tauri";
import { cn } from "@/lib/utils";
import { startCaptionBridge } from "@/stores/captionStore";
import { startTickerBridge } from "@/stores/tickerStore";
import { startVideoPlaybackBridge } from "@/stores/videoPlaybackStore";
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

function useTransparentOutput(scene: Scene | null) {
  useEffect(() => {
    const transparent = isTransparentLowerThirdOutput(scene, null, false);
    document.documentElement.classList.toggle("bsp-output-transparent", transparent);
    document.body.classList.toggle("bsp-output-transparent", transparent);
    return () => {
      document.documentElement.classList.remove("bsp-output-transparent");
      document.body.classList.remove("bsp-output-transparent");
    };
  }, [scene]);
}

function prefersReducedMotion() {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function OutputApp() {
  const isPreviewFeed = new URLSearchParams(window.location.search).get("ndi") === "preview";
  const [scene, setScene] = useState<Scene | null>(() => logoScene());
  const [revealed, setRevealed] = useState(isPreviewFeed);
  useOutputWakeLock();
  useTransparentOutput(scene);

  useEffect(() => startVideoPlaybackBridge({ applyRemote: true }), []);
  useEffect(() => startCaptionBridge({ applyRemote: true }), []);
  useEffect(() => startTickerBridge({ applyRemote: true }), []);

  const transparent = isTransparentLowerThirdOutput(scene, null, false);

  useEffect(() => {
    let cancelled = false;
    let fallbackTimer: number | undefined;

    const onUpdate = (event: Event) => {
      const detail = (event as CustomEvent<Scene | null>).detail;
      if (detail) setScene(detail);
    };
    window.addEventListener("bsp-program-update", onUpdate);

    const beginFadeIn = () => {
      if (cancelled) return;
      if (isPreviewFeed || prefersReducedMotion()) {
        setRevealed(true);
        return;
      }
      // Double-rAF: first visible OS frame stays at opacity 0, then ease in.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!cancelled) setRevealed(true);
        });
      });
    };

    const boot = async () => {
      try {
        const stored = (await (isPreviewFeed ? Promise.resolve(null) : api.getProgramOutput())) as Scene | null;
        if (!cancelled && stored) setScene(stored);
      } catch {
        // Browser/dev without Tauri
      }

      const eventName = isPreviewFeed ? "preview-update" : "program-update";
      try {
        await listen<Scene | null>(eventName, (event) => {
          if (!cancelled) setScene(event.payload ?? logoScene());
        });
      } catch {
        // Browser/dev without Tauri
      }

      if (isPreviewFeed) {
        setRevealed(true);
        return;
      }

      // Register reveal listener BEFORE asking native to show the window.
      try {
        await listen("output-revealed", () => {
          beginFadeIn();
        });
      } catch {
        // Browser/dev without Tauri — fade immediately.
        beginFadeIn();
        return;
      }

      if (cancelled) return;

      // Safety if output-revealed is missed.
      fallbackTimer = window.setTimeout(beginFadeIn, 2500);

      // Native shows the window, then emits output-revealed for the fade.
      void emit("output-ready");
    };

    void boot();

    return () => {
      cancelled = true;
      window.removeEventListener("bsp-program-update", onUpdate);
      if (fallbackTimer !== undefined) window.clearTimeout(fallbackTimer);
    };
  }, [isPreviewFeed]);

  return (
    <div
      className={cn("relative h-screen w-screen overflow-hidden", !transparent && "bg-black")}
      style={transparent ? { backgroundColor: "transparent" } : undefined}
    >
      <div
        className={cn(
          "h-full w-full",
          !isPreviewFeed && "bsp-output-reveal",
          !isPreviewFeed && revealed && "bsp-output-reveal-visible",
        )}
      >
        <SceneRenderer scene={scene} className="h-full w-full" label="" />
      </div>
      {/* Outside the reveal wrapper: overlays should not wait on the output fade-in. */}
      <CaptionOverlay />
      <TickerOverlay />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<OutputApp />);
