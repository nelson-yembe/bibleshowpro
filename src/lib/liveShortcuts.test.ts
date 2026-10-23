import { describe, expect, it } from "vitest";
import { resolveLiveShortcut, type ShortcutInput } from "@/lib/liveShortcuts";

function press(key: string, extra: Partial<ShortcutInput> = {}) {
  return resolveLiveShortcut({ key, target: "other", onListenPage: true, ...extra });
}

describe("resolveLiveShortcut", () => {
  it("accepts the newest suggestion with Enter and a numbered one with its digit", () => {
    expect(press("Enter")).toEqual({ type: "accept-next" });
    expect(press("1")).toEqual({ type: "accept", index: 0 });
    expect(press("9")).toEqual({ type: "accept", index: 8 });
    expect(press("0")).toBeNull();
  });

  it("keeps suggestion keys to the page that shows suggestions", () => {
    expect(press("Enter", { onListenPage: false })).toBeNull();
    expect(press("3", { onListenPage: false })).toBeNull();
  });

  it("leaves Enter to a focused button so nothing happens twice", () => {
    expect(press("Enter", { target: "control" })).toBeNull();
  });

  it("never fires while the operator is typing", () => {
    for (const key of [" ", "Enter", "b", "c", "1", "ArrowRight", "?"]) {
      expect(press(key, { target: "text" })).toBeNull();
    }
  });

  it("leaves modified keys to the system", () => {
    expect(press("c", { ctrlKey: true })).toBeNull();
    expect(press("b", { metaKey: true })).toBeNull();
    expect(press("1", { altKey: true })).toBeNull();
  });

  it("maps the screen and navigation keys everywhere", () => {
    expect(press(" ", { onListenPage: false })).toEqual({ type: "go-live" });
    expect(press(" ", { shiftKey: true })).toBeNull();
    expect(press("B", { onListenPage: false })).toEqual({ type: "blackout" });
    expect(press("c", { onListenPage: false })).toEqual({ type: "clear" });
    expect(press("ArrowUp")).toEqual({ type: "prev" });
    expect(press("ArrowDown")).toEqual({ type: "next" });
    expect(press("?", { shiftKey: true })).toEqual({ type: "help" });
  });
});
