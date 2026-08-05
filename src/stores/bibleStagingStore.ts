import { create } from "zustand";
import {
  sceneContentEqual,
  sceneFromVerseComparison,
  sceneFromVersesWithLayout,
  sceneWithPresentationOverlays,
  type Scene,
  type VerseLayout,
} from "@/engine/scene";
import type { ThemeConfig, VerseResult } from "@/lib/tauri";
import { usePresentationStore } from "@/stores/presentationStore";

export interface PresentationOverlays {
  highlightPhrase?: string;
  highlightColor?: string;
  emphasis?: "none" | "bold" | "glow";
  backgroundPreset?: "theme" | "ridge-dark" | "hymnal" | "plain-black";
}

interface BibleStagingState {
  /** Local staging scene for Bible Search — independent of projection program state. */
  stagedScene: Scene | null;
  stageScene: (scene: Scene) => void;
  stageVerses: (
    verses: VerseResult[],
    theme?: ThemeConfig,
    layout?: VerseLayout,
    overlays?: PresentationOverlays,
  ) => void;
  stageVerseComparison: (
    primary: VerseResult,
    secondary: VerseResult,
    theme?: ThemeConfig,
    layout?: VerseLayout,
    overlays?: PresentationOverlays,
  ) => void;
  /** Update highlight/emphasis/background on the current staged scene (and live program if following). */
  applyOverlays: (overlays: PresentationOverlays) => void;
  clearStage: () => void;
}

/** Push to the projection output only when live follow is active. */
function pushToProgramIfLive(scene: Scene) {
  const presentation = usePresentationStore.getState();
  if (!presentation.liveFollow || presentation.program?.type === "blackout") return;
  presentation.pushSceneLive(scene, "bible");
}

export const useBibleStagingStore = create<BibleStagingState>((set, get) => ({
  stagedScene: null,

  stageScene: (scene) => {
    const current = get().stagedScene;
    if (!sceneContentEqual(current, scene)) {
      set({ stagedScene: scene });
    }
    pushToProgramIfLive(scene);
  },

  stageVerses: (verses, theme, layout, overlays) => {
    let scene = sceneFromVersesWithLayout(verses, theme, layout);
    if (overlays) scene = sceneWithPresentationOverlays(scene, overlays);
    get().stageScene(scene);
  },

  stageVerseComparison: (primary, secondary, theme, layout, overlays) => {
    let scene = sceneFromVerseComparison(primary, secondary, theme, layout);
    if (overlays) scene = sceneWithPresentationOverlays(scene, overlays);
    get().stageScene(scene);
  },

  applyOverlays: (overlays) => {
    const current = get().stagedScene;
    if (!current) return;
    const next = sceneWithPresentationOverlays(current, overlays);
    if (sceneContentEqual(current, next)) return;
    // Keep a stable id so React doesn't remount the whole slide on highlight edits.
    get().stageScene({ ...next, id: current.id });
  },

  clearStage: () => set({ stagedScene: null }),
}));
