import type { CSSProperties } from "react";
import type { ThemeConfig, LowerThirdStyle } from "@/lib/themeConfig";
import { mergeThemeConfig } from "@/lib/themeConfig";
import type { Scene } from "@/engine/scene";

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

/** Transparent canvas on program output; bar styling comes from the active theme. */
export const STREAM_OVERLAY_LOWER_THIRD: LowerThirdOverrides = {
  enabled: true,
  transparentOutput: true,
};

/** Standard fixed bar height (px) when barHeightPercent is not used. */
export const STANDARD_LOWER_THIRD_BAR_HEIGHT = 112;

/** Default width of text/content inside the bar (% of bar width). */
export const LOWER_THIRD_CONTENT_WIDTH_PERCENT = 80;

/** Defaults merged when entering any lower-third projection mode. */
export const LOWER_THIRD_LAYOUT_DEFAULTS: LowerThirdOverrides = {
  ...STREAM_OVERLAY_LOWER_THIRD,
  barHeight: STANDARD_LOWER_THIRD_BAR_HEIGHT,
  contentWidthPercent: LOWER_THIRD_CONTENT_WIDTH_PERCENT,
  maxLines: 4,
};

/** Text-only overlay — no bar fill (legacy chroma / minimal OBS preset). */
export const STREAM_TEXT_ONLY_LOWER_THIRD: LowerThirdOverrides = {
  ...STREAM_OVERLAY_LOWER_THIRD,
  barOpacity: 0,
  textOutline: true,
  backdropBlur: false,
  showAccent: false,
  showBottomAccent: false,
  showDecorations: false,
};

export function isLowerThirdScene(scene: Scene | null | undefined): boolean {
  if (!scene) return false;
  return (
    scene.type === "scripture_lower_third" ||
    scene.type === "speaker_lower_third" ||
    (scene.type === "song_lyrics" && scene.content.layout === "lower_third")
  );
}

export function isTransparentLowerThirdOutput(
  scene: Scene | null | undefined,
  themeOverride?: Partial<ThemeConfig> | null,
  compact?: boolean,
): boolean {
  if (!scene || compact || !isLowerThirdScene(scene)) return false;
  const theme = mergeThemeConfig({ ...(scene.theme ?? undefined), ...themeOverride });
  return theme.lowerThird.transparentOutput;
}

/** Merge stream layout defaults without overriding saved theme / modal settings. */
export function buildLowerThirdTheme(
  base?: ThemeConfig | null,
  extraOverrides?: LowerThirdOverrides | null,
): ThemeConfig {
  const theme = mergeThemeConfig(base ?? undefined);
  const result = mergeLowerThirdTheme(theme, {
    ...LOWER_THIRD_LAYOUT_DEFAULTS,
    ...theme.lowerThird,
    ...extraOverrides,
  });
  return result;
}

export function resolveVerseLayout(
  _theme: ThemeConfig | undefined,
  layout: "fullscreen" | "lower_third",
): "fullscreen" | "lower_third" {
  return layout === "lower_third" ? "lower_third" : "fullscreen";
}

export function themeForLowerThirdLayout(base: ThemeConfig | undefined, layout: "fullscreen" | "lower_third"): ThemeConfig {
  if (layout !== "lower_third") return mergeThemeConfig(base);
  return buildLowerThirdTheme(base);
}

export interface LowerThirdBarDimensions {
  heightCss: string | number;
  boxStyle: CSSProperties;
}

/** Fixed bar box — content wraps inside; height does not grow with text. */
export function lowerThirdBarDimensions(
  lt: LowerThirdStyle,
  options?: { compact?: boolean; compactVariant?: "panel" | "workspace" | "stage" },
): LowerThirdBarDimensions {
  const compact = options?.compact;
  const compactVariant = options?.compactVariant;
  const scale = compact ? (compactVariant === "stage" ? 0.55 : 0.45) : 1;
  const vhScale = compact ? (compactVariant === "stage" ? 0.38 : 0.28) : 1;

  if (lt.barHeightPercent > 0) {
    const vh = lt.barHeightPercent * vhScale;
    const heightCss = `${vh}vh`;
    return {
      heightCss,
      boxStyle: {
        height: heightCss,
        minHeight: heightCss,
        maxHeight: heightCss,
        overflow: "hidden",
      },
    };
  }

  const heightPx = compact
    ? Math.max(Math.round(lt.barHeight * scale), 48)
    : Math.max(lt.barHeight, STANDARD_LOWER_THIRD_BAR_HEIGHT * 0.35);
  return {
    heightCss: heightPx,
    boxStyle: {
      height: heightPx,
      minHeight: heightPx,
      maxHeight: heightPx,
      overflow: "hidden",
    },
  };
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
      barHeight: 112,
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
      barHeight: 112,
      barOpacity: 0.82,
      backdropBlur: true,
      referencePlacement: "inline",
      animation: "fade",
    },
  },
  {
    id: "stream_bar",
    label: "Stream Bar",
    description: "Transparent canvas with styled lower-third bar for OBS, NDI, or video underlay",
    overrides: {
      ...STREAM_OVERLAY_LOWER_THIRD,
      template: "glass",
      horizontalAlign: "center",
      widthPercent: 88,
      bottomOffsetPercent: 5,
      safeMarginPercent: 5.5,
      barHeight: 112,
      barOpacity: 0.88,
      backdropBlur: true,
      referencePlacement: "below",
      animation: "slide-up",
    },
  },
  {
    id: "obs_chroma",
    label: "Text Only Overlay",
    description: "Fully transparent canvas — outlined text only, no bar background",
    overrides: {
      ...STREAM_TEXT_ONLY_LOWER_THIRD,
      template: "minimal",
      horizontalAlign: "center",
      widthPercent: 85,
      bottomOffsetPercent: 5,
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
      barHeight: 112,
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

/** Count non-empty logical lines (lyric / verse lines split on newline). */
export function countTextLines(text: string): number {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  return Math.max(lines.length, 1);
}

/** Keep only the first N logical lines — used so lyrics stay inside the bar. */
export function clipTextToMaxLines(text: string, maxLines: number): string {
  if (maxLines <= 0 || !text.trim()) return text;
  const lines = text.split("\n");
  if (lines.length <= maxLines) return text;
  return lines.slice(0, maxLines).join("\n");
}

export interface LowerThirdLineCapacityOptions {
  compact?: boolean;
  compactVariant?: "panel" | "workspace" | "stage";
  minFontSize?: number;
  lineHeight?: number;
  /** Extra lines reserved for reference above/below the body. */
  referenceLines?: number;
  /** When true, estimate using the compact staging preview height. */
  previewHeightPx?: number;
}

/** How many lyric/scripture lines fit in the bar at minimum font size. */
export function estimateLowerThirdMaxLines(
  lt: LowerThirdStyle,
  barBox: LowerThirdBarDimensions,
  options: LowerThirdLineCapacityOptions = {},
): number {
  const minFont = options.minFontSize ?? 14;
  const lineHeight = options.lineHeight ?? (lt.template === "worship" ? 1.65 : 1.45);
  const compact = options.compact;

  let heightPx: number;
  if (typeof barBox.heightCss === "number") {
    heightPx = barBox.heightCss;
  } else if (typeof barBox.heightCss === "string" && barBox.heightCss.endsWith("vh")) {
    const vh = parseFloat(barBox.heightCss);
    const baseHeight = options.previewHeightPx ?? (compact ? 200 : 1080);
    heightPx = baseHeight * (vh / 100);
  } else {
    heightPx = lt.barHeight;
  }

  const padY = compact ? lt.paddingY * 0.5 * 2 : lt.paddingY * 2;
  const borderPx = compact ? Math.max(lt.accentWidth * 0.5, 2) : lt.accentWidth;
  const accentReserve =
    lt.showAccent && lt.template !== "line-only" && (lt.accentPosition === "top" || lt.accentPosition === "bottom")
      ? borderPx
      : 0;
  const worshipBorder = lt.template === "worship" && (lt.showAccent || lt.showBottomAccent) ? borderPx * 2 : 0;
  const refReserve = (options.referenceLines ?? 0) * (compact ? 14 : 22);

  const available = heightPx - padY - accentReserve - worshipBorder - refReserve;
  const linePx = minFont * lineHeight;
  const fitLines = Math.max(1, Math.floor(available / linePx));

  if (lt.maxLines > 0) return Math.min(lt.maxLines, fitLines);
  return fitLines;
}

/** Content column width and horizontal alignment within the bar. */
export function lowerThirdContentLayout(lt: LowerThirdStyle): {
  style: CSSProperties;
  className: string;
} {
  const widthPct = lt.contentWidthPercent > 0 ? lt.contentWidthPercent : LOWER_THIRD_CONTENT_WIDTH_PERCENT;
  const alignClass =
    lt.horizontalAlign === "left"
      ? "mr-auto"
      : lt.horizontalAlign === "right"
        ? "ml-auto"
        : "mx-auto";

  return {
    style: {
      width: `${widthPct}%`,
      maxWidth: `${widthPct}%`,
      minWidth: 0,
    },
    className: alignClass,
  };
}
