import { create } from "zustand";
import { emit, listen } from "@tauri-apps/api/event";
import {
  appendFinalLine,
  DEFAULT_CAPTION_SETTINGS,
  normalizeCaptionText,
  sanitizeCaptionSettings,
  type CaptionSettings,
} from "@/lib/captions";

const EVENT = "caption-update";
const STORAGE_KEY = "bsp-caption-settings";
/** Interim results arrive several times a second; control changes go out immediately. */
const PARTIAL_THROTTLE_MS = 120;

export interface CaptionSnapshot {
  settings: CaptionSettings;
  finalLines: string[];
  partial: string;
  /** Bumped on every push so the overlay can distinguish a repeat from silence. */
  revision: number;
}

interface CaptionState extends CaptionSnapshot {
  pushPartial: (text: string) => void;
  pushFinal: (text: string) => void;
  clear: () => void;
  updateSettings: (patch: Partial<CaptionSettings>) => void;
  applyRemote: (snapshot: CaptionSnapshot) => void;
}

function loadSettings(): CaptionSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CAPTION_SETTINGS };
    return sanitizeCaptionSettings(JSON.parse(raw) as Partial<CaptionSettings>);
  } catch {
    return { ...DEFAULT_CAPTION_SETTINGS };
  }
}

function persistSettings(settings: CaptionSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Private mode or blocked storage — settings stay in memory for this session.
  }
}

function snapshotOf(state: CaptionSnapshot): CaptionSnapshot {
  return {
    settings: state.settings,
    finalLines: state.finalLines,
    partial: state.partial,
    revision: state.revision,
  };
}

let lastEmit = 0;
let pendingEmit: CaptionSnapshot | null = null;
let emitTimer: number | undefined;

async function broadcast(snapshot: CaptionSnapshot, force = false) {
  const now = Date.now();
  if (!force && now - lastEmit < PARTIAL_THROTTLE_MS) {
    pendingEmit = snapshot;
    if (emitTimer == null) {
      emitTimer = window.setTimeout(() => {
        emitTimer = undefined;
        if (pendingEmit) {
          const next = pendingEmit;
          pendingEmit = null;
          void broadcast(next, true);
        }
      }, PARTIAL_THROTTLE_MS);
    }
    return;
  }
  lastEmit = now;
  pendingEmit = null;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: snapshot }));
  try {
    await emit(EVENT, snapshot);
  } catch {
    // Browser / tests without Tauri
  }
}

export const useCaptionStore = create<CaptionState>((set, get) => ({
  settings: loadSettings(),
  finalLines: [],
  partial: "",
  revision: 0,

  pushPartial: (text) => {
    const state = get();
    if (!state.settings.enabled) return;
    const partial = normalizeCaptionText(text);
    if (partial === state.partial) return;
    const next = { ...snapshotOf(state), partial, revision: state.revision + 1 };
    set(next);
    void broadcast(next);
  },

  pushFinal: (text) => {
    const state = get();
    if (!state.settings.enabled) return;
    const finalLines = appendFinalLine(state.finalLines, text, state.settings.maxLines);
    if (finalLines === state.finalLines && !state.partial) return;
    const next = {
      ...snapshotOf(state),
      finalLines,
      partial: "",
      revision: state.revision + 1,
    };
    set(next);
    void broadcast(next, true);
  },

  clear: () => {
    const state = get();
    const next = {
      ...snapshotOf(state),
      finalLines: [],
      partial: "",
      revision: state.revision + 1,
    };
    set(next);
    void broadcast(next, true);
  },

  updateSettings: (patch) => {
    const state = get();
    const settings = sanitizeCaptionSettings({ ...state.settings, ...patch });
    persistSettings(settings);
    // Turning captions off clears what is on screen rather than freezing it there.
    const cleared = !settings.enabled;
    const next: CaptionSnapshot = {
      settings,
      finalLines: cleared ? [] : state.finalLines.slice(-settings.maxLines),
      partial: cleared ? "" : state.partial,
      revision: state.revision + 1,
    };
    set(next);
    void broadcast(next, true);
  },

  applyRemote: (snapshot) => {
    set({
      settings: sanitizeCaptionSettings(snapshot.settings ?? {}),
      finalLines: snapshot.finalLines ?? [],
      partial: snapshot.partial ?? "",
      revision: snapshot.revision ?? 0,
    });
  },
}));

/** Subscribe main/output windows to cross-webview caption updates. */
export function startCaptionBridge(options?: { applyRemote?: boolean }) {
  const applyRemote = options?.applyRemote ?? true;

  const onLocal = (event: Event) => {
    if (!applyRemote) return;
    const detail = (event as CustomEvent<CaptionSnapshot>).detail;
    if (detail) useCaptionStore.getState().applyRemote(detail);
  };
  window.addEventListener(EVENT, onLocal);

  let unlisten: (() => void) | undefined;
  void listen<CaptionSnapshot>(EVENT, (event) => {
    if (applyRemote) useCaptionStore.getState().applyRemote(event.payload);
  }).then((fn) => {
    unlisten = fn;
  });

  return () => {
    window.removeEventListener(EVENT, onLocal);
    unlisten?.();
  };
}
