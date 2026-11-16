import { describe, expect, it } from "vitest";
import { createSession } from "../../src/domain/session";
import { bindCuratorialActions } from "../../src/agent/actions";
import { createReplayController } from "../../src/showcase/ReplayController";

async function recordTrace() {
  const live = createSession({ seed: "default", gateEnabled: false, attachWindow: false });
  bindCuratorialActions(live);
  await live.registry.call("scan_room_planes", {}, { source: "agent", round: 1 });
  await live.registry.call("toggle_seated_scale_twin", { enabled: true }, { source: "agent", round: 1 });
  await live.registry.call("preview_wheelchair_eye_level", { enabled: true }, { source: "agent", round: 2 });
  return live.trace.toDocument();
}

describe("replay controller", () => {
  it("steps a second session and leaves the live session and window trace untouched", async () => {
    const doc = await recordTrace();
    const primary = createSession({ seed: "default", gateEnabled: false, attachWindow: false });
    const primaryRevision = primary.store.getState().revision;
    const primaryTraceLen = primary.trace.getEntries().length;
    const windowTrace = (globalThis as { window?: { __runTrace?: unknown } }).window?.__runTrace;

    const replay = createReplayController(doc);
    const session = replay.getSession();
    const r0 = session.store.getState().revision;
    expect(replay.getState().totalSteps).toBe(doc.entries.length);

    await replay.stepForward();
    await replay.stepForward();
    await replay.stepForward();

    expect(replay.getState().cursor).toBe(3);
    expect(session.store.getState().revision).toBeGreaterThan(r0);
    expect(primary.store.getState().revision).toBe(primaryRevision);
    expect(primary.trace.getEntries().length).toBe(primaryTraceLen);
    expect((globalThis as { window?: { __runTrace?: unknown } }).window?.__runTrace).toBe(windowTrace);

    replay.reset();
    expect(replay.getState().cursor).toBe(0);
    replay.dispose();
  });
});
