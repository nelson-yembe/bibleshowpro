import { describe, expect, it } from "vitest";
import { coverage, lyricWords, openingOf, shouldAdvance } from "@/lib/lyricsFollow";

const verse = "Amazing grace, how sweet the sound\nThat saved a wretch like me";
const verse2 = "’Twas grace that taught my heart to fear\nAnd grace my fears relieved";
const chorus = "How great Thou art\nHow great Thou art";

describe("lyric matching", () => {
  it("folds case, accents and apostrophes", () => {
    expect(lyricWords("’Twas Grâce, that taught")).toEqual(["twas", "grace", "that", "taught"]);
  });

  it("counts words heard in order, forgiving a misheard one", () => {
    expect(coverage(lyricWords("that saved a wreck like me"), lyricWords("That saved a wretch like me"))).toBeCloseTo(5 / 6);
  });

  it("uses two lines when the first is too short to tell", () => {
    expect(openingOf("Hallelujah\nWe sing your praise")).toEqual(["hallelujah", "we", "sing", "your", "praise"]);
  });
});

describe("shouldAdvance", () => {
  it("moves on when the next slide's first line is sung", () => {
    const heard = lyricWords("like me twas grace that taught my heart");
    expect(shouldAdvance({ heard, current: verse, next: verse2, closingHeard: false })).toBe(true);
  });

  it("waits while the slide on screen is still being sung", () => {
    const heard = lyricWords("amazing grace how sweet the sound");
    expect(shouldAdvance({ heard, current: verse, next: verse2, closingHeard: false })).toBe(false);
  });

  it("does not skip a repeated chorus until this one has ended", () => {
    const heard = lyricWords("how great thou art how great");
    expect(shouldAdvance({ heard, current: chorus, next: chorus, closingHeard: false })).toBe(false);
    expect(shouldAdvance({ heard, current: chorus, next: chorus, closingHeard: true })).toBe(true);
  });

  it("stops at the last slide", () => {
    expect(shouldAdvance({ heard: lyricWords("anything"), current: verse, next: null, closingHeard: true })).toBe(false);
  });
});
