import type { ServiceItemContent } from "@/lib/serviceItemContent";

export type CountdownEndBehavior = "hold" | "flash" | "blackout" | "next" | "logo";
export type CountdownStyle = "ring" | "bar" | "minimal";

export interface CountdownColors {
  normal: string;
  warning: string;
  critical: string;
  track: string;
  title: string;
}

export interface CountdownConfig {
  countdownSeconds: number;
  warningSeconds: number;
  criticalSeconds: number;
  endBehavior: CountdownEndBehavior;
  style: CountdownStyle;
  colors: CountdownColors;
  showProgress: boolean;
  showTitle: boolean;
  flashOnCritical: boolean;
  /** Projection size multiplier (0.55–1.45). */
  displayScale: number;
  /** After 00:00, show the real wall-clock time under the timer. */
  showClockAfterZero: boolean;
  /** Epoch ms when the live countdown started — drives synced remaining time. */
  countdownStartedAt?: number;
}

export const DEFAULT_COUNTDOWN_COLORS: CountdownColors = {
  normal: "#f8fafc",
  warning: "#fbbf24",
  critical: "#f87171",
  track: "rgba(255,255,255,0.18)",
  title: "rgba(248,250,252,0.78)",
};

export const DEFAULT_COUNTDOWN_CONFIG: CountdownConfig = {
  countdownSeconds: 300,
  warningSeconds: 60,
  criticalSeconds: 10,
  endBehavior: "flash",
  style: "ring",
  colors: DEFAULT_COUNTDOWN_COLORS,
  showProgress: true,
  showTitle: true,
  flashOnCritical: true,
  displayScale: 1,
  showClockAfterZero: true,
};

export function mergeCountdownConfig(
  partial?: Partial<CountdownConfig> | ServiceItemContent | null,
): CountdownConfig {
  const raw = partial ?? {};
  const colors = {
    ...DEFAULT_COUNTDOWN_COLORS,
    ...("colors" in raw && raw.colors ? raw.colors : {}),
  };
  const seconds =
    typeof raw.countdownSeconds === "number" && raw.countdownSeconds > 0
      ? Math.floor(raw.countdownSeconds)
      : DEFAULT_COUNTDOWN_CONFIG.countdownSeconds;

  const warningSeconds = clampThreshold(
    typeof raw.warningSeconds === "number" ? raw.warningSeconds : DEFAULT_COUNTDOWN_CONFIG.warningSeconds,
    seconds,
  );
  const criticalSeconds = clampThreshold(
    typeof raw.criticalSeconds === "number" ? raw.criticalSeconds : DEFAULT_COUNTDOWN_CONFIG.criticalSeconds,
    Math.min(warningSeconds, seconds),
  );

  const scaleRaw =
    typeof raw.displayScale === "number" ? raw.displayScale : DEFAULT_COUNTDOWN_CONFIG.displayScale;

  return {
    countdownSeconds: seconds,
    warningSeconds,
    criticalSeconds,
    endBehavior: isEndBehavior(raw.endBehavior) ? raw.endBehavior : DEFAULT_COUNTDOWN_CONFIG.endBehavior,
    style: isStyle(raw.style) ? raw.style : DEFAULT_COUNTDOWN_CONFIG.style,
    colors,
    showProgress: raw.showProgress ?? DEFAULT_COUNTDOWN_CONFIG.showProgress,
    showTitle: raw.showTitle ?? DEFAULT_COUNTDOWN_CONFIG.showTitle,
    flashOnCritical: raw.flashOnCritical ?? DEFAULT_COUNTDOWN_CONFIG.flashOnCritical,
    displayScale: clampScale(scaleRaw),
    showClockAfterZero: raw.showClockAfterZero ?? DEFAULT_COUNTDOWN_CONFIG.showClockAfterZero,
    countdownStartedAt:
      typeof raw.countdownStartedAt === "number" ? raw.countdownStartedAt : undefined,
  };
}

function clampThreshold(value: number, max: number) {
  return Math.max(0, Math.min(Math.floor(value), max));
}

function clampScale(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(1.45, Math.max(0.55, Math.round(value * 100) / 100));
}

function isEndBehavior(value: unknown): value is CountdownEndBehavior {
  return value === "hold" || value === "flash" || value === "blackout" || value === "next" || value === "logo";
}

function isStyle(value: unknown): value is CountdownStyle {
  return value === "ring" || value === "bar" || value === "minimal";
}

export function splitCountdownSeconds(totalSeconds: number): {
  hours: number;
  minutes: number;
  seconds: number;
} {
  const safe = Math.max(0, Math.floor(totalSeconds));
  return {
    hours: Math.floor(safe / 3600),
    minutes: Math.floor((safe % 3600) / 60),
    seconds: safe % 60,
  };
}

export function combineCountdownParts(hours: number, minutes: number, seconds: number): number {
  const h = Math.max(0, Math.min(99, Math.floor(hours) || 0));
  const m = Math.max(0, Math.min(59, Math.floor(minutes) || 0));
  const s = Math.max(0, Math.min(59, Math.floor(seconds) || 0));
  return Math.max(1, h * 3600 + m * 60 + s);
}

export function formatCountdownTime(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export function formatWallClock(date = new Date()): string {
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

export type CountdownPhase = "normal" | "warning" | "critical" | "ended";

export function countdownPhase(remaining: number, config: CountdownConfig): CountdownPhase {
  if (remaining <= 0) return "ended";
  if (remaining <= config.criticalSeconds) return "critical";
  if (remaining <= config.warningSeconds) return "warning";
  return "normal";
}

export function countdownPhaseColor(phase: CountdownPhase, colors: CountdownColors): string {
  switch (phase) {
    case "warning":
      return colors.warning;
    case "critical":
    case "ended":
      return colors.critical;
    default:
      return colors.normal;
  }
}

export function remainingFromStart(
  totalSeconds: number,
  startedAt: number | undefined,
  now = Date.now(),
): number {
  if (!startedAt) return totalSeconds;
  return Math.max(0, totalSeconds - Math.floor((now - startedAt) / 1000));
}

export const COUNTDOWN_END_BEHAVIOR_OPTIONS: {
  value: CountdownEndBehavior;
  label: string;
  hint: string;
}[] = [
  {
    value: "flash",
    label: "Stay & alert",
    hint: "Keep 00:00 on screen with a warning pulse (shows clock time)",
  },
  {
    value: "hold",
    label: "Hold at 00:00",
    hint: "Stay on zero with warning — no pulse (shows clock time)",
  },
  { value: "next", label: "Next cue", hint: "Advance to the next run-sheet item" },
  { value: "logo", label: "Show logo", hint: "Switch to logo / standby slide" },
  { value: "blackout", label: "Blackout", hint: "Fade program to black when time ends" },
];

export const COUNTDOWN_STYLE_OPTIONS: { value: CountdownStyle; label: string }[] = [
  { value: "ring", label: "Ring" },
  { value: "bar", label: "Progress bar" },
  { value: "minimal", label: "Minimal clock" },
];

export const COUNTDOWN_DURATION_PRESETS = [
  { label: "1m", seconds: 60 },
  { label: "3m", seconds: 180 },
  { label: "5m", seconds: 300 },
  { label: "10m", seconds: 600 },
  { label: "15m", seconds: 900 },
] as const;

export const COUNTDOWN_SIZE_PRESETS = [
  { label: "S", scale: 0.7 },
  { label: "M", scale: 0.85 },
  { label: "L", scale: 1 },
  { label: "XL", scale: 1.2 },
] as const;
