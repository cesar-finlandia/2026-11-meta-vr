/**
 * Unit and offline replay tests for Sightline Studio's multi-round curatorial workflow,
 * verify-and-repair loop, human approval checkpoints, and HeeRunTrace contract.
 */
import { describe, expect, it } from "vitest";
import { createSession } from "../../src/domain/session";
import { bindCuratorialActions } from "../../src/agent/actions";
import { runCuratorialWorkflow, runInteractiveReflow } from "../../src/agent/orchestrator";
import { createNodeGoldenCache } from "../../src/resilience/golden-cache";

describe("Curatorial Workflow & Orchestrator", () => {
  it("executes full 6-stage workflow in offline replay mode with approval approved", async () => {
    const session = createSession({ seed: "default", gateEnabled: true });
    bindCuratorialActions(session);

    let gatePrompts = 0;
    session.gate.subscribe((pending) => {
      if (pending) {
        gatePrompts++;
        expect(pending.actionName).toBe("pin_spatial_anchor");
        expect(pending.plainSummary).toContain("North Wall Final Hang Schedule");
        session.gate.approve(pending.id);
      }
    });

    const stagesVisited: string[] = [];
    const result = await runCuratorialWorkflow(session, {
      brief: "Botanical Prints & Modernist Form",
      mode: "replay",
      onStageChange: (_stage, label) => stagesVisited.push(label),
    });

    expect(result.ok).toBe(true);
    expect(result.finalErrorCount).toBe(0);
    expect(result.verifyRepairRounds).toBeGreaterThanOrEqual(1);
    expect(gatePrompts).toBe(1);
    expect(stagesVisited.length).toBeGreaterThanOrEqual(4);

    const trace = result.traceDocument;
    expect(trace.version).toBe("1.0.0");
    expect(trace.run_id).toBe(session.sessionId);
    expect(typeof trace.started_at).toBe("string");
    expect(Array.isArray(trace.entries)).toBe(true);

    // Validate HeeRunTrace summary floors
    const summary = trace.summary;
    expect(summary.model_calls).toBeGreaterThanOrEqual(4);
    expect(summary.model_roles.length).toBeGreaterThanOrEqual(4);
    expect(summary.model_roles).toContain("curatorial_planner");
    expect(summary.model_roles).toContain("layout_strategist");
    expect(summary.model_roles).toContain("repair_critic");
    expect(summary.model_roles).toContain("interpretive_writer");
    expect(summary.actions).toBeGreaterThanOrEqual(15);
    expect(summary.verify_repair_rounds).toBeGreaterThanOrEqual(1);
    expect(summary.human_checkpoints).toBeGreaterThanOrEqual(1);
    expect(summary.approvals.approved).toBe(1);
    expect(summary.approvals.rejected).toBe(0);
    expect(summary.final_truth).not.toBeNull();
    expect(summary.final_truth?.errors).toBe(0);

    // Verify pinned spatial anchor was saved
    const anchors = session.store.getState().anchors;
    expect(anchors.length).toBeGreaterThanOrEqual(1);
    expect(anchors[0].wallId).toBe("wall-north");

    // Verify timeline snapshots were saved
    const snapshots = session.store.getState().snapshots;
    expect(snapshots.some((s) => s.label === "Initial Hang Proposal")).toBe(true);
    expect(snapshots.some((s) => s.label === "ADA & Conservation Verified")).toBe(true);

    // Verify placards were drafted with >= 26 mm font
    const mounts = session.store.getState().mounts;
    expect(mounts.length).toBeGreaterThanOrEqual(5);
    const heroPlacards = mounts.filter((m) => m.wallId === "wall-north");
    for (const m of heroPlacards) {
      expect(m.placard.fontHeight_mm).toBeGreaterThanOrEqual(26);
      expect(m.placard.curatorialNote.length).toBeGreaterThan(10);
    }
  });

  it("handles curator rejection at approval checkpoint cleanly without pinning anchor", async () => {
    const session = createSession({ seed: "default", gateEnabled: true });
    bindCuratorialActions(session);

    let gatePrompts = 0;
    session.gate.subscribe((pending) => {
      if (pending) {
        gatePrompts++;
        session.gate.reject(pending.id, "Curator requested adjustments before final anchor pin.");
      }
    });

    const result = await runCuratorialWorkflow(session, {
      brief: "Architectural Etchings & Light",
      mode: "replay",
    });

    expect(gatePrompts).toBe(1);
    expect(result.finalErrorCount).toBe(0);

    // Rejection recorded in trace summary
    expect(result.traceDocument.summary.approvals.rejected).toBe(1);
    expect(result.traceDocument.summary.approvals.approved).toBe(0);

    // Anchor was NOT pinned because curator rejected
    const anchors = session.store.getState().anchors;
    expect(anchors.some((a) => a.label === "North Wall Final Hang Schedule")).toBe(false);
    expect(anchors.length).toBe(1); // Only initial seed anchor remains
  });

  it("replays all 3 preset briefs from golden cache fixtures", async () => {
    const briefs = [
      "Botanical Prints & Modernist Form",
      "Architectural Etchings & Light",
      "Impressionist Color & Scale",
    ];

    for (const brief of briefs) {
      const session = createSession({ seed: "default", gateEnabled: false });
      bindCuratorialActions(session);

      const result = await runCuratorialWorkflow(session, {
        brief,
        mode: "replay",
      });

      expect(result.finalErrorCount).toBe(0);
      expect(result.traceDocument.summary.model_calls).toBeGreaterThanOrEqual(4);
      expect(result.traceDocument.summary.actions).toBeGreaterThanOrEqual(15);
    }
  });

  it("executes interactive dismiss and reflow with compliance verification", async () => {
    const session = createSession({ seed: "default", gateEnabled: false });
    bindCuratorialActions(session);

    // Place an initial hang
    await runCuratorialWorkflow(session, {
      brief: "Botanical Prints & Modernist Form",
      mode: "replay",
    });

    const initialMounts = session.store.getState().mounts;
    expect(initialMounts.length).toBeGreaterThanOrEqual(5);

    const mountToDismiss = initialMounts[0];
    const dismissRes = await runInteractiveReflow(session, mountToDismiss.id);

    expect(dismissRes.ok).toBe(true);
    expect(dismissRes.finalErrorCount).toBe(0);
    expect(dismissRes.summary).toContain("Dismissed artwork replaced");

    const updatedMounts = session.store.getState().mounts;
    const replaced = updatedMounts.find((m) => m.id === mountToDismiss.id);
    expect(replaced?.artworkId).not.toBe(mountToDismiss.artworkId);
  });

  it("enforces CostGuard limits when budget is exhausted", async () => {
    const { createCostGuard } = await import("../../src/agent/cost-guard");
    const guard = createCostGuard({ maxCallsPerRun: 1 });

    const session = createSession({ seed: "default", gateEnabled: false });
    bindCuratorialActions(session);

    const result = await runCuratorialWorkflow(session, {
      brief: "Botanical Prints & Modernist Form",
      mode: "replay",
      costGuard: guard,
    });

    // Run was degraded or halted due to cost guard ceiling
    expect(result.degraded || result.traceDocument.summary.model_calls <= 2).toBe(true);
  });
});
