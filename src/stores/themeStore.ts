import { create } from "zustand";
import { api, type ThemeRecord } from "@/lib/tauri";
import {
  DEFAULT_THEME,
  mergeThemeConfig,
  parseThemeJson,
  type ThemeConfig,
} from "@/lib/themeConfig";

interface ThemeState {
  themes: ThemeRecord[];
  activeTheme: ThemeConfig;
  activeThemeId?: string;
  /** Bumped whenever activeTheme is updated — drives cross-screen sync */
  themeRevision: number;
  loadThemes: () => Promise<void>;
  selectTheme: (id: string) => void;
  saveTheme: (name: string, config: ThemeConfig, id?: string, isDefault?: boolean) => Promise<void>;
  deleteTheme: (id: string) => Promise<void>;
  createTheme: (name: string, config?: Partial<ThemeConfig>) => Promise<void>;
  duplicateTheme: (id: string) => Promise<void>;
  setDefaultTheme: (id: string) => Promise<void>;
  applyThemeLive: (config: ThemeConfig) => void;
  exportThemeJson: (id: string) => string | null;
  importThemeFromJson: (json: string, name?: string) => Promise<void>;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  themes: [],
  activeTheme: DEFAULT_THEME,
  themeRevision: 0,

  loadThemes: async () => {
    const themes = await api.listThemes();
    const defaultTheme = themes.find((t) => t.is_default) ?? themes[0];
    const activeTheme = defaultTheme ? parseThemeJson(defaultTheme.config_json) : DEFAULT_THEME;
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
      activeTheme: parseThemeJson(theme.config_json),
      themeRevision: s.themeRevision + 1,
    }));
  },

  saveTheme: async (name, config, id, isDefault = false) => {
    const merged = mergeThemeConfig(config);
    const saved = await api.saveTheme({
      id,
      name,
      configJson: JSON.stringify(merged),
      isDefault: isDefault || !id,
    });
    const themes = await api.listThemes();
    set((s) => ({
      themes,
      activeThemeId: saved.id,
      activeTheme: merged,
      themeRevision: s.themeRevision + 1,
    }));
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
    const config = parseThemeJson(source.config_json);
    await get().saveTheme(`${source.name} (copy)`, config);
  },

  setDefaultTheme: async (id) => {
    const theme = get().themes.find((t) => t.id === id);
    if (!theme) return;
    const config = parseThemeJson(theme.config_json);
    await get().saveTheme(theme.name, config, id, true);
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
    return JSON.stringify(
      { name: theme.name, config: parseThemeJson(theme.config_json) },
      null,
      2,
    );
  },

  importThemeFromJson: async (json, name) => {
    const parsed = JSON.parse(json) as { name?: string; config?: Partial<ThemeConfig> } | Partial<ThemeConfig>;
    const config = "config" in parsed && parsed.config ? parsed.config : (parsed as Partial<ThemeConfig>);
    const themeName = ("name" in parsed && parsed.name) || name || "Imported theme";
    await get().createTheme(themeName, config);
  },
}));
