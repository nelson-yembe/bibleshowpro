import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { createRoot } from "react-dom/client";
import type { Scene } from "@/engine/scene";
import {
  formatCountdownTime,
  formatWallClock,
  mergeCountdownConfig,
  resolveCountdownRemaining,
} from "@/lib/countdownConfig";
import { stageBodySize, stageTextOf } from "@/lib/stageText";
import { tauriInvoke } from "@/lib/tauri";
import { cn } from "@/lib/utils";
import "../index.css";

interface StageState {
  program: Scene | null;
  preview: Scene | null;
  message: string;
}

const BODY_SIZE = { large: "text-[3.6vw]", medium: "text-[2.9vw]", small: "text-[2.3vw]" } as const;

function useClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

/** Confidence monitor for the platform: what the congregation sees, what comes next, the time. */
function StageApp() {
  const [state, setState] = useState<StageState>({ program: null, preview: null, message: "" });
  const now = useClock();

  useEffect(() => {
    void tauriInvoke<StageState>("get_stage_state")
      .then((initial) => setState({ program: initial.program, preview: initial.preview, message: initial.message }))
      .catch(() => {});
    const unlisten = [
      listen<Scene | null>("program-update", (e) => setState((s) => ({ ...s, program: e.payload }))),
      listen<Scene | null>("preview-update", (e) => setState((s) => ({ ...s, preview: e.payload }))),
      listen<string>("stage-message", (e) => setState((s) => ({ ...s, message: e.payload }))),
    ];
    return () => unlisten.forEach((p) => void p.then((off) => off()));
  }, []);

  const current = stageTextOf(state.program);
  const next = stageTextOf(state.preview);
  const showNext = next && next.heading !== current?.heading;
  const countdown =
    state.program?.type === "countdown"
      ? formatCountdownTime(resolveCountdownRemaining(mergeCountdownConfig(state.program.content), now))
      : null;

  return (
    <div className="flex h-screen flex-col gap-[1.4vw] overflow-hidden bg-black p-[2vw] text-white">
      <header className="flex items-baseline justify-between">
        <span className="text-[1.4vw] font-semibold uppercase tracking-[0.3em] text-red-400">● Now on screen</span>
        <div className="flex items-baseline gap-[2vw]">
          {countdown && <span className="font-mono text-[4vw] font-bold text-amber-300">{countdown}</span>}
          <span className="font-mono text-[4vw] font-bold tabular-nums">{formatWallClock(new Date(now))}</span>
        </div>
      </header>

      {state.message && (
        <div className="rounded-[0.8vw] bg-amber-300 px-[2vw] py-[1vw] text-[2.6vw] font-bold leading-tight text-black">
          {state.message}
        </div>
      )}

      <section className="flex min-h-0 flex-[3] flex-col rounded-[0.8vw] border border-white/15 p-[2vw]">
        {current ? (
          <>
            <h1 className="mb-[1vw] text-[2.6vw] font-bold text-amber-300">{current.heading}</h1>
            {current.body && (
              <p className={cn("min-h-0 overflow-hidden whitespace-pre-line leading-snug", BODY_SIZE[stageBodySize(current.body)])}>
                {current.body}
              </p>
            )}
          </>
        ) : (
          <p className="text-[2.6vw] text-white/50">Nothing on screen yet</p>
        )}
      </section>

      <section className="flex min-h-0 flex-1 flex-col rounded-[0.8vw] border border-white/10 bg-white/[0.04] p-[1.5vw]">
        <span className="mb-[0.5vw] text-[1.2vw] font-semibold uppercase tracking-[0.3em] text-white/50">Next</span>
        {showNext ? (
          <>
            <p className="text-[2vw] font-semibold text-white/85">{next.heading}</p>
            {next.body && <p className="mt-[0.4vw] line-clamp-2 text-[1.7vw] text-white/60">{next.body}</p>}
          </>
        ) : (
          <p className="text-[1.7vw] text-white/40">Nothing staged</p>
        )}
      </section>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<StageApp />);
