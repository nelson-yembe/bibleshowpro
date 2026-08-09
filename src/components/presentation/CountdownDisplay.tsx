import { useEffect, useRef, useState } from "react";
import {
  countdownPhase,
  countdownPhaseColor,
  formatCountdownTime,
  formatWallClock,
  mergeCountdownConfig,
  remainingFromStart,
  type CountdownColors,
  type CountdownConfig,
  type CountdownPhase,
} from "@/lib/countdownConfig";
import { cn } from "@/lib/utils";
import { usePresentationStore } from "@/stores/presentationStore";
import { useServiceStore } from "@/stores/serviceStore";

type CountdownDisplayConfig = Omit<Partial<CountdownConfig>, "colors"> & {
  colors?: Partial<CountdownColors>;
};

interface CountdownDisplayProps {
  title?: string;
  config: CountdownDisplayConfig;
  /** Full projection vs operator monitor. */
  compact?: boolean;
  /** When true, this surface is the live program and may run end behaviors. */
  isProgram?: boolean;
  className?: string;
}

export function CountdownDisplay({
  title,
  config: configPartial,
  compact = false,
  isProgram = false,
  className,
}: CountdownDisplayProps) {
  const config = mergeCountdownConfig(configPartial);
  const startedAt = config.countdownStartedAt;
  const ticking = Boolean(startedAt);
  const [now, setNow] = useState(() => Date.now());
  const endedActionRef = useRef(false);

  useEffect(() => {
    // Keep ticking after zero so wall-clock under the timer stays live.
    if (!ticking) return;
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, [ticking, startedAt]);

  useEffect(() => {
    endedActionRef.current = false;
  }, [startedAt, config.countdownSeconds]);

  const remaining = remainingFromStart(config.countdownSeconds, startedAt, now);
  const phase = countdownPhase(remaining, config);
  const accent = countdownPhaseColor(phase, config.colors);
  const progress =
    config.countdownSeconds > 0 ? Math.min(1, Math.max(0, remaining / config.countdownSeconds)) : 0;
  const scale = compact ? Math.min(1, config.displayScale) * 0.42 : config.displayScale;

  useEffect(() => {
    if (!isProgram || !ticking || remaining > 0 || endedActionRef.current) return;
    // Stay-on-screen modes never leave the countdown surface.
    if (config.endBehavior === "flash" || config.endBehavior === "hold") {
      endedActionRef.current = true;
      return;
    }
    endedActionRef.current = true;
    void runEndBehavior(config.endBehavior);
  }, [isProgram, ticking, remaining, config.endBehavior]);

  const flash =
    (phase === "critical" && config.flashOnCritical) ||
    (phase === "ended" && (config.endBehavior === "flash" || config.flashOnCritical));

  const timeLabel = formatCountdownTime(remaining);
  const wallClock = formatWallClock(new Date(now));
  const showWallClock = phase === "ended" && config.showClockAfterZero;
  const subtitle = !ticking
    ? "Ready · press GO LIVE to start"
    : phase === "ended"
      ? "Time’s up"
      : null;

  return (
    <div
      className={cn(
        "relative flex h-full w-full flex-col items-center justify-center px-6 text-center",
        className,
      )}
    >
      <div
        className={cn("flex flex-col items-center", flash && "bsp-countdown-flash")}
        style={{
          color: accent,
          transform: `scale(${scale})`,
          transformOrigin: "center center",
        }}
      >
        {config.showTitle && title ? (
          <p
            className={cn(
              "mb-4 max-w-[90%] font-semibold tracking-[0.18em] uppercase",
              compact ? "text-[10px]" : "text-sm md:text-base lg:text-lg",
            )}
            style={{ color: config.colors.title }}
          >
            {title}
          </p>
        ) : null}

        {config.style === "ring" && config.showProgress ? (
          <RingClock
            progress={progress}
            timeLabel={timeLabel}
            accent={accent}
            track={config.colors.track}
            compact={compact}
            phase={phase}
          />
        ) : (
          <div className="flex flex-col items-center gap-4">
            <p
              className={cn(
                "font-bold tabular-nums tracking-tight",
                compact ? "text-4xl" : "text-[clamp(4rem,14vw,9rem)]",
              )}
              style={{
                color: accent,
                textShadow: compact ? undefined : `0 0 48px ${accent}55`,
              }}
            >
              {timeLabel}
            </p>
            {config.style === "bar" && config.showProgress ? (
              <ProgressBar progress={progress} accent={accent} track={config.colors.track} compact={compact} />
            ) : null}
          </div>
        )}

        {phase === "warning" || phase === "critical" || phase === "ended" ? (
          <p
            className={cn(
              "mt-4 font-semibold uppercase tracking-[0.22em]",
              compact ? "text-[9px]" : "text-[11px]",
            )}
            style={{ color: accent }}
          >
            {phase === "ended" ? "Time expired" : phase === "critical" ? "Final moments" : "Wrapping up"}
          </p>
        ) : null}

        {showWallClock ? (
          <div className="mt-3 flex flex-col items-center gap-1">
            <p
              className={cn(
                "font-medium uppercase tracking-[0.2em] text-white/50",
                compact ? "text-[8px]" : "text-[10px]",
              )}
            >
              Current time
            </p>
            <p
              className={cn(
                "font-semibold tabular-nums tracking-wide",
                compact ? "text-sm" : "text-xl md:text-2xl",
              )}
              style={{ color: accent }}
            >
              {wallClock}
            </p>
          </div>
        ) : null}

        {subtitle && !compact && phase !== "ended" ? (
          <p className="mt-5 text-xs font-medium tracking-wide text-white/45">{subtitle}</p>
        ) : null}
      </div>
    </div>
  );
}

function RingClock({
  progress,
  timeLabel,
  accent,
  track,
  compact,
  phase,
}: {
  progress: number;
  timeLabel: string;
  accent: string;
  track: string;
  compact: boolean;
  phase: CountdownPhase;
}) {
  const size = compact ? 148 : 340;
  const stroke = compact ? 8 : 14;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - progress);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={track}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={accent}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{
            transition: "stroke-dashoffset 0.2s linear, stroke 0.35s ease",
            filter: phase === "critical" || phase === "ended" ? `drop-shadow(0 0 12px ${accent})` : undefined,
          }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <p
          className={cn(
            "font-bold tabular-nums tracking-tight",
            compact ? "text-3xl" : "text-[clamp(2.75rem,8vw,5.5rem)]",
          )}
          style={{
            color: accent,
            textShadow: compact ? undefined : `0 0 40px ${accent}44`,
          }}
        >
          {timeLabel}
        </p>
      </div>
    </div>
  );
}

function ProgressBar({
  progress,
  accent,
  track,
  compact,
}: {
  progress: number;
  accent: string;
  track: string;
  compact: boolean;
}) {
  return (
    <div
      className={cn("overflow-hidden rounded-full", compact ? "h-1.5 w-40" : "h-2.5 w-[min(420px,70vw)]")}
      style={{ backgroundColor: track }}
    >
      <div
        className="h-full rounded-full transition-[width] duration-200 ease-linear"
        style={{ width: `${progress * 100}%`, backgroundColor: accent }}
      />
    </div>
  );
}

async function runEndBehavior(behavior: CountdownConfig["endBehavior"]) {
  const presentation = usePresentationStore.getState();
  switch (behavior) {
    case "blackout":
      await presentation.blackout();
      break;
    case "logo":
      await presentation.showLogo();
      break;
    case "next":
      await useServiceStore.getState().nextItem();
      break;
    case "hold":
    case "flash":
    default:
      break;
  }
}
