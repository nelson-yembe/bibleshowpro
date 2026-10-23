import { create } from "zustand";
import { api, type NotesReference } from "@/lib/tauri";
import {
  buildDetectionContext,
  buildSuggestionFromReference,
  clearReferenceDedupeCache,
  detectScriptureFromText,
} from "@/lib/transcription/referenceDetect";
import {
  previewDetectedScripture,
  presentDetectedScripture,
  presentVerseSession,
  reloadVerseSessionTranslation,
  representTranscriptionVerses,
  resolveTranscriptionVerses,
  shouldPresentVerseToProgram,
} from "@/lib/transcriptionLive";
import {
  createExpandedVerseSessionFromSuggestion,
  stepVerseSession,
  getCurrentVerse,
  type ActiveVerseSession,
  sessionProgressLabel,
} from "@/lib/transcription/verseSession";
import { parseVoiceCommands, isLikelyVoiceCommand } from "@/lib/transcription/voiceCommands";
import {
  isExplicitScripture,
  isOperatorVerifyOnly,
  pickAutoOutputSuggestion,
  rankSuggestions,
} from "@/lib/transcription/suggestionRouting";
import { isWaitingNotesReference, notesContext, withNotesSupport } from "@/lib/transcription/sermonNotes";
import {
  createVoiceNavGuard,
  rearmVoiceNav,
  recordVerseNavAccepted,
  resetVoiceNavGuard,
  shouldAcceptVerseNav,
} from "@/lib/transcription/voiceNavGuard";
import { preprocessTranscriptForDetection } from "@/lib/transcription/transcriptPreprocess";
import {
  recordCorrectionAccept,
  recordCorrectionIgnore,
  recordCorrectionOverride,
} from "@/lib/transcription/correctionMemory";
import {
  audioInputLabel,
  preflightAudioInput,
} from "@/lib/transcription/audioInput";
import { AudioLevelMonitor } from "@/lib/transcription/audioLevelMonitor";
import {
  ensureMicrophoneAccess,
  listAudioInputDevices,
  pickValidAudioDeviceId,
} from "@/lib/transcription/audioInput";
import type { TranscriptionEngine } from "@/lib/transcription/engine";
import {
  diagnoseListening,
  faultMessage,
  silenceWindowMs,
} from "@/lib/transcription/engineHealth";
import { createTranscriptionEngine } from "@/lib/transcription/engineFactory";
import {
  ENGINE_MIGRATION_KEY,
  isDesktopApp,
  migrateEngineChoice,
} from "@/lib/transcription/engineReadiness";
import {
  engineConfigError,
  loadStoredEngineConfig,
  normalizeLanguage,
  speechLocales,
  toEngineConfig,
} from "@/lib/transcription/engineConfig";
import {
  TRANSCRIPTION_MODELS,
  type DetectionContext,
  type ListeningStatus,
  type ScriptureSuggestion,
  type TranscriptSegment,
  type TranscriptionModel,
  type ConfidenceLevel,
} from "@/lib/transcription/types";
import { useBibleStore } from "@/stores/bibleStore";
import { useCaptionStore } from "@/stores/captionStore";
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
  autoGoLive: boolean;
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
  audioDeviceLabel: string | null;
  audioLevel: number;
  audioWarning: string | null;
  /** Language of the latest final segment, when the engine reports one ("en", "fr"). */
  heardLanguage: string | null;
  /** Passages from the preacher's notes: queued up front, and trusted more when heard. */
  sermonNotes: NotesReference[];
  preflightStatus: "idle" | "checking" | "ready" | "failed";
  preflightMessage: string | null;
  paraphraseEnabled: boolean;
  suggestionsMuted: boolean;
  previewLayout: "fullscreen" | "lower_third";
  minConfidence: ConfidenceLevel;
  autoGoLive: boolean;
  lastScanAt: string | null;
  scanning: boolean;
  error: string | null;
  saving: boolean;
  speechSupported: boolean;

  init: () => Promise<void>;
  refreshAudioDevices: (requestPermission?: boolean) => Promise<void>;
  preflightAudio: (options?: { strict?: boolean }) => Promise<boolean>;
  setModelId: (id: string) => void;
  setAudioDeviceId: (id: string | null) => void;
  setParaphraseEnabled: (enabled: boolean) => void;
  setSuggestionsMuted: (muted: boolean) => void;
  setPreviewLayout: (layout: "fullscreen" | "lower_third") => void;
  setMinConfidence: (level: ConfidenceLevel) => void;
  setAutoGoLive: (enabled: boolean) => void;
  setSelectedSuggestion: (id: string | null) => void;
  /** Select a detection and stage it — takes live when Auto is on or transcription is already on air. */
  selectAndPresentSuggestion: (suggestion: ScriptureSuggestion) => Promise<void>;
  previewSuggestion: (suggestion: ScriptureSuggestion) => Promise<void>;
  refreshPreviewOutput: () => Promise<void>;
  goLiveSelectedSuggestion: () => Promise<void>;
  stepActiveVerse: (delta: number) => Promise<boolean>;
  switchActiveTranslation: (translationId: string) => Promise<boolean>;
  startListening: () => Promise<void>;
  pauseListening: () => void;
  resumeListening: () => Promise<void>;
  stopListening: () => void;
  rescanTranscript: () => Promise<void>;
  lookupManualReference: (reference: string) => Promise<void>;
  saveSession: (title?: string) => Promise<string | null>;
  discardSession: () => void;
  ignoreSuggestion: (id: string) => void;
  /** Operator picked a different reference for the same ASR phrase — learn and preview. */
  correctSuggestionReference: (id: string, reference: string) => Promise<void>;
  markSuggestionStatus: (id: string, status: ScriptureSuggestion["status"]) => void;
  /** Queue the notes passages (replacing earlier ones still waiting); returns how many were found in the Bible. */
  loadSermonNotes: (passages: NotesReference[]) => Promise<number>;
  clearSermonNotes: () => void;
  tickElapsed: () => void;
  resetListeningWorkspace: () => void;
}

let engine: TranscriptionEngine | null = null;
/** Which engine the current instance was built for, so a model change swaps it out. */
let engineModelId: string | null = null;
let levelMonitor: AudioLevelMonitor | null = null;
let segmentCounter = 0;
let partialScanTimer: number | undefined;
const voiceNavGuard = createVoiceNavGuard();
let noSignalTimer: number | undefined;
let lastReportedAudioLevel = 0;
let lastAudioLevelEmit = 0;
let sessionPeakAudioLevel = 0;

/** Cap meter updates to ~20fps so the level monitor doesn't thrash React state. */
const AUDIO_LEVEL_MIN_INTERVAL_MS = 50;

async function stopLevelMonitor() {
  window.clearTimeout(noSignalTimer);
  noSignalTimer = undefined;
  if (levelMonitor) {
    await levelMonitor.stop();
    levelMonitor = null;
  }
}

async function startLevelMonitor(
  deviceId: string | null,
  set: (partial: Partial<TranscriptionState>) => void,
  get: () => TranscriptionState,
) {
  await stopLevelMonitor();
  if (!levelMonitor) levelMonitor = new AudioLevelMonitor();

  sessionPeakAudioLevel = 0;
  lastReportedAudioLevel = 0;

  await levelMonitor.start(
    deviceId,
    (level) => {
      sessionPeakAudioLevel = Math.max(sessionPeakAudioLevel, level);
      const levelChanged = Math.abs(level - lastReportedAudioLevel) >= 0.015;
      if (!levelChanged) return;
      const now = Date.now();
      if (now - lastAudioLevelEmit < AUDIO_LEVEL_MIN_INTERVAL_MS) return;
      lastAudioLevelEmit = now;
      lastReportedAudioLevel = level;
      set({ audioLevel: level });
    },
    (warning) => {
      set({ audioWarning: warning });
    },
  );

  window.clearTimeout(noSignalTimer);
  // A chunked engine returns nothing until a segment closes and inference finishes, so
  // the streaming window would fire on a perfectly healthy Whisper run.
  const scheduledFor = get().models.find((m) => m.id === get().modelId);
  const window_ms = silenceWindowMs(scheduledFor?.streaming ?? true);

  noSignalTimer = window.setTimeout(() => {
    const state = get();
    if (state.status !== "listening" && state.status !== "processing" && state.status !== "reconnecting") return;
    // A working microphone used to silence this warning entirely, so an engine that
    // returns nothing looked identical to a healthy session.
    const hasTranscript = state.segments.length > 0 || state.partialText.trim().length > 0;
    const engine = state.models.find((m) => m.id === state.modelId);
    const message = faultMessage(
      diagnoseListening({ hasTranscript, peakAudioLevel: sessionPeakAudioLevel }),
      { id: engine?.id ?? state.modelId, label: engine?.label ?? "The speech engine" },
    );
    if (message) set({ audioWarning: message });
  }, window_ms);
}

/**
 * Whether the chosen engine can capture audio here. This used to be the Web Speech
 * check for every engine, so a PC without that API was told transcription was
 * unavailable even when Whisper or Gemini would have worked fine.
 */
function engineSupported(modelId: string): boolean {
  return createTranscriptionEngine(modelId).isSupported();
}

function unsupportedMessage(): string {
  return "This PC is not letting the app capture audio. Check Windows Settings → Privacy & security → Microphone, and allow desktop apps.";
}

function readMigrationFlag(): boolean {
  try {
    return localStorage.getItem(ENGINE_MIGRATION_KEY) === "1";
  } catch {
    return false;
  }
}

function writeMigrationFlag(): void {
  try {
    localStorage.setItem(ENGINE_MIGRATION_KEY, "1");
  } catch {
    // Storage blocked: the migration simply runs again next launch.
  }
}

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
      autoGoLive: parsed.autoGoLive ?? false,
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
  | "autoGoLive"
>) {
  const payload: PersistedPreferences = {
    modelId: state.modelId,
    audioDeviceId: state.audioDeviceId,
    paraphraseEnabled: state.paraphraseEnabled,
    suggestionsMuted: state.suggestionsMuted,
    previewLayout: state.previewLayout,
    minConfidence: state.minConfidence,
    autoGoLive: state.autoGoLive,
  };
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(payload));
}

function resetWorkspaceState(kept: ScriptureSuggestion[] = []): Pick<
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
  | "heardLanguage"
> {
  return {
    sessionId: null,
    startedAt: null,
    elapsedMs: 0,
    partialText: "",
    segments: [],
    suggestions: kept,
    selectedSuggestionId: null,
    verseSession: null,
    lastVoiceAction: null,
    lastScanAt: null,
    error: null,
    heardLanguage: null,
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
    bible.selectedTranslationIds[0] ??
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

/** What was heard or picked; planned notes passages wait until the operator takes one. */
function activeSuggestions(state: TranscriptionState): ScriptureSuggestion[] {
  return state.suggestions.filter((s) => s.status !== "ignored" && !isWaitingNotesReference(s));
}

/**
 * Auto-go-live is only for explicit scripture citations from finalized text.
 * Quotes / paraphrases stay queued for operator verification unless the
 * operator explicitly Previews or presses Go live (`forceStage`).
 */
async function applySuggestionOutput(
  suggestion: ScriptureSuggestion,
  get: () => TranscriptionState,
  set: (partial: Partial<TranscriptionState> | ((s: TranscriptionState) => Partial<TranscriptionState>)) => void,
  options?: { allowAutoLive?: boolean; forceStage?: boolean },
) {
  const state = get();
  const allowAutoLive = options?.allowAutoLive ?? false;
  const forceStage = options?.forceStage ?? false;

  if (allowAutoLive && state.autoGoLive && isExplicitScripture(suggestion)) {
    const session = await presentDetectedScripture(suggestion, state.previewLayout);
    set({
      verseSession: session,
      selectedSuggestionId: suggestion.id,
      lastVoiceAction: `Auto live — ${suggestion.reference}`,
    });
    get().markSuggestionStatus(suggestion.id, "live");
    return;
  }

  // Keep speculative hits in the suggestion queue until the operator acts.
  if (isOperatorVerifyOnly(suggestion) && !forceStage) {
    set({ selectedSuggestionId: suggestion.id });
    return;
  }

  const session = await previewDetectedScripture(suggestion, state.previewLayout);
  set({
    verseSession: session,
    selectedSuggestionId: suggestion.id,
    lastVoiceAction: null,
  });
  get().markSuggestionStatus(suggestion.id, "preview");
}

async function refreshPreviewOutput(
  get: () => TranscriptionState,
  set: (partial: Partial<TranscriptionState> | ((s: TranscriptionState) => Partial<TranscriptionState>)) => void,
) {
  const state = get();
  const presentation = usePresentationStore.getState();
  const toProgram = shouldPresentVerseToProgram(state.autoGoLive);

  if (state.verseSession) {
    await presentVerseSession(state.verseSession, state.previewLayout, toProgram);
    return;
  }

  const suggestion =
    state.suggestions.find((s) => s.id === state.selectedSuggestionId && s.status !== "ignored") ??
    activeSuggestions(state)[0];
  if (suggestion) {
    await applySuggestionOutput(suggestion, get, set);
    return;
  }

  const verses = resolveTranscriptionVerses({
    preview: presentation.preview,
    program: presentation.program,
  });
  if (verses.length > 0) {
    await representTranscriptionVerses(verses, state.previewLayout, toProgram);
  }
}

async function mergeDetections(
  detected: Omit<ScriptureSuggestion, "id" | "segmentId" | "status" | "createdAt">[],
  segmentId: string | undefined,
  get: () => TranscriptionState,
  set: (partial: Partial<TranscriptionState> | ((s: TranscriptionState) => Partial<TranscriptionState>)) => void,
  options?: { allowRepeatReference?: boolean; allowAutoLive?: boolean },
) {
  if (detected.length === 0) return;

  const allowAutoLive = options?.allowAutoLive ?? false;
  const state = get();
  const filtered = detected
    .map((d) => withNotesSupport(d, state.sermonNotes))
    .filter((d) => passesConfidenceFilter(d.confidenceLevel, state.minConfidence));
  if (filtered.length === 0) return;

  // A passage queued from the notes is taken up when heard, never listed twice.
  const refreshable = (s: ScriptureSuggestion, d: { reference: string }) =>
    s.status !== "ignored" &&
    (options?.allowRepeatReference || isWaitingNotesReference(s)) &&
    s.reference.toLowerCase() === d.reference.toLowerCase();
  const repeat = filtered.find((d) => state.suggestions.some((s) => refreshable(s, d)));

  if (repeat) {
    const existing = state.suggestions.find((s) => refreshable(s, repeat));
    if (existing) {
      const refreshed: ScriptureSuggestion = {
        ...existing,
        verses: repeat.verses,
        versePreview: repeat.versePreview,
        detectedPhrase: repeat.detectedPhrase,
        translationAbbr: repeat.translationAbbr,
        detectionType: repeat.detectionType,
        confidence: repeat.confidence,
        confidenceLevel: repeat.confidenceLevel,
        notes: repeat.notes ?? existing.notes,
      };
      set((s) => ({
        suggestions: s.suggestions.map((item) => (item.id === existing.id ? refreshed : item)),
        selectedSuggestionId: existing.id,
      }));
      // Only re-project explicit citations; quotes remain queued.
      if (!isOperatorVerifyOnly(refreshed)) {
        await applySuggestionOutput(refreshed, get, set, { allowAutoLive });
      }
      return;
    }
  }

  const newSuggestions: ScriptureSuggestion[] = filtered.map((d) => ({
    ...d,
    id: newSuggestionId(),
    segmentId,
    // Quotes / paraphrases wait in the suggestion list for operator verification.
    status: "pending",
    createdAt: new Date().toISOString(),
  }));

  // Prefer book/chapter hits for selection; keep weak quote guesses in the list
  // but do not let them steal preview/projection from real references.
  const ranked = rankSuggestions(newSuggestions);

  // Explicit citations and repaired/learned references stage automatically;
  // quotes and paraphrases wait in the queue for the operator.
  const top = pickAutoOutputSuggestion(ranked);

  set((s) => ({
    suggestions: [...ranked, ...s.suggestions],
    segments: segmentId
      ? s.segments.map((seg) => (seg.id === segmentId ? { ...seg, hasDetection: true } : seg))
      : s.segments,
    selectedSuggestionId: top?.id ?? s.selectedSuggestionId,
  }));

  if (top) {
    await applySuggestionOutput(top, get, set, { allowAutoLive });
  }
}

/** Sermon context so bare references ("verse 16") resolve to the active passage. */
function resolveDetectionContext(state: TranscriptionState): DetectionContext | undefined {
  const session = state.verseSession;
  if (session) {
    const verse = session.verses[session.verseIndex] ?? session.verses[0];
    if (verse) {
      return { bookNumber: verse.book_number, bookName: verse.book_name, chapter: verse.chapter };
    }
  }
  // Prefer what is currently on air, then the operator-selected suggestion, so
  // "look at verse 8" sticks to the live sermon passage.
  const live = state.suggestions.find((s) => s.status === "live" && s.verses.length > 0);
  const selected =
    state.selectedSuggestionId != null
      ? state.suggestions.find(
          (s) => s.id === state.selectedSuggestionId && s.status !== "ignored" && s.verses.length > 0,
        )
      : undefined;
  const recent = live ?? selected ?? activeSuggestions(state).find((s) => s.verses.length > 0);
  const verse = recent?.verses[0];
  if (verse) {
    return { bookNumber: verse.book_number, bookName: verse.book_name, chapter: verse.chapter };
  }
  return undefined;
}

async function resolveActiveVerseSession(
  state: TranscriptionState,
): Promise<ActiveVerseSession | null> {
  if (state.verseSession && state.verseSession.verses.length > 1) {
    return state.verseSession;
  }

  const suggestion =
    (state.selectedSuggestionId != null
      ? state.suggestions.find(
          (s) => s.id === state.selectedSuggestionId && s.status !== "ignored" && s.verses.length > 0,
        )
      : undefined) ??
    state.suggestions.find((s) => s.status === "live" && s.verses.length > 0) ??
    state.suggestions.find((s) => s.status !== "ignored" && s.verses.length > 0);

  if (state.verseSession && !suggestion) {
    // Single-verse session with no suggestion to expand — still usable.
    return state.verseSession;
  }
  if (!suggestion) return state.verseSession;

  // Expand to the full chapter so "next verse" can step beyond a one-verse hit.
  const expanded = await createExpandedVerseSessionFromSuggestion(suggestion);
  if (state.verseSession) {
    const current = getCurrentVerse(state.verseSession) ?? state.verseSession.verses[0];
    if (current) {
      const idx = expanded.verses.findIndex(
        (v) =>
          v.book_number === current.book_number &&
          v.chapter === current.chapter &&
          v.verse === current.verse,
      );
      if (idx >= 0) {
        return { ...expanded, verseIndex: idx };
      }
    }
  }
  return expanded;
}

async function processVoiceCommands(
  text: string,
  get: () => TranscriptionState,
  set: (partial: Partial<TranscriptionState> | ((s: TranscriptionState) => Partial<TranscriptionState>)) => void,
  options?: { source?: "final" | "partial" },
): Promise<boolean> {
  const cleaned = preprocessTranscriptForDetection(text);
  if (cleaned.length < 3) return false;

  const bible = useBibleStore.getState();
  const cmd = parseVoiceCommands(cleaned, bible.translations);
  if (cmd.type === "none") {
    // A non-nav final utterance re-arms navigation for the next cue.
    if (options?.source === "final") {
      rearmVoiceNav(voiceNavGuard);
    }
    return false;
  }

  const state = get();

  if (cmd.type === "next_verse" || cmd.type === "prev_verse") {
    // Only finalized speech steps verses — partials were looping +1 repeatedly
    // while ASR kept rewriting the same "next verse" hypothesis.
    if (options?.source !== "final") {
      return true;
    }

    const now = Date.now();
    if (!shouldAcceptVerseNav(voiceNavGuard, cmd.type, now)) {
      return true;
    }

    const session = await resolveActiveVerseSession(state);
    if (!session) {
      set({ lastVoiceAction: "No active passage — cite a scripture first." });
      return true;
    }

    // Exactly one verse per spoken cue — never accumulate multiple steps.
    const delta = cmd.type === "next_verse" ? 1 : -1;
    const next = stepVerseSession(session, delta);
    if (!next) {
      set({
        verseSession: session,
        lastVoiceAction:
          delta > 0 ? "Already at the last verse." : "Already at the first verse.",
      });
      return true;
    }

    recordVerseNavAccepted(voiceNavGuard, cmd.type, now);
    set({ verseSession: next, lastVoiceAction: `Voice · ${sessionProgressLabel(next)}` });
    await presentVerseSession(next, state.previewLayout, shouldPresentVerseToProgram(get().autoGoLive));
    return true;
  }

  if (cmd.type === "switch_translation") {
    if (bible.translations.length === 0) {
      set({ lastVoiceAction: "No Bible translations installed." });
      return true;
    }
    bible.setTranslation(cmd.translation.id);
    const session = await resolveActiveVerseSession(state);
    if (session) {
      const updated = await reloadVerseSessionTranslation(session, cmd.translation.id);
      if (updated) {
        set({
          verseSession: updated,
          lastVoiceAction: `Switched to ${cmd.translation.abbreviation} · ${sessionProgressLabel(updated)}`,
        });
        await presentVerseSession(updated, state.previewLayout, shouldPresentVerseToProgram(get().autoGoLive));
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
  if (cleaned.length < 3) return;

  // Voice navigation must work even when scripture suggestions are muted.
  if (await processVoiceCommands(cleaned, get, set, { source: "final" })) return;
  if (isLikelyVoiceCommand(cleaned)) return;
  if (get().suggestionsMuted) return;

  const translationId = resolveTranslationId();
  if (!translationId) {
    set({ error: "No Bible translation loaded — install a Bible version in Settings." });
    return;
  }

  const existingReferences = activeSuggestions(get()).map((s) => s.reference);

  const detected = await detectScriptureFromText(cleaned, translationId, {
    paraphraseEnabled: get().paraphraseEnabled,
    existingReferences,
    allowRepeatReference: true,
    context: resolveDetectionContext(get()),
  });
  // Final transcript text — safe to auto-go-live for high-confidence explicit refs.
  await mergeDetections(detected, segmentId, get, set, {
    allowRepeatReference: true,
    allowAutoLive: true,
  });
}

async function runContextScan(
  get: () => TranscriptionState,
  set: (partial: Partial<TranscriptionState> | ((s: TranscriptionState) => Partial<TranscriptionState>)) => void,
  segmentId?: string,
) {
  if (get().suggestionsMuted) return;

  // Do not run verse navigation from partial/context scans — that caused
  // repeated +1 steps while ASR kept the same "next verse" hypothesis alive.

  const translationId = resolveTranslationId();
  if (!translationId) {
    set({ error: "No Bible translation loaded — install a Bible version in Settings." });
    return;
  }

  const context = buildDetectionContext(get().segments, get().partialText);
  if (context.length < 3) return;

  // Skip scripture detection while the live hypothesis is clearly a nav cue.
  const partial = preprocessTranscriptForDetection(get().partialText);
  if (partial.length >= 3 && isLikelyVoiceCommand(partial)) return;

  set({ scanning: true, lastScanAt: new Date().toLocaleTimeString() });
  try {
    const existingReferences = activeSuggestions(get()).map((s) => s.reference);

    const detected = await detectScriptureFromText(context, translationId, {
      paraphraseEnabled: get().paraphraseEnabled,
      existingReferences,
      context: resolveDetectionContext(get()),
    });
    // Context scans run on live partial text too; only auto-go-live when this
    // scan was triggered by a finalized segment (segmentId present).
    await mergeDetections(detected, segmentId, get, set, {
      allowAutoLive: Boolean(segmentId),
    });
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
  modelId: TRANSCRIPTION_MODELS[0]?.id ?? "whisper-local",
  audioDevices: [],
  audioDeviceId: null,
  audioDeviceLabel: null,
  audioLevel: 0,
  audioWarning: null,
  heardLanguage: null,
  sermonNotes: [],
  preflightStatus: "idle",
  preflightMessage: null,
  paraphraseEnabled: false,
  suggestionsMuted: false,
  previewLayout: "fullscreen",
  minConfidence: "low",
  autoGoLive: false,
  lastScanAt: null,
  scanning: false,
  error: null,
  saving: false,
  speechSupported: true,

  init: async () => {
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
    const devices = get().audioDevices;
    const bible = useBibleStore.getState();
    if (!bible.selectedTranslationId) {
      await bible.loadTranslations();
    }
    const prefs = loadPersistedPreferences();
    const engineChoice = migrateEngineChoice(prefs?.modelId, isDesktopApp(), readMigrationFlag());
    const speechSupported = engineSupported(engineChoice.modelId);
    const resolvedDeviceId = pickValidAudioDeviceId(devices, prefs?.audioDeviceId ?? get().audioDeviceId);
    set({
      ...(preserveSession ? {} : resetWorkspaceState(get().suggestions.filter(isWaitingNotesReference))),
      status: preserveSession ? existing.status : "idle",
      speechSupported,
      ...(prefs ?? {}),
      modelId: engineChoice.modelId,
      audioDeviceId: resolvedDeviceId,
      audioDeviceLabel: audioInputLabel(devices, resolvedDeviceId),
    });
    if (!speechSupported) {
      set({ error: unsupportedMessage(), status: "unavailable" });
    }
    if (engineChoice.migrated) writeMigrationFlag();
    if (prefs || engineChoice.migrated) persistPreferences(get());
  },

  refreshAudioDevices: async (requestPermission = true) => {
    try {
      const preferredId = get().audioDeviceId;
      if (requestPermission) {
        await ensureMicrophoneAccess(preferredId);
      }
      const devices = await listAudioInputDevices();
      const audioDeviceId = pickValidAudioDeviceId(devices, preferredId);
      set({
        audioDevices: devices,
        audioDeviceId,
        audioDeviceLabel: audioInputLabel(devices, audioDeviceId),
        audioWarning: null,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Microphone access unavailable.";
      set({
        audioDevices: [],
        audioDeviceLabel: null,
        audioWarning: message,
      });
    }
  },

  preflightAudio: async (options) => {
    set({ preflightStatus: "checking", preflightMessage: null, error: null });
    try {
      await get().refreshAudioDevices(true);
      const state = get();
      const result = await preflightAudioInput(state.audioDeviceId, state.audioDevices);

      set({
        audioDeviceId: result.deviceId,
        audioDeviceLabel: result.deviceLabel,
        audioLevel: result.peakLevel,
      });
      persistPreferences(get());

      if (result.error) {
        const blocking = options?.strict !== false && !result.ok;
        set({
          preflightStatus: "failed",
          preflightMessage: result.error.message,
          audioWarning: result.error.code === "no_signal" ? result.error.message : get().audioWarning,
          ...(blocking ? { error: result.error.message } : {}),
        });
        return !blocking && result.ok;
      }

      const hints: string[] = [];
      if (result.clipping) {
        hints.push("Input level is very hot — lower gain to avoid clipping.");
      }

      set({
        preflightStatus: "ready",
        preflightMessage: result.hasSignal
          ? `Input OK on “${result.deviceLabel}”.`
          : `Opened “${result.deviceLabel}” — speak during the test to confirm signal.`,
        audioWarning: result.clipping ? hints[0] ?? null : null,
        error: null,
      });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Microphone preflight failed.";
      set({
        preflightStatus: "failed",
        preflightMessage: message,
        error: message,
      });
      return false;
    }
  },

  setModelId: (id) => {
    const supported = engineSupported(id);
    set((state) => ({
      modelId: id,
      speechSupported: supported,
      // A warning about the previous engine is stale once the operator picks another.
      ...(state.status === "unavailable"
        ? { status: "idle" as const, error: supported ? null : unsupportedMessage() }
        : {}),
    }));
    persistPreferences(get());
  },
  setAudioDeviceId: (id) => {
    const devices = get().audioDevices;
    set({
      audioDeviceId: id,
      audioDeviceLabel: audioInputLabel(devices, id),
      preflightStatus: "idle",
      preflightMessage: null,
    });
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
    void refreshPreviewOutput(get, set);
  },
  setMinConfidence: (level) => {
    set({ minConfidence: level });
    persistPreferences(get());
  },
  setAutoGoLive: (enabled) => {
    set({ autoGoLive: enabled });
    persistPreferences(get());
  },
  setSelectedSuggestion: (id) => set({ selectedSuggestionId: id }),

  selectAndPresentSuggestion: async (suggestion) => {
    set({ selectedSuggestionId: suggestion.id });
    const state = get();

    // Possible quotes stay in the queue until Preview / Go live — never jump
    // onto the projector from a list click, even when Auto is on.
    if (isOperatorVerifyOnly(suggestion)) {
      return;
    }

    const takeLive = shouldPresentVerseToProgram(state.autoGoLive) && isExplicitScripture(suggestion);

    if (takeLive) {
      const session = await presentDetectedScripture(suggestion, state.previewLayout);
      set({
        verseSession: session,
        selectedSuggestionId: suggestion.id,
        lastVoiceAction: `Live — ${sessionProgressLabel(session)}`,
      });
      get().markSuggestionStatus(suggestion.id, "live");
      return;
    }

    await applySuggestionOutput(suggestion, get, set, { forceStage: true });
  },

  previewSuggestion: async (suggestion) => {
    // Operator chose Preview — allowed for quotes after verification glance.
    await applySuggestionOutput(suggestion, get, set, { forceStage: true });
  },

  refreshPreviewOutput: async () => {
    await refreshPreviewOutput(get, set);
  },

  goLiveSelectedSuggestion: async () => {
    const state = get();
    const suggestion =
      state.suggestions.find((s) => s.id === state.selectedSuggestionId && s.status !== "ignored") ??
      activeSuggestions(state)[0];

    let session = state.verseSession;
    if (!session && suggestion) {
      session = await createExpandedVerseSessionFromSuggestion(suggestion);
    }
    if (!session && !suggestion) {
      set({ lastVoiceAction: "Nothing staged — select a scripture first" });
      return;
    }

    if (suggestion) {
      session = await presentDetectedScripture(suggestion, state.previewLayout);
    } else if (session) {
      await presentVerseSession(session, state.previewLayout, true);
    }

    if (!session) return;

    set({
      verseSession: session,
      selectedSuggestionId: suggestion?.id ?? state.selectedSuggestionId,
      lastVoiceAction: `Live — ${sessionProgressLabel(session)}`,
    });
    if (suggestion) {
      get().markSuggestionStatus(suggestion.id, "live");
    }
  },

  stepActiveVerse: async (delta) => {
    const session = get().verseSession;
    if (!session) return false;
    const next = stepVerseSession(session, delta);
    if (!next) return false;
    set({ verseSession: next, lastVoiceAction: sessionProgressLabel(next) });
    await presentVerseSession(next, get().previewLayout, shouldPresentVerseToProgram(get().autoGoLive));
    return true;
  },

  switchActiveTranslation: async (translationId) => {
    const session = get().verseSession;
    useBibleStore.getState().setTranslation(translationId);
    if (!session) return true;
    const updated = await reloadVerseSessionTranslation(session, translationId);
    if (!updated) return false;
    set({ verseSession: updated, lastVoiceAction: sessionProgressLabel(updated) });
    await presentVerseSession(updated, get().previewLayout, shouldPresentVerseToProgram(get().autoGoLive));
    return true;
  },

  startListening: async () => {
    const state = get();
    if (state.status === "listening") return;

    if (!engine || engineModelId !== state.modelId) {
      engine?.stop();
      engine = createTranscriptionEngine(state.modelId);
      engineModelId = state.modelId;
    }

    if (!engine.isSupported()) {
      set({ error: unsupportedMessage(), status: "unavailable", speechSupported: false });
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

    // Fail here with a clear instruction rather than inside the engine mid-service.
    const storedEngineConfig = await loadStoredEngineConfig();
    const configProblem = engineConfigError(state.modelId, storedEngineConfig);
    if (configProblem) {
      set({ error: configProblem, status: "unavailable" });
      return;
    }

    const preflightOk = await get().preflightAudio({ strict: false });
    const afterPreflight = get();
    if (!preflightOk && afterPreflight.preflightStatus === "failed") {
      const preflightError = afterPreflight.preflightMessage;
      const permissionBlocked =
        preflightError?.includes("permission") || preflightError?.includes("denied");
      if (permissionBlocked || afterPreflight.audioDevices.length === 0) {
        set({
          error: preflightError ?? "Could not access microphone.",
          status: "unavailable",
        });
        return;
      }
    }

    const audioDeviceId = afterPreflight.audioDeviceId;

    clearReferenceDedupeCache();
    resetVoiceNavGuard(voiceNavGuard);

    const freshSession = state.status !== "paused" && state.status !== "stopped";
    if (freshSession) {
      set({
        ...resetWorkspaceState(get().suggestions.filter(isWaitingNotesReference)),
        status: "idle",
        speechSupported: true,
      });
    }

    const sessionId = freshSession ? crypto.randomUUID() : (get().sessionId ?? crypto.randomUUID());
    const startedAt = freshSession ? Date.now() : (get().startedAt ?? Date.now());
    lastReportedAudioLevel = 0;
    sessionPeakAudioLevel = 0;

    const noSignalHint =
      get().preflightStatus === "failed" && get().preflightMessage?.includes("No audio detected")
        ? get().preflightMessage
        : null;

    set({
      status: "listening",
      sessionId,
      startedAt,
      error: hasBible
        ? null
        : "Listening — install a Bible translation in Settings to enable scripture detection.",
      partialText: "",
      speechSupported: true,
      audioWarning: noSignalHint,
      audioDeviceLabel: afterPreflight.audioDeviceLabel,
    });

    try {
      await startLevelMonitor(audioDeviceId, set, get);
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Could not open the selected microphone.",
        status: "unavailable",
      });
      return;
    }

    await engine.start(
      {
        onPartial: (text) => {
          set({ partialText: text, audioWarning: null });
          useCaptionStore.getState().pushPartial(text);
          schedulePartialScan(get, set);
        },
        onFinal: async (text, info) => {
          useCaptionStore.getState().pushFinal(text);
          const startedAt = get().startedAt ?? Date.now();
          const offsetMs = Date.now() - startedAt;
          const segment: TranscriptSegment = {
            id: newSegmentId(),
            text,
            isFinal: true,
            offsetMs,
            timestamp: timestampNow(),
            language: info?.language,
          };
          set((s) => ({
            partialText: "",
            segments: [...s.segments, segment],
            status: "processing",
            audioWarning: null,
            heardLanguage: info?.language ?? s.heardLanguage,
          }));

          // Verse nav runs on finalized speech only — exactly ±1 per cue.
          const handledNav = await processVoiceCommands(text, get, set, { source: "final" });
          if (!handledNav && resolveTranslationId()) {
            await runSegmentScan(get, set, text, segment.id);
            await runContextScan(get, set, segment.id);
          }
          set({ status: "listening" });
        },
        onStatus: (status) => {
          if (status === "reconnecting") set({ status: "reconnecting" });
          else if (status === "processing") set({ status: "processing" });
          else if (status === "listening") set({ status: "listening" });
          else if (status === "paused") set({ status: "paused" });
          else if (status === "stopped") set({ status: "stopped" });
          else if (status === "unavailable") set({ status: "unavailable" });
        },
        onError: (message) => set({ error: message, status: "unavailable" }),
      },
      {
        modelId: state.modelId,
        // Browser speech takes one locale; bilingual services fall back to its first.
        language: speechLocales(normalizeLanguage(storedEngineConfig.whisperLanguage))[0],
        config: toEngineConfig(storedEngineConfig),
      },
      audioDeviceId,
    );
  },

  pauseListening: () => {
    engine?.pause();
    window.clearTimeout(partialScanTimer);
    void stopLevelMonitor();
    set({ status: "paused", partialText: "", audioLevel: 0 });
    useCaptionStore.getState().clear();
  },

  resumeListening: async () => {
    engine?.resume();
    set({ status: "listening" });
    try {
      await startLevelMonitor(get().audioDeviceId, set, get);
    } catch (err) {
      set({
        audioWarning: err instanceof Error ? err.message : "Could not reopen microphone for level monitoring.",
      });
    }
  },

  stopListening: () => {
    engine?.stop();
    window.clearTimeout(partialScanTimer);
    void stopLevelMonitor();
    lastReportedAudioLevel = 0;
    sessionPeakAudioLevel = 0;
    set({ status: "stopped", partialText: "", audioLevel: 0, audioWarning: null });
    useCaptionStore.getState().clear();
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
        existingReferences: activeSuggestions(get()).map((s) => s.reference),
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
        detections: activeSuggestions(state).map((s) => ({
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
    void stopLevelMonitor();
    get().resetListeningWorkspace();
    set({
      status: "idle",
      audioLevel: 0,
      audioWarning: null,
      preflightStatus: "idle",
      preflightMessage: null,
    });
  },

  ignoreSuggestion: (id) => {
    const prev = get().suggestions.find((item) => item.id === id);
    if (prev && prev.notes !== "planned") {
      recordCorrectionIgnore(prev.detectedPhrase, prev.reference);
    }
    set((s) => ({
      suggestions: s.suggestions.map((item) =>
        item.id === id ? { ...item, status: "ignored" } : item,
      ),
      selectedSuggestionId: s.selectedSuggestionId === id ? null : s.selectedSuggestionId,
    }));
  },

  correctSuggestionReference: async (id, reference) => {
    const prev = get().suggestions.find((item) => item.id === id);
    if (!prev) return;

    const translationId = useBibleStore.getState().selectedTranslationId || prev.translationId;
    try {
      const result = await api.lookupReference(reference, translationId);
      const verses = result.search.verses;
      if (verses.length === 0) return;

      const resolved =
        result.search.parsed_reference != null
          ? (() => {
              const p = result.search.parsed_reference!;
              if (p.verse_start) {
                if (p.verse_end && p.verse_end !== p.verse_start) {
                  return `${p.book_name} ${p.chapter}:${p.verse_start}-${p.verse_end}`;
                }
                return `${p.book_name} ${p.chapter}:${p.verse_start}`;
              }
              return `${p.book_name} ${p.chapter}`;
            })()
          : reference;

      recordCorrectionOverride(prev.detectedPhrase, prev.reference, resolved);

      const corrected: ScriptureSuggestion = {
        ...prev,
        reference: resolved,
        verses,
        versePreview: verses[0]?.text ?? "",
        translationId,
        translationAbbr: verses[0]?.translation_abbr ?? prev.translationAbbr,
        confidence: Math.max(0.7, prev.confidence),
        confidenceLevel: "medium",
        detectionType: "inferred",
        status: "preview",
      };

      set((s) => ({
        suggestions: s.suggestions.map((item) => (item.id === id ? corrected : item)),
        selectedSuggestionId: id,
      }));

      await applySuggestionOutput(corrected, get, set);
    } catch {
      /* lookup failed — keep prior suggestion */
    }
  },

  markSuggestionStatus: (id, status) => {
    const prev = get().suggestions.find((item) => item.id === id);
    if (status === "live" && prev && prev.notes !== "planned") {
      recordCorrectionAccept(prev.detectedPhrase, prev.reference);
    }
    set((s) => ({
      suggestions: s.suggestions.map((item) => {
        if (item.id === id) return { ...item, status };
        // Only one suggestion can be live — demote the previous live cue into history.
        if (status === "live" && item.status === "live") {
          return { ...item, status: "presented" };
        }
        return item;
      }),
    }));
  },

  tickElapsed: () => {
    const { startedAt, status } = get();
    if (!startedAt || status === "idle" || status === "stopped") return;
    set({ elapsedMs: Date.now() - startedAt });
  },

  loadSermonNotes: async (passages) => {
    const translationId = resolveTranslationId();
    if (!translationId) {
      set({ error: "No Bible translation loaded — install a Bible version in Settings." });
      return 0;
    }
    const built = await Promise.all(
      passages.map((p) => buildSuggestionFromReference(p.reference, notesContext(p), translationId, "explicit", 1)),
    );
    // One timestamp keeps them in the order they were written.
    const createdAt = new Date().toISOString();
    const planned: ScriptureSuggestion[] = built.flatMap((b) =>
      b ? [{ ...b, id: newSuggestionId(), status: "queued" as const, createdAt, notes: "planned" as const }] : [],
    );
    set((s) => ({
      sermonNotes: passages,
      suggestions: [...s.suggestions.filter((item) => !isWaitingNotesReference(item)), ...planned],
    }));
    return planned.length;
  },

  clearSermonNotes: () =>
    set((s) => ({
      sermonNotes: [],
      suggestions: s.suggestions.filter((item) => !isWaitingNotesReference(item)),
    })),

  resetListeningWorkspace: () => {
    window.clearTimeout(partialScanTimer);
    clearReferenceDedupeCache();
    const presentation = usePresentationStore.getState();
    if (presentation.previewSource === "transcription") {
      presentation.clearPreview();
    }
    set(resetWorkspaceState(get().suggestions.filter(isWaitingNotesReference)));
  },
}));
