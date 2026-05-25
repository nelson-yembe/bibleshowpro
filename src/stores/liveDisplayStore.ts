import { create } from "zustand";
import type { DisplayOptions } from "@/components/presentation/displayOptions";

interface LiveDisplayState {
  displayOptions?: Partial<DisplayOptions>;
  setDisplayOptions: (options?: Partial<DisplayOptions>) => void;
}

export const useLiveDisplayStore = create<LiveDisplayState>((set) => ({
  displayOptions: undefined,
  setDisplayOptions: (displayOptions) => set({ displayOptions }),
}));
