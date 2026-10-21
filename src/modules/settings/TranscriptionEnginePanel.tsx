import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
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
          Runs entirely on this machine, so it keeps working when the internet drops. Download a
          ggml Whisper model once and point at the file. Larger models are more accurate and slower.
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
