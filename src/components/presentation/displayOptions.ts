import type { ThemeConfig } from "@/lib/themeConfig";
import { themeToDisplayDefaults } from "@/lib/themeConfig";
import type { LowerThirdOverrides } from "@/lib/lowerThird";
import { DEFAULT_HIGHLIGHT_COLOR } from "@/components/presentation/highlightStyle";

export interface DisplayOptions {
  fontSize: number;
  highlightPhrase: string;
  highlightColor: string;
  textAlign: "left" | "center" | "right";
  showVerseNumbers: boolean;
  showReference: boolean;
  showVersion: boolean;
  emphasis: "none" | "bold" | "glow";
  autoFit: boolean;
  verseStart: string;
  verseEnd: string;
  backgroundPreset: "theme" | "ridge-dark" | "hymnal" | "plain-black";
}

export const defaultDisplayOptions: DisplayOptions = {
  fontSize: 64,
  highlightPhrase: "",
  highlightColor: DEFAULT_HIGHLIGHT_COLOR,
  textAlign: "center",
  showVerseNumbers: true,
  showReference: true,
  showVersion: true,
  emphasis: "none",
  autoFit: true,
  verseStart: "16",
  verseEnd: "16",
  backgroundPreset: "theme",
};

export const backgroundPresets: Record<Exclude<DisplayOptions["backgroundPreset"], "theme">, { label: string; color: string }> = {
  "ridge-dark": { label: "Ridge — Dark", color: "#0a0a0a" },
  hymnal: { label: "Hymnal", color: "#1a1510" },
  "plain-black": { label: "Plain Black", color: "#000000" },
};

export function mergeDisplayWithTheme(
  theme: ThemeConfig,
  partial?: Partial<DisplayOptions>,
): DisplayOptions {
  const fromTheme = themeToDisplayDefaults(theme);
  return { ...defaultDisplayOptions, ...fromTheme, ...partial };
}

/** Verse/session overrides — theme-owned fields (fontSize, alignment, etc.) come from activeTheme */
export type LocalDisplayOverrides = Pick<
  DisplayOptions,
  "verseStart" | "verseEnd" | "highlightPhrase" | "highlightColor" | "emphasis" | "backgroundPreset"
> & {
  lowerThird?: LowerThirdOverrides;
  showLowerThirdSafeMargins?: boolean;
  lowerThirdChromaPreview?: boolean;
};

export const defaultLocalDisplayOverrides: LocalDisplayOverrides = {
  verseStart: defaultDisplayOptions.verseStart,
  verseEnd: defaultDisplayOptions.verseEnd,
  highlightPhrase: "",
  highlightColor: DEFAULT_HIGHLIGHT_COLOR,
  emphasis: defaultDisplayOptions.emphasis,
  backgroundPreset: defaultDisplayOptions.backgroundPreset,
  lowerThird: undefined,
  showLowerThirdSafeMargins: false,
  lowerThirdChromaPreview: true,
};

export function buildDisplayOptions(
  theme: ThemeConfig,
  local: LocalDisplayOverrides,
): DisplayOptions {
  return mergeDisplayWithTheme(theme, local);
}

export function splitDisplayPatch(patch: Partial<DisplayOptions>): {
  theme: Partial<ThemeConfig>;
  local: Partial<LocalDisplayOverrides>;
} {
  const theme: Partial<ThemeConfig> = {};
  const local: Partial<LocalDisplayOverrides> = {};

  for (const [key, value] of Object.entries(patch) as [keyof DisplayOptions, unknown][]) {
    if (value === undefined) continue;
    if (key === "fontSize") theme.fontSize = value as number;
    else if (key === "textAlign") theme.textAlign = value as ThemeConfig["textAlign"];
    else if (key === "showVerseNumbers") theme.showVerseNumbers = value as boolean;
    else if (key === "showReference") theme.showReference = value as boolean;
    else if (key === "showVersion") theme.showVersion = value as boolean;
    else if (key === "autoFit") theme.autoFit = value as boolean;
    else if (key === "verseStart") local.verseStart = value as string;
    else if (key === "verseEnd") local.verseEnd = value as string;
    else if (key === "highlightPhrase") local.highlightPhrase = value as string;
    else if (key === "highlightColor") local.highlightColor = value as string;
    else if (key === "emphasis") local.emphasis = value as DisplayOptions["emphasis"];
    else if (key === "backgroundPreset") local.backgroundPreset = value as LocalDisplayOverrides["backgroundPreset"];
  }

  return { theme, local };
}

export function applyDisplayOptionsToBody(body: string, options: DisplayOptions): string {
  if (!options.showVerseNumbers) {
    return body.replace(/^(\[\d+\]|\d+)\s+/gm, "");
  }
  return body.replace(/^(\d+)\s+/gm, "[$1] ");
}

export function splitHighlight(text: string, phrase: string): { before: string; match: string; after: string } | null {
  if (!phrase.trim()) return null;
  const idx = text.toLowerCase().indexOf(phrase.toLowerCase());
  if (idx === -1) return null;
  return {
    before: text.slice(0, idx),
    match: text.slice(idx, idx + phrase.length),
    after: text.slice(idx + phrase.length),
  };
}
