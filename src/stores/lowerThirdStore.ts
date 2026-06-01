import { create } from "zustand";
import type { LowerThirdControlState } from "@/components/presentation/LowerThirdControls";
import type { LowerThirdOverrides } from "@/lib/lowerThird";
import { buildLowerThirdTheme, isLowerThirdScene } from "@/lib/lowerThird";
import type { ThemeConfig } from "@/lib/themeConfig";
import { broadcastProgramReliable } from "@/engine/broadcast";
import { outputProgram } from "@/stores/presentationStore";
import { usePresentationStore, isPresentationOnAir } from "@/stores/presentationStore";
import { useThemeStore } from "@/stores/themeStore";
import { useSongStore } from "@/stores/songStore";

interface LowerThirdStoreState {
  showLowerThirdSafeMargins: boolean;
  lowerThirdChromaPreview: boolean;
  controlState: () => LowerThirdControlState;
  effectiveLowerThird: (baseTheme?: ThemeConfig) => ThemeConfig["lowerThird"];
  applyControlPatch: (patch: Partial<LowerThirdControlState & LowerThirdOverrides & Record<string, unknown>>) => void;
  applyShowToggle: (patch: { showReference?: boolean; showVersion?: boolean; showVerseNumbers?: boolean }) => void;
}

function extractLowerThirdPatch(
  patch: Partial<LowerThirdControlState & LowerThirdOverrides & Record<string, unknown>>,
): LowerThirdOverrides {
  const ltPatch = (patch.lowerThird as LowerThirdOverrides | undefined) ?? {};
  const directLt: LowerThirdOverrides = {};
  for (const [key, value] of Object.entries(patch)) {
    if (
      key !== "lowerThird" &&
      key !== "showLowerThirdSafeMargins" &&
      key !== "lowerThirdChromaPreview" &&
      key !== "showReference" &&
      key !== "showVersion" &&
      key !== "showVerseNumbers" &&
      value !== undefined
    ) {
      (directLt as Record<string, unknown>)[key] = value;
    }
  }
  return { ...ltPatch, ...directLt };
}

function refreshLowerThirdLiveOutput() {
  const presentation = usePresentationStore.getState();
  const onAir = isPresentationOnAir(presentation);
  const program = presentation.program;

  if (presentation.previewSource === "song") {
    const song = useSongStore.getState().activeSong;
    if (!song) return;
    const settings = JSON.parse(song.theme_json || "{}") as { mode?: string };
    if (settings.mode === "lower_third" || settings.mode === "clean") {
      if (onAir) void useSongStore.getState().goLiveCurrent();
      else void useSongStore.getState().previewCurrent();
    }
    return;
  }

  if (!program || !isLowerThirdScene(program)) return;

  const mergedTheme = buildLowerThirdTheme(useThemeStore.getState().activeTheme);
  const refreshed = {
    ...program,
    theme: {
      ...mergedTheme,
      showReference: useThemeStore.getState().activeTheme.showReference,
      showVersion: useThemeStore.getState().activeTheme.showVersion,
      showVerseNumbers: useThemeStore.getState().activeTheme.showVerseNumbers,
    },
  };

  usePresentationStore.setState((state) => {
    const next = onAir
      ? { ...state, preview: refreshed, program: refreshed, liveFollow: true }
      : { ...state, preview: refreshed };
    if (onAir) void broadcastProgramReliable(outputProgram(refreshed, true));
    return next;
  });
}

export const useLowerThirdStore = create<LowerThirdStoreState>((set, get) => ({
  showLowerThirdSafeMargins: false,
  lowerThirdChromaPreview: true,

  controlState: () => ({
    showLowerThirdSafeMargins: get().showLowerThirdSafeMargins,
    lowerThirdChromaPreview: get().lowerThirdChromaPreview,
  }),

  effectiveLowerThird: (baseTheme) => buildLowerThirdTheme(baseTheme ?? useThemeStore.getState().activeTheme).lowerThird,

  applyControlPatch: (patch) => {
    set((state) => ({
      showLowerThirdSafeMargins:
        patch.showLowerThirdSafeMargins !== undefined
          ? (patch.showLowerThirdSafeMargins as boolean)
          : state.showLowerThirdSafeMargins,
      lowerThirdChromaPreview:
        patch.lowerThirdChromaPreview !== undefined
          ? (patch.lowerThirdChromaPreview as boolean)
          : state.lowerThirdChromaPreview,
    }));

    const ltPatch = extractLowerThirdPatch(patch);
    if (Object.keys(ltPatch).length > 0) {
      const activeTheme = useThemeStore.getState().activeTheme;
      useThemeStore.getState().applyThemeLive({
        ...activeTheme,
        lowerThird: { ...activeTheme.lowerThird, ...ltPatch },
      });
    }

    refreshLowerThirdLiveOutput();
  },

  applyShowToggle: (patch) => {
    const activeTheme = useThemeStore.getState().activeTheme;
    useThemeStore.getState().applyThemeLive({ ...activeTheme, ...patch });
    refreshLowerThirdLiveOutput();
  },
}));
