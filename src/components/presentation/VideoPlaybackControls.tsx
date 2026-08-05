import {
  Pause,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
  Repeat,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatPlaybackTime,
  useVideoPlaybackStore,
} from "@/stores/videoPlaybackStore";

interface VideoPlaybackControlsProps {
  className?: string;
  dense?: boolean;
  /** Hide when no clip is bound. */
  hideWhenIdle?: boolean;
}

export function VideoPlaybackControls({
  className,
  dense = false,
  hideWhenIdle = true,
}: VideoPlaybackControlsProps) {
  const path = useVideoPlaybackStore((s) => s.path);
  const playing = useVideoPlaybackStore((s) => s.playing);
  const currentTime = useVideoPlaybackStore((s) => s.currentTime);
  const duration = useVideoPlaybackStore((s) => s.duration);
  const muted = useVideoPlaybackStore((s) => s.muted);
  const loop = useVideoPlaybackStore((s) => s.loop);
  const volume = useVideoPlaybackStore((s) => s.volume);
  const togglePlay = useVideoPlaybackStore((s) => s.togglePlay);
  const seek = useVideoPlaybackStore((s) => s.seek);
  const restart = useVideoPlaybackStore((s) => s.restart);
  const toggleMute = useVideoPlaybackStore((s) => s.toggleMute);
  const toggleLoop = useVideoPlaybackStore((s) => s.toggleLoop);
  const setVolume = useVideoPlaybackStore((s) => s.setVolume);

  if (hideWhenIdle && !path) return null;

  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <div
      className={cn(
        "rounded-lg border border-[var(--color-border-light)] bg-[var(--color-panel)]",
        dense ? "p-2" : "p-2.5",
        className,
      )}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="section-label">Video playback</p>
        <span className="font-mono text-[10px] text-[var(--color-subtle)]">
          {formatPlaybackTime(currentTime)} / {formatPlaybackTime(duration)}
        </span>
      </div>

      <input
        type="range"
        min={0}
        max={duration || 0}
        step={0.1}
        value={Math.min(currentTime, duration || currentTime)}
        disabled={!duration}
        onChange={(e) => seek(Number(e.target.value))}
        className="mb-2 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-[var(--color-border)] accent-[var(--color-primary)] disabled:opacity-40"
        style={{
          background: duration
            ? `linear-gradient(to right, var(--color-primary) ${progress}%, var(--color-border) ${progress}%)`
            : undefined,
        }}
        aria-label="Seek"
      />

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => togglePlay()}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)]"
          title={playing ? "Pause" : "Play"}
        >
          {playing ? <Pause className="h-3.5 w-3.5 fill-current" /> : <Play className="h-3.5 w-3.5 fill-current" />}
        </button>
        <button
          type="button"
          onClick={() => restart()}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--color-border-light)] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
          title="Restart"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => toggleLoop()}
          className={cn(
            "inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--color-border-light)]",
            loop
              ? "border-[var(--color-primary)]/50 bg-blue-950/40 text-blue-300"
              : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]",
          )}
          title={loop ? "Loop on" : "Loop off"}
        >
          <Repeat className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => toggleMute()}
          className={cn(
            "inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--color-border-light)]",
            muted
              ? "text-amber-300"
              : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]",
          )}
          title={muted ? "Unmute" : "Mute"}
        >
          {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={muted ? 0 : volume}
          onChange={(e) => {
            const value = Number(e.target.value);
            setVolume(value);
            if (value > 0 && muted) useVideoPlaybackStore.getState().setMuted(false);
          }}
          className="ml-1 h-1.5 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-[var(--color-border)] accent-[var(--color-primary)]"
          aria-label="Volume"
        />
      </div>
    </div>
  );
}
