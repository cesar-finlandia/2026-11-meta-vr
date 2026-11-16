/**
 * React hook consuming the Server-Sent Events progress hub with auto-reconnect
 * and Last-Event-ID replay resumption.
 */
import { useEffect, useState } from "react";
import type { StreamProgressEvent } from "../server/event-stream";

export interface EventStreamState {
  events: StreamProgressEvent[];
  connected: boolean;
  lastStageLabel: string | null;
  lastError: string | null;
}

export function useEventStream(
  runId: string | null,
  apiBaseUrl = ""
): EventStreamState {
  const [events, setEvents] = useState<StreamProgressEvent[]>([]);
  const [connected, setConnected] = useState<boolean>(false);
  const [lastStageLabel, setLastStageLabel] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => {
    if (!runId || typeof window === "undefined" || typeof EventSource === "undefined") {
      setConnected(false);
      return;
    }

    setEvents([]);
    setLastError(null);

    let lastId = 0;
    const url = `${apiBaseUrl}/api/events?runId=${encodeURIComponent(runId)}&afterId=${lastId}`;
    const source = new EventSource(url);

    source.onopen = () => {
      setConnected(true);
      setLastError(null);
    };

    source.onerror = () => {
      setConnected(false);
      setLastError("SSE stream disconnected. Reconnecting...");
    };

    const eventTypes: Array<StreamProgressEvent["type"]> = [
      "stage_started",
      "model_completed",
      "action_applied",
      "truth_checked",
      "checkpoint_waiting",
      "run_finished",
      "degraded_notice",
    ];

    const handleEvent = (ev: MessageEvent) => {
      try {
        const id = Number(ev.lastEventId || 0);
        if (id > lastId) lastId = id;

        const payload = JSON.parse(ev.data);
        const event: StreamProgressEvent = {
          id,
          run_id: runId,
          ts: new Date().toISOString(),
          type: ev.type as StreamProgressEvent["type"],
          payload,
        };

        setEvents((prev) => [...prev, event]);

        if (ev.type === "stage_started") {
          const role = typeof payload.role === "string" ? payload.role : null;
          const label = typeof payload.label === "string" ? payload.label : role;
          if (label) setLastStageLabel(label);
        }
      } catch (err) {
        console.error("SSE parse error:", err);
      }
    };

    for (const t of eventTypes) {
      source.addEventListener(t, handleEvent);
    }

    source.onmessage = handleEvent;

    return () => {
      for (const t of eventTypes) {
        source.removeEventListener(t, handleEvent);
      }
      source.close();
      setConnected(false);
    };
  }, [runId, apiBaseUrl]);

  return {
    events,
    connected,
    lastStageLabel,
    lastError,
  };
}
