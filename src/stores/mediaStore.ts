import { create } from "zustand";
import { presentMediaItem, previewMediaItem, serviceItemContentFromMedia } from "@/lib/mediaLive";
import { parseMediaTags } from "@/lib/mediaUrl";
import { api, type MediaRecord } from "@/lib/tauri";
import { useServiceStore } from "@/stores/serviceStore";
import { useThemeStore } from "@/stores/themeStore";

const STORAGE_KEY = "bsp-media-context";

interface MediaContext {
  selectedId: string | null;
}

export type MediaFilter = "all" | "image" | "video" | "audio" | "recent" | "missing";

interface MediaState {
  items: MediaRecord[];
  selectedId: string | null;
  loading: boolean;
  importing: boolean;
  search: string;
  filter: MediaFilter;
  loadMedia: () => Promise<void>;
  init: () => Promise<void>;
  selectItem: (id: string | null, options?: { preview?: boolean }) => Promise<void>;
  importFiles: (paths: string[]) => Promise<void>;
  updateItem: (id: string, patch: { name?: string; tags?: string[] }) => Promise<void>;
  removeItem: (id: string) => Promise<void>;
  setSearch: (value: string) => void;
  setFilter: (value: MediaFilter) => void;
  previewSelected: () => Promise<void>;
  goLiveSelected: () => Promise<void>;
  addSelectedToService: () => Promise<void>;
  filteredItems: () => MediaRecord[];
  selectedItem: () => MediaRecord | null;
}

function loadContext(): MediaContext {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as MediaContext;
  } catch {
    // ignore
  }
  return { selectedId: null };
}

function saveContext(selectedId: string | null) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ selectedId }));
}

function activeTheme() {
  return useThemeStore.getState().activeTheme;
}

export const useMediaStore = create<MediaState>((set, get) => ({
  items: [],
  selectedId: null,
  loading: false,
  importing: false,
  search: "",
  filter: "all",

  loadMedia: async () => {
    set({ loading: true });
    try {
      const items = await api.listMedia();
      const context = loadContext();
      const selectedId =
        context.selectedId && items.some((item) => item.id === context.selectedId)
          ? context.selectedId
          : items[0]?.id ?? null;
      set({ items, selectedId });
      saveContext(selectedId);
    } finally {
      set({ loading: false });
    }
  },

  init: async () => {
    await get().loadMedia();
    const item = get().selectedItem();
    if (item) await previewMediaItem(item, activeTheme());
  },

  selectItem: async (id, options = { preview: true }) => {
    saveContext(id);
    set({ selectedId: id });
    if (options.preview !== false && id) {
      const item = get().items.find((entry) => entry.id === id);
      if (item) await previewMediaItem(item, activeTheme());
    }
  },

  importFiles: async (paths) => {
    if (paths.length === 0) return;
    set({ importing: true });
    try {
      const imported = await api.importMediaFiles(paths);
      await get().loadMedia();
      if (imported[0]) {
        await get().selectItem(imported[0].id);
      }
    } finally {
      set({ importing: false });
    }
  },

  updateItem: async (id, patch) => {
    const updated = await api.updateMedia({
      id,
      name: patch.name,
      tagsJson: patch.tags ? JSON.stringify(patch.tags) : undefined,
    });
    set((state) => ({
      items: state.items.map((item) => (item.id === id ? updated : item)),
    }));
    if (get().selectedId === id) {
      await get().previewSelected();
    }
  },

  removeItem: async (id) => {
    await api.deleteMedia(id);
    const nextSelected = get().selectedId === id ? null : get().selectedId;
    saveContext(nextSelected);
    await get().loadMedia();
    if (nextSelected) {
      await get().selectItem(nextSelected);
    }
  },

  setSearch: (value) => set({ search: value }),
  setFilter: (value) => set({ filter: value }),

  previewSelected: async () => {
    const item = get().selectedItem();
    if (!item) return;
    await previewMediaItem(item, activeTheme());
  },

  goLiveSelected: async () => {
    const item = get().selectedItem();
    if (!item) return;
    await presentMediaItem(item, activeTheme());
  },

  addSelectedToService: async () => {
    const item = get().selectedItem();
    if (!item) return;

    const service = useServiceStore.getState();
    if (!service.activePlan) {
      await service.createPlan("Quick service");
    }

    const itemType = item.media_type === "audio" ? "announcement" : item.media_type;
    await service.addItem(itemType, item.name, serviceItemContentFromMedia(item));
  },

  filteredItems: () => {
    const { items, search, filter } = get();
    const query = search.trim().toLowerCase();

    return items.filter((item) => {
      if (filter === "image" || filter === "video" || filter === "audio") {
        if (item.media_type !== filter) return false;
      }
      if (filter === "missing" && item.file_exists) return false;
      if (filter === "recent") {
        const created = new Date(item.created_at).getTime();
        const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        if (created < weekAgo) return false;
      }

      if (!query) return true;
      const tags = parseMediaTags(item.tags_json);
      return (
        item.name.toLowerCase().includes(query) ||
        item.file_path.toLowerCase().includes(query) ||
        tags.some((tag) => tag.toLowerCase().includes(query))
      );
    });
  },

  selectedItem: () => {
    const { items, selectedId } = get();
    return items.find((item) => item.id === selectedId) ?? null;
  },
}));
