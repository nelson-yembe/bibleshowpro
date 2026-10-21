import {
  isTickerVisible,
  normalizeTickerText,
  TICKER_BAR_HEIGHT_PCT,
  tickerDurationSeconds,
} from "@/lib/ticker";
import { useTickerStore } from "@/stores/tickerStore";
import { cn } from "@/lib/utils";

/** Base size at the default bar height — viewport-relative, like the captions. */
const BASE_FONT_VW = 1.9;

interface TickerOverlayProps {
  className?: string;
}

/**
 * Operator-authored message scrolling along one edge of the output.
 *
 * Shares the captions' bridge shape — its own lightweight channel rather than a
 * `SceneType` — because the bar persists across scene changes. Sized in vw, so this
 * belongs in the full-screen output window rather than a scaled console monitor.
 */
export function TickerOverlay({ className }: TickerOverlayProps) {
  const settings = useTickerStore((s) => s.settings);
  const revision = useTickerStore((s) => s.revision);

  if (!isTickerVisible(settings)) return null;

  const text = normalizeTickerText(settings.text);
  const duration = tickerDurationSeconds(settings.text, settings.speed);

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 z-40 overflow-hidden bg-black/80",
        settings.position === "top" ? "top-0" : "bottom-0",
        className,
      )}
      style={{ height: `${TICKER_BAR_HEIGHT_PCT}%` }}
    >
      <div className="flex h-full items-center">
        <span
          // Restart the pass whenever the message or pace changes.
          key={`${revision}-${duration}`}
          className="bsp-ticker-track font-medium text-white"
          style={{
            fontSize: `${BASE_FONT_VW}vw`,
            animationDuration: `${duration}s`,
            textShadow: "0 0.1vw 0.2vw rgba(0,0,0,0.85)",
          }}
        >
          {text}
        </span>
      </div>
    </div>
  );
}
