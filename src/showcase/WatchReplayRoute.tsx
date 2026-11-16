/**
 * /watch: replays a recorded curatorial run in an isolated second session.
 * The only [data-demo-focus] element on this route is the replay stage.
 */
import { useEffect, useMemo, useState, type JSX } from "react";
import { Pause, Play, RotateCcw, StepForward } from "lucide-react";
import type { RunTraceDocument, SightlineCone, TruthIssue } from "../domain/types";
import { getSpatialStage, type WatchRouteMountProps } from "../ui/stage-registry";
import { InlineCallout } from "../ui/components/SystemMessages";
import { createReplayController, type ReplayController, type ReplaySpeed, type ReplayState } from "./ReplayController";

const SPEEDS: ReplaySpeed[] = [1, 2, 4];

function ReplayPlayer({ doc, theme }: { doc: RunTraceDocument; theme: WatchRouteMountProps["theme"] }): JSX.Element {
  const controller: ReplayController = useMemo(() => createReplayController(doc), [doc]);
  const [state, setState] = useState<ReplayState>(() => controller.getState());
  const session = controller.getSession();
  const [issues, setIssues] = useState<TruthIssue[]>(() => session.truthEngine.checkExhibition(session.store.getState()));
  const [cones, setCones] = useState<SightlineCone[]>(() => session.truthEngine.computeSightlineFrustums(session.store.getState()));
  const Stage = getSpatialStage();

  useEffect(() => controller.subscribe(setState), [controller]);
  useEffect(() => () => controller.dispose(), [controller]);
  useEffect(() => {
    const sess = controller.getSession();
    const recompute = (): void => {
      const m = sess.store.getState();
      setIssues(sess.truthEngine.checkExhibition(m));
      setCones(sess.truthEngine.computeSightlineFrustums(m));
    };
    recompute();
    return sess.store.subscribe(recompute);
  }, [controller, session]);

  const entry = state.currentEntry;
  return (
    <div data-demo-focus="replay-stage" data-surface="watch-replay" style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap" }}>
        <span className="eyebrow" style={{ padding: "2px 10px", border: "1px solid var(--accent)", borderRadius: 999, color: "var(--accent)" }}>
          Recorded Session Replay
        </span>
        <span className="support" data-testid="watch-progress">
          Step {state.cursor} of {state.totalSteps}
        </span>
      </div>

      <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", alignItems: "center" }}>
        <button
          type="button"
          className="btn btn--primary"
          data-testid="watch-play-btn"
          onClick={() => (state.playing ? controller.pause() : controller.play())}
          disabled={state.cursor >= state.totalSteps && !state.playing}
        >
          {state.playing ? <Pause size={16} /> : <Play size={16} />}
          <span>{state.playing ? "Pause" : "Play"}</span>
        </button>
        <button type="button" className="btn" data-testid="watch-scrubber" onClick={() => void controller.stepForward()} disabled={state.cursor >= state.totalSteps}>
          <StepForward size={16} />
          <span>Step</span>
        </button>
        <button type="button" className="btn" onClick={() => controller.reset()}>
          <RotateCcw size={16} />
          <span>Reset</span>
        </button>
        <div role="group" aria-label="Replay speed" style={{ display: "inline-flex", gap: 4 }}>
          {SPEEDS.map((s) => (
            <button key={s} type="button" className="btn btn--sm" aria-pressed={state.speed === s} onClick={() => controller.setSpeed(s)}>
              {s}×
            </button>
          ))}
        </div>
      </div>

      {state.error ? <InlineCallout severity="warning" title="A step did not replay" detail={state.error} /> : null}

      {Stage ? <Stage session={session} issues={issues} cones={cones} theme={theme} /> : null}

      <div data-surface="watch-step" className="support" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span className="eyebrow">Current step</span>
        {entry ? (
          <span data-testid="watch-step-detail">
            {entry.kind} · {entry.name} · round {entry.round} · {entry.ok ? "ok" : "failed"}
          </span>
        ) : (
          <span>Press Play or Step to begin.</span>
        )}
        <span>Open issues: {issues.filter((i) => i.severity === "error").length}</span>
      </div>
    </div>
  );
}

export function WatchReplayRoute({ theme }: WatchRouteMountProps): JSX.Element {
  const [doc, setDoc] = useState<RunTraceDocument | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/run-trace.json")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<RunTraceDocument>;
      })
      .then((d) => {
        if (alive) setDoc(d);
      })
      .catch((e: Error) => {
        if (alive) setFailed(e.message);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (failed) {
    return (
      <div data-demo-focus="replay-stage" data-surface="watch-replay">
        <InlineCallout
          severity="warning"
          title="No recorded session found"
          detail={`The replay file could not be loaded (${failed}). Run a curation in the workbench, then save its trace as run-trace.json in public/.`}
        />
      </div>
    );
  }
  if (!doc) {
    return (
      <div data-demo-focus="replay-stage" data-surface="watch-replay" role="status">
        Loading the recorded session…
      </div>
    );
  }
  return <ReplayPlayer doc={doc} theme={theme} />;
}
