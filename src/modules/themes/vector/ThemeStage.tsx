import { useState } from "react";
import {
  Ruler,
  SquareDashed,
  ZoomIn,
  ZoomOut,
  Maximize2,
  PenTool,
} from "lucide-react";
import { StagingPreview } from "@/components/presentation/StagingPreview";
import { VectorEditorCanvas } from "@/modules/themes/vector/VectorEditorCanvas";
import type { DisplayOptions } from "@/components/presentation/displayOptions";
import type { Scene } from "@/engine/scene";
import type { VectorDesign, VectorTool } from "@/lib/vectorDesign";
import type { SafeMargins } from "@/lib/themeDocument";
import { cn } from "@/lib/utils";

const RULER = 16;
const TICKS = 10;

interface ThemeStageProps {
  scene: Scene;
  displayOptions: Partial<DisplayOptions>;
  /** Vector edit mode: show interactive overlay + guides, hide baked layers. */
  editing: boolean;
  design: VectorDesign;
  tool: VectorTool;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (design: VectorDesign) => void;
  safeMargins: SafeMargins;
  canvasWidth: number;
  canvasHeight: number;
  outputLabel: string;
  contrastRatio: number;
  contrastWarn: boolean;
}

export function ThemeStage({
  scene,
  displayOptions,
  editing,
  design,
  tool,
  selectedId,
  onSelect,
  onChange,
  safeMargins,
  canvasWidth,
  canvasHeight,
  outputLabel,
  contrastRatio,
  contrastWarn,
}: ThemeStageProps) {
  const [zoom, setZoom] = useState(1);
  const [showRulers, setShowRulers] = useState(true);
  const [showGuides, setShowGuides] = useState(true);

  const widthPct = Math.round(zoom * 100);
  const ticks = Array.from({ length: TICKS + 1 }, (_, i) => i);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Canvas chrome toolbar */}
      <div className="flex shrink-0 items-center justify-between gap-2 pb-2">
        <div className="flex items-center gap-1">
          <ChromeToggle active={showRulers} onClick={() => setShowRulers((v) => !v)} title="Rulers">
            <Ruler className="h-3.5 w-3.5" />
          </ChromeToggle>
          <ChromeToggle active={showGuides} onClick={() => setShowGuides((v) => !v)} title="Safe-area guides">
            <SquareDashed className="h-3.5 w-3.5" />
          </ChromeToggle>
        </div>
        <div className="flex items-center gap-1">
          <ChromeBtn onClick={() => setZoom((z) => Math.max(0.25, +(z - 0.25).toFixed(2)))} title="Zoom out">
            <ZoomOut className="h-3.5 w-3.5" />
          </ChromeBtn>
          <span className="w-12 text-center text-[11px] tabular-nums text-[var(--color-subtle)]">{widthPct}%</span>
          <ChromeBtn onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))} title="Zoom in">
            <ZoomIn className="h-3.5 w-3.5" />
          </ChromeBtn>
          <ChromeBtn onClick={() => setZoom(1)} title="Fit to screen">
            <Maximize2 className="h-3.5 w-3.5" />
          </ChromeBtn>
          <button
            type="button"
            onClick={() => setZoom(1)}
            className="rounded-md border border-[var(--color-border-light)] px-2 py-1 text-[10px] text-[var(--color-subtle)] hover:text-[var(--color-foreground)]"
            title="Actual size"
          >
            100%
          </button>
        </div>
      </div>

      {/* Scrollable stage */}
      <div className="relative min-h-0 flex-1 overflow-auto rounded-lg bg-black/30 p-4">
        <div
          className="relative mx-auto"
          style={{ width: `${widthPct}%`, maxWidth: zoom <= 1 ? "100%" : "none" }}
        >
          {/* Rulers */}
          {showRulers && (
            <>
              <div
                className="pointer-events-none absolute left-0 top-0 flex items-end overflow-hidden border-b border-[var(--color-border-light)] bg-[var(--color-surface)] text-[7px] text-[var(--color-subtle)]"
                style={{ height: RULER, left: RULER, right: 0 }}
              >
                {ticks.map((i) => (
                  <span key={i} className="absolute flex flex-col items-center" style={{ left: `${(i / TICKS) * 100}%` }}>
                    <span className="leading-none">{Math.round((i / TICKS) * canvasWidth)}</span>
                    <span className="h-1 w-px bg-[var(--color-border-light)]" />
                  </span>
                ))}
              </div>
              <div
                className="pointer-events-none absolute left-0 overflow-hidden border-r border-[var(--color-border-light)] bg-[var(--color-surface)] text-[7px] text-[var(--color-subtle)]"
                style={{ width: RULER, top: RULER, bottom: 0 }}
              >
                {ticks.map((i) => (
                  <span key={i} className="absolute right-0.5" style={{ top: `${(i / TICKS) * 100}%` }}>
                    {Math.round((i / TICKS) * canvasHeight)}
                  </span>
                ))}
              </div>
              <div
                className="pointer-events-none absolute left-0 top-0 border-b border-r border-[var(--color-border-light)] bg-[var(--color-surface)]"
                style={{ width: RULER, height: RULER }}
              />
            </>
          )}

          {/* Canvas (16:9) */}
          <div
            className="relative aspect-video w-full"
            style={showRulers ? { marginLeft: RULER, marginTop: RULER, width: `calc(100% - ${RULER}px)` } : undefined}
          >
            <StagingPreview
              scene={scene}
              displayOptions={displayOptions}
              label="Theme preview"
              className="absolute inset-0"
              forceThemeBackground
              hideVectorLayers={editing}
            >
              {editing && (
                <VectorEditorCanvas
                  design={design}
                  tool={tool}
                  selectedId={selectedId}
                  onSelect={onSelect}
                  onChange={onChange}
                />
              )}

              {showGuides && <SafeGuides margins={safeMargins} />}

              {editing && (
                <div className="absolute left-2 top-2 z-30 flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-[10px] text-white">
                  <PenTool className="h-3 w-3" />
                  {outputLabel} · {canvasWidth}×{canvasHeight}
                </div>
              )}

              {contrastWarn && (
                <div className="absolute bottom-0 left-0 right-0 z-30 bg-amber-950/90 px-4 py-2 text-[11px] text-amber-200">
                  Text contrast {contrastRatio.toFixed(1)}:1 — below WCAG AA. Adjust colors or enable text shadow.
                </div>
              )}
            </StagingPreview>
          </div>
        </div>
      </div>
    </div>
  );
}

function SafeGuides({ margins }: { margins: SafeMargins }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20" aria-hidden>
      <div
        className="absolute border border-dashed border-amber-400/50"
        style={{
          top: `${margins.top}%`,
          right: `${margins.right}%`,
          bottom: `${margins.bottom}%`,
          left: `${margins.left}%`,
        }}
      />
    </div>
  );
}

function ChromeBtn({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="rounded-md border border-[var(--color-border-light)] p-1 text-[var(--color-subtle)] hover:text-[var(--color-foreground)]"
    >
      {children}
    </button>
  );
}

function ChromeToggle({
  children,
  active,
  onClick,
  title,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "rounded-md border p-1 transition-colors",
        active
          ? "border-[var(--color-primary)] text-[var(--color-primary)]"
          : "border-[var(--color-border-light)] text-[var(--color-subtle)] hover:text-[var(--color-foreground)]",
      )}
    >
      {children}
    </button>
  );
}
