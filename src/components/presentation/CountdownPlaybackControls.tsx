import { useEffect, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import {
  countdownRunState,
  formatCountdownTime,
  mergeCountdownConfig,
  resolveCountdownRemaining,
} from "@/lib/countdownConfig";
import { cn } from "@/lib/utils";
import { usePresentationStore } from "@/stores/presentationStore";

interface CountdownPlaybackControlsProps {
  className?: string;
  dense?: boolean;
}

export function CountdownPlaybackControls({
  className,
  dense = false,
}: CountdownPlaybackControlsProps) {
  const program = usePresentationStore((s) => s.program);
  const preview = usePresentationStore((s) => s.preview);
  const liveFollow = usePresentationStore((s) => s.liveFollow);
  const stopCountdown = usePresentationStore((s) => s.stopCountdown);
  const resetCountdown = usePresentationStore((s) => s.resetCountdown);
  const resumeCountdown = usePresentationStore((s) => s.resumeCountdown);
  const [now, setNow] = useState(() => Date.now());

  const scene =
    (liveFollow && program?.type === "countdown" && program) ||
    (preview?.type === "countdown" ? preview : null) ||
    (program?.type === "countdown" ? program : null);

  const startedAt = scene?.type === "countdown" ? scene.content.countdownStartedAt : undefined;

  useEffect(() => {
    if (!startedAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [startedAt]);

  if (!scene || scene.type !== "countdown") return null;

  const config = mergeCountdownConfig(scene.content);
  const remaining = resolveCountdownRemaining(config, now);
  const runState = countdownRunState(config, now);
  const canStop = runState === "running";
  const canResume = runState === "paused" || runState === "ready";
  const canReset = runState !== "ready";

  return (
    <div
      className={cn(
        "rounded-lg border border-[var(--color-border-light)] bg-[var(--color-panel)]",
        dense ? "p-2" : "p-2.5",
        className,
      )}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="section-label">Countdown</p>
        <span className="font-mono text-[10px] tabular-nums text-[var(--color-subtle)]">
          {formatCountdownTime(remaining)} / {formatCountdownTime(config.countdownSeconds)}
        </span>
      </div>

      <div className="mb-2 flex items-center gap-2">
        <StatusPill state={runState} />
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--color-border)]">
          <div
            className="h-full rounded-full bg-[var(--color-primary)] transition-[width] duration-200"
            style={{
              width: `${config.countdownSeconds > 0 ? Math.min(100, (remaining / config.countdownSeconds) * 100) : 0}%`,
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        <button
          type="button"
          disabled={!canStop}
          onClick={() => stopCountdown()}
          className={cn(
            "inline-flex items-center justify-center gap-1 rounded-md border px-2 py-2 text-[11px] font-semibold uppercase tracking-wide transition",
            canStop
              ? "border-amber-500/40 bg-amber-500/15 text-amber-100 hover:bg-amber-500/25"
              : "cursor-not-allowed border-[var(--color-border-light)] text-[var(--color-subtle)] opacity-40",
          )}
        >
          <Pause className="h-3.5 w-3.5" />
          Stop
        </button>
        <button
          type="button"
          disabled={!canResume}
          onClick={() => void resumeCountdown()}
          className={cn(
            "inline-flex items-center justify-center gap-1 rounded-md border px-2 py-2 text-[11px] font-semibold uppercase tracking-wide transition",
            canResume
              ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25"
              : "cursor-not-allowed border-[var(--color-border-light)] text-[var(--color-subtle)] opacity-40",
          )}
        >
          <Play className="h-3.5 w-3.5" />
          {runState === "paused" ? "Resume" : "Start"}
        </button>
        <button
          type="button"
          disabled={!canReset}
          onClick={() => resetCountdown()}
          className={cn(
            "inline-flex items-center justify-center gap-1 rounded-md border px-2 py-2 text-[11px] font-semibold uppercase tracking-wide transition",
            canReset
              ? "border-[var(--color-border-light)] text-[var(--color-foreground)] hover:bg-[var(--color-panel-hover)]"
              : "cursor-not-allowed border-[var(--color-border-light)] text-[var(--color-subtle)] opacity-40",
          )}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset
        </button>
      </div>
    </div>
  );
}

function StatusPill({ state }: { state: ReturnType<typeof countdownRunState> }) {
  const label =
    state === "running"
      ? "Running"
      : state === "paused"
        ? "Paused"
        : state === "ended"
          ? "Ended"
          : "Ready";
  const tone =
    state === "running"
      ? "bg-red-500/20 text-red-200"
      : state === "paused"
        ? "bg-amber-500/20 text-amber-100"
        : state === "ended"
          ? "bg-[var(--color-border)] text-[var(--color-muted-foreground)]"
          : "bg-[var(--color-primary)]/20 text-[var(--color-primary-foreground)]";

  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide", tone)}>
      {label}
    </span>
  );
}
