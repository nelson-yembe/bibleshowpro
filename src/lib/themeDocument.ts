/**
 * ThemeDocument — the v2 theme model.
 *
 * Stored as JSON in `themes.config_json`. It is a superset of the legacy
 * `ThemeConfig`: the `base` field holds the original style config (so existing
 * live rendering keeps working unchanged), while `canvases` adds per-output-mode
 * vector designs for the advanced studio. A v1 theme (bare `ThemeConfig`) is
 * transparently wrapped into a v2 document on load, so nothing breaks.
 */

import {
  DEFAULT_THEME,
  mergeThemeConfig,
  type ThemeConfig,
} from "@/lib/themeConfig";
import type { VectorElement } from "@/lib/vectorDesign";

export type OutputMode =
  | "projectorFullscreen"
  | "lowerThird"
  | "confidenceMonitor"
  | "announcement"
  | "scriptureSlide"
  | "lyricsSlide"
  | "speakerLowerThird"
  | "countdown";

export interface OutputModeDef {
  id: OutputMode;
  label: string;
  description: string;
  width: number;
  height: number;
  safeMargins: SafeMargins;
}

export interface SafeMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export type CanvasBackgroundType = "inherit" | "solid" | "gradient" | "image" | "video";

export interface CanvasBackground {
  /** "inherit" reuses the base theme background (keeps one source of truth). */
  type: CanvasBackgroundType;
  color: string;
  gradientFrom: string;
  gradientTo: string;
  gradientAngle: number;
  mediaPath?: string;
  /** 0..1 darkening overlay over media. */
  overlay: number;
  /** Force transparent output (e.g. for keying lower thirds). */
  transparent: boolean;
}

export interface ThemeCanvas {
  id: string;
  outputMode: OutputMode;
  width: number;
  height: number;
  background: CanvasBackground;
  safeMargins: SafeMargins;
  layers: VectorElement[];
  /** When false, this output mode falls back to the base theme rendering. */
  enabled: boolean;
}

export interface ThemeMeta {
  description: string;
  tags: string[];
  version: number;
  isFavorite: boolean;
  createdBy: string;
  updatedAt: string;
}

export interface ThemeDocument {
  schemaVersion: 2;
  meta: ThemeMeta;
  /** Legacy style config — still the source of truth for the live renderer. */
  base: ThemeConfig;
  canvases: ThemeCanvas[];
}

const STANDARD_SAFE: SafeMargins = { top: 5, right: 5, bottom: 5, left: 5 };
const LOWER_THIRD_SAFE: SafeMargins = { top: 66, right: 5, bottom: 8, left: 5 };

export const OUTPUT_MODES: OutputModeDef[] = [
  {
    id: "projectorFullscreen",
    label: "Main projector",
    description: "Fullscreen 16:9 program output",
    width: 1920,
    height: 1080,
    safeMargins: STANDARD_SAFE,
  },
  {
    id: "lowerThird",
    label: "Livestream lower third",
    description: "Keyable lower-third band for streaming",
    width: 1920,
    height: 1080,
    safeMargins: LOWER_THIRD_SAFE,
  },
  {
    id: "confidenceMonitor",
    label: "Confidence monitor",
    description: "Stage / speaker confidence display",
    width: 1920,
    height: 1080,
    safeMargins: STANDARD_SAFE,
  },
  {
    id: "announcement",
    label: "Announcement",
    description: "Announcement / info slide",
    width: 1920,
    height: 1080,
    safeMargins: STANDARD_SAFE,
  },
  {
    id: "scriptureSlide",
    label: "Scripture slide",
    description: "Fullscreen scripture layout",
    width: 1920,
    height: 1080,
    safeMargins: STANDARD_SAFE,
  },
  {
    id: "lyricsSlide",
    label: "Lyrics slide",
    description: "Fullscreen song lyrics layout",
    width: 1920,
    height: 1080,
    safeMargins: STANDARD_SAFE,
  },
  {
    id: "speakerLowerThird",
    label: "Speaker lower third",
    description: "Name / title lower third for speakers",
    width: 1920,
    height: 1080,
    safeMargins: LOWER_THIRD_SAFE,
  },
  {
    id: "countdown",
    label: "Countdown screen",
    description: "Pre-service countdown timer",
    width: 1920,
    height: 1080,
    safeMargins: STANDARD_SAFE,
  },
];

export function outputModeDef(mode: OutputMode): OutputModeDef {
  return OUTPUT_MODES.find((m) => m.id === mode) ?? OUTPUT_MODES[0];
}

function newId(prefix: string): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${rand}`;
}

export function defaultCanvasBackground(): CanvasBackground {
  return {
    type: "inherit",
    color: DEFAULT_THEME.backgroundColor,
    gradientFrom: DEFAULT_THEME.backgroundGradient.from,
    gradientTo: DEFAULT_THEME.backgroundGradient.to,
    gradientAngle: DEFAULT_THEME.backgroundGradient.angle,
    overlay: 0,
    transparent: false,
  };
}

export function createDefaultCanvas(mode: OutputMode): ThemeCanvas {
  const def = outputModeDef(mode);
  const isLowerThird = mode === "lowerThird" || mode === "speakerLowerThird";
  return {
    id: newId("canvas"),
    outputMode: mode,
    width: def.width,
    height: def.height,
    background: {
      ...defaultCanvasBackground(),
      transparent: isLowerThird,
    },
    safeMargins: { ...def.safeMargins },
    layers: [],
    enabled: false,
  };
}

function mergeMeta(partial?: Partial<ThemeMeta> | null): ThemeMeta {
  return {
    description: partial?.description ?? "",
    tags: Array.isArray(partial?.tags) ? partial!.tags : [],
    version: typeof partial?.version === "number" ? partial!.version : 1,
    isFavorite: Boolean(partial?.isFavorite),
    createdBy: partial?.createdBy ?? "",
    updatedAt: partial?.updatedAt ?? new Date().toISOString(),
  };
}

function mergeSafeMargins(fallback: SafeMargins, partial?: Partial<SafeMargins> | null): SafeMargins {
  return {
    top: partial?.top ?? fallback.top,
    right: partial?.right ?? fallback.right,
    bottom: partial?.bottom ?? fallback.bottom,
    left: partial?.left ?? fallback.left,
  };
}

function mergeBackground(partial?: Partial<CanvasBackground> | null): CanvasBackground {
  const base = defaultCanvasBackground();
  if (!partial) return base;
  return {
    type: partial.type ?? base.type,
    color: partial.color ?? base.color,
    gradientFrom: partial.gradientFrom ?? base.gradientFrom,
    gradientTo: partial.gradientTo ?? base.gradientTo,
    gradientAngle: partial.gradientAngle ?? base.gradientAngle,
    mediaPath: partial.mediaPath,
    overlay: typeof partial.overlay === "number" ? partial.overlay : base.overlay,
    transparent: Boolean(partial.transparent),
  };
}

function mergeCanvas(mode: OutputMode, partial?: Partial<ThemeCanvas> | null): ThemeCanvas {
  const base = createDefaultCanvas(mode);
  if (!partial) return base;
  return {
    id: partial.id ?? base.id,
    outputMode: mode,
    width: partial.width ?? base.width,
    height: partial.height ?? base.height,
    background: mergeBackground(partial.background),
    safeMargins: mergeSafeMargins(base.safeMargins, partial.safeMargins),
    layers: Array.isArray(partial.layers) ? partial.layers : [],
    enabled: Boolean(partial.enabled),
  };
}

/** Ensure a document has exactly one canvas per output mode (in order). */
function normalizeCanvases(canvases?: ThemeCanvas[] | null): ThemeCanvas[] {
  const byMode = new Map<OutputMode, ThemeCanvas>();
  for (const c of canvases ?? []) {
    if (c && OUTPUT_MODES.some((m) => m.id === c.outputMode)) {
      byMode.set(c.outputMode, mergeCanvas(c.outputMode, c));
    }
  }
  return OUTPUT_MODES.map((m) => byMode.get(m.id) ?? createDefaultCanvas(m.id));
}

export function createThemeDocument(
  base?: Partial<ThemeConfig> | null,
  meta?: Partial<ThemeMeta> | null,
): ThemeDocument {
  return {
    schemaVersion: 2,
    meta: mergeMeta(meta),
    base: mergeThemeConfig(base),
    canvases: normalizeCanvases(),
  };
}

export function isThemeDocument(value: unknown): value is ThemeDocument {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { schemaVersion?: number }).schemaVersion === 2 &&
    "base" in value
  );
}

export function mergeThemeDocument(partial?: Partial<ThemeDocument> | null): ThemeDocument {
  if (!partial) return createThemeDocument();
  return {
    schemaVersion: 2,
    meta: mergeMeta(partial.meta),
    base: mergeThemeConfig(partial.base),
    canvases: normalizeCanvases(partial.canvases),
  };
}

/** Wrap a legacy v1 ThemeConfig into a v2 document. */
export function documentFromThemeConfig(
  config: Partial<ThemeConfig> | null,
  meta?: Partial<ThemeMeta> | null,
): ThemeDocument {
  return createThemeDocument(config, meta);
}

/**
 * Parse `themes.config_json` into a ThemeDocument, transparently migrating
 * legacy v1 configs. Never throws.
 */
export function parseThemeDocument(json: string): ThemeDocument {
  try {
    const parsed = JSON.parse(json) as unknown;
    if (isThemeDocument(parsed)) return mergeThemeDocument(parsed);
    // Legacy: the blob is a bare ThemeConfig.
    return documentFromThemeConfig(parsed as Partial<ThemeConfig>);
  } catch {
    return createThemeDocument();
  }
}

/** Serialize a document for storage. */
export function serializeThemeDocument(doc: ThemeDocument): string {
  return JSON.stringify({ ...doc, meta: { ...doc.meta, updatedAt: new Date().toISOString() } });
}

/** Back-compat accessor: the style config the live renderer consumes today. */
export function themeDocumentBase(doc: ThemeDocument): ThemeConfig {
  return doc.base;
}

export function canvasForOutputMode(doc: ThemeDocument, mode: OutputMode): ThemeCanvas {
  return doc.canvases.find((c) => c.outputMode === mode) ?? createDefaultCanvas(mode);
}

export function updateCanvas(
  doc: ThemeDocument,
  mode: OutputMode,
  patch: Partial<ThemeCanvas>,
): ThemeDocument {
  return {
    ...doc,
    canvases: doc.canvases.map((c) =>
      c.outputMode === mode ? mergeCanvas(mode, { ...c, ...patch }) : c,
    ),
  };
}
