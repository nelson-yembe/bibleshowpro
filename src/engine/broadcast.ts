import { emit } from "@tauri-apps/api/event";
import type { Scene } from "@/engine/scene";
import { api } from "@/lib/tauri";

let lastBroadcast: Scene | null = null;

export function getLastBroadcastScene(): Scene | null {
  return lastBroadcast;
}

// #region agent log
let __emitCount = 0;
let __emitLastLog = 0;
// #endregion

async function emitProgramOnce(scene: Scene | null): Promise<void> {
  // #region agent log
  __emitCount++;
  {
    const __now = Date.now();
    if (__now - __emitLastLog > 500) {
      const __c = __emitCount;
      __emitLastLog = __now;
      fetch('http://127.0.0.1:7738/ingest/e670e04f-991d-4bfa-a718-ab18cda6626f',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'1b94a6'},body:JSON.stringify({sessionId:'1b94a6',hypothesisId:'A',location:'broadcast.ts:emitProgramOnce',message:'program emit',data:{cumulativeEmits:__c,sceneType:scene?.type ?? null},timestamp:__now})}).catch(()=>{});
    }
  }
  // #endregion
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
