import type { Scene } from "@/engine/scene";
import { logoScene } from "@/engine/scene";

export interface PresentationSnapshot {
  preview: Scene | null;
  program: Scene | null;
  queue: Scene[];
  history: Scene[];
  frozen: boolean;
}

const STORAGE_KEY = "bible-show-pro-presentation";

export function createInitialSnapshot(): PresentationSnapshot {
  return {
    preview: null,
    program: logoScene(),
    queue: [],
    history: [],
    frozen: false,
  };
}

export function loadSnapshotFromStorage(): PresentationSnapshot {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialSnapshot();
    const parsed = JSON.parse(raw) as PresentationSnapshot;
    return {
      ...parsed,
      program: logoScene(),
    };
  } catch {
    return createInitialSnapshot();
  }
}

export function persistSnapshot(snapshot: PresentationSnapshot) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
}

export function setPreview(snapshot: PresentationSnapshot, scene: Scene | null): PresentationSnapshot {
  return { ...snapshot, preview: scene };
}

export function takeProgram(snapshot: PresentationSnapshot): PresentationSnapshot {
  if (!snapshot.preview || snapshot.frozen) return snapshot;
  const next = {
    ...snapshot,
    program: snapshot.preview,
    preview: snapshot.queue[0] ?? null,
    queue: snapshot.queue.slice(1),
    history: snapshot.program ? [snapshot.program, ...snapshot.history].slice(0, 20) : snapshot.history,
  };
  persistSnapshot(next);
  return next;
}

export function queueScene(snapshot: PresentationSnapshot, scene: Scene): PresentationSnapshot {
  return { ...snapshot, queue: [...snapshot.queue, scene] };
}

export function undoProgram(snapshot: PresentationSnapshot): PresentationSnapshot {
  const [previous, ...rest] = snapshot.history;
  if (!previous) return snapshot;
  const next = {
    ...snapshot,
    program: previous,
    history: rest,
  };
  persistSnapshot(next);
  return next;
}

export function clearProgramText(snapshot: PresentationSnapshot): PresentationSnapshot {
  const next = {
    ...snapshot,
    program: {
      id: crypto.randomUUID(),
      type: "blank" as const,
      content: {},
      transition: "fade" as const,
    },
  };
  persistSnapshot(next);
  return next;
}

export function setBlackout(snapshot: PresentationSnapshot): PresentationSnapshot {
  const next = {
    ...snapshot,
    program: {
      id: crypto.randomUUID(),
      type: "blackout" as const,
      content: {},
      transition: "none" as const,
    },
  };
  persistSnapshot(next);
  return next;
}

export function toggleFreeze(snapshot: PresentationSnapshot): PresentationSnapshot {
  return { ...snapshot, frozen: !snapshot.frozen };
}

