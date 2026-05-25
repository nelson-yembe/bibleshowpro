import { describe, expect, it } from "vitest";
import { sceneFromVerses, DEFAULT_THEME } from "@/engine/scene";
import type { VerseResult } from "@/lib/tauri";
import {
  createInitialSnapshot,
  setPreview,
  takeProgram,
  undoProgram,
} from "@/engine/previewProgram";

const sampleVerse: VerseResult = {
  id: 1,
  translation_id: "kjv",
  translation_abbr: "KJV",
  book_number: 43,
  book_name: "John",
  chapter: 3,
  verse: 16,
  text: "For God so loved the world...",
  reference: "John 3:16",
};

describe("scene engine", () => {
  it("builds scripture scene from verses", () => {
    const scene = sceneFromVerses([sampleVerse], DEFAULT_THEME);
    expect(scene.type).toBe("scripture_fullscreen");
    expect(scene.content.reference).toBe("John 3:16");
    expect(scene.content.body).toContain("16");
  });
});

describe("preview/program", () => {
  it("moves preview to program on go live", () => {
    const initial = createInitialSnapshot();
    const scene = sceneFromVerses([sampleVerse]);
    const withPreview = setPreview(initial, scene);
    const live = takeProgram(withPreview);
    expect(live.program?.content.reference).toBe("John 3:16");
    expect(live.preview).toBeNull();
  });

  it("supports undo", () => {
    const initial = createInitialSnapshot();
    const first = sceneFromVerses([sampleVerse]);
    const second = sceneFromVerses([{ ...sampleVerse, verse: 17, reference: "John 3:17", text: "Verse 17" }]);
    let state = setPreview(initial, first);
    state = takeProgram(state);
    state = setPreview(state, second);
    state = takeProgram(state);
    state = undoProgram(state);
    expect(state.program?.content.reference).toBe("John 3:16");
  });
});
