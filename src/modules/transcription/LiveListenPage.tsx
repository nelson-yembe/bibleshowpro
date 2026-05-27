import { ListenPreviewPanel } from "@/components/presentation/ListenPreviewPanel";
import {
  ScriptureSuggestionCard,
  SuggestionsMuteToggle,
} from "@/components/presentation/ScriptureSuggestionCard";
import { TopBar } from "@/components/layout/TopBar";
import { cn } from "@/lib/utils";
import { exportScriptureList, exportTranscriptText } from "@/lib/transcription/referenceDetect";
import { formatTranscriptProse } from "@/lib/transcription/transcriptFormat";
import { formatElapsed, TRANSCRIPTION_MODELS, type ConfidenceLevel } from "@/lib/transcription/types";
import { useTranscriptionStore } from "@/stores/transcriptionStore";
import { useBibleStore } from "@/stores/bibleStore";
import {
  Mic,
  MicOff,
  Pause,
  Play,
  Save,
  Search,
  Square,
  Trash2,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const statusLabels = {
  idle: "Not listening",
  listening: "Listening",
  paused: "Paused",
  stopped: "Stopped",
  processing: "Detecting scripture…",
  reconnecting: "Reconnecting…",
  unavailable: "Unavailable",
} as const;

export function LiveListenPage() {
  const [transcriptSearch, setTranscriptSearch] = useState("");
  const [manualReference, setManualReference] = useState("");
  const [saveTitle, setSaveTitle] = useState("");
  const [showSaveDialog, setShowSaveDialog] = useState(false);

  const bible = useBibleStore();
  const {
    status,
    partialText,
    segments,
    suggestions,
    selectedSuggestionId,
    modelId,
    models,
    audioDevices,
    audioDeviceId,
    audioLevel,
    audioWarning,
    paraphraseEnabled,
    minConfidence,
    lastScanAt,
    scanning,
    elapsedMs,
    error,
    saving,
    init,
    refreshAudioDevices,
    setModelId,
    setAudioDeviceId,
    setParaphraseEnabled,
    setMinConfidence,
    setSelectedSuggestion,
    startListening,
    pauseListening,
    resumeListening,
    stopListening,
    rescanTranscript,
    lookupManualReference,
    saveSession,
    discardSession,
    tickElapsed,
  } = useTranscriptionStore();

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    const timer = window.setInterval(() => tickElapsed(), 1000);
    return () => window.clearInterval(timer);
  }, [tickElapsed]);

  const model = models.find((m) => m.id === modelId) ?? models[0];
  const activeSuggestions = suggestions.filter((s) => s.status !== "ignored");
  const transcriptProse = useMemo(
    () => formatTranscriptProse(segments, partialText),
    [segments, partialText],
  );

  const filteredProse = useMemo(() => {
    const q = transcriptSearch.trim().toLowerCase();
    if (!q) return transcriptProse;
    return transcriptProse.toLowerCase().includes(q) ? transcriptProse : "";
  }, [transcriptProse, transcriptSearch]);

  const handleStart = () => {
    if (status === "paused") {
      resumeListening();
      return;
    }
    void startListening();
  };

  const handleSave = async () => {
    const id = await saveSession(saveTitle);
    if (id) {
      setShowSaveDialog(false);
      setSaveTitle("");
    }
  };

  const exportTranscript = () => {
    const text = exportTranscriptText(segments);
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sermon-transcript-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportReferences = () => {
    const text = exportScriptureList(suggestions);
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sermon-scriptures-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const isListening = status === "listening" || status === "processing" || status === "reconnecting";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TopBar
        breadcrumbs={["Live Listen", "Transcription & scripture detection"]}
        status={isListening ? "live" : "ready"}
        actions={
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                isListening && "bg-red-500/20 text-red-300",
                status === "paused" && "bg-amber-500/20 text-amber-300",
                (status === "idle" || status === "stopped") && "bg-[var(--color-panel)] text-[var(--color-subtle)]",
              )}
            >
              {isListening ? "● " : ""}
              {statusLabels[status] ?? status}
            </span>
            {elapsedMs > 0 && (
              <span className="text-[11px] tabular-nums text-[var(--color-muted-foreground)]">
                {formatElapsed(elapsedMs)}
              </span>
            )}
            {lastScanAt && (
              <span className="text-[10px] text-[var(--color-subtle)]">Scan {lastScanAt}</span>
            )}
          </div>
        }
      />

      {/* Session toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] bg-[#080a0f] px-4 py-2">
        {isListening ? (
          <>
            <button type="button" onClick={pauseListening} className="control-btn">
              <Pause className="h-3.5 w-3.5" />
              Pause
            </button>
            <button type="button" onClick={stopListening} className="control-btn-danger">
              <Square className="h-3.5 w-3.5" />
              Stop
            </button>
          </>
        ) : status === "paused" ? (
          <>
            <button type="button" onClick={handleStart} className="control-btn-primary">
              <Play className="h-3.5 w-3.5" />
              Resume
            </button>
            <button type="button" onClick={stopListening} className="control-btn-danger">
              <Square className="h-3.5 w-3.5" />
              Stop
            </button>
          </>
        ) : (
          <button type="button" onClick={handleStart} className="control-btn-primary">
            <Mic className="h-3.5 w-3.5" />
            Start listening
          </button>
        )}

        {(status === "stopped" || segments.length > 0) && (
          <>
            <button type="button" onClick={() => setShowSaveDialog(true)} disabled={saving || segments.length === 0} className="control-btn">
              <Save className="h-3.5 w-3.5" />
              Save
            </button>
            <button type="button" onClick={discardSession} className="control-btn">
              <Trash2 className="h-3.5 w-3.5" />
              Discard
            </button>
          </>
        )}

        <SuggestionsMuteToggle />
        <div className="ml-auto flex items-center gap-2">
          <div className="hidden h-2 w-24 overflow-hidden rounded-full bg-black/40 sm:block">
            <div
              className={cn(
                "h-full transition-all duration-75",
                audioLevel > 0.9 ? "bg-red-500" : audioLevel > 0.02 ? "bg-emerald-500" : "bg-[var(--color-subtle)]",
              )}
              style={{ width: `${Math.round(audioLevel * 100)}%` }}
            />
          </div>
          <span className="text-[10px] text-[var(--color-subtle)]">
            {bible.translations.find((t) => t.id === bible.selectedTranslationId)?.abbreviation ?? "Bible"}
          </span>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 p-3 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.3fr)_minmax(0,0.95fr)] lg:p-4">
        {/* Left: transcript + settings */}
        <div className="flex min-h-0 flex-col gap-3">
          <section className="flex min-h-[240px] flex-1 flex-col rounded-xl border border-[var(--color-border)] bg-[#0a0c12] lg:min-h-0">
            <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-3 py-2">
              <h2 className="section-label flex-1">Live transcript</h2>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--color-subtle)]" />
                <input
                  value={transcriptSearch}
                  onChange={(e) => setTranscriptSearch(e.target.value)}
                  placeholder="Search"
                  className="h-7 w-28 rounded-md border border-[var(--color-border-light)] bg-[var(--color-panel)] pl-7 pr-2 text-[11px]"
                />
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {!transcriptProse && !isListening && (
                <p className="text-[12px] leading-relaxed text-[var(--color-subtle)]">
                  Transcript appears here as continuous sentences. Scripture references are detected automatically — try
                  saying “Romans 8 28” or “John chapter 3 verse 16”.
                </p>
              )}
              {filteredProse ? (
                <p className="whitespace-pre-wrap text-[14px] leading-[1.75] text-[var(--color-foreground)]">
                  {filteredProse}
                </p>
              ) : transcriptSearch.trim() ? (
                <p className="text-[12px] text-[var(--color-subtle)]">No transcript matches your search.</p>
              ) : isListening ? (
                <p className="text-[13px] italic text-[var(--color-muted-foreground)]">Listening…</p>
              ) : null}
            </div>
          </section>

          <section className="rounded-xl border border-[var(--color-border)] bg-[#0a0c12] p-3">
            <h2 className="section-label mb-2">Detection settings</h2>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1 block text-[10px] uppercase tracking-wide text-[var(--color-subtle)]">Audio</span>
                <select
                  value={audioDeviceId ?? ""}
                  onChange={(e) => setAudioDeviceId(e.target.value || null)}
                  disabled={isListening}
                  className="h-8 w-full rounded-md border border-[var(--color-border-light)] bg-[var(--color-panel)] px-2 text-[11px]"
                >
                  {audioDevices.length === 0 && <option value="">Default mic</option>}
                  {audioDevices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || `Mic ${d.deviceId.slice(0, 6)}`}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] uppercase tracking-wide text-[var(--color-subtle)]">Model</span>
                <select
                  value={modelId}
                  onChange={(e) => setModelId(e.target.value)}
                  disabled={isListening}
                  className="h-8 w-full rounded-md border border-[var(--color-border-light)] bg-[var(--color-panel)] px-2 text-[11px]"
                >
                  {TRANSCRIPTION_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="mt-1 text-[10px] text-[var(--color-subtle)]">
              Live transcription uses your system default microphone. Use Refresh mics after plugging in hardware.
            </p>
            <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-[var(--color-muted-foreground)]">
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={paraphraseEnabled} onChange={(e) => setParaphraseEnabled(e.target.checked)} />
                Paraphrase matching
              </label>
            </div>
            <label className="mt-2 block">
              <span className="mb-1 block text-[10px] uppercase tracking-wide text-[var(--color-subtle)]">Min confidence</span>
              <select
                value={minConfidence}
                onChange={(e) => setMinConfidence(e.target.value as ConfidenceLevel)}
                className="h-8 w-full rounded-md border border-[var(--color-border-light)] bg-[var(--color-panel)] px-2 text-[11px]"
              >
                <option value="low">Low and above</option>
                <option value="medium">Medium and above</option>
                <option value="high">High only</option>
              </select>
            </label>
            {audioWarning === "Input clipping — lower gain." && (
              <p className="mt-2 text-[10px] text-amber-400">{audioWarning}</p>
            )}
            <p className="mt-2 inline-flex items-center gap-1 text-[10px] text-[var(--color-subtle)]">
              {model?.requiresInternet ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
              {model?.requiresInternet ? "Internet required" : "Local preferred"}
            </p>
          </section>
        </div>

        {/* Center: large preview */}
        <ListenPreviewPanel />

        {/* Right: suggestions + manual lookup */}
        <div className="flex min-h-0 flex-col gap-3">
          <section className="rounded-xl border border-[var(--color-border)] bg-[#0a0c12] p-3">
            <h2 className="section-label mb-2">Manual reference</h2>
            <div className="flex gap-2">
              <input
                value={manualReference}
                onChange={(e) => setManualReference(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void lookupManualReference(manualReference)}
                placeholder="e.g. Romans 8:28"
                className="h-9 min-w-0 flex-1 rounded-md border border-[var(--color-border-light)] bg-[var(--color-panel)] px-3 text-[12px]"
              />
              <button
                type="button"
                disabled={scanning || !manualReference.trim()}
                onClick={() => void lookupManualReference(manualReference)}
                className="control-btn-primary shrink-0"
              >
                Lookup
              </button>
            </div>
          </section>

          <section className="flex min-h-0 flex-1 flex-col rounded-xl border border-[var(--color-border)] bg-[#0a0c12]">
            <div className="flex items-center justify-between border-b border-[var(--color-border)] px-3 py-2">
              <h2 className="section-label">Scripture suggestions</h2>
              <span className="text-[10px] text-[var(--color-subtle)]">
                {scanning ? "Scanning…" : `${activeSuggestions.length} found`}
              </span>
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
              {activeSuggestions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center text-[var(--color-subtle)]">
                  <MicOff className="mb-2 h-8 w-8 opacity-40" />
                  <p className="text-sm">No scripture detected yet</p>
                  <p className="mt-1 max-w-xs text-[11px]">
                    Say a reference like “Romans 8 28”, use manual lookup, or press Rescan in the preview panel.
                  </p>
                </div>
              ) : (
                activeSuggestions.map((s) => (
                  <ScriptureSuggestionCard
                    key={s.id}
                    suggestion={s}
                    selected={s.id === selectedSuggestionId}
                    onSelect={() => setSelectedSuggestion(s.id)}
                  />
                ))
              )}
            </div>
          </section>

          {(segments.length > 0 || suggestions.length > 0) && (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={exportTranscript} className="control-btn text-[11px]">
                Export transcript
              </button>
              <button type="button" onClick={exportReferences} className="control-btn text-[11px]">
                Export scriptures
              </button>
              <button type="button" onClick={() => void refreshAudioDevices(true)} className="control-btn text-[11px]">
                Refresh mics
              </button>
              <button type="button" disabled={scanning} onClick={() => void rescanTranscript()} className="control-btn text-[11px]">
                Rescan all
              </button>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="border-t border-red-900/40 bg-red-950/20 px-4 py-2 text-[11px] text-red-300">{error}</div>
      )}

      {showSaveDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-[var(--color-border)] bg-[#0f1219] p-4 shadow-xl">
            <h3 className="mb-2 text-sm font-semibold text-[var(--color-foreground)]">Save listening session</h3>
            <input
              value={saveTitle}
              onChange={(e) => setSaveTitle(e.target.value)}
              placeholder="Session title (optional)"
              className="mb-3 h-9 w-full rounded-md border border-[var(--color-border-light)] bg-[var(--color-panel)] px-3 text-sm"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowSaveDialog(false)} className="control-btn">
                Cancel
              </button>
              <button type="button" disabled={saving} onClick={() => void handleSave()} className="control-btn-primary">
                {saving ? "Saving…" : "Save session"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
