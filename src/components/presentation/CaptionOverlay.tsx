import { useEffect, useState } from "react";
import { CAPTION_STALE_MS, composeCaptionLines } from "@/lib/captions";
import { captionEdgeOffsetPct } from "@/lib/ticker";
import { useCaptionStore } from "@/stores/captionStore";
import { useTickerStore } from "@/stores/tickerStore";
import { cn } from "@/lib/utils";

/** Base size at scale 1 — viewport-relative so captions track the projector resolution. */
const BASE_FONT_VW = 2.6;
/** Distance from the chosen edge before any ticker offset. */
const BASE_EDGE_PCT = 6;

interface CaptionOverlayProps {
  className?: string;
}

/**
 * Live transcript drawn over whatever scene is on air.
 *
 * Deliberately not a SceneType: a scene replaces the output, whereas captions sit on top
 * of it, and interim results arrive far too often to push a whole scene each time.
 * Sized in vw, so this belongs in the full-screen output window rather than a scaled
 * console monitor.
 */
export function CaptionOverlay({ className }: CaptionOverlayProps) {
  const settings = useCaptionStore((s) => s.settings);
  const finalLines = useCaptionStore((s) => s.finalLines);
  const partial = useCaptionStore((s) => s.partial);
  const translatedLines = useCaptionStore((s) => s.translatedLines);
  const revision = useCaptionStore((s) => s.revision);
  const tickerSettings = useTickerStore((s) => s.settings);

  // Blank the overlay when the engine goes quiet, so dead text never sticks on screen.
  const [stale, setStale] = useState(true);
  useEffect(() => {
    if (revision === 0) {
      setStale(true);
      return;
    }
    setStale(false);
    const timer = window.setTimeout(() => setStale(true), CAPTION_STALE_MS);
    return () => window.clearTimeout(timer);
  }, [revision]);

  if (!settings.enabled || stale) return null;

  const translating = settings.translateTo !== "off";
  const original = !translating || settings.showOriginal ? composeCaptionLines(finalLines, partial, settings.maxLines) : [];
  const translated = translating ? translatedLines.slice(-settings.maxLines) : [];
  const lines = [
    ...original.map((text) => ({ text, translated: false })),
    ...translated.map((text) => ({ text, translated: true })),
  ];
  if (lines.length === 0) return null;

  // Step clear of the ticker bar when it occupies the same edge.
  const edgePct = BASE_EDGE_PCT + captionEdgeOffsetPct(settings.position, tickerSettings);
  const edgeStyle =
    settings.position === "top" ? { top: `${edgePct}%` } : { bottom: `${edgePct}%` };

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 z-30 flex flex-col items-center gap-[0.4vw] px-[4vw]",
        className,
      )}
      style={edgeStyle}
      aria-live="polite"
    >
      {lines.map((line, index) => (
        <span
          key={`${revision}-${index}`}
          className={cn(
            "max-w-full rounded-[0.3vw] bg-black/70 px-[1.2vw] py-[0.4vw] text-center font-medium leading-tight",
            // The translation in warm yellow, so two languages never read as one sentence.
            line.translated && original.length > 0 ? "text-amber-200" : "text-white",
          )}
          style={{
            fontSize: `${BASE_FONT_VW * settings.fontScale}vw`,
            textShadow: "0 0.15vw 0.3vw rgba(0,0,0,0.85)",
          }}
        >
          {line.text}
        </span>
      ))}
    </div>
  );
}
