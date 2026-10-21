import { describe, expect, it } from "vitest";
import {
  arrangementSectionIds,
  orderedSongSections,
  splitLyricsToSlides,
  type SongDetail,
} from "@/lib/songTypes";

function songWithArrangement(sectionOrderJson: string): SongDetail {
  return {
    id: "song-1",
    title: "Amazing Grace",
    tags_json: "[]",
    favorite: false,
    theme_json: "{}",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    sections: [
      {
        id: "sec-1",
        song_id: "song-1",
        section_type: "verse",
        label: "Verse 1",
        lyrics: "Amazing grace how sweet the sound",
        sort_order: 0,
      },
      {
        id: "sec-2",
        song_id: "song-1",
        section_type: "chorus",
        label: "Chorus",
        lyrics: "How sweet the sound",
        sort_order: 1,
      },
    ],
    arrangements: [
      {
        id: "arr-1",
        song_id: "song-1",
        name: "Default",
        section_order_json: sectionOrderJson,
        is_default: true,
      },
    ],
    slides: [],
  };
}

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

describe("arrangementSectionIds (corrupt arrangement data)", () => {
  it("uses the stored order when it is valid", () => {
    const song = songWithArrangement(JSON.stringify(["sec-2", "sec-1"]));
    expect(arrangementSectionIds(song)).toEqual(["sec-2", "sec-1"]);
  });

  it("falls back to upload order when the arrangement is empty text", () => {
    const song = songWithArrangement("");
    expect(arrangementSectionIds(song)).toEqual(["sec-1", "sec-2"]);
  });

  it("falls back to upload order when the arrangement is malformed JSON", () => {
    const song = songWithArrangement("{not json");
    expect(arrangementSectionIds(song)).toEqual(["sec-1", "sec-2"]);
  });

  it("falls back to upload order when the arrangement is null", () => {
    const song = songWithArrangement("null");
    expect(arrangementSectionIds(song)).toEqual(["sec-1", "sec-2"]);
  });

  it("falls back to upload order when the arrangement is not an array", () => {
    const song = songWithArrangement('{"sec-1":true}');
    expect(arrangementSectionIds(song)).toEqual(["sec-1", "sec-2"]);
  });

  it("drops non-string entries instead of throwing", () => {
    const song = songWithArrangement('["sec-2", 7, null, "sec-1"]');
    expect(arrangementSectionIds(song)).toEqual(["sec-2", "sec-1"]);
  });

  it("still resolves sections for projection when data is corrupt", () => {
    const song = songWithArrangement("{not json");
    expect(orderedSongSections(song).map((s) => s.id)).toEqual(["sec-1", "sec-2"]);
  });
});
