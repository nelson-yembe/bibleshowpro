import type { MouseEvent, ReactNode, RefObject } from "react";
import { SceneRenderer } from "@/components/presentation/SceneRenderer";
import type { DisplayOptions } from "@/components/presentation/displayOptions";
import type { Scene } from "@/engine/scene";
import { cn } from "@/lib/utils";

/** Matches the Bible Search center staging preview footprint. */
export const STAGING_PREVIEW_MIN_HEIGHT_PX = 340;

import type { ThemeConfig } from "@/lib/themeConfig";

interface StagingPreviewProps {
  scene: Scene | null;
  displayOptions?: Partial<DisplayOptions>;
  themeOverride?: Partial<ThemeConfig>;
  label?: string;
  className?: string;
  innerRef?: RefObject<HTMLDivElement | null>;
  onContextMenu?: (event: MouseEvent) => void;
  forceThemeBackground?: boolean;
  hideVectorLayers?: boolean;
  isBlackout?: boolean;
  children?: ReactNode;
}

export function StagingPreview({
  scene,
  displayOptions,
  themeOverride,
  label = "Preview",
  className,
  innerRef,
  onContextMenu,
  forceThemeBackground,
  hideVectorLayers,
  isBlackout = false,
  children,
}: StagingPreviewProps) {
  return (
    <div
      ref={innerRef}
      className={cn(
        "relative flex h-full w-full min-h-[340px] flex-1 flex-col overflow-hidden rounded-lg border border-[var(--color-border-light)] bg-black",
        className,
      )}
      onContextMenu={onContextMenu}
    >
      {isBlackout ? (
        <div className="flex h-full flex-col items-center justify-center text-[var(--color-subtle)]">
          <p className="text-xs font-medium tracking-widest">BLACKOUT ACTIVE</p>
        </div>
      ) : (
        <SceneRenderer
          scene={scene}
          className="h-full min-h-0"
          compact
          compactVariant="stage"
          displayOptions={displayOptions}
          themeOverride={themeOverride}
          label={label}
          forceThemeBackground={forceThemeBackground}
          hideVectorLayers={hideVectorLayers}
        />
      )}
      {children}
    </div>
  );
}
