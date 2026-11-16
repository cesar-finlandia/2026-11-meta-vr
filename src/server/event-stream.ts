/**
 * Typed Server-Sent Events hub for curatorial workflow progress streaming.
 */

export interface StreamProgressEvent {
  id: number;
  run_id: string;
  ts: string;
  type:
    | "stage_started"
    | "model_completed"
    | "action_applied"
    | "truth_checked"
    | "checkpoint_waiting"
    | "run_finished"
    | "degraded_notice";
  payload: Record<string, unknown>;
}

export interface EventStreamHub {
  publish(
    runId: string,
    type: StreamProgressEvent["type"],
    payload: Record<string, unknown>
  ): StreamProgressEvent;
  getHistory(runId: string, afterId?: number): StreamProgressEvent[];
  subscribe(runId: string, listener: (ev: StreamProgressEvent) => void): () => void;
}

export function createEventStreamHub(): EventStreamHub {
  let nextId = 1;
  const historyByRun = new Map<string, StreamProgressEvent[]>();
  const listenersByRun = new Map<string, Set<(ev: StreamProgressEvent) => void>>();

  return {
    publish(
      runId: string,
      type: StreamProgressEvent["type"],
      payload: Record<string, unknown>
    ): StreamProgressEvent {
      const event: StreamProgressEvent = {
        id: nextId++,
        run_id: runId,
        ts: new Date().toISOString(),
        type,
        payload,
      };

      let history = historyByRun.get(runId);
      if (!history) {
        history = [];
        historyByRun.set(runId, history);
      }
      history.push(event);

      const listeners = listenersByRun.get(runId);
      if (listeners) {
        for (const l of listeners) {
          try {
            l(event);
          } catch (err) {
            console.error("EventStreamHub listener error:", err);
          }
        }
      }

      return event;
    },

    getHistory(runId: string, afterId = 0): StreamProgressEvent[] {
      const history = historyByRun.get(runId) ?? [];
      return history.filter((ev) => ev.id > afterId);
    },

    subscribe(runId: string, listener: (ev: StreamProgressEvent) => void): () => void {
      let listeners = listenersByRun.get(runId);
      if (!listeners) {
        listeners = new Set();
        listenersByRun.set(runId, listeners);
      }
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          listenersByRun.delete(runId);
        }
      };
    },
  };
}
