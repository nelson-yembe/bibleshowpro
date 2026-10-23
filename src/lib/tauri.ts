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

/** What an XML or USFM Bible file holds, read before anything is imported. */
export interface OpenBiblePreview {
  format: string;
  name: string;
  abbreviation: string;
  language: string;
  copyright: string | null;
  bookCount: number;
  verseCount: number;
  warnings: string[];
}

/** A scripture reference written in the preacher's notes. */
export interface NotesReference {
  reference: string;
  bookNumber: number;
  chapter: number;
  verseStart: number | null;
  verseEnd: number | null;
  /** The line it was written on. */
  context: string;
}

/** A song the transcript sounds like (see `songs/heard.rs`). */
export interface HeardSong {
  songId: string;
  title: string;
  sectionId: string | null;
  sectionLabel: string | null;
  line: string;
  score: number;
}

/** The church-network server for phones. */
export interface RemoteStatus {
  running: boolean;
  port: number;
  /** One per network this PC is on, the church Wi-Fi or router first. */
  addresses: { url: string; adapter: string }[];
  pin: string | null;
  qrSvg: string | null;
}

/** Whether Windows Firewall lets phones on that network reach the app. */
export interface FirewallStatus {
  profile: string;
  allowed: boolean;
}

export interface OpenBibleMeta {
  name: string;
  abbreviation: string;
  language: string;
  copyright: string | null;
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
  description?: string;
  tags?: string;
  version?: number;
  is_favorite?: boolean;
  updated_at?: string;
}

export interface ThemeVersionRecord {
  id: string;
  theme_id: string;
  version_number: number;
  snapshot_json: string;
  created_at: string;
}

export interface ThemeAssetRecord {
  id: string;
  theme_id: string;
  asset_type: string;
  file_path: string;
  thumbnail_path?: string | null;
  metadata_json: string;
  created_at: string;
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
  previewBibleFiles: (files: string[], fileName?: string) =>
    tauriInvoke<OpenBiblePreview>("preview_bible_files", { files, fileName }),
  importBibleFiles: (files: string[], meta: OpenBibleMeta, setDefault?: boolean) =>
    tauriInvoke<BibleImportResult>("import_bible_files", { files, meta, setDefault }),
  readSermonNotes: (path: string) => tauriInvoke<NotesReference[]>("read_sermon_notes", { path }),
  findSermonReferences: (text: string) => tauriInvoke<NotesReference[]>("find_sermon_references", { text }),
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
  saveTheme: (args: {
    id?: string;
    name: string;
    configJson: string;
    isDefault?: boolean;
    description?: string;
    tags?: string;
    isFavorite?: boolean;
  }) =>
    tauriInvoke<ThemeRecord>("save_theme", {
      id: args.id,
      name: args.name,
      configJson: args.configJson,
      isDefault: args.isDefault,
      description: args.description,
      tags: args.tags,
      isFavorite: args.isFavorite,
    }),
  deleteTheme: (id: string) => tauriInvoke<void>("delete_theme", { id }),
  listThemeVersions: (themeId: string) =>
    tauriInvoke<ThemeVersionRecord[]>("list_theme_versions", { themeId }),
  restoreThemeVersion: (themeId: string, versionNumber: number) =>
    tauriInvoke<ThemeRecord>("restore_theme_version", { themeId, versionNumber }),
  listThemeAssets: (themeId: string) =>
    tauriInvoke<ThemeAssetRecord[]>("list_theme_assets", { themeId }),
  addThemeAsset: (args: {
    themeId: string;
    assetType: string;
    filePath: string;
    thumbnailPath?: string;
    metadataJson?: string;
  }) =>
    tauriInvoke<ThemeAssetRecord>("add_theme_asset", {
      themeId: args.themeId,
      assetType: args.assetType,
      filePath: args.filePath,
      thumbnailPath: args.thumbnailPath,
      metadataJson: args.metadataJson,
    }),
  deleteThemeAsset: (id: string) => tauriInvoke<void>("delete_theme_asset", { id }),
  listMedia: () => tauriInvoke<MediaRecord[]>("list_media"),
  addMedia: (name: string, filePath: string, mediaType: string) =>
    tauriInvoke<MediaRecord>("add_media", { name, filePath, mediaType }),
  importMediaFiles: (paths: string[]) => tauriInvoke<MediaRecord[]>("import_media_files", { paths }),
  readMediaDataUrl: (path: string) => tauriInvoke<string>("read_media_data_url", { path }),
  ensureVideoThumbnail: (id: string) => tauriInvoke<MediaRecord>("ensure_video_thumbnail", { id }),
  backfillVideoThumbnails: () => tauriInvoke<MediaRecord[]>("backfill_video_thumbnails"),
  saveMediaThumbnailJpeg: (id: string, jpegBase64: string) =>
    tauriInvoke<MediaRecord>("save_media_thumbnail_jpeg", { id, jpegBase64 }),
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
  setProjectorDisplay: (displayId: string | null) => tauriInvoke<void>("set_projector_display", { displayId }),
  openSideScreen: (displayId: string) => tauriInvoke<void>("open_side_screen", { displayId }),
  closeSideScreen: (displayId: string) => tauriInvoke<void>("close_side_screen", { displayId }),
  listSideScreens: () => tauriInvoke<string[]>("list_side_screens"),
  startRemoteServer: (port?: number) => tauriInvoke<RemoteStatus>("start_remote_server", { port }),
  stopRemoteServer: () => tauriInvoke<RemoteStatus>("stop_remote_server"),
  getRemoteStatus: () => tauriInvoke<RemoteStatus>("get_remote_status"),
  checkRemoteFirewall: () => tauriInvoke<FirewallStatus | null>("check_remote_firewall"),
  openFirewallSettings: () => tauriInvoke<void>("open_firewall_settings"),
  writePhoneQrSlide: () => tauriInvoke<string>("write_phone_qr_slide"),
  matchHeardSong: (heard: string) => tauriInvoke<HeardSong[]>("match_heard_song", { heard }),
  /** Verses of one chapter that `heard` reads from, in any installed translation. */
  matchPassageReading: (heard: string, bookNumber: number, chapter: number) =>
    tauriInvoke<{ verse: number; score: number; translationId: string }[]>("match_passage_reading", {
      heard,
      bookNumber,
      chapter,
    }),
  translateCaption: (text: string, source: string | null, target: string) =>
    tauriInvoke<string>("translate_caption", { text, source, target }),
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

  detectScriptureInText: (
    text: string,
    context?: import("@/lib/transcription/types").DetectionContext,
  ) =>
    tauriInvoke<import("@/lib/transcription/types").ParsedReferenceMatch[]>("detect_scripture_in_text", {
      text,
      context: context ?? null,
    }),
  listTranscriptionSessions: (limit?: number) =>
    tauriInvoke<import("@/lib/transcription/types").TranscriptionSessionSummary[]>(
      "list_transcription_sessions",
      { limit },
    ),
  getTranscriptionSession: (id: string) =>
    tauriInvoke<import("@/lib/transcription/types").TranscriptionSessionDetail>("get_transcription_session", { id }),
  saveTranscriptionSession: (input: Record<string, unknown>) =>
    tauriInvoke<string>("save_transcription_session", { input }),
  deleteTranscriptionSession: (id: string) =>
    tauriInvoke<void>("delete_transcription_session", { id }),
};
