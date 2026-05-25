import { StagingPreview } from "@/components/presentation/StagingPreview";
import { cn } from "@/lib/utils";
import { previewDetectedScripture } from "@/lib/transcriptionLive";
import { usePresentationStore } from "@/stores/presentationStore";
import { useTranscriptionStore } from "@/stores/transcriptionStore";
import { useThemeStore } from "@/stores/themeStore";
import {
  Layers,
  Maximize2,
  PanelBottom,
  Radio,
  RotateCcw,
  Zap,
} from "lucide-react";

export function ListenPreviewPanel() {
  const preview = usePresentationStore((s) => s.preview);
  const program = usePresentationStore((s) => s.program);
  const previewSource = usePresentationStore((s) => s.previewSource);
  const goLive = usePresentationStore((s) => s.goLive);
  const clear = usePresentationStore((s) => s.clear);

  const previewLayout = useTranscriptionStore((s) => s.previewLayout);
  const setPreviewLayout = useTranscriptionStore((s) => s.setPreviewLayout);
  const selectedSuggestionId = useTranscriptionStore((s) => s.selectedSuggestionId);
  const suggestions = useTranscriptionStore((s) => s.suggestions);
  const rescanTranscript = useTranscriptionStore((s) => s.rescanTranscript);
  const scanning = useTranscriptionStore((s) => s.scanning);

  const activeTheme = useThemeStore((s) => s.activeTheme);
  const selected = suggestions.find((s) => s.id === selectedSuggestionId) ?? suggestions.find((s) => s.status !== "ignored");

  const previewActive = previewSource === "transcription" && preview != null;

  const refreshSelectedPreview = async () => {
    if (!selected) return;
    await previewDetectedScripture(selected, previewLayout);
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-xl border border-[var(--color-border)] bg-[#0a0c12]">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] px-4 py-2.5">
        <div>
          <h2 className="section-label">Staging preview</h2>
          <p className="text-[10px] text-[var(--color-subtle)]">
            {selected ? `${selected.reference} · ${selected.translationAbbr}` : "Select a detected reference"}
          </p>
        </div>
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

      <div className="min-h-0 flex-1 p-4">
        <StagingPreview
          scene={previewActive ? preview : null}
          themeOverride={activeTheme}
          label={previewActive ? "Ready for GO LIVE" : selected ? `${selected.reference} — click Preview` : "Preview a detected scripture"}
          className="h-full min-h-[420px]"
        />
      </div>

      <div className="border-t border-[var(--color-border)] px-4 py-3">
        <div className="mb-3 grid grid-cols-2 gap-2 text-[10px]">
          <div className="rounded-lg border border-blue-500/30 bg-blue-950/15 px-2.5 py-2">
            <p className="mb-0.5 uppercase tracking-wide text-blue-300/80">Preview</p>
            <p className="truncate text-[var(--color-foreground)]">
              {preview?.content.reference ?? preview?.content.title ?? "Empty"}
            </p>
          </div>
          <div className="rounded-lg border border-red-500/30 bg-red-950/15 px-2.5 py-2">
            <p className="mb-0.5 uppercase tracking-wide text-red-300/80">Program</p>
            <p className="truncate text-[var(--color-foreground)]">
              {program?.content.reference ?? program?.content.title ?? "Empty"}
            </p>
          </div>
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
          <button type="button" disabled={!previewActive} onClick={() => void goLive()} className="go-live-btn !w-auto flex-1 min-w-[140px] !py-2.5 !text-[12px]">
            <Zap className="h-4 w-4 fill-current" />
            GO LIVE
          </button>
          <button type="button" onClick={clear} className="control-btn">
            Clear
          </button>
          <button type="button" disabled={scanning} onClick={() => void rescanTranscript()} className="control-btn">
            <RotateCcw className={cn("h-3.5 w-3.5", scanning && "animate-spin")} />
            Rescan
          </button>
        </div>

        <p className="mt-2 flex items-center gap-1.5 text-[10px] text-[var(--color-subtle)]">
          <Radio className="h-3 w-3" />
          Auto project sends detected scripture to preview and program. Turn off for manual GO LIVE.
        </p>
      </div>
    </section>
  );
}
