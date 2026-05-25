import { invoke } from "@tauri-apps/api/core";

export async function tauriInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  return invoke<T>(command, args);
}

export interface TranslationInfo {
  id: string;
  name: string;
  abbreviation: string;
  language: string;
  is_default: boolean;
}

export interface CatalogEntryView {
  id: string;
  name: string;
  abbreviation: string;
  language: string;
  copyright: string;
  license: string;
  source_format: string;
  download_url?: string | null;
  size_bytes?: number | null;
  is_default: boolean;
  install_method: "download" | "import" | string;
  installed: boolean;
  verse_count: number;
}

export interface BibleImportResult {
  translation_id: string;
  abbreviation: string;
  verse_count: number;
  message: string;
}

export interface BibleSetupStatus {
  kjv_verse_count: number;
  needs_full_bible: boolean;
}

export interface BibleImportProgress {
  translation_id: string;
  phase: string;
  current: number;
  total: number;
  message: string;
}

export interface DisplayInfo {
  id: string;
  name: string;
  width: number;
  height: number;
  x: number;
  y: number;
  scale_factor: number;
  is_primary: boolean;
}

export interface OutputStatus {
  open: boolean;
  active_display: DisplayInfo | null;
  displays: DisplayInfo[];
}

export interface VerseResult {
  id: number;
  translation_id: string;
  translation_abbr: string;
  book_number: number;
  book_name: string;
  chapter: number;
  verse: number;
  text: string;
  reference: string;
}

export interface SearchResult {
  verses: VerseResult[];
  parsed_reference?: {
    book_number: number;
    book_name: string;
    chapter: number;
    verse_start?: number;
    verse_end?: number;
  };
  suggestions: string[];
}

export interface BibleSearchOptions {
  exactPhrase?: boolean;
  matchAllWords?: boolean;
}

export interface ServicePlanSummary {
  id: string;
  title: string;
  service_date?: string | null;
  is_template: boolean;
  updated_at: string;
  item_count: number;
}

export interface ServiceItem {
  id: string;
  service_plan_id: string;
  item_type: string;
  title: string;
  content_json: string;
  operator_notes?: string | null;
  sort_order: number;
}

export interface ServicePlanDetail {
  id: string;
  title: string;
  service_date?: string | null;
  notes?: string | null;
  theme_id?: string | null;
  is_template: boolean;
  items: ServiceItem[];
}

export interface ThemeRecord {
  id: string;
  name: string;
  config_json: string;
  is_default: boolean;
}

export interface MediaRecord {
  id: string;
  name: string;
  file_path: string;
  media_type: string;
  tags_json: string;
  thumbnail_path?: string | null;
  created_at: string;
  file_exists: boolean;
}

export type { ThemeConfig } from "@/lib/themeConfig";
export { DEFAULT_THEME, mergeThemeConfig, parseThemeJson } from "@/lib/themeConfig";

export const api = {
  initApp: () => tauriInvoke<{ initialized: boolean; translation_count: number }>("init_app"),
  getTranslations: () => tauriInvoke<TranslationInfo[]>("get_translations"),
  getBibleCatalog: () => tauriInvoke<CatalogEntryView[]>("get_bible_catalog"),
  getBibleSetupStatus: () => tauriInvoke<BibleSetupStatus>("get_bible_setup_status"),
  installCoreBiblePackages: () =>
    tauriInvoke<BibleImportResult[]>("install_core_bible_packages"),
  downloadBibleTranslation: (translationId: string) =>
    tauriInvoke<BibleImportResult>("download_bible_translation", { translationId }),
  importBibleJson: (json: string, setDefault?: boolean) =>
    tauriInvoke<BibleImportResult>("import_bible_json", { json, setDefault }),
  deleteBibleTranslation: (translationId: string) =>
    tauriInvoke<void>("delete_bible_translation", { translationId }),
  setDefaultBibleTranslation: (translationId: string) =>
    tauriInvoke<void>("set_default_bible_translation", { translationId }),
  searchBible: (query: string, translationId?: string, searchOptions?: BibleSearchOptions) =>
    tauriInvoke<SearchResult>("search_bible", { query, translationId, searchOptions }),
  lookupReference: (query: string, translationId?: string, searchOptions?: BibleSearchOptions) =>
    tauriInvoke<{ groups: VerseResult[][]; search: SearchResult }>("lookup_bible_reference", {
      query,
      translationId,
      searchOptions,
    }),
  listServicePlans: () => tauriInvoke<ServicePlanSummary[]>("list_service_plans"),
  getServicePlan: (id: string) => tauriInvoke<ServicePlanDetail>("get_service_plan", { id }),
  createServicePlan: (title: string, isTemplate?: boolean) =>
    tauriInvoke<ServicePlanDetail>("create_service_plan", { title, isTemplate }),
  updateServicePlan: (args: {
    id: string;
    title?: string;
    serviceDate?: string;
    notes?: string;
    themeId?: string;
  }) =>
    tauriInvoke<ServicePlanDetail>("update_service_plan", {
      id: args.id,
      title: args.title,
      serviceDate: args.serviceDate,
      notes: args.notes,
      themeId: args.themeId,
    }),
  deleteServicePlan: (id: string) => tauriInvoke<void>("delete_service_plan", { id }),
  duplicateServicePlan: (id: string) => tauriInvoke<ServicePlanDetail>("duplicate_service_plan", { id }),
  createServiceItem: (args: {
    planId: string;
    itemType: string;
    title: string;
    contentJson: string;
    operatorNotes?: string;
  }) =>
    tauriInvoke<ServiceItem>("create_service_item", {
      planId: args.planId,
      itemType: args.itemType,
      title: args.title,
      contentJson: args.contentJson,
      operatorNotes: args.operatorNotes,
    }),
  updateServiceItem: (args: {
    id: string;
    title?: string;
    contentJson?: string;
    operatorNotes?: string;
  }) =>
    tauriInvoke<ServiceItem>("update_service_item", {
      id: args.id,
      title: args.title,
      contentJson: args.contentJson,
      operatorNotes: args.operatorNotes,
    }),
  deleteServiceItem: (id: string) => tauriInvoke<void>("delete_service_item", { id }),
  reorderServiceItems: (planId: string, itemIds: string[]) =>
    tauriInvoke<void>("reorder_service_items", { planId, itemIds }),
  importScriptureList: (planId: string, text: string) =>
    tauriInvoke<ServiceItem[]>("import_scripture_list", { planId, text }),
  exportServicePlan: (id: string) => tauriInvoke<string>("export_service_plan", { id }),
  listThemes: () => tauriInvoke<ThemeRecord[]>("list_themes"),
  saveTheme: (args: { id?: string; name: string; configJson: string; isDefault?: boolean }) =>
    tauriInvoke<ThemeRecord>("save_theme", {
      id: args.id,
      name: args.name,
      configJson: args.configJson,
      isDefault: args.isDefault,
    }),
  deleteTheme: (id: string) => tauriInvoke<void>("delete_theme", { id }),
  listMedia: () => tauriInvoke<MediaRecord[]>("list_media"),
  addMedia: (name: string, filePath: string, mediaType: string) =>
    tauriInvoke<MediaRecord>("add_media", { name, filePath, mediaType }),
  importMediaFiles: (paths: string[]) => tauriInvoke<MediaRecord[]>("import_media_files", { paths }),
  updateMedia: (args: { id: string; name?: string; tagsJson?: string }) =>
    tauriInvoke<MediaRecord>("update_media", {
      id: args.id,
      name: args.name,
      tagsJson: args.tagsJson,
    }),
  deleteMedia: (id: string) => tauriInvoke<void>("delete_media", { id }),
  savePresentationState: (stateJson: string, planId?: string) =>
    tauriInvoke<string>("save_presentation_state", { stateJson, planId }),
  loadPresentationState: () => tauriInvoke<string | null>("load_presentation_state"),
  createBackup: () => tauriInvoke<string>("create_backup"),
  restoreBackup: (json: string) => tauriInvoke<void>("restore_backup", { json }),
  openOutputWindow: () => tauriInvoke<void>("open_output_window"),
  closeOutputWindow: () => tauriInvoke<void>("close_output_window"),
  refreshOutputWindow: () => tauriInvoke<void>("refresh_output_window"),
  listDisplays: () => tauriInvoke<DisplayInfo[]>("list_displays"),
  getOutputStatus: () => tauriInvoke<OutputStatus>("get_output_status"),
  pushProgramUpdate: (scene: unknown) =>
    tauriInvoke<void>("push_program_update", { scene }),
  getProgramOutput: () => tauriInvoke<unknown>("get_program_output"),
  setPresentationKeepAwake: (active: boolean) =>
    tauriInvoke<void>("set_presentation_keep_awake", { active }),

  getNdiConfig: () => tauriInvoke<import("@/lib/ndiConfig").NdiOutputConfig>("get_ndi_config"),
  saveNdiConfig: (config: import("@/lib/ndiConfig").NdiOutputConfig) =>
    tauriInvoke<import("@/lib/ndiConfig").NdiOutputConfig>("save_ndi_config", { config }),
  startNdiOutput: () => tauriInvoke<import("@/lib/ndiConfig").NdiRuntimeStatus>("start_ndi_output"),
  stopNdiOutput: () => tauriInvoke<import("@/lib/ndiConfig").NdiRuntimeStatus>("stop_ndi_output"),
  getNdiStatus: () => tauriInvoke<import("@/lib/ndiConfig").NdiRuntimeStatus>("get_ndi_status"),
  discoverNdiSources: (timeoutMs?: number) =>
    tauriInvoke<import("@/lib/ndiConfig").NdiDiscoveredSource[]>("discover_ndi_sources", {
      timeoutMs,
    }),
  pushNdiFrame: (feed: string, width: number, height: number, data: number[]) =>
    tauriInvoke<void>("push_ndi_frame", { feed, width, height, data }),
  pushPreviewUpdate: (scene: unknown) =>
    tauriInvoke<void>("push_preview_update", { scene }),

  listSongs: (filter?: string, query?: string) =>
    tauriInvoke<import("@/lib/songTypes").SongSummary[]>("list_songs", { filter, query }),
  getSong: (id: string) => tauriInvoke<import("@/lib/songTypes").SongDetail>("get_song", { id }),
  createSong: (input: Record<string, unknown>) =>
    tauriInvoke<import("@/lib/songTypes").SongDetail>("create_song", { input }),
  updateSong: (input: Record<string, unknown>) =>
    tauriInvoke<import("@/lib/songTypes").SongDetail>("update_song", { input }),
  deleteSong: (id: string) => tauriInvoke<void>("delete_song", { id }),
  duplicateSong: (id: string) => tauriInvoke<import("@/lib/songTypes").SongDetail>("duplicate_song", { id }),
  importSongLyrics: (title: string, artist: string | undefined, rawText: string, tagsJson?: string) =>
    tauriInvoke<{ song: import("@/lib/songTypes").SongDetail; duplicate_of?: string | null }>(
      "import_song_lyrics",
      { title, artist, rawText, tagsJson },
    ),
  markSongUsed: (id: string) => tauriInvoke<void>("mark_song_used", { id }),
  exportSongsLibrary: () => tauriInvoke<string>("export_songs_library"),
};
