import { describe, expect, it } from "vitest";
import { sceneFromServiceItem, sceneFromVerses, DEFAULT_THEME } from "@/engine/scene";
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

describe("sceneFromServiceItem (corrupt content_json)", () => {
  it("builds a scene from valid content", () => {
    const scene = sceneFromServiceItem(
      "announcement",
      "Welcome",
      JSON.stringify({ body: "Good morning" }),
    );
    expect(scene.type).toBe("announcement");
    expect(scene.content.body).toBe("Good morning");
  });

  it("falls back to the item title when content is malformed JSON", () => {
    const scene = sceneFromServiceItem("announcement", "Welcome", "{not json");
    expect(scene.type).toBe("announcement");
    expect(scene.content.body).toBe("Welcome");
  });

  it("does not throw when content is null", () => {
    const scene = sceneFromServiceItem("announcement", "Welcome", "null");
    expect(scene.content.body).toBe("Welcome");
  });

  it("does not throw when content is a JSON array", () => {
    const scene = sceneFromServiceItem("announcement", "Welcome", "[1,2,3]");
    expect(scene.content.body).toBe("Welcome");
  });

  it("does not throw when content is a bare string", () => {
    const scene = sceneFromServiceItem("announcement", "Welcome", '"just text"');
    expect(scene.content.body).toBe("Welcome");
  });

  it("still resolves a scripture item with unusable content", () => {
    const scene = sceneFromServiceItem("scripture", "John 3:16", "");
    expect(scene.type).toBe("scripture_fullscreen");
  });
});

describe("preview/program", () => {
  it("moves preview to program on go live", () => {
    const initial = createInitialSnapshot();
    const scene = sceneFromVerses([sampleVerse]);
    const withPreview = setPreview(initial, scene);
    const live = takeProgram(withPreview);
    expect(live.program?.content.reference).toBe("John 3:16");
    expect(live.preview?.content.reference).toBe("John 3:16");
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
