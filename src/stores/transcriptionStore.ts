import { create } from "zustand";
import { api } from "@/lib/tauri";
import {
  buildDetectionContext,
  clearReferenceDedupeCache,
  detectScriptureFromText,
} from "@/lib/transcription/referenceDetect";
import {
  previewDetectedScripture,
  presentVerseSession,
  reloadVerseSessionTranslation,
} from "@/lib/transcriptionLive";
import { isTranscriptionOnAir } from "@/lib/transcription/transcriptionLiveFollow";
import {
  createVerseSessionFromSuggestion,
  stepVerseSession,
  type ActiveVerseSession,
  sessionProgressLabel,
} from "@/lib/transcription/verseSession";
import { parseVoiceCommands, isLikelyVoiceCommand } from "@/lib/transcription/voiceCommands";
import { preprocessTranscriptForDetection } from "@/lib/transcription/transcriptPreprocess";
import {
  ensureMicrophoneAccess,
  listAudioInputDevices,
  pickValidAudioDeviceId,
  WebSpeechTranscriptionEngine,
} from "@/lib/transcription/webSpeechProvider";
import { isSpeechRecognitionSupported } from "@/lib/transcription/speechTypes";
import {
  TRANSCRIPTION_MODELS,
  type ListeningStatus,
  type ScriptureSuggestion,
  type TranscriptSegment,
  type TranscriptionModel,
  type ConfidenceLevel,
} from "@/lib/transcription/types";
import { useBibleStore } from "@/stores/bibleStore";
import { usePresentationStore } from "@/stores/presentationStore";

const SESSION_STORAGE_KEY = "bsp-transcription-session";
const PARTIAL_SCAN_MS = 700;

interface PersistedPreferences {
  modelId: string;
  audioDeviceId: string | null;
  paraphraseEnabled: boolean;
  suggestionsMuted: boolean;
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
  verseSession: ActiveVerseSession | null;
  lastVoiceAction: string | null;
  models: TranscriptionModel[];
  modelId: string;
  audioDevices: MediaDeviceInfo[];
  audioDeviceId: string | null;
  audioLevel: number;
  audioWarning: string | null;
  paraphraseEnabled: boolean;
  suggestionsMuted: boolean;
  previewLayout: "fullscreen" | "lower_third";
  minConfidence: ConfidenceLevel;
  lastScanAt: string | null;
  scanning: boolean;
  error: string | null;
  saving: boolean;
  speechSupported: boolean;

  init: () => Promise<void>;
  refreshAudioDevices: (requestPermission?: boolean) => Promise<void>;
  setModelId: (id: string) => void;
  setAudioDeviceId: (id: string | null) => void;
  setParaphraseEnabled: (enabled: boolean) => void;
  setSuggestionsMuted: (muted: boolean) => void;
  setPreviewLayout: (layout: "fullscreen" | "lower_third") => void;
  setMinConfidence: (level: ConfidenceLevel) => void;
  setSelectedSuggestion: (id: string | null) => void;
  previewSuggestion: (suggestion: ScriptureSuggestion) => Promise<void>;
  stepActiveVerse: (delta: number) => Promise<boolean>;
  switchActiveTranslation: (translationId: string) => Promise<boolean>;
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
  resetListeningWorkspace: () => void;
}

let engine: WebSpeechTranscriptionEngine | null = null;
let segmentCounter = 0;
let partialScanTimer: number | undefined;
let lastReportedAudioLevel = 0;

function loadPersistedPreferences(): PersistedPreferences | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedPreferences>;
    if (!parsed.modelId) return null;
    return {
      modelId: parsed.modelId,
      audioDeviceId: parsed.audioDeviceId ?? null,
      paraphraseEnabled: parsed.paraphraseEnabled ?? false,
      suggestionsMuted: parsed.suggestionsMuted ?? false,
      previewLayout: parsed.previewLayout ?? "fullscreen",
      minConfidence: parsed.minConfidence ?? "low",
    };
  } catch {
    return null;
  }
}

function persistPreferences(state: Pick<
  TranscriptionState,
  | "modelId"
  | "audioDeviceId"
  | "paraphraseEnabled"
  | "suggestionsMuted"
  | "previewLayout"
  | "minConfidence"
>) {
  const payload: PersistedPreferences = {
    modelId: state.modelId,
    audioDeviceId: state.audioDeviceId,
    paraphraseEnabled: state.paraphraseEnabled,
    suggestionsMuted: state.suggestionsMuted,
    previewLayout: state.previewLayout,
    minConfidence: state.minConfidence,
  };
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(payload));
}

function resetWorkspaceState(): Pick<
  TranscriptionState,
  | "sessionId"
  | "startedAt"
  | "elapsedMs"
  | "partialText"
  | "segments"
  | "suggestions"
  | "selectedSuggestionId"
  | "verseSession"
  | "lastVoiceAction"
  | "lastScanAt"
  | "error"
> {
  return {
    sessionId: null,
    startedAt: null,
    elapsedMs: 0,
    partialText: "",
    segments: [],
    suggestions: [],
    selectedSuggestionId: null,
    verseSession: null,
    lastVoiceAction: null,
    lastScanAt: null,
    error: null,
  };
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
  options?: { allowRepeatReference?: boolean },
) {
  if (detected.length === 0) return;

  const state = get();
  const filtered = detected.filter((d) => passesConfidenceFilter(d.confidenceLevel, state.minConfidence));
  if (filtered.length === 0) return;

  const repeat = options?.allowRepeatReference
    ? filtered.find((d) =>
        state.suggestions.some(
          (s) => s.status !== "ignored" && s.reference.toLowerCase() === d.reference.toLowerCase(),
        ),
      )
    : undefined;

  if (repeat) {
    const existing = state.suggestions.find(
      (s) => s.status !== "ignored" && s.reference.toLowerCase() === repeat.reference.toLowerCase(),
    );
    if (existing) {
      const refreshed: ScriptureSuggestion = {
        ...existing,
        verses: repeat.verses,
        versePreview: repeat.versePreview,
        detectedPhrase: repeat.detectedPhrase,
        translationAbbr: repeat.translationAbbr,
      };
      set((s) => ({
        suggestions: s.suggestions.map((item) => (item.id === existing.id ? refreshed : item)),
        selectedSuggestionId: existing.id,
      }));
      const onAir = isTranscriptionOnAir();
      const session = await previewDetectedScripture(refreshed, state.previewLayout);
      set({ verseSession: session, lastVoiceAction: null });
      get().markSuggestionStatus(existing.id, onAir ? "live" : "preview");
      return;
    }
  }

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

  const top = newSuggestions.find((s) => s.detectionType === "explicit") ?? newSuggestions[0];
  if (top) {
    const onAir = isTranscriptionOnAir();
    const session = await previewDetectedScripture(top, state.previewLayout);
    set({ verseSession: session, lastVoiceAction: null });
    get().markSuggestionStatus(top.id, onAir ? "live" : "preview");
  }
}

function resolveActiveVerseSession(state: TranscriptionState): ActiveVerseSession | null {
  if (state.verseSession) return state.verseSession;
  const latest = state.suggestions.find(
    (s) => s.status !== "ignored" && s.verses.length > 0,
  );
  if (!latest) return null;
  return createVerseSessionFromSuggestion(latest);
}

async function processVoiceCommands(
  text: string,
  get: () => TranscriptionState,
  set: (partial: Partial<TranscriptionState> | ((s: TranscriptionState) => Partial<TranscriptionState>)) => void,
): Promise<boolean> {
  const cleaned = preprocessTranscriptForDetection(text);
  if (cleaned.length < 3) return false;

  const bible = useBibleStore.getState();
  const cmd = parseVoiceCommands(cleaned, bible.translations);
  if (cmd.type === "none") return false;

  const state = get();

  if (cmd.type === "next_verse" || cmd.type === "prev_verse") {
    const session = resolveActiveVerseSession(state);
    if (!session) {
      set({ lastVoiceAction: "No active passage — cite a scripture first." });
      return true;
    }
    const delta = cmd.type === "next_verse" ? 1 : -1;
    const next = stepVerseSession(session, delta);
    if (!next) {
      set({
        lastVoiceAction:
          delta > 0 ? "Already at the last verse." : "Already at the first verse.",
      });
      return true;
    }
    set({ verseSession: next, lastVoiceAction: sessionProgressLabel(next) });
    await presentVerseSession(next, state.previewLayout, isTranscriptionOnAir());
    return true;
  }

  if (cmd.type === "switch_translation") {
    if (bible.translations.length === 0) {
      set({ lastVoiceAction: "No Bible translations installed." });
      return true;
    }
    bible.setTranslation(cmd.translation.id);
    const session = resolveActiveVerseSession(state);
    if (session) {
      const updated = await reloadVerseSessionTranslation(session, cmd.translation.id);
      if (updated) {
        set({
          verseSession: updated,
          lastVoiceAction: `Switched to ${cmd.translation.abbreviation} · ${sessionProgressLabel(updated)}`,
        });
        await presentVerseSession(updated, state.previewLayout, isTranscriptionOnAir());
      } else {
        set({ lastVoiceAction: `Could not load ${cmd.translation.abbreviation} for this passage.` });
      }
    } else {
      set({ lastVoiceAction: `Translation set to ${cmd.translation.abbreviation}.` });
    }
    return true;
  }

  return false;
}

async function runSegmentScan(
  get: () => TranscriptionState,
  set: (partial: Partial<TranscriptionState> | ((s: TranscriptionState) => Partial<TranscriptionState>)) => void,
  text: string,
  segmentId?: string,
) {
  const cleaned = preprocessTranscriptForDetection(text);
  if (get().suggestionsMuted || cleaned.length < 3) return;

  if (await processVoiceCommands(cleaned, get, set)) return;
  if (isLikelyVoiceCommand(cleaned)) return;

  const translationId = resolveTranslationId();
  if (!translationId) {
    set({ error: "No Bible translation loaded — install a Bible version in Settings." });
    return;
  }

  const existingReferences = get()
    .suggestions.filter((s) => s.status !== "ignored")
    .map((s) => s.reference);

  const detected = await detectScriptureFromText(cleaned, translationId, {
    paraphraseEnabled: get().paraphraseEnabled,
    existingReferences,
    allowRepeatReference: true,
  });
  await mergeDetections(detected, segmentId, get, set, { allowRepeatReference: true });
}

async function runContextScan(
  get: () => TranscriptionState,
  set: (partial: Partial<TranscriptionState> | ((s: TranscriptionState) => Partial<TranscriptionState>)) => void,
  segmentId?: string,
) {
  if (get().suggestionsMuted) return;

  const partial = preprocessTranscriptForDetection(get().partialText);
  if (partial.length >= 3 && (await processVoiceCommands(partial, get, set))) return;

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
  verseSession: null,
  lastVoiceAction: null,
  models: TRANSCRIPTION_MODELS,
  modelId: TRANSCRIPTION_MODELS[0]?.id ?? "web-speech",
  audioDevices: [],
  audioDeviceId: null,
  audioLevel: 0,
  audioWarning: null,
  paraphraseEnabled: false,
  suggestionsMuted: false,
  previewLayout: "fullscreen",
  minConfidence: "low",
  lastScanAt: null,
  scanning: false,
  error: null,
  saving: false,
  speechSupported: isSpeechRecognitionSupported(),

  init: async () => {
    const speechSupported = isSpeechRecognitionSupported();
    const existing = get();
    const preserveSession =
      existing.status === "listening" ||
      existing.status === "paused" ||
      existing.status === "processing" ||
      existing.status === "reconnecting" ||
      existing.status === "stopped" ||
      existing.segments.length > 0 ||
      Boolean(existing.sessionId);

    await get().refreshAudioDevices(false);
    const bible = useBibleStore.getState();
    if (!bible.selectedTranslationId) {
      await bible.loadTranslations();
    }
    const prefs = loadPersistedPreferences();
    set({
      ...(preserveSession ? {} : resetWorkspaceState()),
      status: preserveSession ? existing.status : "idle",
      speechSupported,
      ...(prefs ?? {}),
    });
    if (!speechSupported) {
      set({
        error:
          "Speech recognition is unavailable in this window. Use the installed Bible Show Pro app (not the browser preview) and ensure microphone access is allowed.",
        status: "unavailable",
      });
    }
    if (prefs) persistPreferences(get());
  },

  refreshAudioDevices: async (requestPermission = true) => {
    try {
      if (requestPermission) {
        await ensureMicrophoneAccess();
      }
      const devices = await listAudioInputDevices();
      const audioDeviceId = pickValidAudioDeviceId(devices, get().audioDeviceId);
      set({ audioDevices: devices, audioDeviceId, audioWarning: null });
    } catch (err) {
      set({
        audioDevices: [],
        audioWarning: err instanceof Error ? err.message : "Microphone access unavailable.",
      });
    }
  },

  setModelId: (id) => {
    set({ modelId: id });
    persistPreferences(get());
  },
  setAudioDeviceId: (id) => {
    set({ audioDeviceId: id });
    persistPreferences(get());
  },
  setParaphraseEnabled: (enabled) => {
    set({ paraphraseEnabled: enabled });
    persistPreferences(get());
  },
  setSuggestionsMuted: (muted) => set({ suggestionsMuted: muted }),
  setPreviewLayout: (layout) => {
    set({ previewLayout: layout });
    persistPreferences(get());
  },
  setMinConfidence: (level) => {
    set({ minConfidence: level });
    persistPreferences(get());
  },
  setSelectedSuggestion: (id) => set({ selectedSuggestionId: id }),

  previewSuggestion: async (suggestion) => {
    const onAir = isTranscriptionOnAir();
    const session = await previewDetectedScripture(suggestion, get().previewLayout);
    set({ verseSession: session, selectedSuggestionId: suggestion.id, lastVoiceAction: null });
    get().markSuggestionStatus(suggestion.id, onAir ? "live" : "preview");
  },

  stepActiveVerse: async (delta) => {
    const session = get().verseSession;
    if (!session) return false;
    const next = stepVerseSession(session, delta);
    if (!next) return false;
    set({ verseSession: next, lastVoiceAction: sessionProgressLabel(next) });
    await presentVerseSession(next, get().previewLayout, isTranscriptionOnAir());
    return true;
  },

  switchActiveTranslation: async (translationId) => {
    const session = get().verseSession;
    useBibleStore.getState().setTranslation(translationId);
    if (!session) return true;
    const updated = await reloadVerseSessionTranslation(session, translationId);
    if (!updated) return false;
    set({ verseSession: updated, lastVoiceAction: sessionProgressLabel(updated) });
    await presentVerseSession(updated, get().previewLayout, isTranscriptionOnAir());
    return true;
  },

  startListening: async () => {
    const state = get();
    if (state.status === "listening") return;

    if (!engine) engine = new WebSpeechTranscriptionEngine();

    if (!engine.isSupported()) {
      set({
        error:
          "Speech recognition is not supported here. Run the installed Bible Show Pro desktop app with microphone permission enabled.",
        status: "unavailable",
        speechSupported: false,
      });
      return;
    }

    const bible = useBibleStore.getState();
    if (bible.translations.length === 0) {
      await bible.loadTranslations();
    }
    const hasBible = Boolean(resolveTranslationId());

    const model = state.models.find((m) => m.id === state.modelId) ?? state.models[0];
    if (model?.requiresInternet && !navigator.onLine) {
      set({ error: "Selected model requires internet during live service.", status: "unavailable" });
      return;
    }

    try {
      await ensureMicrophoneAccess();
      const devices = await listAudioInputDevices();
      const audioDeviceId = pickValidAudioDeviceId(devices, state.audioDeviceId);
      set({ audioDevices: devices, audioDeviceId });
      persistPreferences(get());
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Could not access microphone.",
        status: "unavailable",
      });
      return;
    }

    clearReferenceDedupeCache();

    const freshSession = state.status !== "paused" && state.status !== "stopped";
    if (freshSession) {
      set({ ...resetWorkspaceState(), status: "idle", speechSupported: true });
    }

    const sessionId = freshSession ? crypto.randomUUID() : (get().sessionId ?? crypto.randomUUID());
    const startedAt = freshSession ? Date.now() : (get().startedAt ?? Date.now());
    lastReportedAudioLevel = 0;

    set({
      status: "listening",
      sessionId,
      startedAt,
      error: hasBible
        ? null
        : "Listening — install a Bible translation in Settings to enable scripture detection.",
      partialText: "",
      speechSupported: true,
    });

    engine.start(
      {
        onPartial: (text) => {
          set({ partialText: text });
          const cleaned = preprocessTranscriptForDetection(text);
          if (isLikelyVoiceCommand(cleaned)) {
            void processVoiceCommands(cleaned, get, set);
          }
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

          if (resolveTranslationId()) {
            await runSegmentScan(get, set, text, segment.id);
            await runContextScan(get, set, segment.id);
          }
          set({ status: "listening" });
        },
        onStatus: (status) => {
          if (status === "reconnecting") set({ status: "reconnecting" });
          else if (status === "listening") set({ status: "listening" });
          else if (status === "paused") set({ status: "paused" });
          else if (status === "stopped") set({ status: "stopped" });
          else if (status === "unavailable") set({ status: "unavailable" });
        },
        onError: (message) => set({ error: message, status: "unavailable" }),
        onAudioActivity: (level) => {
          const levelChanged = Math.abs(level - lastReportedAudioLevel) >= 0.02;
          if (!levelChanged) return;
          lastReportedAudioLevel = level;
          set({ audioLevel: level });
        },
      },
      { modelId: state.modelId },
    );
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
    window.clearTimeout(partialScanTimer);
    lastReportedAudioLevel = 0;
    set({ status: "stopped", partialText: "", audioLevel: 0, audioWarning: null });
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
      get().resetListeningWorkspace();
      persistPreferences(get());
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
    get().resetListeningWorkspace();
    set({ status: "idle", audioLevel: 0, audioWarning: null });
  },

  ignoreSuggestion: (id) => {
    set((s) => ({
      suggestions: s.suggestions.map((item) =>
        item.id === id ? { ...item, status: "ignored" } : item,
      ),
      selectedSuggestionId: s.selectedSuggestionId === id ? null : s.selectedSuggestionId,
    }));
  },

  markSuggestionStatus: (id, status) => {
    set((s) => ({
      suggestions: s.suggestions.map((item) => (item.id === id ? { ...item, status } : item)),
    }));
  },

  tickElapsed: () => {
    const { startedAt, status } = get();
    if (!startedAt || status === "idle" || status === "stopped") return;
    set({ elapsedMs: Date.now() - startedAt });
  },

  resetListeningWorkspace: () => {
    window.clearTimeout(partialScanTimer);
    clearReferenceDedupeCache();
    const presentation = usePresentationStore.getState();
    if (presentation.previewSource === "transcription") {
      presentation.clearPreview();
    }
    set(resetWorkspaceState());
  },
}));
