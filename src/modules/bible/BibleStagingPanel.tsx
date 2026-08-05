import { memo, type MouseEvent, type RefObject } from "react";
import { StagingPreview } from "@/components/presentation/StagingPreview";
import {
  PreviewHighlightMenu,
  type HighlightMenuState,
} from "@/components/presentation/PreviewHighlightMenu";
import { ChromaPreviewGrid, SafeMarginOverlay } from "@/components/presentation/SafeMarginOverlay";
import { BibleLiveAirBadge } from "@/modules/bible/BibleLiveAirBadge";
import type { DisplayOptions } from "@/components/presentation/displayOptions";
import type { ThemeConfig } from "@/lib/themeConfig";
import { useBibleStagingStore } from "@/stores/bibleStagingStore";

interface BibleStagingPanelProps {
  displayOptions: Partial<DisplayOptions>;
  themeOverride?: Partial<ThemeConfig>;
  isLowerThirdMode: boolean;
  showLowerThirdSafeMargins: boolean;
  lowerThirdChromaPreview: boolean;
  effectiveLowerThird: ThemeConfig["lowerThird"];
  innerRef?: RefObject<HTMLDivElement | null>;
  highlightMenu: HighlightMenuState | null;
  onCloseHighlightMenu: () => void;
  onHighlight: (text: string) => void;
  onContextMenu?: (event: MouseEvent) => void;
}

/**
 * Center staging preview — reads bible-local staging only, not presentationStore.
 */
export const BibleStagingPanel = memo(function BibleStagingPanel({
  displayOptions,
  themeOverride,
  isLowerThirdMode,
  showLowerThirdSafeMargins,
  lowerThirdChromaPreview,
  effectiveLowerThird,
  innerRef,
  highlightMenu,
  onCloseHighlightMenu,
  onHighlight,
  onContextMenu,
}: BibleStagingPanelProps) {
  const stagedScene = useBibleStagingStore((s) => s.stagedScene);

  return (
    <StagingPreview
      scene={stagedScene}
      displayOptions={displayOptions}
      themeOverride={themeOverride}
      label="Preview a passage — GO LIVE on the right panel"
      innerRef={innerRef}
      onContextMenu={onContextMenu}
      isBlackout={false}
    >
      {isLowerThirdMode && lowerThirdChromaPreview !== false && effectiveLowerThird.transparentOutput && (
        <ChromaPreviewGrid />
      )}
      {isLowerThirdMode && showLowerThirdSafeMargins && (
        <SafeMarginOverlay marginPercent={effectiveLowerThird.safeMarginPercent} />
      )}
      <PreviewHighlightMenu
        menu={highlightMenu}
        onClose={onCloseHighlightMenu}
        onHighlight={onHighlight}
      />
      <div className="pointer-events-none absolute left-3 top-3">
        <BibleLiveAirBadge />
      </div>
      <div className="pointer-events-none absolute right-3 top-3 text-[10px] text-[var(--color-subtle)]">
        1920 × 1080 · 30 fps
      </div>
    </StagingPreview>
  );
});
