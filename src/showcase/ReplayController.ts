/**
 * Isolated trace replay state machine. It steps a secondary SightlineSession through a saved
 * RunTraceDocument without touching the live session's trace or window.__runTrace.
 */
import type { RunTraceDocument, SightlineSession, TraceEntry } from "../domain/types";
import { createSession } from "../domain/session";
import { bindCuratorialActions } from "../agent/actions";

export type ReplaySpeed = 1 | 2 | 4;

export interface ReplayState {
  loaded: boolean;
  playing: boolean;
  cursor: number;
  totalSteps: number;
  speed: ReplaySpeed;
  currentEntry: TraceEntry | null;
  error: string | null;
}

export interface ReplayController {
  getSession(): SightlineSession;
  getState(): ReplayState;
  play(): void;
  pause(): void;
  stepForward(): Promise<void>;
  reset(): void;
  setSpeed(speed: ReplaySpeed): void;
  subscribe(listener: (state: ReplayState) => void): () => void;
  dispose(): void;
}

const BASE_STEP_DELAY_MS = 700;

function makeSession(): SightlineSession {
  const session = createSession({ seed: "empty", gateEnabled: false, attachWindow: false, sessionId: "watch-replay" });
  bindCuratorialActions(session);
  return session;
}

export function createReplayController(traceDoc: RunTraceDocument): ReplayController {
  let session = makeSession();
  const entries = Array.isArray(traceDoc.entries) ? traceDoc.entries : [];
  const listeners = new Set<(s: ReplayState) => void>();
  let cursor = 0;
  let playing = false;
  let speed: ReplaySpeed = 1;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let error: string | null = null;
  let stepping = false;
  let disposed = false;

  const snapshot = (): ReplayState => ({
    loaded: entries.length > 0,
    playing,
    cursor,
    totalSteps: entries.length,
    speed,
    currentEntry: cursor > 0 ? (entries[cursor - 1] ?? null) : null,
    error,
  });

  const emit = (): void => {
    const state = snapshot();
    for (const l of listeners) l(state);
  };

  const clearTimer = (): void => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  async function apply(entry: TraceEntry): Promise<void> {
    if (entry.kind !== "action") return;
    const res = await session.registry.call(entry.name, entry.args ?? {}, {
      round: entry.round,
      source: "agent",
      bypassGate: true,
    });
    if (!res.ok && entry.ok) error = `Step ${entry.seq} (${entry.name}) did not replay: ${res.summary || "failed"}`;
  }

  const schedule = (): void => {
    clearTimer();
    if (!playing || disposed) return;
    timer = setTimeout(() => {
      void stepForward().then(() => {
        if (playing && cursor < entries.length) schedule();
        else if (cursor >= entries.length) {
          playing = false;
          emit();
        }
      });
    }, BASE_STEP_DELAY_MS / speed);
  };

  async function stepForward(): Promise<void> {
    if (stepping || disposed || cursor >= entries.length) return;
    stepping = true;
    try {
      const entry = entries[cursor];
      cursor += 1;
      await apply(entry);
    } finally {
      stepping = false;
      emit();
    }
  }

  return {
    getSession: () => session,
    getState: snapshot,
    play() {
      if (cursor >= entries.length) return;
      playing = true;
      emit();
      schedule();
    },
    pause() {
      playing = false;
      clearTimer();
      emit();
    },
    stepForward,
    reset() {
      playing = false;
      clearTimer();
      cursor = 0;
      error = null;
      session = makeSession();
      emit();
    },
    setSpeed(next) {
      speed = next;
      emit();
      if (playing) schedule();
    },
    subscribe(listener) {
      listeners.add(listener);
      listener(snapshot());
      return () => {
        listeners.delete(listener);
      };
    },
    dispose() {
      disposed = true;
      playing = false;
      clearTimer();
      listeners.clear();
    },
  };
}
