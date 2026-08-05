import { create } from "zustand";
import { emit, listen } from "@tauri-apps/api/event";

export interface VideoPlaybackSnapshot {
  path: string | null;
  playing: boolean;
  currentTime: number;
  duration: number;
  muted: boolean;
  loop: boolean;
  volume: number;
  /** Bumped on intentional seeks so slave players can follow. */
  seekToken: number;
}

interface VideoPlaybackState extends VideoPlaybackSnapshot {
  bind: (path: string, options?: { autoPlay?: boolean; muted?: boolean; loop?: boolean }) => void;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  seek: (time: number) => void;
  restart: () => void;
  setMuted: (muted: boolean) => void;
  toggleMute: () => void;
  setLoop: (loop: boolean) => void;
  toggleLoop: () => void;
  setVolume: (volume: number) => void;
  reportTime: (currentTime: number, duration: number) => void;
  clear: () => void;
  applyRemote: (snapshot: VideoPlaybackSnapshot) => void;
}

const EVENT = "video-playback";

const initial: VideoPlaybackSnapshot = {
  path: null,
  playing: false,
  currentTime: 0,
  duration: 0,
  muted: false,
  loop: false,
  volume: 1,
  seekToken: 0,
};

function snapshotOf(state: VideoPlaybackSnapshot): VideoPlaybackSnapshot {
  return {
    path: state.path,
    playing: state.playing,
    currentTime: state.currentTime,
    duration: state.duration,
    muted: state.muted,
    loop: state.loop,
    volume: state.volume,
    seekToken: state.seekToken,
  };
}

let lastEmit = 0;
let pendingEmit: VideoPlaybackSnapshot | null = null;
let emitTimer: number | undefined;

async function broadcast(snapshot: VideoPlaybackSnapshot, force = false) {
  const now = Date.now();
  // Throttle time-scrub broadcasts; always send control changes immediately.
  if (!force && now - lastEmit < 120) {
    pendingEmit = snapshot;
    if (emitTimer == null) {
      emitTimer = window.setTimeout(() => {
        emitTimer = undefined;
        if (pendingEmit) {
          const next = pendingEmit;
          pendingEmit = null;
          void broadcast(next, true);
        }
      }, 120);
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

export const useVideoPlaybackStore = create<VideoPlaybackState>((set, get) => ({
  ...initial,

  bind: (path, options = {}) => {
    const current = get();
    if (current.path === path) {
      // Same clip — keep transport position unless caller forces autoplay restart.
      if (options.autoPlay) {
        const next = { ...snapshotOf(current), playing: true };
        set(next);
        void broadcast(next, true);
      }
      return;
    }
    const next: VideoPlaybackSnapshot = {
      path,
      playing: options.autoPlay ?? true,
      currentTime: 0,
      duration: 0,
      muted: options.muted ?? false,
      loop: options.loop ?? false,
      volume: 1,
      seekToken: current.seekToken + 1,
    };
    set(next);
    void broadcast(next, true);
  },

  play: () => {
    const next = { ...snapshotOf(get()), playing: true };
    set(next);
    void broadcast(next, true);
  },

  pause: () => {
    const next = { ...snapshotOf(get()), playing: false };
    set(next);
    void broadcast(next, true);
  },

  togglePlay: () => {
    if (get().playing) get().pause();
    else get().play();
  },

  seek: (time) => {
    const state = get();
    const clamped = Math.max(0, Math.min(time, state.duration || time));
    const next = {
      ...snapshotOf(state),
      currentTime: clamped,
      seekToken: state.seekToken + 1,
    };
    set(next);
    void broadcast(next, true);
  },

  restart: () => {
    const state = get();
    const next = {
      ...snapshotOf(state),
      currentTime: 0,
      playing: true,
      seekToken: state.seekToken + 1,
    };
    set(next);
    void broadcast(next, true);
  },

  setMuted: (muted) => {
    const next = { ...snapshotOf(get()), muted };
    set(next);
    void broadcast(next, true);
  },

  toggleMute: () => get().setMuted(!get().muted),

  setLoop: (loop) => {
    const next = { ...snapshotOf(get()), loop };
    set(next);
    void broadcast(next, true);
  },

  toggleLoop: () => get().setLoop(!get().loop),

  setVolume: (volume) => {
    const next = { ...snapshotOf(get()), volume: Math.max(0, Math.min(1, volume)) };
    set(next);
    void broadcast(next, true);
  },

  reportTime: (currentTime, duration) => {
    const state = get();
    if (!state.path) return;
    // Don't fight an in-flight seek; slaves update from seekToken.
    if (Math.abs(state.currentTime - currentTime) < 0.2 && Math.abs(state.duration - duration) < 0.05) {
      return;
    }
    set({ currentTime, duration: duration || state.duration });
  },

  clear: () => {
    set({ ...initial });
    void broadcast({ ...initial }, true);
  },

  applyRemote: (snapshot) => {
    set(snapshot);
  },
}));

/** Subscribe main/output windows to cross-webview playback updates. */
export function startVideoPlaybackBridge(options?: { applyRemote?: boolean }) {
  const applyRemote = options?.applyRemote ?? true;

  const onLocal = (event: Event) => {
    if (!applyRemote) return;
    const detail = (event as CustomEvent<VideoPlaybackSnapshot>).detail;
    if (detail) useVideoPlaybackStore.getState().applyRemote(detail);
  };
  window.addEventListener(EVENT, onLocal);

  let unlisten: (() => void) | undefined;
  void listen<VideoPlaybackSnapshot>(EVENT, (event) => {
    if (applyRemote) useVideoPlaybackStore.getState().applyRemote(event.payload);
  }).then((fn) => {
    unlisten = fn;
  });

  return () => {
    window.removeEventListener(EVENT, onLocal);
    unlisten?.();
  };
}

export function formatPlaybackTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
