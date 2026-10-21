import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { tauriInvoke } from "@/lib/tauri";
import {
  downloadPercent,
  downloadStatusText,
  formatBytes,
  WHISPER_DOWNLOAD_EVENT,
  type WhisperDownloadProgress,
  type WhisperModelInfo,
} from "@/lib/transcription/whisperModels";
import {
  EMPTY_ENGINE_CONFIG,
  loadStoredEngineConfig,
  saveStoredEngineConfig,
  type StoredEngineConfig,
} from "@/lib/transcription/engineConfig";
import { DEFAULT_GEMINI_MODEL } from "@/lib/transcription/geminiProtocol";
import { TRANSCRIPTION_MODELS } from "@/lib/transcription/types";
import { useTranscriptionStore } from "@/stores/transcriptionStore";
import { cn } from "@/lib/utils";

interface TranscriptionEnginePanelProps {
  embedded?: boolean;
}

const inputClass =
  "h-8 w-full rounded-md border border-[var(--color-border-light)] bg-[var(--color-panel)] px-2 text-[11px]";
const labelClass = "mb-1 block text-[10px] uppercase tracking-wide text-[var(--color-subtle)]";

export function TranscriptionEnginePanel({ embedded }: TranscriptionEnginePanelProps) {
  const modelId = useTranscriptionStore((s) => s.modelId);
  const setModelId = useTranscriptionStore((s) => s.setModelId);

  const [config, setConfig] = useState<StoredEngineConfig>(EMPTY_ENGINE_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [catalog, setCatalog] = useState<WhisperModelInfo[]>([]);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [progress, setProgress] = useState<WhisperDownloadProgress | null>(null);
  // The download finishes outside React's render, so read the latest config from a ref
  // rather than closing over a stale copy.
  const configRef = useRef(config);
  configRef.current = config;

  useEffect(() => {
    void tauriInvoke<WhisperModelInfo[]>("list_whisper_models")
      .then(setCatalog)
      .catch(() => setCatalog([]));
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen<WhisperDownloadProgress>(WHISPER_DOWNLOAD_EVENT, (event) => {
      setProgress(event.payload);
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadStoredEngineConfig().then((stored) => {
      if (cancelled) return;
      setConfig(stored);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const patch = (next: Partial<StoredEngineConfig>) => {
    setConfig((current) => ({ ...current, ...next }));
    setMessage(null);
  };

  const save = async () => {
    setSaving(true);
    try {
      const saved = await saveStoredEngineConfig(config);
      setConfig(saved);
      setMessage("Saved.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not save engine settings.");
    } finally {
      setSaving(false);
    }
  };

  const downloadModel = async (model: WhisperModelInfo) => {
    setDownloadingId(model.id);
    setProgress({ modelId: model.id, received: 0, total: model.sizeBytes });
    setMessage(null);
    try {
      const path = await tauriInvoke<string>("download_whisper_model", { modelId: model.id });
      // Select it straight away — a downloaded model nobody pointed at helps no one.
      const next = { ...configRef.current, whisperModelPath: path };
      setConfig(next);
      await saveStoredEngineConfig(next);
      setMessage(`${model.label} ready.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err ?? "Download failed."));
    } finally {
      setDownloadingId(null);
      setProgress(null);
    }
  };

  const cancelDownload = async () => {
    try {
      await tauriInvoke("cancel_whisper_download");
    } catch {
      // Nothing running, or no backend — the download state clears either way.
    }
  };

  const browseForModel = async () => {
    try {
      const picked = await open({
        multiple: false,
        directory: false,
        filters: [{ name: "Whisper model", extensions: ["bin", "gguf"] }],
      });
      if (typeof picked === "string") patch({ whisperModelPath: picked });
    } catch {
      setMessage("Could not open the file picker.");
    }
  };

  const active = TRANSCRIPTION_MODELS.find((m) => m.id === modelId);

  return (
    <div className={cn("space-y-4", !embedded && "rounded-xl border border-[var(--color-border)] bg-[#0a0c12] p-4")}>
      <div>
        <label className={labelClass} htmlFor="engine-select">
          Engine used for transcription
        </label>
        <select
          id="engine-select"
          value={modelId}
          onChange={(e) => setModelId(e.target.value)}
          className={inputClass}
        >
          {TRANSCRIPTION_MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        {active && (
          <p className="mt-1 text-[10px] leading-snug text-[var(--color-subtle)]">{active.description}</p>
        )}
      </div>

      <div className="space-y-2 rounded-lg border border-[var(--color-border-light)] p-3">
        <p className="text-[11px] font-semibold text-[var(--color-muted-foreground)]">Gemini Transcribe Live</p>
        <div>
          <label className={labelClass} htmlFor="gemini-key">
            API key
          </label>
          <input
            id="gemini-key"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={config.geminiApiKey}
            onChange={(e) => patch({ geminiApiKey: e.target.value })}
            placeholder={loading ? "Loading…" : "Paste a paid-tier API key"}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="gemini-model">
            Model override
          </label>
          <input
            id="gemini-model"
            value={config.geminiModel}
            onChange={(e) => patch({ geminiModel: e.target.value })}
            placeholder={DEFAULT_GEMINI_MODEL}
            className={inputClass}
          />
        </div>
        <p className="text-[10px] leading-snug text-amber-300/90">
          Use a paid-tier key. On the free tier Google may use the audio to improve its products,
          and human reviewers may read it — wrong for sermon and congregation audio. The key is
          stored in this app database on this machine, not in browser storage.
        </p>
      </div>

      <div className="space-y-2 rounded-lg border border-[var(--color-border-light)] p-3">
        <p className="text-[11px] font-semibold text-[var(--color-muted-foreground)]">Whisper (offline)</p>

        <div className="space-y-1.5">
          {catalog.map((model) => {
            const installed =
              config.whisperModelPath.length > 0 &&
              config.whisperModelPath.endsWith(model.filename);
            const busy = downloadingId === model.id;
            return (
              <div
                key={model.id}
                className="rounded-md border border-[var(--color-border-light)] p-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[11px] text-[var(--color-foreground)]">
                      {model.label}{" "}
                      <span className="text-[var(--color-subtle)]">
                        · {formatBytes(model.sizeBytes)}
                      </span>
                    </p>
                    <p className="truncate text-[10px] text-[var(--color-subtle)]">{model.note}</p>
                  </div>
                  {installed ? (
                    <span className="shrink-0 text-[10px] font-medium text-emerald-400">In use</span>
                  ) : busy ? (
                    <button
                      type="button"
                      onClick={() => void cancelDownload()}
                      className="control-btn shrink-0 text-[10px]"
                    >
                      Cancel
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={downloadingId !== null}
                      onClick={() => void downloadModel(model)}
                      className="control-btn shrink-0 text-[10px]"
                    >
                      Download
                    </button>
                  )}
                </div>
                {busy && progress?.modelId === model.id && (
                  <div className="mt-1.5">
                    <div className="h-1 w-full overflow-hidden rounded bg-[var(--color-panel)]">
                      <div
                        className="h-full bg-emerald-500 transition-[width] duration-200"
                        style={{ width: `${downloadPercent(progress.received, progress.total)}%` }}
                      />
                    </div>
                    <p className="mt-1 text-[10px] text-[var(--color-subtle)]">
                      {downloadStatusText(progress)}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div>
          <label className={labelClass} htmlFor="whisper-path">
            Model file
          </label>
          <div className="flex gap-2">
            <input
              id="whisper-path"
              value={config.whisperModelPath}
              onChange={(e) => patch({ whisperModelPath: e.target.value })}
              placeholder="e.g. ggml-base.en.bin"
              className={inputClass}
            />
            <button type="button" onClick={() => void browseForModel()} className="control-btn shrink-0 text-[10px]">
              Browse…
            </button>
          </div>
        </div>
        <p className="text-[10px] leading-snug text-[var(--color-subtle)]">
          Runs entirely on this machine, so it keeps working when the internet drops and the audio
          never leaves the building. Downloads land in the app data folder and are selected
          automatically; the file picker is there for a model you already have.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <button type="button" onClick={() => void save()} disabled={saving || loading} className="control-btn text-[11px]">
          {saving ? "Saving…" : "Save engine settings"}
        </button>
        {message && <span className="text-[10px] text-[var(--color-subtle)]">{message}</span>}
      </div>
    </div>
  );
}
