/**
 * Keyboard-first operation: every live action an operator takes mid-service has a key,
 * so the mouse is never between them and the projector.
 *
 * Kept free of stores and the DOM so the key map can be tested on its own.
 */

export type LiveShortcut =
  | { type: "go-live" }
  | { type: "prev" }
  | { type: "next" }
  /** The newest suggestion not yet shown. */
  | { type: "accept-next" }
  /** The suggestion shown with this number, counting from 0. */
  | { type: "accept"; index: number }
  | { type: "blackout" }
  | { type: "clear" }
  | { type: "help" };

/** What has focus: typing in a field, a button that Enter or Space already activates, or neither. */
export type KeyTarget = "text" | "control" | "other";

export interface ShortcutInput {
  key: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  target: KeyTarget;
  /** Suggestion keys only mean something where the suggestions are. */
  onListenPage: boolean;
}

export function resolveLiveShortcut(input: ShortcutInput): LiveShortcut | null {
  if (input.target === "text") return null;
  if (input.ctrlKey || input.altKey || input.metaKey) return null;

  switch (input.key) {
    case " ":
      return input.shiftKey ? null : { type: "go-live" };
    case "ArrowLeft":
    case "ArrowUp":
      return { type: "prev" };
    case "ArrowRight":
    case "ArrowDown":
      return { type: "next" };
    case "Enter":
      // A focused button or card already acts on Enter; acting twice would skip a verse.
      return input.onListenPage && input.target !== "control" ? { type: "accept-next" } : null;
    case "b":
    case "B":
      return { type: "blackout" };
    case "c":
    case "C":
      return { type: "clear" };
    case "?":
      return { type: "help" };
  }
  if (input.onListenPage && /^[1-9]$/.test(input.key)) {
    return { type: "accept", index: Number(input.key) - 1 };
  }
  return null;
}

export function keyTargetOf(target: EventTarget | null): KeyTarget {
  if (!(target instanceof HTMLElement)) return "other";
  if (target.isContentEditable) return "text";
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return "text";
  if (tag === "BUTTON" || tag === "A" || target.getAttribute("role") === "button") return "control";
  return "other";
}

/** The key sheet, in the order an operator meets the actions during a service. */
export const SHORTCUT_SHEET: { keys: string[]; action: string; where: string }[] = [
  { keys: ["Enter"], action: "Accept the newest suggestion (marked ↵)", where: "Live Listen" },
  { keys: ["1", "…", "9"], action: "Accept the suggestion with that number", where: "Live Listen" },
  { keys: ["Space"], action: "Send preview to the screen", where: "Everywhere" },
  { keys: ["←", "→"], action: "Previous or next verse, slide or item", where: "Everywhere" },
  { keys: ["B"], action: "Black out the screen", where: "Everywhere" },
  { keys: ["C"], action: "Clear the text, keep the background", where: "Everywhere" },
  { keys: ["?"], action: "Show or hide this sheet", where: "Everywhere" },
];
