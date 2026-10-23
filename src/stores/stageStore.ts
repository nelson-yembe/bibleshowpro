import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import { tauriInvoke } from "@/lib/tauri";

const DISPLAY_KEY = "bsp-stage-display";

function readDisplayId(): string {
  try {
    return localStorage.getItem(DISPLAY_KEY) ?? "";
  } catch {
    return "";
  }
}

interface StageStoreState {
  open: boolean;
  /** Screen the stage display fills; "" = a window the operator places by hand. */
  displayId: string;
  /** Message showing on the stage display right now. */
  message: string;
  error: string | null;
  init: () => Promise<void>;
  openStage: () => Promise<void>;
  closeStage: () => Promise<void>;
  setDisplayId: (id: string) => void;
  sendMessage: (message: string) => Promise<void>;
}

let listening = false;

export const useStageStore = create<StageStoreState>((set, get) => ({
  open: false,
  displayId: readDisplayId(),
  message: "",
  error: null,

  init: async () => {
    if (!listening) {
      listening = true;
      void listen("stage-opened", () => set({ open: true })).catch(() => {});
      void listen("stage-closed", () => set({ open: false })).catch(() => {});
    }
    try {
      const state = await tauriInvoke<{ open: boolean; message: string }>("get_stage_state");
      set({ open: state.open, message: state.message });
    } catch {
      // Browser dev server: no backend, no stage window.
    }
  },

  openStage: async () => {
    try {
      await tauriInvoke("open_stage_display", { displayId: get().displayId || null });
      set({ open: true, error: null });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  closeStage: async () => {
    try {
      await tauriInvoke("close_stage_display");
    } finally {
      set({ open: false });
    }
  },

  setDisplayId: (displayId) => {
    try {
      localStorage.setItem(DISPLAY_KEY, displayId);
    } catch {
      // Remembering the screen is a convenience.
    }
    set({ displayId });
  },

  sendMessage: async (message) => {
    const trimmed = message.trim();
    set({ message: trimmed });
    try {
      await tauriInvoke("set_stage_message", { message: trimmed });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },
}));
