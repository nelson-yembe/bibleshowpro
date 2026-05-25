import type { ThemeConfig } from "@/lib/themeConfig";
import { DEFAULT_THEME, mergeThemeConfig } from "@/lib/themeConfig";

export interface ThemePreset {
  id: string;
  name: string;
  description: string;
  config: Partial<ThemeConfig>;
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: "ridge-dark",
    name: "Ridge Dark",
    description: "Deep navy stage — default pro look",
    config: {
      backgroundColor: "#0a0a0a",
      textColor: "#f4f6fb",
      backgroundType: "solid",
      fontFamily: "Georgia, serif",
      fontSize: 52,
      referenceColor: "#8b95a8",
      accentColor: "#2563eb",
    },
  },
  {
    id: "hymnal-warm",
    name: "Hymnal Warm",
    description: "Warm brown tones for traditional services",
    config: {
      backgroundColor: "#1a1510",
      textColor: "#f5ebe0",
      backgroundType: "gradient",
      backgroundGradient: { from: "#1a1510", to: "#2d2419", angle: 180 },
      fontFamily: "'Merriweather', Georgia, serif",
      fontSize: 48,
      referenceColor: "#c4a882",
      accentColor: "#d97706",
    },
  },
  {
    id: "light-worship",
    name: "Light Worship",
    description: "Bright, airy layout for well-lit rooms",
    config: {
      backgroundColor: "#f8fafc",
      textColor: "#0f172a",
      backgroundType: "solid",
      fontFamily: "'Segoe UI', system-ui, sans-serif",
      fontSize: 46,
      referenceColor: "#64748b",
      referenceStyle: "caps",
      accentColor: "#0ea5e9",
      textShadow: false,
    },
  },
  {
    id: "high-contrast",
    name: "High Contrast",
    description: "Maximum readability for large venues",
    config: {
      backgroundColor: "#000000",
      textColor: "#ffffff",
      backgroundType: "solid",
      fontFamily: "'Helvetica Neue', Arial, sans-serif",
      fontSize: 56,
      fontWeight: 700,
      referenceColor: "#fbbf24",
      referenceStyle: "caps",
      textShadow: true,
      shadowColor: "rgba(0,0,0,0.9)",
      lineHeight: 1.35,
    },
  },
  {
    id: "lower-third-blue",
    name: "Lower Third Pro",
    description: "Optimized for lower-third scripture overlays",
    config: {
      backgroundColor: "#000000",
      backgroundType: "solid",
      textColor: "#ffffff",
      fontSize: 36,
      verticalAlign: "bottom",
      textAlign: "left",
      padding: 48,
      lowerThird: {
        ...DEFAULT_THEME.lowerThird,
        enabled: true,
        barColor: "rgba(15,23,42,0.94)",
        barHeight: 32,
        textSize: 24,
      },
      accentColor: "#3b82f6",
    },
  },
  {
    id: "midnight-gradient",
    name: "Midnight Gradient",
    description: "Subtle gradient for modern worship",
    config: {
      backgroundType: "gradient",
      backgroundGradient: { from: "#0f172a", to: "#312e81", angle: 135 },
      backgroundColor: "#0f172a",
      textColor: "#e2e8f0",
      fontFamily: "Inter, system-ui, sans-serif",
      fontSize: 50,
      referenceColor: "#a5b4fc",
      accentColor: "#818cf8",
      textShadow: true,
    },
  },
];

export function presetToConfig(preset: ThemePreset): ThemeConfig {
  return mergeThemeConfig({ ...DEFAULT_THEME, ...preset.config });
}
