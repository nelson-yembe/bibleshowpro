import { describe, expect, it } from "vitest";
import type { Scene } from "@/engine/scene";
import { stageBodySize, stageTextOf } from "@/lib/stageText";

function scene(type: Scene["type"], content: Scene["content"]): Scene {
  return { id: "s", type, content };
}

const verse = (n: number, text: string) =>
  ({ id: n, translation_id: "kjv", translation_abbr: "KJV", book_number: 43, book_name: "John", chapter: 3, verse: n, text, reference: `John 3:${n}` });

describe("stageTextOf", () => {
  it("shows a single verse with its reference and translation", () => {
    const text = stageTextOf(
      scene("scripture_fullscreen", { reference: "John 3:16", translationAbbr: "KJV", verses: [verse(16, "For God so loved the world")] }),
    );
    expect(text).toEqual({ kind: "verse", heading: "John 3:16 (KJV)", body: "For God so loved the world" });
  });

  it("numbers several verses so the preacher can follow along", () => {
    const text = stageTextOf(
      scene("scripture_lower_third", { reference: "John 3:16-17", verses: [verse(16, "For God so loved"), verse(17, "For God sent not")] }),
    );
    expect(text?.body).toBe("16 For God so loved 17 For God sent not");
  });

  it("shows song lines and announcements as words", () => {
    expect(stageTextOf(scene("song_lyrics", { title: "Amazing Grace", body: "Amazing grace, how sweet the sound" }))).toEqual({
      kind: "lyrics",
      heading: "Amazing Grace",
      body: "Amazing grace, how sweet the sound",
    });
    expect(stageTextOf(scene("announcement", { body: "Youth meeting at 5" }))?.heading).toBe("Announcement");
  });

  it("says what the screen is doing when there are no words", () => {
    expect(stageTextOf(scene("blackout", {}))?.heading).toBe("Screen is black");
    expect(stageTextOf(scene("blank", {}))?.heading).toBe("Screen is clear");
    expect(stageTextOf(scene("video", {}))?.kind).toBe("media");
    expect(stageTextOf(null)).toBeNull();
  });
});

describe("stageBodySize", () => {
  it("steps text down as a passage gets longer", () => {
    expect(stageBodySize("Jesus wept.")).toBe("large");
    expect(stageBodySize("x".repeat(300))).toBe("medium");
    expect(stageBodySize("x".repeat(500))).toBe("small");
  });
});
