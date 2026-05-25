import type { ThemeConfig, LowerThirdStyle } from "@/lib/themeConfig";
import { mergeThemeConfig } from "@/lib/themeConfig";

export type LowerThirdTemplate = LowerThirdStyle["template"];
export type LowerThirdHAlign = LowerThirdStyle["horizontalAlign"];
export type LowerThirdReferencePlacement = LowerThirdStyle["referencePlacement"];
export type LowerThirdAnimation = LowerThirdStyle["animation"];
export type LowerThirdDualStack = LowerThirdStyle["dualStack"];

export type LowerThirdOverrides = Partial<LowerThirdStyle>;

export interface LowerThirdPreset {
  id: string;
  label: string;
  description: string;
  overrides: LowerThirdOverrides;
}

/** Broadcast-safe 16:9 defaults (5% action safe, ~7% title safe). */
export const LOWER_THIRD_PRESETS: LowerThirdPreset[] = [
  {
    id: "worship_live",
    label: "Worship Live",
    description: "Full-width purple-to-teal banner with gold borders",
    overrides: {
      template: "worship",
      horizontalAlign: "center",
      widthPercent: 100,
      bottomOffsetPercent: 0,
      safeMarginPercent: 0,
      barHeightPercent: 28,
      barOpacity: 1,
      barGradient: { from: "#4a2080", to: "#0a7070", angle: 90 },
      accentGoldColor: "#e5c76b",
      showAccent: true,
      showBottomAccent: true,
      accentWidth: 5,
      showDecorations: false,
      textSize: 36,
      fontFamily: "'Segoe UI', system-ui, sans-serif",
      fontWeight: 700,
      textShadow: true,
      maxLines: 4,
      referencePlacement: "below",
      paddingX: 40,
      paddingY: 20,
      animation: "slide-up",
    },
  },
  {
    id: "broadcast",
    label: "Broadcast Safe",
    description: "Standard TV safe margins with centered bar",
    overrides: {
      template: "broadcast",
      horizontalAlign: "center",
      widthPercent: 88,
      bottomOffsetPercent: 6,
      safeMarginPercent: 5.5,
      barHeight: 32,
      barOpacity: 0.94,
      showAccent: true,
      accentPosition: "left",
      referencePlacement: "badge",
      animation: "slide-up",
    },
  },
  {
    id: "stream",
    label: "Live Stream",
    description: "Compact bar for webcam overlays",
    overrides: {
      template: "glass",
      horizontalAlign: "left",
      widthPercent: 72,
      bottomOffsetPercent: 8,
      safeMarginPercent: 5.5,
      barHeight: 28,
      barOpacity: 0.82,
      backdropBlur: true,
      referencePlacement: "inline",
      animation: "fade",
    },
  },
  {
    id: "obs_chroma",
    label: "OBS / Chroma",
    description: "Transparent bar for keying — text only on program",
    overrides: {
      template: "minimal",
      horizontalAlign: "center",
      widthPercent: 85,
      bottomOffsetPercent: 5,
      transparentOutput: true,
      barOpacity: 0,
      showAccent: false,
      textOutline: true,
      referencePlacement: "below",
      animation: "fade",
    },
  },
  {
    id: "full_width",
    label: "Full Width",
    description: "Edge-to-edge lower third",
    overrides: {
      template: "classic",
      horizontalAlign: "center",
      widthPercent: 100,
      bottomOffsetPercent: 0,
      safeMarginPercent: 0,
      barHeight: 36,
      showAccent: true,
      accentPosition: "top",
      referencePlacement: "inline",
    },
  },
  {
    id: "minimal",
    label: "Minimal Line",
    description: "Thin accent line with floating text",
    overrides: {
      template: "line-only",
      horizontalAlign: "left",
      widthPercent: 65,
      bottomOffsetPercent: 7,
      barHeight: 24,
      barOpacity: 0.75,
      showAccent: true,
      accentPosition: "bottom",
      referencePlacement: "above",
      animation: "slide-up",
    },
  },
];

export function mergeLowerThirdTheme(
  theme: ThemeConfig,
  overrides?: LowerThirdOverrides | null,
): ThemeConfig {
  if (!overrides || Object.keys(overrides).length === 0) return theme;
  return mergeThemeConfig({
    ...theme,
    lowerThird: { ...theme.lowerThird, ...overrides },
  });
}

export function applyBarColorOpacity(color: string, opacity: number): string {
  const clamped = Math.min(1, Math.max(0, opacity));
  const rgbaMatch = color.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i);
  if (rgbaMatch) {
    return `rgba(${rgbaMatch[1]}, ${rgbaMatch[2]}, ${rgbaMatch[3]}, ${clamped})`;
  }
  const hex = color.replace("#", "");
  if (/^[0-9a-f]{6}$/i.test(hex)) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${clamped})`;
  }
  if (/^[0-9a-f]{3}$/i.test(hex)) {
    const r = parseInt(hex[0] + hex[0], 16);
    const g = parseInt(hex[1] + hex[1], 16);
    const b = parseInt(hex[2] + hex[2], 16);
    return `rgba(${r}, ${g}, ${b}, ${clamped})`;
  }
  return color;
}

export function lowerThirdAnimationClass(animation: LowerThirdAnimation): string {
  if (animation === "slide-up") return "lower-third-enter-slide";
  if (animation === "fade") return "lower-third-enter-fade";
  return "";
}

export function lowerThirdMaxFontSize(theme: ThemeConfig, compact?: boolean, comparison?: boolean): number {
  const base = theme.lowerThird.textSize;
  if (theme.lowerThird.template === "worship" && !compact) {
    return Math.max(base, 32);
  }
  if (compact) {
    if (comparison) return Math.min(base * 0.42, 32);
    return Math.min(base * 0.55, 42);
  }
  return base;
}
