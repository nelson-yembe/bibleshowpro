import { memo, useEffect } from "react";
import { formatElapsed } from "@/lib/transcription/types";
import { useTranscriptionStore } from "@/stores/transcriptionStore";

/**
 * Isolated session timer. Subscribes ONLY to `elapsedMs` and owns the 1s tick,
 * so the per-second update doesn't re-render the whole Live Listen page.
 */
export const TranscriptionElapsed = memo(function TranscriptionElapsed() {
  const elapsedMs = useTranscriptionStore((s) => s.elapsedMs);
  const tickElapsed = useTranscriptionStore((s) => s.tickElapsed);

  useEffect(() => {
    const timer = window.setInterval(() => tickElapsed(), 1000);
    return () => window.clearInterval(timer);
  }, [tickElapsed]);

  if (elapsedMs <= 0) return null;

  return (
    <span className="text-[11px] tabular-nums text-[var(--color-muted-foreground)]">
      {formatElapsed(elapsedMs)}
    </span>
  );
});
