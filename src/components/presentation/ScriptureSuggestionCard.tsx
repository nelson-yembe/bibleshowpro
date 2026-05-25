import {
  BookOpen,
  Eye,
  EyeOff,
  ListPlus,
  MoreHorizontal,
  Volume2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { previewDetectedScripture, queueDetectedScripture } from "@/lib/transcriptionLive";
import type { ConfidenceLevel, ScriptureSuggestion } from "@/lib/transcription/types";
import { useTranscriptionStore } from "@/stores/transcriptionStore";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { useBibleStore } from "@/stores/bibleStore";
import { api } from "@/lib/tauri";

const confidenceStyles: Record<ConfidenceLevel, string> = {
  high: "border-emerald-500/40 bg-emerald-950/20",
  medium: "border-amber-500/35 bg-amber-950/15",
  low: "border-[var(--color-border-light)] bg-[var(--color-panel)] opacity-80",
};

const typeLabels = {
  explicit: "Explicit reference",
  paraphrase: "Possible paraphrase",
  quote: "Possible quote",
  topic: "Topic suggestion",
} as const;

interface ScriptureSuggestionCardProps {
  suggestion: ScriptureSuggestion;
  selected?: boolean;
  onSelect?: () => void;
}

export function ScriptureSuggestionCard({ suggestion, selected, onSelect }: ScriptureSuggestionCardProps) {
  const navigate = useNavigate();
  const markStatus = useTranscriptionStore((s) => s.markSuggestionStatus);
  const previewLayout = useTranscriptionStore((s) => s.previewLayout);
  const ignore = useTranscriptionStore((s) => s.ignoreSuggestion);
  const [busy, setBusy] = useState(false);
  const [showAlternatives, setShowAlternatives] = useState(false);

  if (suggestion.status === "ignored") return null;

  const preview = async () => {
    setBusy(true);
    try {
      onSelect?.();
      await previewDetectedScripture(suggestion, previewLayout);
      markStatus(suggestion.id, "preview");
    } finally {
      setBusy(false);
    }
  };

  const queue = async () => {
    setBusy(true);
    try {
      await queueDetectedScripture(suggestion);
      markStatus(suggestion.id, "queued");
    } finally {
      setBusy(false);
    }
  };

  const openInSearch = () => {
    const bible = useBibleStore.getState();
    bible.setQuery(suggestion.reference);
    navigate("/bible");
    void bible.search(suggestion.reference);
  };

  const loadAlternative = async (reference: string) => {
    setBusy(true);
    try {
      const translationId = useBibleStore.getState().selectedTranslationId;
      const result = await api.lookupReference(reference, translationId);
      const verses = result.search.verses;
      if (verses.length === 0) return;
      const alt: ScriptureSuggestion = {
        ...suggestion,
        reference,
        verses,
        versePreview: verses[0]?.text ?? "",
        translationAbbr: verses[0]?.translation_abbr ?? suggestion.translationAbbr,
        confidence: Math.max(0.5, suggestion.confidence - 0.1),
        confidenceLevel: "medium",
        detectionType: "explicit",
      };
      await previewDetectedScripture(alt, previewLayout);
      markStatus(suggestion.id, "preview");
    } finally {
      setBusy(false);
    }
  };

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => e.key === "Enter" && onSelect?.()}
      className={cn(
        "cursor-pointer rounded-lg border p-3 transition-colors",
        confidenceStyles[suggestion.confidenceLevel],
        selected && "ring-2 ring-[var(--color-primary)]",
        suggestion.status === "preview" && "ring-1 ring-blue-400/50",
        suggestion.status === "queued" && "ring-1 ring-violet-400/40",
      )}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-[var(--color-subtle)]">
            {typeLabels[suggestion.detectionType]}
          </p>
          <h3 className="text-sm font-semibold text-[var(--color-foreground)]">{suggestion.reference}</h3>
          <p className="text-[10px] text-[var(--color-muted-foreground)]">
            {suggestion.translationAbbr} · {Math.round(suggestion.confidence * 100)}% confidence
          </p>
        </div>
        <button
          type="button"
          onClick={() => ignore(suggestion.id)}
          className="rounded p-1 text-[var(--color-subtle)] hover:bg-black/20 hover:text-[var(--color-foreground)]"
          title="Ignore"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <p className="mb-1 line-clamp-2 text-[11px] italic text-[var(--color-muted-foreground)]">
        “{suggestion.detectedPhrase.slice(0, 120)}{suggestion.detectedPhrase.length > 120 ? "…" : ""}”
      </p>
      <p className="mb-3 line-clamp-3 text-[12px] leading-snug text-[var(--color-foreground)]">
        {suggestion.versePreview}
      </p>

      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation();
            void preview();
          }}
          className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1.5 text-[11px] font-medium text-white hover:bg-blue-500 disabled:opacity-50"
        >
          <Eye className="h-3 w-3" />
          Preview
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation();
            void queue();
          }}
          className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border-light)] px-2.5 py-1.5 text-[11px] text-[var(--color-foreground)] hover:bg-[var(--color-panel)] disabled:opacity-50"
        >
          <ListPlus className="h-3 w-3" />
          Queue
        </button>
        {suggestion.alternatives.length > 0 && (
          <button
            type="button"
            onClick={() => setShowAlternatives((v) => !v)}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-[11px] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
          >
            <MoreHorizontal className="h-3 w-3" />
            Alternatives
          </button>
        )}
        <button
          type="button"
          onClick={openInSearch}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-[11px] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
        >
          <BookOpen className="h-3 w-3" />
          Search
        </button>
      </div>

      {showAlternatives && suggestion.alternatives.length > 0 && (
        <div className="mt-2 space-y-1 border-t border-[var(--color-border-light)] pt-2">
          {suggestion.alternatives.map((alt) => (
            <button
              key={alt}
              type="button"
              disabled={busy}
              onClick={() => void loadAlternative(alt)}
              className="block w-full rounded px-2 py-1 text-left text-[11px] text-[var(--color-muted-foreground)] hover:bg-black/20 hover:text-[var(--color-foreground)]"
            >
              {alt}
            </button>
          ))}
        </div>
      )}
    </article>
  );
}

export function SuggestionsMuteToggle() {
  const muted = useTranscriptionStore((s) => s.suggestionsMuted);
  const setMuted = useTranscriptionStore((s) => s.setSuggestionsMuted);
  return (
    <button
      type="button"
      onClick={() => setMuted(!muted)}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px]",
        muted
          ? "border-amber-500/40 text-amber-300"
          : "border-[var(--color-border-light)] text-[var(--color-muted-foreground)]",
      )}
      title={muted ? "Suggestions muted" : "Mute suggestions"}
    >
      {muted ? <EyeOff className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
      {muted ? "Muted" : "Detecting"}
    </button>
  );
}
