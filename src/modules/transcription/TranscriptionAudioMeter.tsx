import { memo } from "react";
import { cn } from "@/lib/utils";
import { useTranscriptionStore } from "@/stores/transcriptionStore";

/**
 * Isolated input-level meter. Subscribes ONLY to `audioLevel`, which updates at
 * ~60fps while listening. Keeping it in its own memoized component prevents the
 * whole Live Listen page from re-rendering on every audio frame (which would
 * tear down open dropdowns and cause flicker).
 */
export const TranscriptionAudioMeter = memo(function TranscriptionAudioMeter() {
  const audioLevel = useTranscriptionStore((s) => s.audioLevel);

  return (
    <div className="hidden h-2 w-24 overflow-hidden rounded-full bg-black/40 sm:block" title="Input level">
      <div
        className={cn(
          "h-full transition-all duration-75",
          audioLevel > 0.9 ? "bg-red-500" : audioLevel > 0.02 ? "bg-emerald-500" : "bg-[var(--color-subtle)]",
        )}
        style={{ width: `${Math.round(audioLevel * 100)}%` }}
      />
    </div>
  );
});
