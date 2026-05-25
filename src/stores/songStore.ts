import { create } from "zustand";
import {
  copyrightLine,
  defaultSongTheme,
  parseSongTheme,
  buildSlidesFromSong,
  type LyricSlide,
  type SongDetail,
  type SongSection,
  type SongSummary,
  type SongThemeSettings,
} from "@/lib/songTypes";
import {
  previewSongSlide,
  takeSongSlideLive,
  buildSongProjectionTheme,
  serviceItemContentFromSong,
} from "@/lib/songLive";
import type { LowerThirdOverrides } from "@/lib/lowerThird";
import { api } from "@/lib/tauri";
import { useLiveNavigationStore } from "@/stores/liveNavigationStore";
import { useServiceStore } from "@/stores/serviceStore";
import { useThemeStore } from "@/stores/themeStore";

export type SongFilter = string;

interface SongState {
  songs: SongSummary[];
  activeSong: SongDetail | null;
  selectedId: string | null;
  slideIndex: number;
  filter: SongFilter;
  search: string;
  loading: boolean;
  saving: boolean;
  dirty: boolean;
  importWarning: string | null;
  linesPerSlide: number;
  lowerThirdOverrides?: LowerThirdOverrides;
  showLowerThirdSafeMargins: boolean;
  lowerThirdChromaPreview: boolean;
  loadSongs: () => Promise<void>;
  selectSong: (id: string) => Promise<void>;
  setSearch: (q: string) => void;
  setFilter: (f: SongFilter) => void;
  setSlideIndex: (index: number) => void;
  navigateToSlide: (index: number) => Promise<void>;
  nextSlide: () => Promise<void>;
  prevSlide: () => Promise<void>;
  jumpToSectionType: (type: string) => Promise<void>;
  jumpToSection: (sectionId: string) => Promise<void>;
  previewCurrent: () => Promise<void>;
  goLiveCurrent: () => Promise<void>;
  toggleFavorite: () => Promise<void>;
  importText: (title: string, artist: string, raw: string, tags?: string[]) => Promise<void>;
  importFile: (file: File) => Promise<void>;
  createBlank: (title?: string) => Promise<void>;
  saveSong: () => Promise<void>;
  deleteSong: () => Promise<void>;
  duplicateSong: () => Promise<void>;
  addToService: () => Promise<void>;
  exportLibrary: () => Promise<string>;
  updateDraft: (patch: Partial<SongDetail> & { sections?: SongSection[]; theme?: SongThemeSettings }) => void;
  reorderArrangement: (sectionIds: string[]) => void;
  setSectionLinesPerSlide: (sectionId: string, linesPerSlide: number) => void;
  setDefaultLinesPerSlide: (linesPerSlide: number) => void;
  addSection: (type?: string) => void;
  removeSection: (id: string) => void;
  markDirty: () => void;
  setProjectionMode: (mode: "fullscreen" | "lower_third") => void;
  setLowerThirdOverrides: (patch: Record<string, unknown>) => void;
  projectionTheme: () => import("@/lib/tauri").ThemeConfig;
  warnings: () => string[];
  effectiveSlides: () => LyricSlide[];
  currentSlide: () => LyricSlide | null;
  nextSlidePreview: () => LyricSlide | null;
}

let autosaveTimer: number | undefined;

function activeTheme() {
  return useThemeStore.getState().activeTheme;
}

function themeSettings(song: SongDetail | null): SongThemeSettings {
  return song ? parseSongTheme(song.theme_json) : defaultSongTheme();
}

function clampSlideIndex(index: number, slides: LyricSlide[]): number {
  if (slides.length === 0) return 0;
  return Math.max(0, Math.min(index, slides.length - 1));
}

function resolveSlides(song: SongDetail | null, linesPerSlide: number, dirty: boolean): LyricSlide[] {
  if (!song) return [];
  const computed = buildSlidesFromSong(song, linesPerSlide);
  if (computed.length > 0) return computed;
  if (!dirty && song.slides.length > 0) return song.slides;
  return computed;
}

export const useSongStore = create<SongState>((set, get) => ({
  songs: [],
  activeSong: null,
  selectedId: null,
  slideIndex: 0,
  filter: "all",
  search: "",
  loading: false,
  saving: false,
  dirty: false,
  importWarning: null,
  linesPerSlide: 4,
  lowerThirdOverrides: undefined,
  showLowerThirdSafeMargins: false,
  lowerThirdChromaPreview: true,

  loadSongs: async () => {
    set({ loading: true });
    try {
      const { filter, search } = get();
      const songs = await api.listSongs(filter === "all" ? undefined : filter, search || undefined);
      set({ songs });
    } finally {
      set({ loading: false });
    }
  },

  selectSong: async (id) => {
    const activeSong = await api.getSong(id);
    set({
      activeSong,
      selectedId: id,
      slideIndex: 0,
      dirty: false,
      importWarning: null,
      lowerThirdOverrides: undefined,
      showLowerThirdSafeMargins: false,
    });
    await get().previewCurrent();
  },

  setSearch: (search) => {
    set({ search });
    void get().loadSongs();
  },

  setFilter: (filter) => {
    set({ filter });
    void get().loadSongs();
  },

  setSlideIndex: (index) => {
    const slides = resolveSlides(get().activeSong, get().linesPerSlide, get().dirty);
    set({ slideIndex: clampSlideIndex(index, slides) });
    void get().previewCurrent();
  },

  navigateToSlide: async (index) => {
    const slides = resolveSlides(get().activeSong, get().linesPerSlide, get().dirty);
    const slideIndex = clampSlideIndex(index, slides);
    if (slides.length === 0) return;
    if (slideIndex === get().slideIndex) return;
    set({ slideIndex });
    await get().goLiveCurrent();
  },

  nextSlide: async () => {
    await get().navigateToSlide(get().slideIndex + 1);
  },

  prevSlide: async () => {
    await get().navigateToSlide(get().slideIndex - 1);
  },

  jumpToSectionType: async (type) => {
    const song = get().activeSong;
    if (!song) return;
    const slides = get().effectiveSlides();
    const order = song.arrangements.find((a) => a.is_default);
    const ids = order ? (JSON.parse(order.section_order_json) as string[]) : song.sections.map((s) => s.id);
    const targetSectionId = ids.find((id) => song.sections.find((s) => s.id === id && s.section_type === type));
    if (!targetSectionId) return;
    const index = slides.findIndex((slide) => slide.section_id === targetSectionId);
    if (index >= 0) await get().navigateToSlide(index);
  },

  jumpToSection: async (sectionId) => {
    const slides = get().effectiveSlides();
    const index = slides.findIndex((slide) => slide.section_id === sectionId);
    if (index >= 0) await get().navigateToSlide(index);
  },

  previewCurrent: async () => {
    const song = get().activeSong;
    const slide = get().currentSlide();
    if (!song || !slide) return;
    await previewSongSlide(
      slide,
      song,
      activeTheme(),
      themeSettings(song),
      get().lowerThirdOverrides,
    );
  },

  goLiveCurrent: async () => {
    const song = get().activeSong;
    const slide = get().currentSlide();
    if (!song || !slide) return;
    await takeSongSlideLive(
      slide,
      song,
      activeTheme(),
      themeSettings(song),
      get().lowerThirdOverrides,
    );
    void api.markSongUsed(song.id);
  },

  setProjectionMode: (mode) => {
    const song = get().activeSong;
    if (!song) return;
    const current = themeSettings(song);
    get().updateDraft({ theme: { ...current, mode } });
    void get().previewCurrent();
  },

  setLowerThirdOverrides: (patch) => {
    set((state) => {
      const next = {
        ...state,
        showLowerThirdSafeMargins:
          patch.showLowerThirdSafeMargins !== undefined
            ? (patch.showLowerThirdSafeMargins as boolean)
            : state.showLowerThirdSafeMargins,
        lowerThirdChromaPreview:
          patch.lowerThirdChromaPreview !== undefined
            ? (patch.lowerThirdChromaPreview as boolean)
            : state.lowerThirdChromaPreview,
      };
      const ltPatch = (patch.lowerThird as LowerThirdOverrides | undefined) ?? {};
      const directLt: LowerThirdOverrides = {};
      for (const [key, value] of Object.entries(patch)) {
        if (
          key !== "lowerThird" &&
          key !== "showLowerThirdSafeMargins" &&
          key !== "lowerThirdChromaPreview" &&
          value !== undefined
        ) {
          (directLt as Record<string, unknown>)[key] = value;
        }
      }
      const merged = { ...(state.lowerThirdOverrides ?? {}), ...ltPatch, ...directLt };
      if (Object.keys(merged).length > 0) {
        next.lowerThirdOverrides = merged;
      }
      return next;
    });
    void get().previewCurrent();
  },

  projectionTheme: () => {
    const song = get().activeSong;
    if (!song) return activeTheme();
    return buildSongProjectionTheme(activeTheme(), themeSettings(song), get().lowerThirdOverrides);
  },

  toggleFavorite: async () => {
    const song = get().activeSong;
    if (!song) return;
    const updated = await api.updateSong({ id: song.id, favorite: !song.favorite });
    set({ activeSong: updated, dirty: false });
    await get().loadSongs();
  },

  importText: async (title, artist, raw, tags = []) => {
    const result = await api.importSongLyrics(title, artist || undefined, raw, JSON.stringify(tags));
    set({
      importWarning: result.duplicate_of ? "A song with this title already exists — saved as new copy." : null,
    });
    await get().loadSongs();
    await get().selectSong(result.song.id);
  },

  importFile: async (file) => {
    const text = await file.text();
    const title = file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");
    await get().importText(title, "", text);
  },

  createBlank: async (title = "New Song") => {
    const song = await api.createSong({
      title,
      sections: [
        { section_type: "verse", label: "Verse 1", lyrics: "", sort_order: 0 },
        { section_type: "chorus", label: "Chorus", lyrics: "", sort_order: 1 },
      ],
      lines_per_slide: get().linesPerSlide,
    });
    await get().loadSongs();
    await get().selectSong(song.id);
  },

  saveSong: async () => {
    const song = get().activeSong;
    if (!song) return;
    set({ saving: true });
    try {
      const arrangement = song.arrangements.find((a) => a.is_default);
      const sectionOrder: string[] = arrangement
        ? (JSON.parse(arrangement.section_order_json) as string[])
        : song.sections.map((s) => s.id);

      const updated = await api.updateSong({
        id: song.id,
        title: song.title,
        artist: song.artist ?? undefined,
        default_key: song.default_key ?? undefined,
        bpm: song.bpm ?? undefined,
        tags_json: song.tags_json,
        favorite: song.favorite,
        operator_notes: song.operator_notes ?? undefined,
        theme_json: song.theme_json,
        sections: song.sections.map((s, i) => ({
          section_type: s.section_type,
          label: s.label,
          lyrics: s.lyrics,
          sort_order: i,
          lines_per_slide: s.lines_per_slide ?? undefined,
        })),
        arrangement_section_ids: sectionOrder,
        copyright: song.copyright
          ? {
              author: song.copyright.author ?? undefined,
              composer: song.copyright.composer ?? undefined,
              publisher: song.copyright.publisher ?? undefined,
              copyright_year: song.copyright.copyright_year ?? undefined,
              ccli_number: song.copyright.ccli_number ?? undefined,
              license_text: song.copyright.license_text ?? undefined,
            }
          : undefined,
        lines_per_slide: get().linesPerSlide,
      });
      set({ activeSong: updated, dirty: false });
      await get().loadSongs();
      await get().previewCurrent();
    } finally {
      set({ saving: false });
    }
  },

  deleteSong: async () => {
    const id = get().selectedId;
    if (!id) return;
    if (!window.confirm("Delete this song from your library? This cannot be undone.")) return;
    await api.deleteSong(id);
    set({ activeSong: null, selectedId: null, slideIndex: 0 });
    await get().loadSongs();
  },

  duplicateSong: async () => {
    const id = get().selectedId;
    if (!id) return;
    const copy = await api.duplicateSong(id);
    await get().loadSongs();
    await get().selectSong(copy.id);
  },

  addToService: async () => {
    const song = get().activeSong;
    if (!song) return;
    const service = useServiceStore.getState();
    if (!service.activePlan) await service.createPlan("Quick service");
    await service.addItem("song", song.title, serviceItemContentFromSong(song.id, get().slideIndex));
  },

  exportLibrary: async () => api.exportSongsLibrary(),

  updateDraft: (patch) => {
    const song = get().activeSong;
    if (!song) return;
    const next = { ...song, ...patch };
    if (patch.theme) next.theme_json = JSON.stringify(patch.theme);
    if (patch.sections) next.sections = patch.sections;
    set({ activeSong: next });
    get().markDirty();
  },

  reorderArrangement: (sectionIds) => {
    const song = get().activeSong;
    if (!song) return;
    get().updateDraft({
      arrangements: song.arrangements.map((a) =>
        a.is_default ? { ...a, section_order_json: JSON.stringify(sectionIds) } : a,
      ),
    });
  },

  setSectionLinesPerSlide: (sectionId, linesPerSlide) => {
    const song = get().activeSong;
    if (!song) return;
    const value = Math.max(1, Math.min(12, Math.round(linesPerSlide) || 1));
    get().updateDraft({
      sections: song.sections.map((s) =>
        s.id === sectionId ? { ...s, lines_per_slide: value } : s,
      ),
    });
  },

  setDefaultLinesPerSlide: (linesPerSlide) => {
    const value = Math.max(1, Math.min(12, Math.round(linesPerSlide) || 1));
    set({ linesPerSlide: value });
    get().markDirty();
  },

  addSection: (type = "verse") => {
    const song = get().activeSong;
    if (!song) return;
    const count = song.sections.filter((s) => s.section_type === type).length + 1;
    const label = `${type.replace("_", " ")} ${count}`;
    const section: SongSection = {
      id: crypto.randomUUID(),
      song_id: song.id,
      section_type: type,
      label,
      lyrics: "",
      sort_order: song.sections.length,
    };
    const sections = [...song.sections, section];
    const arrangement = song.arrangements.find((a) => a.is_default);
    const order: string[] = arrangement
      ? [...(JSON.parse(arrangement.section_order_json) as string[]), section.id]
      : sections.map((s) => s.id);
    get().updateDraft({
      sections,
      arrangements: song.arrangements.map((a) =>
        a.is_default ? { ...a, section_order_json: JSON.stringify(order) } : a,
      ),
    });
  },

  removeSection: (id) => {
    const song = get().activeSong;
    if (!song) return;
    const sections = song.sections.filter((s) => s.id !== id);
    const order = (JSON.parse(
      song.arrangements.find((a) => a.is_default)?.section_order_json ?? "[]",
    ) as string[]).filter((sid) => sid !== id);
    get().updateDraft({
      sections,
      arrangements: song.arrangements.map((a) =>
        a.is_default ? { ...a, section_order_json: JSON.stringify(order) } : a,
      ),
    });
  },

  markDirty: () => {
    set({ dirty: true });
    window.clearTimeout(autosaveTimer);
    autosaveTimer = window.setTimeout(() => {
      void get().saveSong();
    }, 3000);
  },

  warnings: () => {
    const warnings: string[] = [];
    const song = get().activeSong;
    if (!song) return warnings;
    if (get().dirty) warnings.push("Unsaved changes");
    if (!copyrightLine(song.copyright)) warnings.push("Missing copyright info");
    const slide = get().currentSlide();
    if (slide && slide.text.split("\n").length > get().linesPerSlide + 1) {
      warnings.push("Text may overflow at current font size");
    }
    if (get().effectiveSlides().length === 0 && song.sections.some((s) => s.lyrics.trim())) {
      warnings.push("Lyrics found but no slides — check arrangement");
    }
    return warnings;
  },

  effectiveSlides: () => resolveSlides(get().activeSong, get().linesPerSlide, get().dirty),

  currentSlide: () => {
    const slides = get().effectiveSlides();
    if (slides.length === 0) return null;
    return slides[get().slideIndex] ?? slides[0] ?? null;
  },

  nextSlidePreview: () => {
    const slides = get().effectiveSlides();
    if (slides.length === 0) return null;
    return slides[get().slideIndex + 1] ?? null;
  },
}));

export function registerSongLiveNavigation() {
  const state = useSongStore.getState();
  const slides = state.effectiveSlides();
  const slideNum = slides.length > 0 ? state.slideIndex + 1 : 0;
  const slideTotal = slides.length;
  const slideLabel = slideTotal > 0 ? ` · ${slideNum}/${slideTotal}` : "";
  useLiveNavigationStore.getState().register({
    onPrev: () => void state.prevSlide(),
    onNext: () => void state.nextSlide(),
    canPrev: state.slideIndex > 0,
    canNext: slides.length > 0 && state.slideIndex < slides.length - 1,
    label: state.activeSong ? `${state.activeSong.title}${slideLabel}` : "Song lyrics",
    beforeGoLive: async () => {
      await useSongStore.getState().previewCurrent();
    },
  });
}
