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
  sceneContentEqual,
  sceneFromServiceItem,
  sceneFromVerseComparison,
  sceneFromVersesWithLayout,
  type Scene,
  type VerseLayout,
} from "@/engine/scene";
import type { ServiceItem, ThemeConfig, VerseResult, DisplayInfo } from "@/lib/tauri";
import { api } from "@/lib/tauri";
import { syncNdiPreview, useNdiStore } from "@/stores/ndiStore";
import { useVideoPlaybackStore } from "@/stores/videoPlaybackStore";

export type PreviewSource = "bible" | "service" | "media" | "song" | "transcription" | null;

interface PresentationState extends PresentationSnapshot {
  outputOpen: boolean;
  outputError: string | null;
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
  /** Copy a module-local staged scene into presentation preview before GO LIVE. */
  preparePreviewForGoLive: (scene: Scene, source: PreviewSource) => void;
  /** Push a scene to program output and broadcast (when already live). */
  pushSceneLive: (scene: Scene, source?: PreviewSource) => void;
  goLive: () => Promise<void>;
  enqueue: (scene: Scene) => void;
  undo: () => void;
  clear: () => void;
  clearPreview: () => void;
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
  await api.openOutputWindow();
  await usePresentationStore.getState().syncOutputStatus();
  usePresentationStore.setState({ outputError: null });
}

export const usePresentationStore = create<PresentationState>((set, get) => ({
  ...createInitialSnapshot(),
  outputOpen: false,
  outputError: null,
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
    const state = get();
    // Skip redundant restage to avoid unnecessary re-renders.
    if (state.previewSource === "bible" && sceneContentEqual(state.preview, preview)) return;
    const next = setPreview(state, preview);
    persistSnapshot(next);
    set({ ...next, previewSource: "bible" });
  },

  showVerses: (verses, theme, layout) => {
    const scene = sceneFromVersesWithLayout(verses, theme, layout);
    set((state) => {
      const onAir = isOnAir(state);
      // Skip redundant restage/broadcast when the target slot already shows this scene.
      const current = onAir ? state.program : state.preview;
      if (state.previewSource === "bible" && sceneContentEqual(current, scene)) return state;
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
      const current = onAir ? state.program : state.preview;
      if (state.previewSource === "bible" && sceneContentEqual(current, scene)) return state;
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

  preparePreviewForGoLive: (scene, source) => {
    const state = get();
    if (state.previewSource === source && sceneContentEqual(state.preview, scene)) return;
    const next = setPreview(state, scene);
    persistSnapshot(next);
    set({ ...next, previewSource: source });
  },

  pushSceneLive: (scene, source = "bible") => {
    set((state) => {
      if (sceneContentEqual(state.program, scene)) return state;
      const next: PresentationSnapshot = {
        ...state,
        preview: scene,
        program: scene,
        history: state.program ? [state.program, ...state.history].slice(0, 20) : state.history,
      };
      persistSnapshot(next);
      void syncOutputReliable({ ...next, liveFollow: true });
      return { ...next, previewSource: source, liveFollow: true };
    });
  },

  goLive: async () => {
    try {
      await ensureOutputOpen();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ outputError: message || "Failed to open projector window" });
      return;
    }

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
    if (staged.type === "video" && staged.content.videoPath) {
      useVideoPlaybackStore.getState().bind(staged.content.videoPath, { autoPlay: true });
      useVideoPlaybackStore.getState().play();
    }
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
    useVideoPlaybackStore.getState().pause();
    void syncKeepAwake(false);
  },

  clearPreview: () => {
    const next = setPreview(get(), null);
    persistSnapshot(next);
    set({ ...next, previewSource: null });
  },

  blackout: async () => {
    await ensureOutputOpen();
    const next = setBlackout(get());
    const state = { ...next, liveFollow: false };
    set(state);
    syncOutput(state);
    useVideoPlaybackStore.getState().pause();
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
    useVideoPlaybackStore.getState().pause();
    void syncKeepAwake(true);
  },

  freeze: () => {
    const next = toggleFreeze(get());
    set(next);
    if (next.frozen) useVideoPlaybackStore.getState().pause();
  },

  openOutput: async () => {
    try {
      await api.openOutputWindow();
      await get().syncOutputStatus();
      set({ outputError: null });
      await syncOutputReliable(get());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ outputError: message || "Failed to open projector window" });
      throw error;
    }
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
