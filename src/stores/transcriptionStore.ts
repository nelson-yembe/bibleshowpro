import { create } from "zustand";
import { api } from "@/lib/tauri";
import {
  buildDetectionContext,
  clearReferenceDedupeCache,
  detectScriptureFromText,
} from "@/lib/transcription/referenceDetect";
import { presentDetectedScripture, previewDetectedScripture } from "@/lib/transcriptionLive";
import {
  AudioLevelMonitor,
  listAudioInputDevices,
  WebSpeechTranscriptionEngine,
} from "@/lib/transcription/webSpeechProvider";
import {
  TRANSCRIPTION_MODELS,
  type ListeningStatus,
  type ScriptureSuggestion,
  type TranscriptSegment,
  type TranscriptionModel,
  type ConfidenceLevel,
} from "@/lib/transcription/types";
import { useBibleStore } from "@/stores/bibleStore";

const SESSION_STORAGE_KEY = "bsp-transcription-session";
const PARTIAL_SCAN_MS = 700;

interface PersistedSession {
  sessionId: string | null;
  startedAt: number | null;
  modelId: string;
  audioDeviceId: string | null;
  segments: TranscriptSegment[];
  suggestions: ScriptureSuggestion[];
  paraphraseEnabled: boolean;
  suggestionsMuted: boolean;
  autoPreviewHigh: boolean;
  autoProject: boolean;
  previewLayout: "fullscreen" | "lower_third";
  minConfidence: ConfidenceLevel;
}

interface TranscriptionState {
  status: ListeningStatus;
  sessionId: string | null;
  startedAt: number | null;
  elapsedMs: number;
  partialText: string;
  segments: TranscriptSegment[];
  suggestions: ScriptureSuggestion[];
  selectedSuggestionId: string | null;
  models: TranscriptionModel[];
  modelId: string;
  audioDevices: MediaDeviceInfo[];
  audioDeviceId: string | null;
  audioLevel: number;
  audioWarning: string | null;
  paraphraseEnabled: boolean;
  suggestionsMuted: boolean;
  autoPreviewHigh: boolean;
  autoProject: boolean;
  previewLayout: "fullscreen" | "lower_third";
  minConfidence: ConfidenceLevel;
  lastScanAt: string | null;
  scanning: boolean;
  error: string | null;
  saving: boolean;

  init: () => Promise<void>;
  refreshAudioDevices: () => Promise<void>;
  setModelId: (id: string) => void;
  setAudioDeviceId: (id: string | null) => void;
  setParaphraseEnabled: (enabled: boolean) => void;
  setSuggestionsMuted: (muted: boolean) => void;
  setAutoPreviewHigh: (enabled: boolean) => void;
  setAutoProject: (enabled: boolean) => void;
  setPreviewLayout: (layout: "fullscreen" | "lower_third") => void;
  setMinConfidence: (level: ConfidenceLevel) => void;
  setSelectedSuggestion: (id: string | null) => void;
  startListening: () => Promise<void>;
  pauseListening: () => void;
  resumeListening: () => void;
  stopListening: () => void;
  rescanTranscript: () => Promise<void>;
  lookupManualReference: (reference: string) => Promise<void>;
  saveSession: (title?: string) => Promise<string | null>;
  discardSession: () => void;
  ignoreSuggestion: (id: string) => void;
  markSuggestionStatus: (id: string, status: ScriptureSuggestion["status"]) => void;
  tickElapsed: () => void;
  restorePersistedSession: () => void;
}

let engine: WebSpeechTranscriptionEngine | null = null;
let levelMonitor: AudioLevelMonitor | null = null;
let segmentCounter = 0;
let partialScanTimer: number | undefined;

function loadPersistedSession(): PersistedSession | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedSession;
  } catch {
    return null;
  }
}

function persistSession(state: Pick<
  TranscriptionState,
  | "sessionId"
  | "startedAt"
  | "modelId"
  | "audioDeviceId"
  | "segments"
  | "suggestions"
  | "paraphraseEnabled"
  | "suggestionsMuted"
  | "autoPreviewHigh"
  | "autoProject"
  | "previewLayout"
  | "minConfidence"
>) {
  const payload: PersistedSession = {
    sessionId: state.sessionId,
    startedAt: state.startedAt,
    modelId: state.modelId,
    audioDeviceId: state.audioDeviceId,
    segments: state.segments,
    suggestions: state.suggestions,
    paraphraseEnabled: state.paraphraseEnabled,
    suggestionsMuted: state.suggestionsMuted,
    autoPreviewHigh: state.autoPreviewHigh,
    autoProject: state.autoProject,
    previewLayout: state.previewLayout,
    minConfidence: state.minConfidence,
  };
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(payload));
}

function clearPersistedSession() {
  localStorage.removeItem(SESSION_STORAGE_KEY);
}

function timestampNow() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function newSegmentId() {
  segmentCounter += 1;
  return `seg-${Date.now()}-${segmentCounter}`;
}

function newSuggestionId() {
  return `sug-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function resolveTranslationId(): string {
  const bible = useBibleStore.getState();
  return (
    bible.selectedTranslationId ??
    bible.translations.find((t) => t.is_default)?.id ??
    bible.translations[0]?.id ??
    ""
  );
}

function passesConfidenceFilter(level: ConfidenceLevel, min: ConfidenceLevel): boolean {
  const order: ConfidenceLevel[] = ["low", "medium", "high"];
  return order.indexOf(level) >= order.indexOf(min);
}

async function mergeDetections(
  detected: Omit<ScriptureSuggestion, "id" | "segmentId" | "status" | "createdAt">[],
  segmentId: string | undefined,
  get: () => TranscriptionState,
  set: (partial: Partial<TranscriptionState> | ((s: TranscriptionState) => Partial<TranscriptionState>)) => void,
) {
  if (detected.length === 0) return;

  const state = get();
  const filtered = detected.filter((d) => passesConfidenceFilter(d.confidenceLevel, state.minConfidence));
  if (filtered.length === 0) return;

  const newSuggestions: ScriptureSuggestion[] = filtered.map((d) => ({
    ...d,
    id: newSuggestionId(),
    segmentId,
    status: "pending",
    createdAt: new Date().toISOString(),
  }));

  set((s) => ({
    suggestions: [...newSuggestions, ...s.suggestions],
    segments: segmentId
      ? s.segments.map((seg) => (seg.id === segmentId ? { ...seg, hasDetection: true } : seg))
      : s.segments,
    selectedSuggestionId: newSuggestions[0]?.id ?? s.selectedSuggestionId,
  }));

  if (state.autoProject) {
    const top = newSuggestions.find((s) => s.detectionType === "explicit") ?? newSuggestions[0];
    if (top) {
      await presentDetectedScripture(top, state.previewLayout);
      get().markSuggestionStatus(top.id, "live");
    }
  } else if (state.autoPreviewHigh) {
    const top = newSuggestions.find((s) => s.confidenceLevel === "high");
    if (top) {
      await previewDetectedScripture(top, state.previewLayout);
      get().markSuggestionStatus(top.id, "preview");
    }
  }

  persistSession(get());
}

async function runSegmentScan(
  get: () => TranscriptionState,
  set: (partial: Partial<TranscriptionState> | ((s: TranscriptionState) => Partial<TranscriptionState>)) => void,
  text: string,
  segmentId?: string,
) {
  if (get().suggestionsMuted || text.trim().length < 3) return;

  const translationId = resolveTranslationId();
  if (!translationId) return;

  const existingReferences = get()
    .suggestions.filter((s) => s.status !== "ignored")
    .map((s) => s.reference);

  const detected = await detectScriptureFromText(text.trim(), translationId, {
    paraphraseEnabled: get().paraphraseEnabled,
    existingReferences,
  });
  await mergeDetections(detected, segmentId, get, set);
}

async function runContextScan(
  get: () => TranscriptionState,
  set: (partial: Partial<TranscriptionState> | ((s: TranscriptionState) => Partial<TranscriptionState>)) => void,
  segmentId?: string,
) {
  if (get().suggestionsMuted) return;

  const translationId = resolveTranslationId();
  if (!translationId) {
    set({ error: "No Bible translation loaded — install a Bible version in Settings." });
    return;
  }

  const context = buildDetectionContext(get().segments, get().partialText);
  if (context.length < 3) return;

  set({ scanning: true, lastScanAt: new Date().toLocaleTimeString() });
  try {
    const existingReferences = get()
      .suggestions.filter((s) => s.status !== "ignored")
      .map((s) => s.reference);

    const detected = await detectScriptureFromText(context, translationId, {
      paraphraseEnabled: get().paraphraseEnabled,
      existingReferences,
    });
    await mergeDetections(detected, segmentId, get, set);
  } finally {
    set({ scanning: false });
  }
}

function schedulePartialScan(
  get: () => TranscriptionState,
  set: (partial: Partial<TranscriptionState> | ((s: TranscriptionState) => Partial<TranscriptionState>)) => void,
) {
  window.clearTimeout(partialScanTimer);
  partialScanTimer = window.setTimeout(() => {
    void runContextScan(get, set);
  }, PARTIAL_SCAN_MS);
}

export const useTranscriptionStore = create<TranscriptionState>((set, get) => ({
  status: "idle",
  sessionId: null,
  startedAt: null,
  elapsedMs: 0,
  partialText: "",
  segments: [],
  suggestions: [],
  selectedSuggestionId: null,
  models: TRANSCRIPTION_MODELS,
  modelId: TRANSCRIPTION_MODELS[0]?.id ?? "web-speech",
  audioDevices: [],
  audioDeviceId: null,
  audioLevel: 0,
  audioWarning: null,
  paraphraseEnabled: false,
  suggestionsMuted: false,
  autoPreviewHigh: false,
  autoProject: true,
  previewLayout: "fullscreen",
  minConfidence: "low",
  lastScanAt: null,
  scanning: false,
  error: null,
  saving: false,

  init: async () => {
    await get().refreshAudioDevices();
    const bible = useBibleStore.getState();
    if (!bible.selectedTranslationId) {
      await bible.loadTranslations();
    }
    get().restorePersistedSession();
  },

  refreshAudioDevices: async () => {
    try {
      const devices = await listAudioInputDevices();
      set({ audioDevices: devices });
      if (!get().audioDeviceId && devices[0]?.deviceId) {
        set({ audioDeviceId: devices[0].deviceId });
      }
    } catch {
      set({ audioDevices: [], audioWarning: "Microphone access unavailable." });
    }
  },

  setModelId: (id) => set({ modelId: id }),
  setAudioDeviceId: (id) => set({ audioDeviceId: id }),
  setParaphraseEnabled: (enabled) => {
    set({ paraphraseEnabled: enabled });
    persistSession(get());
  },
  setSuggestionsMuted: (muted) => set({ suggestionsMuted: muted }),
  setAutoPreviewHigh: (enabled) => {
    set({ autoPreviewHigh: enabled });
    persistSession(get());
  },
  setAutoProject: (enabled) => {
    set({ autoProject: enabled });
    persistSession(get());
  },
  setPreviewLayout: (layout) => {
    set({ previewLayout: layout });
    persistSession(get());
  },
  setMinConfidence: (level) => {
    set({ minConfidence: level });
    persistSession(get());
  },
  setSelectedSuggestion: (id) => set({ selectedSuggestionId: id }),

  startListening: async () => {
    const state = get();
    if (state.status === "listening") return;

    if (!engine) engine = new WebSpeechTranscriptionEngine();
    if (!levelMonitor) levelMonitor = new AudioLevelMonitor();

    const model = state.models.find((m) => m.id === state.modelId) ?? state.models[0];
    if (model?.requiresInternet && !navigator.onLine) {
      set({ error: "Selected model requires internet during live service.", status: "unavailable" });
      return;
    }

    clearReferenceDedupeCache();
    const sessionId = state.sessionId ?? crypto.randomUUID();
    const startedAt = state.startedAt ?? Date.now();

    set({
      status: "listening",
      sessionId,
      startedAt,
      error: null,
      partialText: "",
    });

    try {
      await levelMonitor.start(state.audioDeviceId, (level) => {
        let audioWarning: string | null = null;
        if (level < 0.02) audioWarning = "Input silent — check microphone or mixer.";
        else if (level > 0.95) audioWarning = "Input clipping — lower gain.";
        set({ audioLevel: level, audioWarning });
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Could not access audio input.",
        status: "unavailable",
      });
      return;
    }

    engine.start(
      {
        onPartial: (text) => {
          set({ partialText: text });
          schedulePartialScan(get, set);
        },
        onFinal: async (text) => {
          const startedAt = get().startedAt ?? Date.now();
          const offsetMs = Date.now() - startedAt;
          const segment: TranscriptSegment = {
            id: newSegmentId(),
            text,
            isFinal: true,
            offsetMs,
            timestamp: timestampNow(),
          };
          set((s) => ({
            partialText: "",
            segments: [...s.segments, segment],
            status: "processing",
          }));

          await runSegmentScan(get, set, text, segment.id);
          await runContextScan(get, set, segment.id);
          set({ status: "listening" });
          persistSession(get());
        },
        onStatus: (status) => {
          if (status === "reconnecting") set({ status: "reconnecting" });
          else if (status === "listening") set({ status: "listening" });
          else if (status === "paused") set({ status: "paused" });
          else if (status === "stopped") set({ status: "stopped" });
          else if (status === "unavailable") set({ status: "unavailable" });
        },
        onError: (message) => set({ error: message }),
      },
      { modelId: state.modelId },
    );

    persistSession(get());
  },

  pauseListening: () => {
    engine?.pause();
    window.clearTimeout(partialScanTimer);
    set({ status: "paused", partialText: "" });
  },

  resumeListening: () => {
    engine?.resume();
    set({ status: "listening" });
  },

  stopListening: () => {
    engine?.stop();
    void levelMonitor?.stop();
    window.clearTimeout(partialScanTimer);
    set({ status: "stopped", partialText: "", audioLevel: 0, audioWarning: null });
    persistSession(get());
  },

  rescanTranscript: async () => {
    clearReferenceDedupeCache();
    await runContextScan(get, set);
  },

  lookupManualReference: async (reference) => {
    const trimmed = reference.trim();
    if (!trimmed) return;
    const translationId = resolveTranslationId();
    if (!translationId) {
      set({ error: "No Bible translation loaded." });
      return;
    }
    set({ scanning: true });
    try {
      const detected = await detectScriptureFromText(trimmed, translationId, {
        paraphraseEnabled: false,
        existingReferences: get().suggestions.map((s) => s.reference),
      });
      if (detected.length === 0) {
        const lookup = await api.lookupReference(trimmed, translationId);
        if (lookup.search.verses.length === 0) {
          set({ error: `Could not find "${trimmed}" in the active Bible.` });
          return;
        }
        const verses = lookup.search.verses;
        const suggestion: Omit<ScriptureSuggestion, "id" | "segmentId" | "status" | "createdAt"> = {
          detectedPhrase: trimmed,
          reference: trimmed,
          translationId,
          translationAbbr: verses[0]?.translation_abbr ?? "",
          confidence: 1,
          confidenceLevel: "high",
          detectionType: "explicit",
          versePreview: verses[0]?.text ?? "",
          verses,
          alternatives: [],
        };
        await mergeDetections([suggestion], undefined, get, set);
      } else {
        await mergeDetections(detected, undefined, get, set);
      }
      set({ error: null });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Lookup failed." });
    } finally {
      set({ scanning: false });
    }
  },

  saveSession: async (title) => {
    const state = get();
    if (state.segments.length === 0 && state.suggestions.length === 0) return null;
    set({ saving: true });
    try {
      const sessionTitle =
        title?.trim() ||
        `Sermon transcript ${new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
      const id = await api.saveTranscriptionSession({
        id: state.sessionId ?? undefined,
        title: sessionTitle,
        status: "saved",
        modelId: state.modelId,
        audioDeviceId: state.audioDeviceId ?? undefined,
        startedAt: state.startedAt ? new Date(state.startedAt).toISOString() : undefined,
        endedAt: new Date().toISOString(),
        segments: state.segments.map((s) => ({
          id: s.id,
          text: s.text,
          isFinal: s.isFinal,
          offsetMs: s.offsetMs,
        })),
        detections: state.suggestions.map((s) => ({
          id: s.id,
          transcriptSegmentId: s.segmentId,
          detectedPhrase: s.detectedPhrase,
          suggestedReference: s.reference,
          translationId: s.translationId,
          confidence: s.confidence,
          detectionType: s.detectionType,
          status: s.status,
          versePreview: s.versePreview,
        })),
      });
      set({ sessionId: id, saving: false, status: "idle" });
      clearPersistedSession();
      return id;
    } catch (err) {
      set({
        saving: false,
        error: err instanceof Error ? err.message : "Failed to save session.",
      });
      return null;
    }
  },

  discardSession: () => {
    engine?.stop();
    void levelMonitor?.stop();
    window.clearTimeout(partialScanTimer);
    clearPersistedSession();
    clearReferenceDedupeCache();
    set({
      status: "idle",
      sessionId: null,
      startedAt: null,
      elapsedMs: 0,
      partialText: "",
      segments: [],
      suggestions: [],
      selectedSuggestionId: null,
      audioLevel: 0,
      audioWarning: null,
      error: null,
    });
  },

  ignoreSuggestion: (id) => {
    set((s) => ({
      suggestions: s.suggestions.map((item) =>
        item.id === id ? { ...item, status: "ignored" } : item,
      ),
      selectedSuggestionId: s.selectedSuggestionId === id ? null : s.selectedSuggestionId,
    }));
    persistSession(get());
  },

  markSuggestionStatus: (id, status) => {
    set((s) => ({
      suggestions: s.suggestions.map((item) => (item.id === id ? { ...item, status } : item)),
    }));
    persistSession(get());
  },

  tickElapsed: () => {
    const { startedAt, status } = get();
    if (!startedAt || status === "idle" || status === "stopped") return;
    set({ elapsedMs: Date.now() - startedAt });
  },

  restorePersistedSession: () => {
    const saved = loadPersistedSession();
    if (!saved) return;
    set({
      sessionId: saved.sessionId,
      startedAt: saved.startedAt,
      modelId: saved.modelId,
      audioDeviceId: saved.audioDeviceId,
      segments: saved.segments,
      suggestions: saved.suggestions,
      paraphraseEnabled: saved.paraphraseEnabled,
      suggestionsMuted: saved.suggestionsMuted,
      autoPreviewHigh: saved.autoPreviewHigh ?? false,
      autoProject: saved.autoProject ?? true,
      previewLayout: saved.previewLayout ?? "fullscreen",
      minConfidence: saved.minConfidence ?? "low",
      status: "stopped",
      elapsedMs: saved.startedAt ? Date.now() - saved.startedAt : 0,
    });
  },
}));
