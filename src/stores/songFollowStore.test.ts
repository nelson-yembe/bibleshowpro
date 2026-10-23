import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HeardSong } from "@/lib/tauri";

const api = vi.hoisted(() => ({ matchHeardSong: vi.fn() }));
vi.mock("@/lib/tauri", () => ({ api, tauriInvoke: vi.fn() }));

const { useSongFollowStore } = await import("@/stores/songFollowStore");
const { useSongStore } = await import("@/stores/songStore");
const { usePresentationStore } = await import("@/stores/presentationStore");

const slides = [
  { id: "v1-0", text: "Amazing grace, how sweet the sound\nThat saved a wretch like me" },
  { id: "v2-1", text: "’Twas grace that taught my heart to fear\nAnd grace my fears relieved" },
];

function showSlide(index: number, nextSlide = vi.fn(async () => {})) {
  useSongStore.setState({
    activeSong: { id: "grace", title: "Amazing Grace" } as never,
    currentSlide: () => slides[index] as never,
    nextSlidePreview: () => (slides[index + 1] ?? null) as never,
    nextSlide,
  });
  usePresentationStore.setState({ program: { id: `song-grace-${slides[index].id}`, type: "song_lyrics", content: {} } });
  return nextSlide;
}

describe("following the singing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSongFollowStore.setState({ following: true, suggestion: null });
  });

  it("moves to the next slide when its first line is sung", () => {
    const nextSlide = showSlide(0);
    const feed = useSongFollowStore.getState().feed;
    feed("amazing grace how sweet the sound", true); // the slide is new: this only sets the start
    feed("that saved a wretch like me", true);
    expect(nextSlide).not.toHaveBeenCalled();
    feed("twas grace that taught my heart", false);
    expect(nextSlide).toHaveBeenCalledTimes(1);
  });

  it("leaves the slides alone when following is off", () => {
    useSongFollowStore.setState({ following: false });
    const nextSlide = showSlide(0);
    const feed = useSongFollowStore.getState().feed;
    feed("amazing grace", true);
    feed("twas grace that taught my heart to fear", true);
    expect(nextSlide).not.toHaveBeenCalled();
  });
});

describe("recognising a song", () => {
  const heard: HeardSong = {
    songId: "great",
    title: "How Great Thou Art",
    sectionId: "chorus",
    sectionLabel: "Chorus",
    line: "Then sings my soul",
    score: 0.9,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    usePresentationStore.setState({ program: null });
    useSongStore.setState({ activeSong: null });
    useSongFollowStore.setState({ following: true, suggestion: null });
  });

  it("offers the song when nothing is being followed", async () => {
    api.matchHeardSong.mockResolvedValue([heard]);
    useSongFollowStore.getState().feed("then sings my soul my saviour god to thee", true);
    await vi.waitFor(() => expect(useSongFollowStore.getState().suggestion?.title).toBe("How Great Thou Art"));
  });

  it("does not offer a song the operator dismissed", async () => {
    api.matchHeardSong.mockResolvedValue([heard]);
    useSongFollowStore.setState({ suggestion: heard });
    useSongFollowStore.getState().dismiss();
    useSongFollowStore.getState().feed("then sings my soul my saviour god to thee", true);
    await vi.waitFor(() => expect(api.matchHeardSong).toHaveBeenCalled());
    await Promise.resolve();
    expect(useSongFollowStore.getState().suggestion).toBeNull();
  });
});
