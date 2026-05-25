import { create } from "zustand";
import {
  clearProgramText,
  createInitialSnapshot,
  loadSnapshotFromStorage,
  persistSnapshot,
  queueScene,
  setBlackout,
  setPreview,
  takeProgram,
  toggleFreeze,
  undoProgram,
  type PresentationSnapshot,
} from "@/engine/previewProgram";
import { broadcastProgram, broadcastProgramReliable } from "@/engine/broadcast";
import {
  isPlaceholderScene,
  refreshPreviewBeforeGoLive,
  resolveStagedScene,
} from "@/engine/liveOutput";
import {
  logoScene,
  sceneFromServiceItem,
  sceneFromVerseComparison,
  sceneFromVersesWithLayout,
  type Scene,
  type VerseLayout,
} from "@/engine/scene";
import type { ServiceItem, ThemeConfig, VerseResult, DisplayInfo } from "@/lib/tauri";
import { api } from "@/lib/tauri";
import { syncNdiPreview, useNdiStore } from "@/stores/ndiStore";

export type PreviewSource = "bible" | "service" | "media" | "song" | "transcription" | null;

interface PresentationState extends PresentationSnapshot {
  outputOpen: boolean;
  displays: DisplayInfo[];
  activeDisplay: DisplayInfo | null;
  activePlanId?: string;
  liveFollow: boolean;
  previewSource: PreviewSource;
  hydrate: () => void;
  previewVerses: (verses: VerseResult[], theme?: ThemeConfig, layout?: VerseLayout) => void;
  showVerses: (verses: VerseResult[], theme?: ThemeConfig, layout?: VerseLayout) => void;
  showVerseComparison: (
    primary: VerseResult,
    secondary: VerseResult,
    theme?: ThemeConfig,
    layout?: VerseLayout,
  ) => void;
  previewItem: (item: ServiceItem, theme?: ThemeConfig) => void;
  previewScene: (scene: Scene | null, source?: PreviewSource) => void;
  goLive: () => Promise<void>;
  enqueue: (scene: Scene) => void;
  undo: () => void;
  clear: () => void;
  blackout: () => Promise<void>;
  showLogo: () => Promise<void>;
  freeze: () => void;
  openOutput: () => Promise<void>;
  closeOutput: () => Promise<void>;
  refreshOutput: () => Promise<void>;
  syncOutputStatus: () => Promise<void>;
  setDisplays: (displays: DisplayInfo[]) => void;
  persist: () => Promise<void>;
}

function syncOutput(state: Pick<PresentationState, "program" | "liveFollow" | "preview">) {
  const scene = outputProgram(
    state.liveFollow
      ? (resolveStagedScene(state.preview, state.program) ?? state.program)
      : state.program,
    state.liveFollow,
  );
  void broadcastProgram(scene);
}

async function syncOutputReliable(state: Pick<PresentationState, "program" | "liveFollow" | "preview">) {
  const scene = outputProgram(
    state.liveFollow
      ? (resolveStagedScene(state.preview, state.program) ?? state.program)
      : state.program,
    state.liveFollow,
  );
  await broadcastProgramReliable(scene);
}

/** What the projection output should show (logo until live). */
export function outputProgram(
  program: Scene | null,
  liveFollow: boolean,
): Scene | null {
  if (liveFollow && program && program.type !== "blank" && !isPlaceholderScene(program)) {
    return program;
  }
  if (program?.type === "blackout") {
    return program;
  }
  return logoScene();
}

async function syncKeepAwake(active: boolean) {
  try {
    await api.setPresentationKeepAwake(active);
  } catch {
    // Browser/dev without Tauri
  }
}

/** True when program output is actively following live (EasyWorship "Live Area" mode). */
export function isPresentationOnAir(state: {
  liveFollow: boolean;
  program: Scene | null;
  frozen: boolean;
}): boolean {
  return (
    state.liveFollow &&
    state.program != null &&
    state.program.type !== "blackout" &&
    state.program.type !== "blank" &&
    !state.frozen
  );
}

function isOnAir(state: PresentationState): boolean {
  return isPresentationOnAir(state);
}

async function ensureOutputOpen() {
  if (!usePresentationStore.getState().outputOpen) {
    await usePresentationStore.getState().openOutput();
  }
}

export const usePresentationStore = create<PresentationState>((set, get) => ({
  ...createInitialSnapshot(),
  outputOpen: false,
  displays: [],
  activeDisplay: null,
  liveFollow: false,
  previewSource: null,

  hydrate: () => {
    const snapshot = loadSnapshotFromStorage();
    const next = { ...snapshot, liveFollow: false };
    persistSnapshot(next);
    set(next);
    syncOutput(next);
  },

  previewVerses: (verses, theme, layout) => {
    const preview = sceneFromVersesWithLayout(verses, theme, layout);
    const next = setPreview(get(), preview);
    persistSnapshot(next);
    set({ ...next, previewSource: "bible" });
  },

  showVerses: (verses, theme, layout) => {
    const scene = sceneFromVersesWithLayout(verses, theme, layout);
    set((state) => {
      const onAir = isOnAir(state);
      const next: PresentationSnapshot = onAir
        ? {
            ...state,
            preview: scene,
            program: scene,
            history: state.program ? [state.program, ...state.history].slice(0, 20) : state.history,
          }
        : setPreview(state, scene);

      persistSnapshot(next);
      if (onAir) {
        void syncOutputReliable({ ...next, liveFollow: true });
      }
      return { ...next, previewSource: "bible" as const };
    });
  },

  showVerseComparison: (primary, secondary, theme, layout) => {
    const scene = sceneFromVerseComparison(primary, secondary, theme, layout);
    set((state) => {
      const onAir = isOnAir(state);
      const next: PresentationSnapshot = onAir
        ? {
            ...state,
            preview: scene,
            program: scene,
            history: state.program ? [state.program, ...state.history].slice(0, 20) : state.history,
          }
        : setPreview(state, scene);

      persistSnapshot(next);
      if (onAir) {
        void syncOutputReliable({ ...next, liveFollow: true });
      }
      return { ...next, previewSource: "bible" as const };
    });
  },

  previewItem: (item, theme) => {
    const preview = sceneFromServiceItem(item.item_type, item.title, item.content_json, theme);
    const next = setPreview(get(), preview);
    persistSnapshot(next);
    set({ ...next, previewSource: "service" });
  },

  previewScene: (scene, source: PreviewSource = null) => {
    const next = setPreview(get(), scene);
    persistSnapshot(next);
    set({ ...next, previewSource: source });
    syncNdiPreview(scene);
  },

  goLive: async () => {
    await ensureOutputOpen();

    await refreshPreviewBeforeGoLive(get().previewSource);

    let state = get();
    const staged = resolveStagedScene(state.preview, state.program);
    if (!staged || isPlaceholderScene(staged)) {
      return;
    }

    const next = state.preview ? takeProgram(state) : { ...state, program: staged };
    const live = { ...next, liveFollow: true };
    set(live);
    persistSnapshot(live);
    await syncOutputReliable(live);
    void syncKeepAwake(true);
    void useNdiStore.getState().maybeAutoStartOnGoLive();
  },

  enqueue: (scene) => set(queueScene(get(), scene)),

  undo: () => {
    const next = undoProgram(get());
    set(next);
    syncOutput({ ...next, liveFollow: get().liveFollow });
  },

  clear: () => {
    const next = clearProgramText(get());
    const cleared = { ...next, liveFollow: false, previewSource: null };
    set(cleared);
    syncOutput(cleared);
    void syncKeepAwake(false);
  },

  blackout: async () => {
    await ensureOutputOpen();
    const next = setBlackout(get());
    const state = { ...next, liveFollow: false };
    set(state);
    syncOutput(state);
    void syncKeepAwake(false);
  },

  showLogo: async () => {
    await ensureOutputOpen();
    const next = setPreview(get(), logoScene());
    const live = takeProgram({ ...get(), ...next });
    const state = { ...live, liveFollow: true };
    set(state);
    persistSnapshot(state);
    await syncOutputReliable(state);
    void syncKeepAwake(true);
  },

  freeze: () => set(toggleFreeze(get())),

  openOutput: async () => {
    await api.openOutputWindow();
    await get().syncOutputStatus();
    await syncOutputReliable(get());
  },

  closeOutput: async () => {
    await api.closeOutputWindow();
    set({ outputOpen: false, activeDisplay: null });
  },

  refreshOutput: async () => {
    await api.refreshOutputWindow();
    await get().syncOutputStatus();
    syncOutput(get());
  },

  syncOutputStatus: async () => {
    try {
      const status = await api.getOutputStatus();
      set({
        outputOpen: status.open,
        displays: status.displays,
        activeDisplay: status.active_display,
      });
    } catch {
      // Browser/dev without Tauri
    }
  },

  setDisplays: (displays) => set({ displays }),

  persist: async () => {
    const { program, preview, queue, history, frozen, activePlanId } = get();
    await api.savePresentationState(
      JSON.stringify({ program, preview, queue, history, frozen }),
      activePlanId,
    );
  },
}));
