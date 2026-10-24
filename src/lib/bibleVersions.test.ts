import { describe, expect, it } from "vitest";
import { isUsableVersion } from "@/lib/bibleVersions";

describe("isUsableVersion", () => {
  it("counts a partial Bible imported from a file", () => {
    expect(isUsableVersion({ installed: true, verse_count: 19_303, install_method: "imported" })).toBe(true);
    expect(isUsableVersion({ installed: true, verse_count: 7_957, install_method: "imported" })).toBe(true);
  });

  it("does not count a catalog download that never finished", () => {
    expect(isUsableVersion({ installed: false, verse_count: 2, install_method: "download" })).toBe(false);
    expect(isUsableVersion({ installed: true, verse_count: 31_102, install_method: "download" })).toBe(true);
  });
});
