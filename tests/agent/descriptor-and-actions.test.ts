import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createSession } from "../../src/domain/session";
import {
  bindCuratorialActions,
  exportActionManifest,
  resolveArtwork,
  resolveMount,
  resolveWall,
} from "../../src/agent/actions";
import {
  lintDescriptor,
  sanitizeSchemaForVertex,
} from "../../src/agent/descriptor-linter";

describe("Curatorial Descriptors and Actions Surface", () => {
  it("registers 20 domain actions + get_capabilities and all 20 pass lintDescriptor and sanitizeSchemaForVertex with 0 errors", () => {
    const session = createSession({ seed: "default" });
    bindCuratorialActions(session);

    const all = session.registry.list({ includeUnavailable: true });
    expect(all.length).toBe(21); // 20 domain + 1 built-in get_capabilities

    const domainActions = all.filter((d) => d.name !== "get_capabilities");
    expect(domainActions.length).toBe(20);

    for (const desc of domainActions) {
      const lintErrors = lintDescriptor(desc);
      expect(lintErrors, `Descriptor '${desc.name}' has lint errors: ${lintErrors.join("; ")}`).toEqual([]);

      const sanitized = sanitizeSchemaForVertex(desc.inputSchema);
      expect(sanitized).toBeDefined();
      expect(sanitized.type).toBe("object");
      expect((sanitized as Record<string, unknown>).additionalProperties).toBeUndefined();
    }
  });

  it("resolves entities by exact id, human-readable name, and partial title", () => {
    const session = createSession({ seed: "default" });
    const model = session.store.getState();

    // Wall resolution
    const wallById = resolveWall(model, "wall-north");
    expect(wallById).toBeDefined();
    expect(wallById?.name).toBe("North Limestone Gallery Wall");

    const wallByName = resolveWall(model, "North Limestone Gallery Wall");
    expect(wallByName?.id).toBe("wall-north");

    const wallPartial = resolveWall(model, "limestone");
    expect(wallPartial?.id).toBe("wall-north");

    // Artwork resolution
    const artById = resolveArtwork(model, "aic-24645");
    expect(artById).toBeDefined();

    const artByTitle = resolveArtwork(model, "The Great Wave off Kanagawa");
    expect(artByTitle).toBeDefined();
    expect(artByTitle?.id).toBe("aic-24645");

    const artPartial = resolveArtwork(model, "great wave");
    expect(artPartial?.id).toBe("aic-24645");

    // Mount resolution
    const firstMount = model.mounts[0];
    if (firstMount) {
      const mountById = resolveMount(model, firstMount.id);
      expect(mountById?.id).toBe(firstMount.id);

      const art = model.catalog.find((a) => a.id === firstMount.artworkId);
      if (art) {
        const mountByTitle = resolveMount(model, art.title);
        expect(mountByTitle?.id).toBe(firstMount.id);
      }
    }
  });

  it("toggles dynamic swap_rejected_artwork availability based on selectedMountId", async () => {
    const session = createSession({ seed: "default" });
    bindCuratorialActions(session);

    // Initially no mount is selected
    expect(session.store.getState().selectedMountId).toBeNull();
    const swapDesc = session.registry.get("swap_rejected_artwork");
    expect(swapDesc).toBeDefined();
    expect(swapDesc?.isAvailable?.(session.store.getState())).toBe(false);

    // Call fails when unavailable
    const callWhenUnavailable = await session.registry.call(
      "swap_rejected_artwork",
      { replacementArtworkIdOrTitle: "aic-222222" },
      { source: "agent" }
    );
    expect(callWhenUnavailable.ok).toBe(false);
    expect(callWhenUnavailable.errorCode).toBe("ACTION_UNAVAILABLE");

    // Select a mount
    const firstMount = session.store.getState().mounts[0];
    session.store.dispatch({
      type: "SELECT_ENTITY",
      mountId: firstMount.id,
      wallId: firstMount.wallId,
    });

    expect(session.store.getState().selectedMountId).toBe(firstMount.id);
    expect(swapDesc?.isAvailable?.(session.store.getState())).toBe(true);
  });

  it("enforces ApprovalGate on destructive actions (pin_spatial_anchor & swap_rejected_artwork) and rejects without mutating state", async () => {
    const session = createSession({ seed: "default", gateEnabled: true });
    bindCuratorialActions(session);

    const initialRevision = session.store.getState().revision;
    const initialAnchorsCount = session.store.getState().anchors.length;

    // Launch destructive action without bypassGate -> should trigger gate
    const pinPromise = session.registry.call(
      "pin_spatial_anchor",
      { wallIdOrName: "wall-north", label: "Final Installation Drill Line" },
      { source: "agent" }
    );

    // Verify pending approval exists
    const pending = session.gate.getPending();
    expect(pending).not.toBeNull();
    expect(pending?.actionName).toBe("pin_spatial_anchor");
    expect(pending?.plainSummary).toContain("Final Installation Drill Line");

    // Curator rejects approval
    session.gate.reject(pending?.id, "Curator requires additional sightline verification.");

    const callResult = await pinPromise;
    expect(callResult.ok).toBe(false);
    expect(callResult.errorCode).toBe("GATE_REJECTED");
    expect(callResult.summary).toContain("Curator requires additional sightline verification.");

    // Store state must not have mutated
    expect(session.store.getState().revision).toBe(initialRevision);
    expect(session.store.getState().anchors.length).toBe(initialAnchorsCount);

    // Now test approval
    const pinPromise2 = session.registry.call(
      "pin_spatial_anchor",
      { wallIdOrName: "wall-north", label: "Approved Anchor Schedule" },
      { source: "agent" }
    );

    const pending2 = session.gate.getPending();
    expect(pending2).not.toBeNull();
    session.gate.approve(pending2?.id);

    const callResult2 = await pinPromise2;
    expect(callResult2.ok).toBe(true);
    expect(session.store.getState().anchors.length).toBe(initialAnchorsCount + 1);
    expect(session.store.getState().anchors.at(-1)?.label).toBe("Approved Anchor Schedule");
  });

  it("exports actions.manifest.json matching all required schema fields and contract_hash", () => {
    const session = createSession({ seed: "default" });
    bindCuratorialActions(session);

    const manifest = exportActionManifest(session.registry);
    expect(manifest.version).toBe("1.0.0");
    expect(manifest.contract_version).toBe(1);
    expect(manifest.contract_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(manifest.actions.length).toBe(20);
    expect(manifest.procedures.length).toBeGreaterThanOrEqual(1);

    for (const act of manifest.actions) {
      expect(act.name).toMatch(/^[a-z]+(_[a-z0-9]+)+$/);
      expect(act.title.length).toBeGreaterThan(0);
      expect([
        "read",
        "change",
        "verify",
        "navigate",
        "collaborate",
        "cross_boundary",
      ]).toContain(act.group);
      expect(act.description.length).toBeGreaterThanOrEqual(80);
      expect(act.input_schema.type).toBe("object");
      expect(typeof act.annotations.readOnly).toBe("boolean");
      expect(typeof act.annotations.destructive).toBe("boolean");
      expect(typeof act.annotations.untrustedContent).toBe("boolean");
      expect(typeof act.dynamic).toBe("boolean");
    }

    // Verify on-disk actions.manifest.json matches exported manifest hash
    const diskPath = resolve(process.cwd(), "actions.manifest.json");
    const diskContent = JSON.parse(readFileSync(diskPath, "utf8"));
    expect(diskContent.version).toBe("1.0.0");
    expect(diskContent.actions.length).toBe(20);
    expect(diskContent.contract_hash).toBe(manifest.contract_hash);
  });
});
