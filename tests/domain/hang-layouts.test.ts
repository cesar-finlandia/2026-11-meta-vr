import { describe, expect, it } from "vitest";
import { BUNDLED_AIC_CATALOG } from "../../src/domain/collection-loader";
import {
  computeHangLayout,
  createDefaultPlacard,
  outerHeight_cm,
  outerWidth_cm,
  reflowWallMounts,
} from "../../src/domain/hang-layouts";
import type { MountedArtwork, WallPlane } from "../../src/domain/types";

const testWall: WallPlane = {
  id: "wall-north",
  name: "North Limestone Gallery Wall",
  width_cm: 420,
  height_cm: 280,
  position_m: [0, 0, -2.1],
  rotation_deg: 0,
  source: "virtual_twin",
};

describe("hang-layouts", () => {
  it("calculates outer dimensions including frame borders", () => {
    const art = BUNDLED_AIC_CATALOG[0]; // width 124, height 84, frame_border 5
    expect(outerWidth_cm(art)).toBe(134);
    expect(outerHeight_cm(art)).toBe(94);
  });

  it("createDefaultPlacard places placard within 8-15 cm of frame and 120-140 cm height", () => {
    const art = BUNDLED_AIC_CATALOG[1]; // Great Wave, width 38, frame 4 -> outerW 46
    const centerX = 150;
    const centerY = 145;
    const placard = createDefaultPlacard("m1", testWall, art, centerX, centerY);

    expect(placard.centerY_cm).toBe(130);
    expect(placard.centerY_cm).toBeGreaterThanOrEqual(120);
    expect(placard.centerY_cm).toBeLessThanOrEqual(140);

    const frameRight = centerX + outerWidth_cm(art) / 2; // 150 + 23 = 173
    const placardLeft = placard.centerX_cm - placard.width_cm / 2;
    const gap = placardLeft - frameRight;
    expect(Math.round(gap)).toBe(10); // Exactly inside [8, 15] cm
    expect(placard.fontHeight_mm).toBe(28);
  });

  it("flips placard to left side when near the right wall boundary", () => {
    const art = BUNDLED_AIC_CATALOG[1]; // outerW 46
    const centerX = 390; // Near wall right edge (420 cm)
    const placard = createDefaultPlacard("m2", testWall, art, centerX, 145);

    expect(placard.side).toBe("left");
    const frameLeft = centerX - outerWidth_cm(art) / 2;
    const placardRight = placard.centerX_cm + placard.width_cm / 2;
    const gap = frameLeft - placardRight;
    expect(Math.round(gap)).toBe(10);
  });

  it("chronological_spine arranges works strictly by year with >=15 cm frame gaps", () => {
    // Select 3 works from different centuries
    const selected = [
      BUNDLED_AIC_CATALOG[0], // Seurat 1884
      BUNDLED_AIC_CATALOG[1], // Hokusai 1831
      BUNDLED_AIC_CATALOG[5], // Korin 1705
    ];

    const mounts = computeHangLayout("chronological_spine", testWall, selected);
    expect(mounts).toHaveLength(3);

    // Verify ordering by year
    expect(mounts[0].artworkId).toBe("aic-80607"); // 1705
    expect(mounts[1].artworkId).toBe("aic-24645"); // 1831
    expect(mounts[2].artworkId).toBe("aic-27992"); // 1884

    // Centerlines all at 145 cm
    for (const m of mounts) {
      expect(m.centerY_cm).toBe(145);
    }

    // Verify horizontal ordering and clearance
    for (let i = 0; i < mounts.length - 1; i++) {
      const artA = selected.find((a) => a.id === mounts[i].artworkId)!;
      const artB = selected.find((a) => a.id === mounts[i + 1].artworkId)!;
      const rightA = mounts[i].centerX_cm + outerWidth_cm(artA) / 2;
      const leftB = mounts[i + 1].centerX_cm - outerWidth_cm(artB) / 2;
      expect(leftB - rightA).toBeGreaterThanOrEqual(15.0);
    }
  });

  it("salon_cluster centers the largest artwork and staggers flanking works inside 138-155 cm", () => {
    const selected = [
      BUNDLED_AIC_CATALOG[1], // Great Wave (38x26)
      BUNDLED_AIC_CATALOG[0], // Grande Jatte (124x84) -> largest
      BUNDLED_AIC_CATALOG[2], // Water Lilies (94x90)
    ];

    const mounts = computeHangLayout("salon_cluster", testWall, selected);
    expect(mounts).toHaveLength(3);

    // Middle element should be the largest
    expect(mounts[1].artworkId).toBe("aic-27992");
    expect(mounts[1].centerY_cm).toBe(146);

    for (const m of mounts) {
      expect(m.centerY_cm).toBeGreaterThanOrEqual(138);
      expect(m.centerY_cm).toBeLessThanOrEqual(155);
    }
  });

  it("symmetrical_pair spaces works symmetrically around wall center", () => {
    const selected = [BUNDLED_AIC_CATALOG[1], BUNDLED_AIC_CATALOG[7]]; // two small works
    const mounts = computeHangLayout("symmetrical_pair", testWall, selected);

    expect(mounts).toHaveLength(2);
    const wallCenter = testWall.width_cm / 2; // 210 cm
    const dist0 = Math.abs(wallCenter - mounts[0].centerX_cm);
    const dist1 = Math.abs(mounts[1].centerX_cm - wallCenter);
    expect(Math.abs(dist0 - dist1)).toBeLessThan(5);
  });

  it("reflowWallMounts eliminates overlaps and enforces >=15 cm frame clearance", () => {
    const artA = BUNDLED_AIC_CATALOG[1]; // outerW 46
    const artB = BUNDLED_AIC_CATALOG[6]; // outerW 44

    // Deliberately create overlapping mounts
    const overlappingMounts: MountedArtwork[] = [
      {
        id: "m-a",
        artworkId: artA.id,
        wallId: testWall.id,
        centerX_cm: 150,
        centerY_cm: 145,
        spotLux: 45,
        pinnedAnchorId: null,
        placard: createDefaultPlacard("m-a", testWall, artA, 150, 145),
      },
      {
        id: "m-b",
        artworkId: artB.id,
        wallId: testWall.id,
        centerX_cm: 165, // Collision: distance is only 15 cm while outer widths are 46 and 44
        centerY_cm: 145,
        spotLux: 45,
        pinnedAnchorId: null,
        placard: createDefaultPlacard("m-b", testWall, artB, 165, 145),
      },
    ];

    const reflowed = reflowWallMounts(testWall, overlappingMounts, [artA, artB], 18);
    expect(reflowed).toHaveLength(2);

    const rightA = reflowed[0].centerX_cm + outerWidth_cm(artA) / 2;
    const leftB = reflowed[1].centerX_cm - outerWidth_cm(artB) / 2;
    const gap = leftB - rightA;
    expect(gap).toBeGreaterThanOrEqual(15.0);

    // Placards recomputed
    expect(reflowed[0].placard.centerX_cm).toBeGreaterThan(reflowed[0].centerX_cm);
    expect(reflowed[1].placard.centerX_cm).toBeGreaterThan(reflowed[1].centerX_cm);
  });
});
