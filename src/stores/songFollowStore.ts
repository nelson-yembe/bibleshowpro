import { create } from "zustand";
import { closingOf, coverage, FOLLOW_MATCH, HEARD_WINDOW, lyricWords, shouldAdvance } from "@/lib/lyricsFollow";
import { api, type HeardSong } from "@/lib/tauri";
import { usePresentationStore } from "@/stores/presentationStore";
import { useSongStore } from "@/stores/songStore";

const FOLLOW_KEY = "bsp-follow-singing";
/** One slide per sung line at most, however fast the transcript arrives. */
const ADVANCE_COOLDOWN_MS = 1500;
/** Fewer words than this cannot tell one song from another. */
const MIN_WORDS_TO_MATCH = 4;

function readFollowing(): boolean {
  try {
    return localStorage.getItem(FOLLOW_KEY) !== "off";
  } catch {
    return true;
  }
}

interface SongFollowState {
  /** Advance song slides as the lines are sung. */
  following: boolean;
  /** A song the transcript sounds like, offered to the operator. */
  suggestion: HeardSong | null;
  setFollowing: (on: boolean) => void;
  /** Transcript text as it arrives; `final` once the engine has settled it. */
  feed: (text: string, final: boolean) => void;
  /** Stage the suggested song at the matched section, in preview. */
  accept: () => Promise<void>;
  dismiss: () => void;
}

let heardFinal: string[] = [];
let liveSlideKey: string | null = null;
let closingHeard = false;
let lastAdvanceAt = 0;
let matching = false;
const dismissed = new Set<string>();

/** The song slide on the projector, when the song store is on that same slide. */
function liveSongSlide() {
  const songs = useSongStore.getState();
  const song = songs.activeSong;
  const current = songs.currentSlide();
  const program = usePresentationStore.getState().program;
  if (!song || !current || program?.id !== `song-${song.id}-${current.id}`) return null;
  return { key: program.id, current: current.text, next: songs.nextSlidePreview()?.text ?? null };
}

export const useSongFollowStore = create<SongFollowState>((set, get) => ({
  following: readFollowing(),
  suggestion: null,

  setFollowing: (following) => {
    try {
      localStorage.setItem(FOLLOW_KEY, following ? "on" : "off");
    } catch {
      // Remembering the choice is a convenience.
    }
    set({ following });
  },

  feed: (text, final) => {
    const words = lyricWords(text);
    const heard = [...heardFinal, ...words].slice(-HEARD_WINDOW);
    if (final) heardFinal = heard;

    const live = liveSongSlide();
    if (live) {
      if (live.key !== liveSlideKey) {
        // A new slide: what was sung before it must not count towards the next one.
        liveSlideKey = live.key;
        closingHeard = false;
        heardFinal = final ? words.slice(-HEARD_WINDOW) : [];
        return;
      }
      if (!closingHeard && coverage(heard, closingOf(live.current)) >= FOLLOW_MATCH) closingHeard = true;
      const now = Date.now();
      if (
        get().following &&
        now - lastAdvanceAt >= ADVANCE_COOLDOWN_MS &&
        shouldAdvance({ heard, current: live.current, next: live.next, closingHeard })
      ) {
        lastAdvanceAt = now;
        void useSongStore.getState().nextSlide();
      }
      return;
    }
    liveSlideKey = null;

    if (!final || matching || heard.length < MIN_WORDS_TO_MATCH) return;
    matching = true;
    api
      .matchHeardSong(heard.join(" "))
      .then((found) => {
        const best = found.find((song) => !dismissed.has(song.songId));
        const active = useSongStore.getState().activeSong?.id;
        if (best && best.songId !== active && best.songId !== get().suggestion?.songId) set({ suggestion: best });
      })
      .catch(() => {
        // No library, or not in the desktop app: nothing to suggest.
      })
      .finally(() => {
        matching = false;
      });
  },

  accept: async () => {
    const suggestion = get().suggestion;
    if (!suggestion) return;
    set({ suggestion: null });
    const songs = useSongStore.getState();
    await songs.selectSong(suggestion.songId);
    if (suggestion.sectionId) {
      const index = useSongStore.getState().effectiveSlides().findIndex((s) => s.section_id === suggestion.sectionId);
      if (index > 0) useSongStore.getState().setSlideIndex(index);
    }
  },

  dismiss: () => {
    const suggestion = get().suggestion;
    if (suggestion) dismissed.add(suggestion.songId);
    set({ suggestion: null });
  },
}));
