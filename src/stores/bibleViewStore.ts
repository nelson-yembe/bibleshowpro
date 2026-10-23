import { create } from "zustand";
import {
  defaultLocalDisplayOverrides,
  type LocalDisplayOverrides,
} from "@/components/presentation/displayOptions";
import type { VerseResult } from "@/lib/tauri";

export type BibleViewMode = "fullscreen" | "lower_third" | "compare" | "reader";

type Update<T> = T | ((previous: T) => T);

function resolve<T>(update: Update<T>, previous: T): T {
  return typeof update === "function" ? (update as (p: T) => T)(previous) : update;
}

/**
 * What the Bible page is showing, outside the page itself, so the phone remote and the
 * page drive one selection: the view tab, the operator's display overrides, and which
 * search result or slide is picked.
 */
interface BibleViewState {
  viewMode: BibleViewMode;
  localDisplay: LocalDisplayOverrides;
  /** Search result card the operator picked (highlighted in the results list). */
  selectedVerseId: number | null;
  /** The passage being shown when it is not part of a loaded chapter. */
  selectedGroup: VerseResult[] | null;
  /** Slide picked in search-results mode; in chapter mode the active verse is the slide. */
  activeSlideIndex: number;
  setViewMode: (mode: BibleViewMode) => void;
  setLocalDisplay: (update: Update<LocalDisplayOverrides>) => void;
  setSelectedVerseId: (id: number | null) => void;
  setSelectedGroup: (group: VerseResult[] | null) => void;
  setActiveSlideIndex: (index: number) => void;
}

export const useBibleViewStore = create<BibleViewState>((set) => ({
  viewMode: "fullscreen",
  localDisplay: defaultLocalDisplayOverrides,
  selectedVerseId: null,
  selectedGroup: null,
  activeSlideIndex: 0,
  setViewMode: (viewMode) => set({ viewMode }),
  setLocalDisplay: (update) => set((s) => ({ localDisplay: resolve(update, s.localDisplay) })),
  setSelectedVerseId: (selectedVerseId) => set({ selectedVerseId }),
  setSelectedGroup: (selectedGroup) => set({ selectedGroup }),
  setActiveSlideIndex: (activeSlideIndex) => set({ activeSlideIndex }),
}));
