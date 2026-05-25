import { emit } from "@tauri-apps/api/event";
import type { Scene } from "@/engine/scene";
import { api } from "@/lib/tauri";

let lastBroadcast: Scene | null = null;

export function getLastBroadcastScene(): Scene | null {
  return lastBroadcast;
}

async function emitProgramOnce(scene: Scene | null): Promise<void> {
  window.dispatchEvent(new CustomEvent("bsp-program-update", { detail: scene }));
  try {
    await api.pushProgramUpdate(scene);
  } catch {
    try {
      await emit("program-update", scene);
    } catch {
      // Non-Tauri environment (tests/browser)
    }
  }
}

/** Push scene to main monitors and the projection output window. */
export async function broadcastProgram(scene: Scene | null): Promise<void> {
  lastBroadcast = scene;
  await emitProgramOnce(scene);
}

/** Re-send after output webview boot (avoids missing the first emit). */
export async function broadcastProgramReliable(scene: Scene | null): Promise<void> {
  lastBroadcast = scene;
  await emitProgramOnce(scene);
  for (const delayMs of [150, 400, 900]) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    if (lastBroadcast === scene) {
      await emitProgramOnce(scene);
    }
  }
}
