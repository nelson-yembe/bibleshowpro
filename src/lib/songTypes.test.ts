import { describe, expect, it } from "vitest";
import { splitLyricsToSlides } from "@/lib/songTypes";

describe("splitLyricsToSlides (stanza-aware)", () => {
  it("keeps a whole stanza together when it fits", () => {
    expect(splitLyricsToSlides("line one\nline two\nline three", 4)).toEqual([
      "line one\nline two\nline three",
    ]);
  });

  it("balances an oversized stanza without leaving an orphan line", () => {
    // 5 lines @ 4 per slide -> 3 + 2 (not 4 + 1)
    expect(splitLyricsToSlides("a\nb\nc\nd\ne", 4)).toEqual(["a\nb\nc", "d\ne"]);
  });

  it("splits 8 lines evenly into 4 + 4", () => {
    expect(splitLyricsToSlides("a\nb\nc\nd\ne\nf\ng\nh", 4)).toEqual([
      "a\nb\nc\nd",
      "e\nf\ng\nh",
    ]);
  });

  it("respects blank-line stanza breaks instead of merging couplets", () => {
    expect(splitLyricsToSlides("a\nb\n\nc\nd", 4)).toEqual(["a\nb", "c\nd"]);
  });

  it("treats multiple consecutive blank lines as a single break", () => {
    expect(splitLyricsToSlides("a\nb\n\n\n\nc\nd", 4)).toEqual(["a\nb", "c\nd"]);
  });

  it("returns no slides for empty or whitespace-only lyrics", () => {
    expect(splitLyricsToSlides("\n\n  \n", 4)).toEqual([]);
  });

  it("guards against linesPerSlide < 1", () => {
    expect(splitLyricsToSlides("a\nb", 0)).toEqual(["a", "b"]);
  });
});
