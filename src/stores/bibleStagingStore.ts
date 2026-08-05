import { create } from "zustand";
import {
  sceneContentEqual,
  sceneFromVerseComparison,
  sceneFromVersesWithLayout,
  type Scene,
  type VerseLayout,
} from "@/engine/scene";
import type { ThemeConfig, VerseResult } from "@/lib/tauri";
import { usePresentationStore } from "@/stores/presentationStore";

interface BibleStagingState {
  /** Local staging scene for Bible Search — independent of projection program state. */
  stagedScene: Scene | null;
  stageScene: (scene: Scene) => void;
  stageVerses: (verses: VerseResult[], theme?: ThemeConfig, layout?: VerseLayout) => void;
  stageVerseComparison: (
    primary: VerseResult,
    secondary: VerseResult,
    theme?: ThemeConfig,
    layout?: VerseLayout,
  ) => void;
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

  stageVerses: (verses, theme, layout) => {
    get().stageScene(sceneFromVersesWithLayout(verses, theme, layout));
  },

  stageVerseComparison: (primary, secondary, theme, layout) => {
    get().stageScene(sceneFromVerseComparison(primary, secondary, theme, layout));
  },

  clearStage: () => set({ stagedScene: null }),
}));
