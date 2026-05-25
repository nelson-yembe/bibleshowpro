import type { CSSProperties } from "react";

export const DEFAULT_HIGHLIGHT_COLOR = "#3b82f6";

export const HIGHLIGHT_COLOR_PRESETS = [
  { label: "Blue", value: "#3b82f6" },
  { label: "Gold", value: "#facc15" },
  { label: "Green", value: "#22c55e" },
  { label: "Red", value: "#ef4444" },
  { label: "Purple", value: "#a855f7" },
  { label: "Cyan", value: "#06b6d4" },
] as const;

export function highlightMarkStyle(color: string): CSSProperties {
  return {
    backgroundColor: `${color}59`,
    color: "#ffffff",
    borderRadius: "0.125rem",
    padding: "0 0.125rem",
    boxDecorationBreak: "clone",
    WebkitBoxDecorationBreak: "clone",
  };
}
