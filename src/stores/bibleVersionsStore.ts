import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import {
  api,
  type BibleImportProgress,
  type CatalogEntryView,
  type TranslationInfo,
} from "@/lib/tauri";
import { useBibleStore } from "@/stores/bibleStore";

interface BibleVersionsState {
  catalog: CatalogEntryView[];
  importProgress: BibleImportProgress | null;
  importing: boolean;
  loadCatalog: () => Promise<void>;
  installCorePackages: () => Promise<string>;
  downloadTranslation: (id: string) => Promise<string>;
  importFromFile: (json: string, setDefault?: boolean) => Promise<string>;
  deleteTranslation: (id: string) => Promise<void>;
  setDefaultTranslation: (id: string) => Promise<void>;
  refreshTranslations: () => Promise<TranslationInfo[]>;
}

let progressListenerReady = false;

async function ensureProgressListener(set: (partial: Partial<BibleVersionsState>) => void) {
  if (progressListenerReady) return;
  progressListenerReady = true;
  await listen<BibleImportProgress>("bible-import-progress", (event) => {
    set({ importProgress: event.payload });
  });
}

export const useBibleVersionsStore = create<BibleVersionsState>((set, get) => ({
  catalog: [],
  importProgress: null,
  importing: false,

  loadCatalog: async () => {
    await ensureProgressListener(set);
    const catalog = await api.getBibleCatalog();
    set({ catalog });
  },

  installCorePackages: async () => {
    set({ importing: true, importProgress: null });
    try {
      const results = await api.installCoreBiblePackages();
      await get().loadCatalog();
      await useBibleStoreRefresh();
      return results.map((r) => r.message).join("\n");
    } finally {
      set({ importing: false });
    }
  },

  downloadTranslation: async (id) => {
    set({ importing: true, importProgress: null });
    try {
      const result = await api.downloadBibleTranslation(id);
      await get().loadCatalog();
      await useBibleStoreRefresh();
      return result.message;
    } finally {
      set({ importing: false });
    }
  },

  importFromFile: async (json, setDefault) => {
    set({ importing: true, importProgress: null });
    try {
      const result = await api.importBibleJson(json, setDefault);
      await get().loadCatalog();
      await useBibleStoreRefresh();
      return result.message;
    } finally {
      set({ importing: false });
    }
  },

  deleteTranslation: async (id) => {
    await api.deleteBibleTranslation(id);
    await get().loadCatalog();
    await useBibleStoreRefresh();
  },

  setDefaultTranslation: async (id) => {
    await api.setDefaultBibleTranslation(id);
    await get().loadCatalog();
    await useBibleStoreRefresh();
  },

  refreshTranslations: async () => {
    await useBibleStore.getState().loadTranslations();
    return useBibleStore.getState().translations;
  },
}));

async function useBibleStoreRefresh() {
  await useBibleStore.getState().loadTranslations();
}
