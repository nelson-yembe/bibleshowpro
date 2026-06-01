import { useCallback, useMemo } from "react";
import { buildLowerThirdTheme } from "@/lib/lowerThird";
import { useLowerThirdStore } from "@/stores/lowerThirdStore";
import { useThemeStore } from "@/stores/themeStore";

export function useLowerThirdSettings() {
  const activeTheme = useThemeStore((s) => s.activeTheme);
  const themeRevision = useThemeStore((s) => s.themeRevision);
  const applyControlPatch = useLowerThirdStore((s) => s.applyControlPatch);
  const applyShowToggle = useLowerThirdStore((s) => s.applyShowToggle);
  const showLowerThirdSafeMargins = useLowerThirdStore((s) => s.showLowerThirdSafeMargins);
  const lowerThirdChromaPreview = useLowerThirdStore((s) => s.lowerThirdChromaPreview);

  const effectiveLowerThird = useMemo(
    () => buildLowerThirdTheme(activeTheme).lowerThird,
    [activeTheme, themeRevision],
  );

  const onChange = useCallback(
    (patch: Record<string, unknown>) => {
      applyControlPatch(patch);
    },
    [applyControlPatch],
  );

  const onShowToggle = useCallback(
    (patch: { showReference?: boolean; showVersion?: boolean; showVerseNumbers?: boolean }) => {
      applyShowToggle(patch);
    },
    [applyShowToggle],
  );

  return {
    effectiveLowerThird,
    controlState: {
      showLowerThirdSafeMargins,
      lowerThirdChromaPreview,
    },
    onChange,
    onShowToggle,
  };
}
