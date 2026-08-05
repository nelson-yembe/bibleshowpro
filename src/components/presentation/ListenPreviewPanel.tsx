import { StagingPreview } from "@/components/presentation/StagingPreview";
import { LowerThirdSettingsModal } from "@/components/presentation/LowerThirdSettingsModal";
import { LowerThirdSettingsTrigger } from "@/components/presentation/LowerThirdSettingsTrigger";
import { ChromaPreviewGrid, SafeMarginOverlay } from "@/components/presentation/SafeMarginOverlay";
import { buildLowerThirdTheme, isTransparentLowerThirdOutput } from "@/lib/lowerThird";
import {
  presentationTranslationLabel,
  transcriptionSceneMatchesLayout,
} from "@/lib/transcriptionLive";
import { useLowerThirdSettings } from "@/hooks/useLowerThirdSettings";
import { cn } from "@/lib/utils";
import { canStepVerse, sessionProgressLabel } from "@/lib/transcription/verseSession";
import { useBibleStore } from "@/stores/bibleStore";
import { usePresentationStore } from "@/stores/presentationStore";
import { useTranscriptionStore } from "@/stores/transcriptionStore";
import { useThemeStore } from "@/stores/themeStore";
import { useLowerThirdStore } from "@/stores/lowerThirdStore";
import {
  ChevronLeft,
  ChevronRight,
  Layers,
  Maximize2,
  PanelBottom,
  Radio,
  RotateCcw,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const sourceLabels = {
  bible: "Bible",
  service: "Service plan",
  media: "Media",
  song: "Song lyrics",
  transcription: "Live listen",
} as const;

export function ListenPreviewPanel() {
  const preview = usePresentationStore((s) => s.preview);
  const previewSource = usePresentationStore((s) => s.previewSource);
  const liveFollow = usePresentationStore((s) => s.liveFollow);
  const activeTheme = useThemeStore((s) => s.activeTheme);
  const themeRevision = useThemeStore((s) => s.themeRevision);

  const previewLayout = useTranscriptionStore((s) => s.previewLayout);
  const setPreviewLayout = useTranscriptionStore((s) => s.setPreviewLayout);
  const selectedSuggestionId = useTranscriptionStore((s) => s.selectedSuggestionId);
  const suggestions = useTranscriptionStore((s) => s.suggestions);
  const rescanTranscript = useTranscriptionStore((s) => s.rescanTranscript);
  const scanning = useTranscriptionStore((s) => s.scanning);
  const verseSession = useTranscriptionStore((s) => s.verseSession);
  const lastVoiceAction = useTranscriptionStore((s) => s.lastVoiceAction);
  const autoGoLive = useTranscriptionStore((s) => s.autoGoLive);
  const setAutoGoLive = useTranscriptionStore((s) => s.setAutoGoLive);
  const stepActiveVerse = useTranscriptionStore((s) => s.stepActiveVerse);
  const goLiveSelectedSuggestion = useTranscriptionStore((s) => s.goLiveSelectedSuggestion);
  const previewSuggestion = useTranscriptionStore((s) => s.previewSuggestion);
  const refreshPreviewOutput = useTranscriptionStore((s) => s.refreshPreviewOutput);
  const clearPreview = usePresentationStore((s) => s.clearPreview);

  const lowerThirdSettings = useLowerThirdSettings();
  const showLowerThirdSafeMargins = useLowerThirdStore((s) => s.showLowerThirdSafeMargins);
  const lowerThirdChromaPreview = useLowerThirdStore((s) => s.lowerThirdChromaPreview);
  const [lowerThirdSettingsOpen, setLowerThirdSettingsOpen] = useState(false);

  const effectiveLowerThird = useMemo(
    () => buildLowerThirdTheme(activeTheme).lowerThird,
    [activeTheme, themeRevision],
  );

  const selected =
    suggestions.find((s) => s.id === selectedSuggestionId) ??
    suggestions.find((s) => s.status !== "ignored");

  const selectedTranslationIds = useBibleStore((s) => s.selectedTranslationIds);
  const selectedTranslationId = useBibleStore((s) => s.selectedTranslationId);
  const translationLabel = useMemo(
    () => presentationTranslationLabel(),
    [selectedTranslationIds, selectedTranslationId],
  );

  const progressLabel = verseSession
    ? sessionProgressLabel(verseSession, translationLabel)
    : selected
      ? `${selected.reference} · ${translationLabel}`
      : null;

  const previewReference = preview?.content.reference ?? preview?.content.title ?? null;
  const isOnAir = liveFollow && previewSource === "transcription";
  // Manual Go Live stays available even when Auto is on (Auto only auto-takes confident explicits).
  const canGoLive = Boolean(verseSession || selected || preview);

  const isLowerThird = previewLayout === "lower_third";
  const transparentOverlay =
    isLowerThird &&
    (preview ? isTransparentLowerThirdOutput(preview, null, false) : true);

  const refreshSelectedPreview = async () => {
    if (!selected) return;
    await previewSuggestion(selected);
  };

  useEffect(() => {
    void refreshPreviewOutput();
  }, [
    activeTheme.lowerThird,
    themeRevision,
    previewLayout,
    selectedTranslationIds,
    selectedTranslationId,
    refreshPreviewOutput,
  ]);

  useEffect(() => {
    if (!preview) return;
    if (transcriptionSceneMatchesLayout(preview, previewLayout)) return;
    void refreshPreviewOutput();
  }, [preview, previewLayout, refreshPreviewOutput]);

  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-xl border border-[var(--color-border)] bg-[#0a0c12]">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] px-4 py-2.5">
        <div>
          <h2 className="section-label">Preview</h2>
          <p className="text-[10px] text-[var(--color-subtle)]">
            {progressLabel ?? previewReference ?? "Detected scripture appears here before going live"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {previewSource && (
            <span className="rounded-md border border-[var(--color-border-light)] px-2 py-0.5 text-[9px] uppercase tracking-wide text-[var(--color-muted-foreground)]">
              {sourceLabels[previewSource]}
            </span>
          )}
          {isOnAir && (
            <span className="rounded-md bg-red-500/20 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-red-300">
              On air
            </span>
          )}
          <div className="flex items-center gap-1 rounded-lg border border-[var(--color-border-light)] p-0.5">
            <button
              type="button"
              onClick={() => setPreviewLayout("fullscreen")}
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium",
                previewLayout === "fullscreen"
                  ? "bg-[var(--color-primary)] text-white"
                  : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]",
              )}
            >
              <Maximize2 className="h-3 w-3" />
              Full
            </button>
            <button
              type="button"
              onClick={() => setPreviewLayout("lower_third")}
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium",
                previewLayout === "lower_third"
                  ? "bg-[var(--color-primary)] text-white"
                  : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]",
              )}
            >
              <PanelBottom className="h-3 w-3" />
              Lower 3rd
            </button>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 p-4">
        <StagingPreview
          scene={preview}
          themeOverride={isLowerThird ? { lowerThird: effectiveLowerThird } : undefined}
          label={
            autoGoLive
              ? isOnAir
                ? "Auto live — new detections go straight to projection"
                : "Auto live enabled — detections will go live automatically"
              : preview
                ? isOnAir
                  ? "On air — use Previous/Next to step verses in this passage"
                  : isLowerThird
                    ? "Stream overlay — transparent canvas with lower third only"
                    : "Staged in preview — click Go live to project"
                : selected
                  ? `${selected.reference} — loading preview…`
                  : "Preview a detected scripture"
          }
          className="h-full min-h-[420px]"
        >
          {isLowerThird && lowerThirdChromaPreview !== false && transparentOverlay && <ChromaPreviewGrid />}
          {isLowerThird && showLowerThirdSafeMargins && (
            <SafeMarginOverlay marginPercent={effectiveLowerThird.safeMarginPercent} />
          )}
        </StagingPreview>
      </div>

      <div className="border-t border-[var(--color-border)] px-4 py-3">
        {isLowerThird && (
          <div className="mb-3">
            <LowerThirdSettingsTrigger
              effective={effectiveLowerThird}
              onOpen={() => setLowerThirdSettingsOpen(true)}
            />
          </div>
        )}

        {verseSession && (
          <div className="mb-3 flex items-center justify-between gap-2 rounded-lg border border-[var(--color-border-light)] bg-[var(--color-panel)] px-2 py-1.5">
            <button
              type="button"
              disabled={!canStepVerse(verseSession, -1)}
              onClick={() => void stepActiveVerse(-1)}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-[var(--color-foreground)] hover:bg-black/20 disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Previous
            </button>
            <p className="text-center text-[10px] text-[var(--color-muted-foreground)]">
              {sessionProgressLabel(verseSession)}
            </p>
            <button
              type="button"
              disabled={!canStepVerse(verseSession, 1)}
              onClick={() => void stepActiveVerse(1)}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-[var(--color-foreground)] hover:bg-black/20 disabled:opacity-40"
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setAutoGoLive(!autoGoLive)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[11px] font-semibold transition-colors",
              autoGoLive
                ? "border-emerald-500/50 bg-emerald-950/30 text-emerald-300"
                : "border-[var(--color-border-light)] bg-[var(--color-panel)] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]",
            )}
          >
            <Radio className="h-3.5 w-3.5" />
            Auto
          </button>
          <button
            type="button"
            disabled={!canGoLive}
            onClick={() => void goLiveSelectedSuggestion()}
            className={cn(
              "inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-semibold transition-colors sm:flex-none",
              !canGoLive
                ? "cursor-not-allowed border border-[var(--color-border-light)] bg-[var(--color-panel)] text-[var(--color-subtle)] opacity-60"
                : "bg-red-600 text-white hover:bg-red-500",
            )}
            title={
              autoGoLive
                ? "Take the staged verse live now (Auto still handles confident detections)"
                : "Send staged verse to projection"
            }
          >
            <Zap className="h-3.5 w-3.5 fill-current" />
            {isOnAir ? "Take live" : "Go live"}
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!selected}
            onClick={() => void refreshSelectedPreview()}
            className="control-btn-primary"
          >
            <Layers className="h-3.5 w-3.5" />
            Send to preview
          </button>
          <button type="button" onClick={clearPreview} className="control-btn">
            Clear preview
          </button>
          <button type="button" disabled={scanning} onClick={() => void rescanTranscript()} className="control-btn">
            <RotateCcw className={cn("h-3.5 w-3.5", scanning && "animate-spin")} />
            Rescan
          </button>
        </div>

        {lastVoiceAction && (
          <p className="mt-2 text-[10px] text-emerald-300/90">{lastVoiceAction}</p>
        )}

        <p className="mt-2 flex items-center gap-1.5 text-[10px] text-[var(--color-subtle)]">
          <Radio className="h-3 w-3" />
          {autoGoLive
            ? "Auto on: detections go live immediately. Previous/Next steps through verses in the same chapter."
            : "Auto off: detections stay in preview until you click Go live. Then Previous/Next moves verse 15 → 16 → 17 in the same chapter."}
        </p>
      </div>

      <LowerThirdSettingsModal
        open={lowerThirdSettingsOpen}
        onClose={() => setLowerThirdSettingsOpen(false)}
        effective={effectiveLowerThird}
        state={lowerThirdSettings.controlState}
        onChange={lowerThirdSettings.onChange}
        onShowToggle={lowerThirdSettings.onShowToggle}
        showReference={activeTheme.showReference}
        showVersion={activeTheme.showVersion}
        showVerseNumbers={activeTheme.showVerseNumbers}
      />
    </section>
  );
}
