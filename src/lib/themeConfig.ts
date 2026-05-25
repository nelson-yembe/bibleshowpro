import type { CSSProperties } from "react";

import { DEFAULT_VECTOR_DESIGN, mergeVectorDesign, type VectorDesign } from "@/lib/vectorDesign";

/** Extended presentation theme — stored as JSON in themes.config_json */

export type BackgroundType = "solid" | "gradient" | "image" | "video";
export type ReferenceStyle = "normal" | "caps" | "smallcaps";
export type TextAlign = "left" | "center" | "right";
export type VerticalAlign = "top" | "center" | "bottom";

export interface ThemeGradient {
  from: string;
  to: string;
  angle: number;
}

export type LowerThirdTemplate = "classic" | "minimal" | "broadcast" | "glass" | "line-only" | "worship";
export type LowerThirdHAlign = "left" | "center" | "right";
export type LowerThirdReferencePlacement = "inline" | "above" | "below" | "badge";
export type LowerThirdAnimation = "none" | "slide-up" | "fade";
export type LowerThirdDualStack = "vertical" | "horizontal";

export interface LowerThirdStyle {
  enabled: boolean;
  barColor: string;
  barHeight: number;
  textSize: number;
  template: LowerThirdTemplate;
  horizontalAlign: LowerThirdHAlign;
  widthPercent: number;
  bottomOffsetPercent: number;
  barOpacity: number;
  /** Transparent bar on program output (chroma/OBS overlay). */
  transparentOutput: boolean;
  showAccent: boolean;
  accentPosition: "top" | "left" | "bottom";
  accentWidth: number;
  referencePlacement: LowerThirdReferencePlacement;
  animation: LowerThirdAnimation;
  safeMarginPercent: number;
  paddingX: number;
  paddingY: number;
  backdropBlur: boolean;
  textOutline: boolean;
  maxLines: number;
  dualStack: LowerThirdDualStack;
  /** Viewport height % (e.g. 28 = bottom 28%). When 0, uses barHeight px. */
  barHeightPercent: number;
  barGradient: ThemeGradient;
  accentGoldColor: string;
  showBottomAccent: boolean;
  showDecorations: boolean;
  /** Override theme font for lower-third text (empty = theme font). */
  fontFamily: string;
  fontWeight: number;
  textShadow: boolean;
}

export interface ThemeConfig {
  backgroundColor: string;
  textColor: string;
  fontFamily: string;
  fontSize: number;
  referenceColor: string;
  referencePosition: "header" | "footer";
  showVerseNumbers: boolean;
  padding: number;
  backgroundImage?: string;
  backgroundVideo?: string;
  backgroundType: BackgroundType;
  backgroundGradient: ThemeGradient;
  backgroundOverlay: number;
  textAlign: TextAlign;
  verticalAlign: VerticalAlign;
  lineHeight: number;
  letterSpacing: number;
  fontWeight: number;
  referenceStyle: ReferenceStyle;
  referenceFontSize: number;
  textShadow: boolean;
  shadowColor: string;
  accentColor: string;
  maxContentWidth: number;
  lowerThird: LowerThirdStyle;
  autoFit: boolean;
  showReference: boolean;
  showVersion: boolean;
  vectorDesign: VectorDesign;
}

export type { VectorDesign };

export const DEFAULT_THEME: ThemeConfig = {
  backgroundColor: "#0f172a",
  textColor: "#f8fafc",
  fontFamily: "Georgia, serif",
  fontSize: 48,
  referenceColor: "#94a3b8",
  referencePosition: "footer",
  showVerseNumbers: true,
  padding: 64,
  backgroundType: "solid",
  backgroundGradient: { from: "#0f172a", to: "#1e293b", angle: 160 },
  backgroundOverlay: 0.45,
  textAlign: "center",
  verticalAlign: "center",
  lineHeight: 1.45,
  letterSpacing: 0,
  fontWeight: 400,
  referenceStyle: "caps",
  referenceFontSize: 14,
  textShadow: false,
  shadowColor: "rgba(0,0,0,0.6)",
  accentColor: "#2563eb",
  maxContentWidth: 85,
  lowerThird: {
    enabled: true,
    barColor: "rgba(15,23,42,0.92)",
    barHeight: 28,
    textSize: 22,
    template: "worship",
    horizontalAlign: "center",
    widthPercent: 100,
    bottomOffsetPercent: 0,
    barOpacity: 1,
    transparentOutput: false,
    showAccent: true,
    accentPosition: "top",
    accentWidth: 5,
    referencePlacement: "below",
    animation: "slide-up",
    safeMarginPercent: 0,
    paddingX: 40,
    paddingY: 20,
    backdropBlur: false,
    textOutline: false,
    maxLines: 4,
    dualStack: "vertical",
    barHeightPercent: 28,
    barGradient: { from: "#4a2080", to: "#0a7070", angle: 90 },
    accentGoldColor: "#e5c76b",
    showBottomAccent: true,
    showDecorations: false,
    fontFamily: "'Segoe UI', system-ui, sans-serif",
    fontWeight: 700,
    textShadow: true,
  },
  autoFit: true,
  showReference: true,
  showVersion: true,
  vectorDesign: { ...DEFAULT_VECTOR_DESIGN, elements: [] },
};

export const FONT_OPTIONS = [
  { label: "Georgia (Serif)", value: "Georgia, serif" },
  { label: "Segoe UI", value: "'Segoe UI', system-ui, sans-serif" },
  { label: "Inter", value: "Inter, system-ui, sans-serif" },
  { label: "Merriweather", value: "'Merriweather', Georgia, serif" },
  { label: "Playfair Display", value: "'Playfair Display', Georgia, serif" },
  { label: "Helvetica Neue", value: "'Helvetica Neue', Arial, sans-serif" },
];

export function mergeThemeConfig(partial?: Partial<ThemeConfig> | null): ThemeConfig {
  if (!partial) return { ...DEFAULT_THEME };
  return {
    ...DEFAULT_THEME,
    ...partial,
    backgroundGradient: { ...DEFAULT_THEME.backgroundGradient, ...partial.backgroundGradient },
    lowerThird: {
      ...DEFAULT_THEME.lowerThird,
      ...partial.lowerThird,
      barGradient: {
        ...DEFAULT_THEME.lowerThird.barGradient,
        ...partial.lowerThird?.barGradient,
      },
    },
    vectorDesign: mergeVectorDesign({ ...DEFAULT_THEME.vectorDesign, ...partial.vectorDesign }),
  };
}

export function parseThemeJson(json: string): ThemeConfig {
  try {
    return mergeThemeConfig(JSON.parse(json) as Partial<ThemeConfig>);
  } catch {
    return { ...DEFAULT_THEME };
  }
}

export function formatReference(text: string, style: ReferenceStyle): string {
  if (style === "caps") return text.toUpperCase();
  if (style === "smallcaps") return text.replace(/\b\w/g, (c) => c.toUpperCase());
  return text;
}

export function themeBackgroundStyle(theme: ThemeConfig): CSSProperties {
  const base: CSSProperties = {
    backgroundColor: theme.backgroundColor,
    backgroundSize: "cover",
    backgroundPosition: "center",
  };

  switch (theme.backgroundType) {
    case "gradient":
      return {
        ...base,
        backgroundImage: `linear-gradient(${theme.backgroundGradient.angle}deg, ${theme.backgroundGradient.from}, ${theme.backgroundGradient.to})`,
      };
    case "image":
      return theme.backgroundImage
        ? { ...base, backgroundImage: `url(${theme.backgroundImage})` }
        : base;
    case "video":
      return base;
    default:
      return base;
  }
}

export function themeToDisplayDefaults(theme: ThemeConfig) {
  return {
    fontSize: theme.fontSize,
    textAlign: theme.textAlign,
    showVerseNumbers: theme.showVerseNumbers,
    showReference: theme.showReference,
    showVersion: theme.showVersion,
    autoFit: true,
    emphasis: "none" as const,
    highlightPhrase: "",
    verseStart: "16",
    verseEnd: "16",
    backgroundPreset: "theme" as const,
  };
}
