import { beforeEach, describe, expect, it } from "vitest";
import { createSeedExhibition } from "../../src/domain/seed";
import { checkExhibition, computeSightlineFrustums } from "../../src/domain/truth-engine";
import { clampHudAngles, toSceneDescription, validateSceneDescription } from "../../src/3d/adapter";
import {
  evaluatePinchDistanceMeters,
  quantizeWallDragCm,
} from "../../src/xr/hands-first";
import {
  ANCHOR_STORAGE_KEY,
  createIwsdkGalleryBridge,
} from "../../src/xr/iwsdk-bridge";
import { createSpatialAudioCues } from "../../src/xr/spatial-audio";
import type { SpatialAnchorRecord } from "../../src/domain/types";

function describeSeed(seed: "default" | "needs-repair" | "empty") {
  const model = createSeedExhibition(seed);
  return {
    model,
    desc: toSceneDescription(model, checkExhibition(model), computeSightlineFrustums(model)),
  };
}

beforeEach(() => {
  const store = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  } as Storage;
});

describe("scene adapter", () => {
  it("maps the default seed to 29 entities with intact links", () => {
    const { desc } = describeSeed("default");
    expect(desc.entities.length).toBe(29);
    expect(desc.entities.length).toBeGreaterThanOrEqual(16);
    expect(validateSceneDescription(desc)).toEqual([]);
    const kinds = new Set(desc.entities.map((e) => e.kind));
    for (const k of ["gallery_wall", "framed_artwork", "placard_label", "sightline_ray", "maquette_base", "fov_hud"]) {
      expect(kinds.has(k as never)).toBe(true);
    }
    expect(desc.namedShots.slice(0, 5)).toEqual([
      "overview",
      "tabletop-maquette",
      "wheelchair-115",
      "standing-152",
      "passthrough-wall",
    ]);
  });

  it("is deterministic", () => {
    expect(JSON.stringify(describeSeed("default").desc)).toBe(JSON.stringify(describeSeed("default").desc));
  });

  it("marks violating frames and their sightlines as failing in the needs-repair seed", () => {
    const { desc } = describeSeed("needs-repair");
    const failFrames = desc.entities.filter((e) => e.kind === "framed_artwork" && e.status === "fail");
    expect(failFrames.length).toBeGreaterThan(0);
    const failRays = desc.entities.filter((e) => e.kind === "sightline_ray" && e.materialName === "cone-fail");
    expect(failRays.length).toBeGreaterThan(0);
    expect(validateSceneDescription(desc)).toEqual([]);
  });

  it("reflects selection and handles the empty seed", () => {
    const { model } = describeSeed("default");
    model.selectedMountId = model.mounts[0].id;
    const desc = toSceneDescription(model, [], computeSightlineFrustums(model));
    expect(desc.entities.filter((e) => e.selected && e.kind === "framed_artwork").map((e) => e.id)).toEqual([
      model.mounts[0].id,
    ]);
    const empty = describeSeed("empty").desc;
    expect(empty.entities.some((e) => e.kind === "maquette_base")).toBe(true);
    expect(validateSceneDescription(empty)).toEqual([]);
  });

  it("detects broken links", () => {
    const { desc } = describeSeed("default");
    desc.links.push({ id: "bad", fromId: "nope", toId: desc.entities[0].id, kind: "mounted_on", materialName: "wall", thickness_m: 0.01 });
    expect(validateSceneDescription(desc)).toHaveLength(1);
  });
});

describe("hands-first", () => {
  it("applies 1.8 cm engage / 2.5 cm release hysteresis", () => {
    const thumb: [number, number, number] = [0, 0, 0];
    expect(evaluatePinchDistanceMeters(thumb, [0.017, 0, 0], false)).toBe(true);
    expect(evaluatePinchDistanceMeters(thumb, [0.02, 0, 0], false)).toBe(false);
    expect(evaluatePinchDistanceMeters(thumb, [0.02, 0, 0], true)).toBe(true);
    expect(evaluatePinchDistanceMeters(thumb, [0.026, 0, 0], true)).toBe(false);
  });

  it("quantizes wall drags to 1 cm", () => {
    expect(quantizeWallDragCm(3.4)).toBe(3);
    expect(quantizeWallDragCm(3.6)).toBe(4);
    expect(quantizeWallDragCm(-2.4)).toBe(-2);
  });
});

describe("iwsdk bridge", () => {
  it("generates parseable uikitml placard markup and escapes text", () => {
    const bridge = createIwsdkGalleryBridge();
    expect(bridge.sdkVersion).toBe("1.1.0");
    const markup = bridge.uikitPlacardMarkup("Starry <Night>", "Vincent, 1889", "Oil on canvas");
    expect(markup).toContain("Starry &lt;Night&gt;");
    bridge.dispose();
  });

  it("clamps the HUD inside the 30 x 22 degree cone", () => {
    expect(clampHudAngles(40, -30)).toEqual({ yawDeg: 15, pitchDeg: -11, clamped: true });
    expect(clampHudAngles(5, 5).clamped).toBe(false);
    const { model } = describeSeed("default");
    model.hudYawOffset_deg = 60;
    model.hudPitchOffset_deg = 40;
    const desc = toSceneDescription(model, [], []);
    const bridge = createIwsdkGalleryBridge();
    const res = bridge.syncSceneEntities(desc);
    expect(res.fovClamped).toBe(true);
    expect(res.ecsEntityCount).toBe(desc.entities.length);
    bridge.dispose();
  });

  it("round-trips spatial anchors through localStorage", () => {
    const bridge = createIwsdkGalleryBridge();
    expect(bridge.loadPersistedAnchors()).toEqual([]);
    const anchors: SpatialAnchorRecord[] = [
      { id: "a1", wallId: "wall-north", label: "North", referenceSpace: "local-floor", poseMatrix16: new Array(16).fill(0), pinnedMountIds: ["m1"], savedAtIso: "2026-11-15T00:00:00Z" },
    ];
    bridge.persistAnchorSnapshot(anchors);
    expect(localStorage.getItem(ANCHOR_STORAGE_KEY)).toContain("a1");
    expect(bridge.loadPersistedAnchors()).toEqual(anchors);
    localStorage.setItem(ANCHOR_STORAGE_KEY, "{bad json");
    expect(bridge.loadPersistedAnchors()).toEqual([]);
    bridge.dispose();
  });
});

describe("spatial audio", () => {
  it("no-ops safely without an AudioContext", () => {
    const cues = createSpatialAudioCues();
    expect(() => {
      cues.playWoodFrameClick([0, 1, -1]);
      cues.playCompliancePassChord();
      cues.playViolationPulse();
    }).not.toThrow();
  });
});
