import { describe, expect, it, vi } from "vitest";
import type { VerseResult } from "@/lib/tauri";

const { showRemoteScripture } = await import("@/lib/liveActions");
const { usePresentationStore } = await import("@/stores/presentationStore");

const verse = (n: number): VerseResult => ({
  id: n,
  translation_id: "kjv",
  translation_abbr: "KJV",
  book_number: 43,
  book_name: "John",
  chapter: 3,
  verse: n,
  text: `verse ${n}`,
  reference: `John 3:${n}`,
});

describe("showRemoteScripture", () => {
  it("stages the verses, and takes them live only when the remote asked", async () => {
    const previewVerses = vi.fn();
    const goLive = vi.fn(async () => {});
    usePresentationStore.setState({ previewVerses, goLive });

    await showRemoteScripture([verse(16), verse(17)], false);
    expect(previewVerses).toHaveBeenCalledWith([verse(16), verse(17)], expect.anything(), "fullscreen");
    expect(goLive).not.toHaveBeenCalled();

    await showRemoteScripture([verse(18)], true);
    expect(goLive).toHaveBeenCalledTimes(1);
  });
});
