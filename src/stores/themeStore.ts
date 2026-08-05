import { create } from "zustand";
import {
  api,
  type ThemeRecord,
  type ThemeVersionRecord,
  type ThemeAssetRecord,
} from "@/lib/tauri";
import {
  DEFAULT_THEME,
  mergeThemeConfig,
  type ThemeConfig,
} from "@/lib/themeConfig";
import {
  createThemeDocument,
  mergeThemeDocument,
  parseThemeDocument,
  serializeThemeDocument,
  type ThemeDocument,
} from "@/lib/themeDocument";

/** Extract the live-render style config from a stored theme blob (v1 or v2). */
function baseFromJson(json: string): ThemeConfig {
  return parseThemeDocument(json).base;
}

/**
 * Build the document to persist for a config-only save. When editing an
 * existing theme we preserve its canvases/meta and only replace `base`.
 */
function documentForConfigSave(
  existing: ThemeRecord | undefined,
  config: ThemeConfig,
): ThemeDocument {
  if (existing) {
    const doc = parseThemeDocument(existing.config_json);
    return { ...doc, base: mergeThemeConfig(config) };
  }
  return createThemeDocument(config);
}

interface ThemeState {
  themes: ThemeRecord[];
  activeTheme: ThemeConfig;
  activeThemeId?: string;
  /** Bumped whenever activeTheme is updated — drives cross-screen sync */
  themeRevision: number;
  loadThemes: () => Promise<void>;
  selectTheme: (id: string) => void;
  saveTheme: (name: string, config: ThemeConfig, id?: string, isDefault?: boolean) => Promise<void>;
  /** Save the full multi-canvas document (used by the theme studio). */
  saveThemeDocument: (
    name: string,
    doc: ThemeDocument,
    id?: string,
    isDefault?: boolean,
  ) => Promise<string>;
  deleteTheme: (id: string) => Promise<void>;
  createTheme: (name: string, config?: Partial<ThemeConfig>) => Promise<void>;
  duplicateTheme: (id: string) => Promise<void>;
  setDefaultTheme: (id: string) => Promise<void>;
  applyThemeLive: (config: ThemeConfig) => void;
  exportThemeJson: (id: string) => string | null;
  importThemeFromJson: (json: string, name?: string) => Promise<void>;
  toggleFavorite: (id: string) => Promise<void>;
  listVersions: (id: string) => Promise<ThemeVersionRecord[]>;
  restoreVersion: (id: string, versionNumber: number) => Promise<void>;
  listAssets: (id: string) => Promise<ThemeAssetRecord[]>;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  themes: [],
  activeTheme: DEFAULT_THEME,
  themeRevision: 0,

  loadThemes: async () => {
    const themes = await api.listThemes();
    const defaultTheme = themes.find((t) => t.is_default) ?? themes[0];
    const activeTheme = defaultTheme ? baseFromJson(defaultTheme.config_json) : DEFAULT_THEME;
    set((s) => ({
      themes,
      activeThemeId: defaultTheme?.id,
      activeTheme,
      themeRevision: s.themeRevision + 1,
    }));
  },

  selectTheme: (id) => {
    const theme = get().themes.find((t) => t.id === id);
    if (!theme) return;
    set((s) => ({
      activeThemeId: id,
      activeTheme: baseFromJson(theme.config_json),
      themeRevision: s.themeRevision + 1,
    }));
  },

  saveTheme: async (name, config, id, isDefault = false) => {
    const merged = mergeThemeConfig(config);
    const existing = id ? get().themes.find((t) => t.id === id) : undefined;
    const doc = documentForConfigSave(existing, merged);
    const saved = await api.saveTheme({
      id,
      name,
      configJson: serializeThemeDocument(doc),
      isDefault: isDefault || !id,
    });
    const themes = await api.listThemes();
    set((s) => ({
      themes,
      activeThemeId: saved.id,
      activeTheme: doc.base,
      themeRevision: s.themeRevision + 1,
    }));
  },

  saveThemeDocument: async (name, doc, id, isDefault = false) => {
    const normalized = mergeThemeDocument(doc);
    const saved = await api.saveTheme({
      id,
      name,
      configJson: serializeThemeDocument(normalized),
      isDefault: isDefault || !id,
    });
    const themes = await api.listThemes();
    set((s) => ({
      themes,
      activeThemeId: saved.id,
      activeTheme: normalized.base,
      themeRevision: s.themeRevision + 1,
    }));
    return saved.id;
  },

  deleteTheme: async (id) => {
    await api.deleteTheme(id);
    await get().loadThemes();
  },

  createTheme: async (name, config) => {
    const merged = mergeThemeConfig(config);
    await get().saveTheme(name, merged);
  },

  duplicateTheme: async (id) => {
    const source = get().themes.find((t) => t.id === id);
    if (!source) return;
    // Preserve the full document (all canvases + meta), not just the base config.
    const doc = parseThemeDocument(source.config_json);
    await get().saveThemeDocument(`${source.name} (copy)`, doc);
  },

  setDefaultTheme: async (id) => {
    const theme = get().themes.find((t) => t.id === id);
    if (!theme) return;
    const doc = parseThemeDocument(theme.config_json);
    await get().saveThemeDocument(theme.name, doc, id, true);
  },

  applyThemeLive: (config) => {
    set((s) => ({
      activeTheme: mergeThemeConfig(config),
      themeRevision: s.themeRevision + 1,
    }));
  },

  exportThemeJson: (id) => {
    const theme = get().themes.find((t) => t.id === id);
    if (!theme) return null;
    const document = parseThemeDocument(theme.config_json);
    return JSON.stringify({ name: theme.name, document }, null, 2);
  },

  importThemeFromJson: async (json, name) => {
    const parsed = JSON.parse(json) as
      | { name?: string; document?: Partial<ThemeDocument>; config?: Partial<ThemeConfig> }
      | Partial<ThemeConfig>;

    let doc: ThemeDocument;
    if (typeof parsed === "object" && parsed !== null && "document" in parsed && parsed.document) {
      doc = mergeThemeDocument(parsed.document);
    } else if (typeof parsed === "object" && parsed !== null && "config" in parsed && parsed.config) {
      doc = createThemeDocument(parsed.config);
    } else {
      // Bare config or full document blob.
      doc = parseThemeDocument(json);
    }

    const themeName =
      (typeof parsed === "object" && parsed !== null && "name" in parsed && parsed.name) ||
      name ||
      "Imported theme";
    await get().saveThemeDocument(themeName, doc);
  },

  toggleFavorite: async (id) => {
    const theme = get().themes.find((t) => t.id === id);
    if (!theme) return;
    await api.saveTheme({
      id,
      name: theme.name,
      configJson: theme.config_json,
      isDefault: theme.is_default,
      isFavorite: !theme.is_favorite,
    });
    await get().loadThemes();
  },

  listVersions: async (id) => api.listThemeVersions(id),

  restoreVersion: async (id, versionNumber) => {
    await api.restoreThemeVersion(id, versionNumber);
    await get().loadThemes();
    get().selectTheme(id);
  },

  listAssets: async (id) => api.listThemeAssets(id),
}));
