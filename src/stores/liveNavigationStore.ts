import { create } from "zustand";

export interface LiveNavigationHandlers {
  onPrev?: () => void;
  onNext?: () => void;
  canPrev?: boolean;
  canNext?: boolean;
  label?: string;
  /** Sync preview immediately before take (e.g. Bible lower-third layout). */
  beforeGoLive?: () => void | Promise<void>;
}

interface LiveNavigationState {
  handlers: LiveNavigationHandlers | null;
  register: (handlers: LiveNavigationHandlers) => void;
  unregister: () => void;
}

export const useLiveNavigationStore = create<LiveNavigationState>((set) => ({
  handlers: null,
  register: (handlers) => set({ handlers }),
  unregister: () => set({ handlers: null }),
}));
