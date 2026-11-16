import { describe, expect, it } from "vitest";
import {
  checkConservationLux,
  checkExhibition,
  checkFovLabelLegibility,
  checkWallBoundsAndClearance,
  computeSightlineFrustums,
  createTruthEngine,
  RULE_ADA_PITCH,
  RULE_CCI_LUX,
  RULE_CENTERLINE_BAND,
  RULE_FRAME_CLEARANCE,
  RULE_PLACARD_PLACEMENT,
  RULE_WALL_BOUNDS,
  RULE_XAUR_LEGIBILITY,
  validateAdaCompliance,
} from "../../src/domain/truth-engine";
import { createDefaultGalleryWalls, createSeedExhibition } from "../../src/domain/seed";
import { BUNDLED_AIC_CATALOG } from "../../src/domain/collection-loader";
import { createDefaultPlacard } from "../../src/domain/hang-layouts";
import type {
  ArtworkCatalogItem,
  ExhibitionModel,
  MountedArtwork,
  PlacardLabel,
} from "../../src/domain/types";

describe("SightlineTruthEngine - Rule Fixtures and Verification", () => {
  const [wallNorth] = createDefaultGalleryWalls();
  const seurat = BUNDLED_AIC_CATALOG[0]; // 124x84 cm canvas, durable_200_lux
  const hokusai = BUNDLED_AIC_CATALOG[1]; // 38x26 cm paper, paper_50_lux

  function makePlacard(
    mountId: string,
    art: ArtworkCatalogItem,
    centerX: number,
    centerY: number,
    opts?: Partial<PlacardLabel>
  ): PlacardLabel {
    const base = createDefaultPlacard(mountId, wallNorth, art, centerX, centerY);
    return {
      ...base,
      ...opts,
    };
  }

  function makeMount(opts: {
    id: string;
    artwork: ArtworkCatalogItem;
    centerX_cm: number;
    centerY_cm: number;
    spotLux: number;
    placardOpts?: Partial<PlacardLabel>;
  }): MountedArtwork {
    const placard = makePlacard(
      opts.id,
      opts.artwork,
      opts.centerX_cm,
      opts.centerY_cm,
      opts.placardOpts
    );
    return {
      id: opts.id,
      wallId: wallNorth.id,
      artworkId: opts.artwork.id,
      centerX_cm: opts.centerX_cm,
      centerY_cm: opts.centerY_cm,
      spotLux: opts.spotLux,
      pinnedAnchorId: null,
      placard,
    };
  }

  function createMinimalModel(mounts: MountedArtwork[]): ExhibitionModel {
    return {
      exhibitionTitle: "Test Curation",
      curatorialBrief: "Test brief",
      activeTheme: "impressionist",
      selectedArtworkIds: [seurat.id, hokusai.id],
      rejectedArtworkIds: [],
      walls: [wallNorth],
      catalog: [seurat, hokusai],
      mounts,
      anchors: [],
      snapshots: [],
      viewMode: "standing_152",
      passthroughActive: false,
      scaleTwinActive: false,
      selectedMountId: null,
      selectedWallId: wallNorth.id,
      hudYawOffset_deg: 0,
      hudPitchOffset_deg: 0,
      revision: 1,
    };
  }

  describe("RULE_WALL_BOUNDS", () => {
    it("passes when artwork outer envelope is within margins", () => {
      const mount = makeMount({
        id: "m-bounds-pass",
        artwork: seurat,
        centerX_cm: 210,
        centerY_cm: 145,
        spotLux: 160,
      });
      const model = createMinimalModel([mount]);
      const issues = checkWallBoundsAndClearance(model).filter(
        (i) => i.ruleId === RULE_WALL_BOUNDS
      );
      expect(issues).toHaveLength(0);
    });

    it("fails with measured cm unit when artwork exceeds wall left edge", () => {
      const mount = makeMount({
        id: "m-bounds-fail",
        artwork: seurat,
        centerX_cm: 50,
        centerY_cm: 145,
        spotLux: 160,
      });
      const model = createMinimalModel([mount]);
      const issues = checkWallBoundsAndClearance(model).filter(
        (i) => i.ruleId === RULE_WALL_BOUNDS
      );
      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0].unit).toBe("cm");
      expect(issues[0].severity).toBe("error");
      expect(issues[0].suggestedAction).toBe("reflow_wall_spacing");
    });
  });

  describe("RULE_FRAME_CLEARANCE", () => {
    it("passes when adjacent outer frame gap is >= 15 cm", () => {
      const mountA = makeMount({
        id: "m-a",
        artwork: seurat,
        centerX_cm: 120,
        centerY_cm: 145,
        spotLux: 160,
        placardOpts: { side: "left", centerX_cm: 30 },
      });
      const mountB = makeMount({
        id: "m-b",
        artwork: hokusai,
        centerX_cm: 230,
        centerY_cm: 145,
        spotLux: 45,
        placardOpts: { side: "right", centerX_cm: 270 },
      });
      const model = createMinimalModel([mountA, mountB]);
      const issues = checkWallBoundsAndClearance(model).filter(
        (i) => i.ruleId === RULE_FRAME_CLEARANCE
      );
      expect(issues).toHaveLength(0);
    });

    it("fails with measured gap in cm when gap is < 15 cm", () => {
      const mountA = makeMount({
        id: "m-a",
        artwork: seurat,
        centerX_cm: 120,
        centerY_cm: 145,
        spotLux: 160,
        placardOpts: { side: "left", centerX_cm: 30 },
      });
      const mountB = makeMount({
        id: "m-b",
        artwork: hokusai,
        centerX_cm: 215, // right edge A = 187, left edge B = 215 - 23 = 192 -> gap = 5 cm < 15 cm
        centerY_cm: 145,
        spotLux: 45,
        placardOpts: { side: "right", centerX_cm: 260 },
      });
      const model = createMinimalModel([mountA, mountB]);
      const issues = checkWallBoundsAndClearance(model).filter(
        (i) => i.ruleId === RULE_FRAME_CLEARANCE
      );
      expect(issues.length).toBe(1);
      expect(issues[0].unit).toBe("cm");
      expect(issues[0].measuredValue).toBe(5);
      expect(issues[0].limitValue).toBe(15);
      expect(issues[0].severity).toBe("error");
    });
  });

  describe("RULE_ADA_PITCH", () => {
    it("passes when wheelchair eye upward pitch is <= 25.0 deg", () => {
      const mount = makeMount({
        id: "m-pitch-pass",
        artwork: seurat,
        centerX_cm: 210,
        centerY_cm: 145,
        spotLux: 160,
      });
      const model = createMinimalModel([mount]);
      const issues = validateAdaCompliance(model).filter(
        (i) => i.ruleId === RULE_ADA_PITCH
      );
      expect(issues).toHaveLength(0);
    });

    it("fails when upward pitch exceeds 25.0 deg with measured deg unit", () => {
      const mount = makeMount({
        id: "m-pitch-fail",
        artwork: seurat,
        centerX_cm: 210,
        centerY_cm: 180,
        spotLux: 160,
      });
      const model = createMinimalModel([mount]);
      const issues = validateAdaCompliance(model).filter(
        (i) => i.ruleId === RULE_ADA_PITCH
      );
      expect(issues).toHaveLength(1);
      expect(issues[0].unit).toBe("deg");
      expect(issues[0].severity).toBe("error");
      expect(issues[0].measuredValue).toBeGreaterThan(25);
    });
  });

  describe("RULE_CENTERLINE_BAND", () => {
    it("passes when centerline is within 138-155 cm band", () => {
      const mount = makeMount({
        id: "m-band-pass",
        artwork: seurat,
        centerX_cm: 210,
        centerY_cm: 145,
        spotLux: 160,
      });
      const model = createMinimalModel([mount]);
      const issues = validateAdaCompliance(model).filter(
        (i) => i.ruleId === RULE_CENTERLINE_BAND
      );
      expect(issues).toHaveLength(0);
    });

    it("emits warning when within 5 cm outside band, and error when further", () => {
      const mountWarn = makeMount({
        id: "m-band-warn",
        artwork: seurat,
        centerX_cm: 210,
        centerY_cm: 135,
        spotLux: 160,
      });
      const modelWarn = createMinimalModel([mountWarn]);
      const issuesWarn = validateAdaCompliance(modelWarn).filter(
        (i) => i.ruleId === RULE_CENTERLINE_BAND
      );
      expect(issuesWarn).toHaveLength(1);
      expect(issuesWarn[0].severity).toBe("warning");
      expect(issuesWarn[0].unit).toBe("cm");

      const mountErr = makeMount({
        id: "m-band-err",
        artwork: seurat,
        centerX_cm: 210,
        centerY_cm: 170,
        spotLux: 160,
      });
      const modelErr = createMinimalModel([mountErr]);
      const issuesErr = validateAdaCompliance(modelErr).filter(
        (i) => i.ruleId === RULE_CENTERLINE_BAND
      );
      expect(issuesErr).toHaveLength(1);
      expect(issuesErr[0].severity).toBe("error");
    });
  });

  describe("RULE_PLACARD_PLACEMENT", () => {
    it("passes when placard height is 120-140 cm and gap is 8-15 cm", () => {
      const mount = makeMount({
        id: "m-pl-pass",
        artwork: seurat,
        centerX_cm: 210,
        centerY_cm: 145,
        spotLux: 160,
        placardOpts: {
          centerX_cm: 296,
          centerY_cm: 130,
        },
      });
      const model = createMinimalModel([mount]);
      const issues = validateAdaCompliance(model).filter(
        (i) => i.ruleId === RULE_PLACARD_PLACEMENT
      );
      expect(issues).toHaveLength(0);
    });

    it("fails when placard gap is outside 8-15 cm with measured cm unit", () => {
      const mount = makeMount({
        id: "m-pl-fail",
        artwork: seurat,
        centerX_cm: 210,
        centerY_cm: 145,
        spotLux: 160,
        placardOpts: {
          centerX_cm: 277 + 20 + 9, // gap = 20 cm
          centerY_cm: 130,
        },
      });
      const model = createMinimalModel([mount]);
      const issues = validateAdaCompliance(model).filter(
        (i) => i.ruleId === RULE_PLACARD_PLACEMENT
      );
      expect(issues).toHaveLength(1);
      expect(issues[0].unit).toBe("cm");
      expect(issues[0].severity).toBe("error");
    });
  });

  describe("RULE_XAUR_LEGIBILITY", () => {
    it("passes when font visual angle is >= 1.2 deg and HUD is centered", () => {
      const mount = makeMount({
        id: "m-xaur-pass",
        artwork: seurat,
        centerX_cm: 210,
        centerY_cm: 145,
        spotLux: 160,
        placardOpts: {
          centerX_cm: 296,
          centerY_cm: 130,
          fontHeight_mm: 28, // 1.34° >= 1.2°
        },
      });
      const model = createMinimalModel([mount]);
      const issues = checkFovLabelLegibility(model).filter(
        (i) => i.ruleId === RULE_XAUR_LEGIBILITY
      );
      expect(issues).toHaveLength(0);
    });

    it("fails with measured deg when font visual angle is < 1.2 deg", () => {
      const mount = makeMount({
        id: "m-xaur-fail",
        artwork: seurat,
        centerX_cm: 210,
        centerY_cm: 145,
        spotLux: 160,
        placardOpts: {
          centerX_cm: 296,
          centerY_cm: 130,
          fontHeight_mm: 16, // 0.76° < 1.2°
        },
      });
      const model = createMinimalModel([mount]);
      const issues = checkFovLabelLegibility(model).filter(
        (i) => i.ruleId === RULE_XAUR_LEGIBILITY
      );
      expect(issues).toHaveLength(1);
      expect(issues[0].unit).toBe("deg");
      expect(issues[0].severity).toBe("error");
      expect(issues[0].measuredValue).toBeLessThan(1.2);
    });
  });

  describe("RULE_CCI_LUX", () => {
    it("passes when spotLux is <= artwork luxCap", () => {
      const mount = makeMount({
        id: "m-lux-pass",
        artwork: hokusai,
        centerX_cm: 210,
        centerY_cm: 145,
        spotLux: 45,
      });
      const model = createMinimalModel([mount]);
      const issues = checkConservationLux(model).filter(
        (i) => i.ruleId === RULE_CCI_LUX
      );
      expect(issues).toHaveLength(0);
    });

    it("fails with measured lux when spotLux > artwork luxCap", () => {
      const mount = makeMount({
        id: "m-lux-fail",
        artwork: hokusai,
        centerX_cm: 210,
        centerY_cm: 145,
        spotLux: 135, // cap is 50 lux
      });
      const model = createMinimalModel([mount]);
      const issues = checkConservationLux(model).filter(
        (i) => i.ruleId === RULE_CCI_LUX
      );
      expect(issues).toHaveLength(1);
      expect(issues[0].unit).toBe("lux");
      expect(issues[0].measuredValue).toBe(135);
      expect(issues[0].limitValue).toBe(50);
      expect(issues[0].severity).toBe("error");
    });
  });

  describe("Seed Presets & Determinism", () => {
    it("createSeedExhibition('default') returns 0 errors and 0 warnings", () => {
      const seed = createSeedExhibition("default");
      const issues = checkExhibition(seed);
      expect(issues).toHaveLength(0);
      expect(seed.mounts.length).toBe(6);
      expect(seed.walls.length).toBe(3);
    });

    it("createSeedExhibition('default') is strictly deterministic (deep-equal across runs)", () => {
      const run1 = createSeedExhibition("default");
      const run2 = createSeedExhibition("default");
      expect(run1).toEqual(run2);
    });

    it("createSeedExhibition('needs-repair') triggers ADA pitch, lux, clearance, and legibility", () => {
      const seedRepair = createSeedExhibition("needs-repair");
      const issues = checkExhibition(seedRepair);
      const ruleIds = new Set(issues.map((i) => i.ruleId));

      expect(ruleIds.has(RULE_ADA_PITCH)).toBe(true);
      expect(ruleIds.has(RULE_CCI_LUX)).toBe(true);
      expect(ruleIds.has(RULE_FRAME_CLEARANCE)).toBe(true);
      expect(ruleIds.has(RULE_XAUR_LEGIBILITY)).toBe(true);
    });

    it("createSeedExhibition('empty') initializes 3 walls and 0 mounts", () => {
      const empty = createSeedExhibition("empty");
      expect(empty.walls).toHaveLength(3);
      expect(empty.mounts).toHaveLength(0);
      expect(checkExhibition(empty)).toHaveLength(0);
    });
  });

  describe("computeSightlineFrustums & TruthEngine facade", () => {
    it("returns 12 sightline cones (6 mounts x 2 postures) for default seed with 'pass' status", () => {
      const seed = createSeedExhibition("default");
      const frustums = computeSightlineFrustums(seed);

      expect(frustums).toHaveLength(12);
      const standing = frustums.filter((f) => f.posture === "standing_152");
      const wheelchair = frustums.filter((f) => f.posture === "wheelchair_115");
      expect(standing).toHaveLength(6);
      expect(wheelchair).toHaveLength(6);

      // All cones on default seed must be "pass"
      expect(frustums.every((f) => f.status === "pass")).toBe(true);
    });

    it("marks cone status 'fail' when mount has an error issue", () => {
      const seedRepair = createSeedExhibition("needs-repair");
      const frustums = computeSightlineFrustums(seedRepair);
      const failingCones = frustums.filter((f) => f.status === "fail");
      expect(failingCones.length).toBeGreaterThan(0);
    });

    it("createTruthEngine facade provides all required methods", () => {
      const engine = createTruthEngine();
      const seed = createSeedExhibition("default");

      expect(engine.checkExhibition(seed)).toHaveLength(0);
      expect(engine.computeSightlineFrustums(seed)).toHaveLength(12);
      expect(engine.validateAdaCompliance(seed)).toHaveLength(0);
      expect(engine.checkFovLabelLegibility(seed)).toHaveLength(0);
      expect(engine.checkConservationLux(seed)).toHaveLength(0);
      expect(engine.checkWallBoundsAndClearance(seed)).toHaveLength(0);
    });
  });
});
