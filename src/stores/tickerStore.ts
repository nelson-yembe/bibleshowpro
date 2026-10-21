import { create } from "zustand";
import { emit, listen } from "@tauri-apps/api/event";
import {
  DEFAULT_TICKER_SETTINGS,
  sanitizeTickerSettings,
  type TickerSettings,
} from "@/lib/ticker";

const EVENT = "ticker-update";
const STORAGE_KEY = "bsp-ticker-settings";
/** Typing in the message box fires per keystroke; the trailing flush guarantees delivery. */
const EMIT_THROTTLE_MS = 120;

export interface TickerSnapshot {
  settings: TickerSettings;
  /** Bumped on every change so the output can restart the scroll animation. */
  revision: number;
}

interface TickerState extends TickerSnapshot {
  updateSettings: (patch: Partial<TickerSettings>) => void;
  applyRemote: (snapshot: TickerSnapshot) => void;
}

function loadSettings(): TickerSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_TICKER_SETTINGS };
    return sanitizeTickerSettings(JSON.parse(raw) as Partial<TickerSettings>);
  } catch {
    return { ...DEFAULT_TICKER_SETTINGS };
  }
}

function persistSettings(settings: TickerSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Private mode or blocked storage — settings stay in memory for this session.
  }
}

let lastEmit = 0;
let pendingEmit: TickerSnapshot | null = null;
let emitTimer: number | undefined;

async function broadcast(snapshot: TickerSnapshot, force = false) {
  const now = Date.now();
  if (!force && now - lastEmit < EMIT_THROTTLE_MS) {
    pendingEmit = snapshot;
    if (emitTimer == null) {
      emitTimer = window.setTimeout(() => {
        emitTimer = undefined;
        if (pendingEmit) {
          const next = pendingEmit;
          pendingEmit = null;
          void broadcast(next, true);
        }
      }, EMIT_THROTTLE_MS);
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

export const useTickerStore = create<TickerState>((set, get) => ({
  settings: loadSettings(),
  revision: 0,

  updateSettings: (patch) => {
    const state = get();
    const settings = sanitizeTickerSettings({ ...state.settings, ...patch });
    persistSettings(settings);
    const next: TickerSnapshot = { settings, revision: state.revision + 1 };
    set(next);
    // Turning the bar on or off should land at once; message edits can coalesce.
    void broadcast(next, patch.enabled !== undefined || patch.position !== undefined);
  },

  applyRemote: (snapshot) => {
    set({
      settings: sanitizeTickerSettings(snapshot.settings ?? {}),
      revision: snapshot.revision ?? 0,
    });
  },
}));

/** Subscribe main/output windows to cross-webview ticker updates. */
export function startTickerBridge(options?: { applyRemote?: boolean }) {
  const applyRemote = options?.applyRemote ?? true;

  const onLocal = (event: Event) => {
    if (!applyRemote) return;
    const detail = (event as CustomEvent<TickerSnapshot>).detail;
    if (detail) useTickerStore.getState().applyRemote(detail);
  };
  window.addEventListener(EVENT, onLocal);

  let unlisten: (() => void) | undefined;
  void listen<TickerSnapshot>(EVENT, (event) => {
    if (applyRemote) useTickerStore.getState().applyRemote(event.payload);
  }).then((fn) => {
    unlisten = fn;
  });

  return () => {
    window.removeEventListener(EVENT, onLocal);
    unlisten?.();
  };
}
