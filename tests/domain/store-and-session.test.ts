import { describe, expect, it } from "vitest";
import { createDomainStore } from "../../src/domain/store";
import {
  createApprovalGate,
  createBaseActionRegistry,
  createSession,
  createTraceCollector,
} from "../../src/domain/session";
import { createDefaultGalleryWalls, createSeedExhibition } from "../../src/domain/seed";
import { BUNDLED_AIC_CATALOG } from "../../src/domain/collection-loader";
import type { ActionDescriptor, MountedArtwork } from "../../src/domain/types";

describe("DomainStore - State mutations, validation, undo/redo & snapshots", () => {
  it("initializes with default seed exhibition if none provided", () => {
    const store = createDomainStore();
    const state = store.getState();
    expect(state.walls.length).toBe(3);
    expect(state.mounts.length).toBe(6);
    expect(state.revision).toBe(1);
    expect(store.canUndo()).toBe(false);
    expect(store.canRedo()).toBe(false);
  });

  it("ADJUST_MOUNT_POSITION updates coordinates and shifts placard relatively", () => {
    const store = createDomainStore();
    const initial = store.getState();
    const target = initial.mounts[0];
    const initialCenterX = target.centerX_cm;
    const initialCenterY = target.centerY_cm;
    const placardInitialX = target.placard!.centerX_cm;
    const placardInitialY = target.placard!.centerY_cm;

    const res = store.dispatch({
      type: "ADJUST_MOUNT_POSITION",
      mountId: target.id,
      centerX_cm: initialCenterX + 20,
      centerY_cm: initialCenterY + 10,
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.state_version).toBe(2);
      expect(res.effects[0].kind).toBe("mount_changed");
    }

    const updated = store.getState().mounts.find((m) => m.id === target.id)!;
    expect(updated.centerX_cm).toBe(initialCenterX + 20);
    expect(updated.centerY_cm).toBe(initialCenterY + 10);
    expect(updated.placard!.centerX_cm).toBe(placardInitialX + 20);
    expect(updated.placard!.centerY_cm).toBe(placardInitialY + 10);
  });

  it("SET_MOUNT_LUX rejects negative illuminance without mutating state", () => {
    const store = createDomainStore();
    const revBefore = store.getState().revision;
    const res = store.dispatch({
      type: "SET_MOUNT_LUX",
      mountId: store.getState().mounts[0].id,
      spotLux: -10,
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toContain("cannot be negative");
      expect(res.state_version).toBe(revBefore);
    }
    expect(store.getState().revision).toBe(revBefore);
  });

  it("REPLACE_WALL_MOUNTS rejects unknown wallId without mutating state", () => {
    const store = createDomainStore();
    const revBefore = store.getState().revision;
    const res = store.dispatch({
      type: "REPLACE_WALL_MOUNTS",
      wallId: "wall-non-existent",
      mounts: [],
    });

    expect(res.ok).toBe(false);
    expect(store.getState().revision).toBe(revBefore);
  });

  it("SWAP_MOUNT_ARTWORK validates replacement artwork existence in catalog", () => {
    const store = createDomainStore();
    const target = store.getState().mounts[0];

    // Invalid artwork ID
    const failRes = store.dispatch({
      type: "SWAP_MOUNT_ARTWORK",
      mountId: target.id,
      replacementArtworkId: "aic-unknown-id",
    });
    expect(failRes.ok).toBe(false);

    // Valid artwork ID
    const validArt = BUNDLED_AIC_CATALOG[10]; // Piranesi
    const successRes = store.dispatch({
      type: "SWAP_MOUNT_ARTWORK",
      mountId: target.id,
      replacementArtworkId: validArt.id,
    });
    expect(successRes.ok).toBe(true);

    const updated = store.getState().mounts.find((m) => m.id === target.id)!;
    expect(updated.artworkId).toBe(validArt.id);
  });

  it("SELECT_ENTITY updates selection without mutating undo/redo stacks", () => {
    const store = createDomainStore();
    const mount = store.getState().mounts[0];

    expect(store.canUndo()).toBe(false);
    const res = store.dispatch({
      type: "SELECT_ENTITY",
      mountId: mount.id,
      wallId: mount.wallId,
    });

    expect(res.ok).toBe(true);
    expect(store.getState().selectedMountId).toBe(mount.id);
    expect(store.getState().selectedWallId).toBe(mount.wallId);
    expect(store.canUndo()).toBe(false); // selection is non-undoable per design
  });

  it("supports full undo and redo cycles across multiple actions", () => {
    const store = createDomainStore();
    const mount = store.getState().mounts[0];
    const initialLux = mount.spotLux;

    store.dispatch({
      type: "SET_MOUNT_LUX",
      mountId: mount.id,
      spotLux: 100,
    });
    expect(store.getState().mounts[0].spotLux).toBe(100);
    expect(store.canUndo()).toBe(true);

    store.dispatch({
      type: "SET_MOUNT_LUX",
      mountId: mount.id,
      spotLux: 120,
    });
    expect(store.getState().mounts[0].spotLux).toBe(120);

    // Undo step 1
    const undo1 = store.undo();
    expect(undo1.ok).toBe(true);
    expect(store.getState().mounts[0].spotLux).toBe(100);
    expect(store.canRedo()).toBe(true);

    // Undo step 2
    const undo2 = store.undo();
    expect(undo2.ok).toBe(true);
    expect(store.getState().mounts[0].spotLux).toBe(initialLux);
    expect(store.canUndo()).toBe(false);

    // Redo step 1
    const redo1 = store.redo();
    expect(redo1.ok).toBe(true);
    expect(store.getState().mounts[0].spotLux).toBe(100);

    // Redo step 2
    const redo2 = store.redo();
    expect(redo2.ok).toBe(true);
    expect(store.getState().mounts[0].spotLux).toBe(120);
    expect(store.canRedo()).toBe(false);
  });

  it("SAVE_SNAPSHOT and RESTORE_SNAPSHOT preserve and restore curatorial hang", () => {
    const store = createDomainStore();
    const mountToRemove = store.getState().mounts[0].id;

    // Save initial snapshot
    store.dispatch({
      type: "SAVE_SNAPSHOT",
      id: "snap-baseline",
      label: "Baseline Curation",
      issueCount: 0,
    });

    // Remove a mount
    store.dispatch({
      type: "REMOVE_MOUNT",
      mountId: mountToRemove,
    });
    expect(store.getState().mounts.length).toBe(5);

    // Restore snapshot
    const restoreRes = store.dispatch({
      type: "RESTORE_SNAPSHOT",
      snapshotId: "snap-baseline",
    });
    expect(restoreRes.ok).toBe(true);
    expect(store.getState().mounts.length).toBe(6);
    expect(store.getState().mounts.some((m) => m.id === mountToRemove)).toBe(true);
  });

  it("notifies subscribers on successful state dispatches", () => {
    const store = createDomainStore();
    let notifications = 0;
    const unsub = store.subscribe(() => {
      notifications++;
    });

    store.dispatch({
      type: "SET_PASSTHROUGH_MODE",
      enabled: true,
    });
    expect(notifications).toBe(1);

    unsub();
    store.dispatch({
      type: "SET_PASSTHROUGH_MODE",
      enabled: false,
    });
    expect(notifications).toBe(1); // Unsubscribed
  });
});

describe("ApprovalGate - Human Curator Checkpoints", () => {
  it("resolves immediately when gate is disabled", async () => {
    const gate = createApprovalGate(false);
    expect(gate.isEnabled()).toBe(false);

    const decision = await gate.requestApproval({
      actionName: "reflow_wall_spacing",
      plainSummary: "reflow all frames on North Limestone Gallery Wall",
      args: { wallId: "wall-north" },
      source: "agent",
    });

    expect(decision.approved).toBe(true);
    expect(decision.reason).toContain("disabled");
  });

  it("holds promise until curator clicks approve", async () => {
    const gate = createApprovalGate(true);
    const promise = gate.requestApproval({
      actionName: "reflow_wall_spacing",
      plainSummary: "reflow North Wall",
      args: { wallId: "wall-north" },
      source: "agent",
    });

    const pending = gate.getPending();
    expect(pending).not.toBeNull();
    expect(pending?.actionName).toBe("reflow_wall_spacing");

    const approved = gate.approve(pending?.id);
    expect(approved).toBe(true);

    const decision = await promise;
    expect(decision.approved).toBe(true);
    expect(gate.getPending()).toBeNull();
  });

  it("resolves with actionable curator feedback on reject", async () => {
    const gate = createApprovalGate(true);
    const promise = gate.requestApproval({
      actionName: "swap_rejected_artwork",
      plainSummary: "swap Hokusai with Kandinsky",
      args: { mountId: "m-1" },
      source: "agent",
    });

    const pending = gate.getPending()!;
    gate.reject(pending.id, "Keep Japanese woodblock collection intact.");

    const decision = await promise;
    expect(decision.approved).toBe(false);
    expect(decision.reason).toBe("Keep Japanese woodblock collection intact.");
  });

  it("handles abort signal cleanly", async () => {
    const gate = createApprovalGate(true);
    const controller = new AbortController();

    const promise = gate.requestApproval(
      {
        actionName: "swap_rejected_artwork",
        plainSummary: "swap mount",
        args: {},
        source: "agent",
      },
      controller.signal
    );

    controller.abort();
    const decision = await promise;
    expect(decision.approved).toBe(false);
    expect(decision.reason).toContain("aborted");
    expect(gate.getPending()).toBeNull();
  });
});

describe("TraceCollector - Monotonic run-trace aggregation", () => {
  it("assigns monotonic seq and builds full run-trace document", () => {
    const store = createDomainStore();
    const trace = createTraceCollector("test-session-1", store, false);

    const e1 = trace.record({
      round: 1,
      kind: "action",
      name: "validate_ada_compliance",
      source: "agent",
      input_ref: null,
      output_ref: null,
      ok: true,
      latency_ms: 12,
    });
    expect(e1.seq).toBe(1);

    const e2 = trace.record({
      round: 1,
      kind: "approval",
      name: "reflow_wall_spacing",
      source: "human",
      input_ref: null,
      output_ref: null,
      ok: true,
      latency_ms: 0,
    });
    expect(e2.seq).toBe(2);

    const doc = trace.toDocument();
    expect(doc.version).toBe("1.0.0");
    expect(doc.run_id).toBe("test-session-1");
    expect(doc.entries).toHaveLength(2);
    expect(doc.summary.actions).toBe(1);
    expect(doc.summary.human_checkpoints).toBe(1);
    expect(doc.summary.approvals.approved).toBe(1);
  });
});

describe("ActionRegistry & createSession Composition Root", () => {
  it("provides built-in get_capabilities action", async () => {
    const session = createSession({ seed: "default", gateEnabled: true });
    const result = await session.registry.call(
      "get_capabilities",
      {},
      { source: "ui" }
    );

    expect(result.ok).toBe(true);
    expect(result.summary).toContain("Retrieved");
    const data = result.data as { actions: unknown[]; procedures: unknown[] };
    expect(data.actions.length).toBeGreaterThan(0);
    expect(data.procedures.length).toBeGreaterThan(0);
  });

  it("intercepts destructive action at approval gate", async () => {
    const session = createSession({ seed: "default", gateEnabled: true });

    // Register a destructive action
    const mockDestructive: ActionDescriptor = {
      name: "clear_all_wall_mounts",
      title: "Clear All Wall Mounts",
      group: "Create/Change",
      description: "Clears all mounted frames from specified wall.",
      inputSchema: {
        type: "object",
        properties: {
          wallId: { type: "string", description: "Target wall ID" },
        },
        required: ["wallId"],
        additionalProperties: false,
      },
      resultShape: "{ cleared: boolean }",
      annotations: {
        readOnly: false,
        destructive: true,
        untrustedContent: false,
      },
      execute: (args) => {
        session.store.dispatch({
          type: "REPLACE_WALL_MOUNTS",
          wallId: args.wallId as string,
          mounts: [],
        });
        return {
          ok: true,
          summary: `Cleared mounts on wall ${args.wallId}`,
          data: { cleared: true },
          revision: session.store.getState().revision,
          validNextActions: ["propose_wall_layout"],
        };
      },
    };

    session.registry.register(mockDestructive);

    // Call without bypass - should trigger gate
    const callPromise = session.registry.call(
      "clear_all_wall_mounts",
      { wallId: "wall-north" },
      { source: "agent" }
    );

    // Verify pending approval appeared
    const pending = session.gate.getPending();
    expect(pending).not.toBeNull();
    expect(pending?.actionName).toBe("clear_all_wall_mounts");

    // Curator rejects
    session.gate.reject(pending?.id, "Preserve existing hang.");
    const result = await callPromise;

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("GATE_REJECTED");
    expect(result.summary).toContain("Preserve existing hang.");

    // Store mounts must still be intact
    expect(session.store.getState().mounts.length).toBe(6);
  });

  it("proves two concurrent createSession instances are completely isolated", () => {
    const sessionA = createSession({ seed: "default", sessionId: "sess-a" });
    const sessionB = createSession({ seed: "default", sessionId: "sess-b" });

    // Mutate session A
    sessionA.store.dispatch({
      type: "SET_PASSTHROUGH_MODE",
      enabled: true,
    });

    expect(sessionA.store.getState().passthroughActive).toBe(true);
    expect(sessionB.store.getState().passthroughActive).toBe(false);

    expect(sessionA.sessionId).toBe("sess-a");
    expect(sessionB.sessionId).toBe("sess-b");
    expect(sessionA.store.getState().revision).toBe(2);
    expect(sessionB.store.getState().revision).toBe(1);
  });
});
