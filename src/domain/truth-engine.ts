/**
 * Deterministic spatial, ADA 115 cm sightline, W3C XAUR angular legibility,
 * and Canadian Conservation Institute illuminance validator.
 */
import { outerHeight_cm, outerWidth_cm } from "./hang-layouts";
import type {
  ArtworkCatalogItem,
  ExhibitionModel,
  MountedArtwork,
  SightlineCone,
  TruthIssue,
  WallPlane,
} from "./types";

export interface SightlineTruthEngine {
  checkExhibition(model: ExhibitionModel): TruthIssue[];
  computeSightlineFrustums(model: ExhibitionModel): SightlineCone[];
  validateAdaCompliance(model: ExhibitionModel): TruthIssue[];
  checkFovLabelLegibility(model: ExhibitionModel): TruthIssue[];
  checkConservationLux(model: ExhibitionModel): TruthIssue[];
  checkWallBoundsAndClearance(model: ExhibitionModel): TruthIssue[];
}

export const RULE_WALL_BOUNDS = "RULE_WALL_BOUNDS";
export const RULE_FRAME_CLEARANCE = "RULE_FRAME_CLEARANCE";
export const RULE_ADA_PITCH = "RULE_ADA_PITCH";
export const RULE_CENTERLINE_BAND = "RULE_CENTERLINE_BAND";
export const RULE_PLACARD_PLACEMENT = "RULE_PLACARD_PLACEMENT";
export const RULE_XAUR_LEGIBILITY = "RULE_XAUR_LEGIBILITY";
export const RULE_CCI_LUX = "RULE_CCI_LUX";

function findCatalogItem(
  catalog: ArtworkCatalogItem[],
  artworkId: string
): ArtworkCatalogItem | undefined {
  return catalog.find((c) => c.id === artworkId);
}

function findWall(walls: WallPlane[], wallId: string): WallPlane | undefined {
  return walls.find((w) => w.id === wallId);
}

export function checkWallBoundsAndClearance(model: ExhibitionModel): TruthIssue[] {
  const issues: TruthIssue[] = [];
  const { walls, catalog, mounts } = model;

  const mountsByWall = new Map<string, MountedArtwork[]>();
  for (const m of mounts) {
    const list = mountsByWall.get(m.wallId) ?? [];
    list.push(m);
    mountsByWall.set(m.wallId, list);
  }

  for (const [wallId, wallMounts] of mountsByWall.entries()) {
    const wall = findWall(walls, wallId);
    if (!wall) continue;

    // 1. RULE_WALL_BOUNDS check for each mount and its placard
    for (const mount of wallMounts) {
      const art = findCatalogItem(catalog, mount.artworkId);
      if (!art) continue;

      const outerW = outerWidth_cm(art);
      const outerH = outerHeight_cm(art);

      const leftMargin = mount.centerX_cm - outerW / 2;
      const rightMargin = wall.width_cm - (mount.centerX_cm + outerW / 2);
      const bottomMargin = mount.centerY_cm - outerH / 2;
      const topMargin = wall.height_cm - (mount.centerY_cm + outerH / 2);

      if (leftMargin < 20) {
        issues.push({
          id: `issue-wall-bounds-left-${mount.id}`,
          ruleId: "RULE_WALL_BOUNDS",
          severity: "error",
          entityIds: [mount.id, wall.id],
          wallId: wall.id,
          mountId: mount.id,
          measuredValue: Math.round(leftMargin * 10) / 10,
          limitValue: 20,
          unit: "cm",
          message: `'${art.title}' sits ${Math.round(leftMargin)} cm from the left wall edge (minimum 20 cm required).`,
          suggestedAction: "reflow_wall_spacing",
          suggestedArgs: { wallId: wall.id, minGapCm: 18 },
        });
      }

      if (rightMargin < 20) {
        issues.push({
          id: `issue-wall-bounds-right-${mount.id}`,
          ruleId: "RULE_WALL_BOUNDS",
          severity: "error",
          entityIds: [mount.id, wall.id],
          wallId: wall.id,
          mountId: mount.id,
          measuredValue: Math.round(rightMargin * 10) / 10,
          limitValue: 20,
          unit: "cm",
          message: `'${art.title}' sits ${Math.round(rightMargin)} cm from the right wall edge (minimum 20 cm required).`,
          suggestedAction: "reflow_wall_spacing",
          suggestedArgs: { wallId: wall.id, minGapCm: 18 },
        });
      }

      if (bottomMargin < 40) {
        issues.push({
          id: `issue-wall-bounds-bottom-${mount.id}`,
          ruleId: "RULE_WALL_BOUNDS",
          severity: "error",
          entityIds: [mount.id, wall.id],
          wallId: wall.id,
          mountId: mount.id,
          measuredValue: Math.round(bottomMargin * 10) / 10,
          limitValue: 40,
          unit: "cm",
          message: `'${art.title}' bottom frame edge sits at ${Math.round(bottomMargin)} cm (minimum 40 cm floor clearance).`,
          suggestedAction: "adjust_frame_height",
          suggestedArgs: { mountId: mount.id, centerYCm: 145 },
        });
      }

      if (topMargin < 15) {
        issues.push({
          id: `issue-wall-bounds-top-${mount.id}`,
          ruleId: "RULE_WALL_BOUNDS",
          severity: "error",
          entityIds: [mount.id, wall.id],
          wallId: wall.id,
          mountId: mount.id,
          measuredValue: Math.round(topMargin * 10) / 10,
          limitValue: 15,
          unit: "cm",
          message: `'${art.title}' top frame edge sits ${Math.round(topMargin)} cm from ceiling (minimum 15 cm clearance).`,
          suggestedAction: "adjust_frame_height",
          suggestedArgs: { mountId: mount.id, centerYCm: 145 },
        });
      }

      // Placard wall bounds check
      if (mount.placard) {
        const pLeft = mount.placard.centerX_cm - mount.placard.width_cm / 2;
        const pRight = wall.width_cm - (mount.placard.centerX_cm + mount.placard.width_cm / 2);
        if (pLeft < 10 || pRight < 10) {
          issues.push({
            id: `issue-placard-wall-bounds-${mount.id}`,
            ruleId: "RULE_WALL_BOUNDS",
            severity: "error",
            entityIds: [mount.id, mount.placard.id, wall.id],
            wallId: wall.id,
            mountId: mount.id,
            measuredValue: Math.round(Math.min(pLeft, pRight) * 10) / 10,
            limitValue: 10,
            unit: "cm",
            message: `Placard for '${art.title}' clips wall boundary with only ${Math.round(Math.min(pLeft, pRight))} cm margin.`,
            suggestedAction: "reflow_wall_spacing",
            suggestedArgs: { wallId: wall.id, minGapCm: 18 },
          });
        }
      }
    }

    // 2. RULE_FRAME_CLEARANCE between every adjacent pair sorted by centerX_cm
    const sorted = [...wallMounts].sort((a, b) => a.centerX_cm - b.centerX_cm);
    for (let i = 0; i < sorted.length - 1; i++) {
      const mA = sorted[i];
      const mB = sorted[i + 1];
      const artA = findCatalogItem(catalog, mA.artworkId);
      const artB = findCatalogItem(catalog, mB.artworkId);
      if (!artA || !artB) continue;

      const outerWA = outerWidth_cm(artA);
      const outerWB = outerWidth_cm(artB);

      const rightEdgeA = mA.centerX_cm + outerWA / 2;
      const leftEdgeB = mB.centerX_cm - outerWB / 2;
      const gap_cm = leftEdgeB - rightEdgeA;

      if (gap_cm < 15.0) {
        issues.push({
          id: `issue-frame-clearance-${mA.id}-${mB.id}`,
          ruleId: "RULE_FRAME_CLEARANCE",
          severity: "error",
          entityIds: [mA.id, mB.id, wall.id],
          wallId: wall.id,
          mountId: mB.id,
          measuredValue: Math.round(gap_cm * 10) / 10,
          limitValue: 15.0,
          unit: "cm",
          message: `Frame clearance between '${artA.title}' and '${artB.title}' is ${Math.round(gap_cm * 10) / 10} cm (minimum 15.0 cm required).`,
          suggestedAction: "reflow_wall_spacing",
          suggestedArgs: { wallId: wall.id, minGapCm: 18 },
        });
      }
    }
  }

  return issues;
}

export function validateAdaCompliance(model: ExhibitionModel): TruthIssue[] {
  const issues: TruthIssue[] = [];
  const { walls, catalog, mounts } = model;

  for (const mount of mounts) {
    const art = findCatalogItem(catalog, mount.artworkId);
    const wall = findWall(walls, mount.wallId);
    if (!art || !wall) continue;

    const outerH = outerHeight_cm(art);

    // 3. RULE_ADA_PITCH: Wheelchair eye height 115 cm, distance 120 cm
    // Upward pitch to top-third optical focal point
    const focalY_cm = mount.centerY_cm + outerH * 0.15;
    const eyeY_cm = 115;
    const dist_cm = 120;
    const deltaY = Math.max(0, focalY_cm - eyeY_cm);
    const pitch_deg = (180 / Math.PI) * Math.atan2(deltaY, dist_cm);

    if (pitch_deg > 25.0) {
      issues.push({
        id: `issue-ada-pitch-${mount.id}`,
        ruleId: "RULE_ADA_PITCH",
        severity: "error",
        entityIds: [mount.id],
        wallId: wall.id,
        mountId: mount.id,
        measuredValue: Math.round(pitch_deg * 10) / 10,
        limitValue: 25.0,
        unit: "deg",
        message: `Wheelchair 115 cm sightline pitch to '${art.title}' is ${Math.round(pitch_deg * 10) / 10}° (limit 25.0° at 120 cm distance).`,
        suggestedAction: "repair_layout_violation",
        suggestedArgs: {
          issueId: `issue-ada-pitch-${mount.id}`,
          mountId: mount.id,
          targetCenterYCm: 145,
        },
      });
    }

    // 4. RULE_CENTERLINE_BAND: Inclusive museum sightline band 138-155 cm
    // Exempt if artwork height > 120 cm and bottom edge >= 55 cm
    const isExemptOversized = art.height_cm > 120 && mount.centerY_cm - outerH / 2 >= 55;
    if (!isExemptOversized) {
      if (mount.centerY_cm < 138 || mount.centerY_cm > 155) {
        const deviation =
          mount.centerY_cm < 138 ? 138 - mount.centerY_cm : mount.centerY_cm - 155;
        const severity: "error" | "warning" = deviation <= 5 ? "warning" : "error";
        const limit = mount.centerY_cm < 138 ? 138 : 155;

        issues.push({
          id: `issue-centerline-${mount.id}`,
          ruleId: "RULE_CENTERLINE_BAND",
          severity,
          entityIds: [mount.id],
          wallId: wall.id,
          mountId: mount.id,
          measuredValue: mount.centerY_cm,
          limitValue: limit,
          unit: "cm",
          message: `'${art.title}' centerline sits at ${mount.centerY_cm} cm (standard inclusive band 138–155 cm).`,
          suggestedAction: "adjust_frame_height",
          suggestedArgs: { mountId: mount.id, centerYCm: 145 },
        });
      }
    }

    // 5. RULE_PLACARD_PLACEMENT: Placard height 120-140 cm & gap 8-15 cm
    if (mount.placard) {
      const p = mount.placard;
      if (p.centerY_cm < 120 || p.centerY_cm > 140) {
        issues.push({
          id: `issue-placard-height-${mount.id}`,
          ruleId: "RULE_PLACARD_PLACEMENT",
          severity: "error",
          entityIds: [mount.id, p.id],
          wallId: wall.id,
          mountId: mount.id,
          measuredValue: p.centerY_cm,
          limitValue: p.centerY_cm < 120 ? 120 : 140,
          unit: "cm",
          message: `Placard for '${art.title}' is hung at ${p.centerY_cm} cm (must be within 120–140 cm reach band).`,
          suggestedAction: "repair_layout_violation",
          suggestedArgs: { issueId: `issue-placard-height-${mount.id}`, mountId: mount.id },
        });
      }

      const outerW = outerWidth_cm(art);
      let horizontalGap = 0;
      if (p.side === "right") {
        horizontalGap = (p.centerX_cm - p.width_cm / 2) - (mount.centerX_cm + outerW / 2);
      } else {
        horizontalGap = (mount.centerX_cm - outerW / 2) - (p.centerX_cm + p.width_cm / 2);
      }

      if (horizontalGap < 8.0 || horizontalGap > 15.0) {
        issues.push({
          id: `issue-placard-gap-${mount.id}`,
          ruleId: "RULE_PLACARD_PLACEMENT",
          severity: "error",
          entityIds: [mount.id, p.id],
          wallId: wall.id,
          mountId: mount.id,
          measuredValue: Math.round(horizontalGap * 10) / 10,
          limitValue: horizontalGap < 8.0 ? 8.0 : 15.0,
          unit: "cm",
          message: `Horizontal gap between '${art.title}' frame and placard is ${Math.round(horizontalGap * 10) / 10} cm (permitted 8–15 cm).`,
          suggestedAction: "repair_layout_violation",
          suggestedArgs: { issueId: `issue-placard-gap-${mount.id}`, mountId: mount.id },
        });
      }
    }
  }

  return issues;
}

export function checkFovLabelLegibility(model: ExhibitionModel): TruthIssue[] {
  const issues: TruthIssue[] = [];
  const { walls, catalog, mounts, hudPitchOffset_deg, hudYawOffset_deg } = model;

  // 6. RULE_XAUR_LEGIBILITY
  for (const mount of mounts) {
    if (!mount.placard) continue;
    const art = findCatalogItem(catalog, mount.artworkId);
    const wall = findWall(walls, mount.wallId);
    if (!art || !wall) continue;

    const p = mount.placard;
    const viewingDistance_cm = 120;
    // Angle subtended by font display block height (mm / 10 = cm)
    const angle_deg =
      2 * (180 / Math.PI) * Math.atan((p.fontHeight_mm / 10) / (2 * viewingDistance_cm));

    if (angle_deg < 1.2) {
      issues.push({
        id: `issue-xaur-legibility-${mount.id}`,
        ruleId: "RULE_XAUR_LEGIBILITY",
        severity: "error",
        entityIds: [mount.id, p.id],
        wallId: wall.id,
        mountId: mount.id,
        measuredValue: Math.round(angle_deg * 100) / 100,
        limitValue: 1.2,
        unit: "deg",
        message: `Placard text visual angle for '${art.title}' is ${Math.round(angle_deg * 100) / 100}° at 120 cm viewing distance (W3C XAUR minimum 1.2°).`,
        suggestedAction: "repair_layout_violation",
        suggestedArgs: { issueId: `issue-xaur-legibility-${mount.id}`, mountId: mount.id },
      });
    }
  }

  // Floating HUD comfort cone checks
  if (Math.abs(hudYawOffset_deg) > 15.0) {
    issues.push({
      id: "issue-hud-yaw-cone",
      ruleId: "RULE_XAUR_LEGIBILITY",
      severity: "warning",
      entityIds: [],
      wallId: model.selectedWallId,
      measuredValue: Math.round(Math.abs(hudYawOffset_deg) * 10) / 10,
      limitValue: 15.0,
      unit: "deg",
      message: `Curatorial HUD yaw drift is ${Math.round(Math.abs(hudYawOffset_deg))}° (exceeds 30° central comfort cone).`,
      suggestedAction: "repair_layout_violation",
      suggestedArgs: { issueId: "issue-hud-yaw-cone" },
    });
  }

  if (Math.abs(hudPitchOffset_deg) > 11.0) {
    issues.push({
      id: "issue-hud-pitch-cone",
      ruleId: "RULE_XAUR_LEGIBILITY",
      severity: "warning",
      entityIds: [],
      wallId: model.selectedWallId,
      measuredValue: Math.round(Math.abs(hudPitchOffset_deg) * 10) / 10,
      limitValue: 11.0,
      unit: "deg",
      message: `Curatorial HUD pitch drift is ${Math.round(Math.abs(hudPitchOffset_deg))}° (exceeds 22° vertical comfort cone).`,
      suggestedAction: "repair_layout_violation",
      suggestedArgs: { issueId: "issue-hud-pitch-cone" },
    });
  }

  return issues;
}

export function checkConservationLux(model: ExhibitionModel): TruthIssue[] {
  const issues: TruthIssue[] = [];
  const { walls, catalog, mounts } = model;

  // 7. RULE_CCI_LUX
  for (const mount of mounts) {
    const art = findCatalogItem(catalog, mount.artworkId);
    const wall = findWall(walls, mount.wallId);
    if (!art || !wall) continue;

    if (mount.spotLux > art.luxCap) {
      issues.push({
        id: `issue-cci-lux-${mount.id}`,
        ruleId: "RULE_CCI_LUX",
        severity: "error",
        entityIds: [mount.id],
        wallId: wall.id,
        mountId: mount.id,
        measuredValue: mount.spotLux,
        limitValue: art.luxCap,
        unit: "lux",
        message: `'${art.title}' (${art.medium}) receives ${mount.spotLux} lux, exceeding its ${art.luxCap} lux conservation ceiling.`,
        suggestedAction: "set_spot_illumination",
        suggestedArgs: {
          mountId: mount.id,
          spotLux: art.luxCap === 50 ? 45 : 175,
        },
      });
    }
  }

  return issues;
}

export function checkExhibition(model: ExhibitionModel): TruthIssue[] {
  return [
    ...checkWallBoundsAndClearance(model),
    ...validateAdaCompliance(model),
    ...checkFovLabelLegibility(model),
    ...checkConservationLux(model),
  ];
}

export function computeSightlineFrustums(model: ExhibitionModel): SightlineCone[] {
  const cones: SightlineCone[] = [];
  const { walls, catalog, mounts } = model;
  const issues = checkExhibition(model);

  for (const mount of mounts) {
    const wall = findWall(walls, mount.wallId);
    const art = findCatalogItem(catalog, mount.artworkId);
    if (!wall || !art) continue;

    const mountIssues = issues.filter((iss) => iss.mountId === mount.id);
    const hasError = mountIssues.some((iss) => iss.severity === "error");
    const hasWarning = mountIssues.some((iss) => iss.severity === "warning");
    const status: "pass" | "warning" | "fail" = hasError
      ? "fail"
      : hasWarning
      ? "warning"
      : "pass";

    const [wx, wy, wz] = wall.position_m;
    const rad = (wall.rotation_deg * Math.PI) / 180;
    const u_m = (mount.centerX_cm - wall.width_cm / 2) / 100;
    const v_m = mount.centerY_cm / 100;

    const target_m: [number, number, number] = [
      Math.round((wx + u_m * Math.cos(rad)) * 1000) / 1000,
      Math.round((wy + v_m) * 1000) / 1000,
      Math.round((wz - u_m * Math.sin(rad)) * 1000) / 1000,
    ];

    const postures: Array<{
      posture: "standing_152" | "wheelchair_115";
      eyeHeight_cm: number;
      dist_cm: number;
    }> = [
      { posture: "standing_152", eyeHeight_cm: 152, dist_cm: 140 },
      { posture: "wheelchair_115", eyeHeight_cm: 115, dist_cm: 120 },
    ];

    for (const p of postures) {
      const dist_m = p.dist_cm / 100;
      const origin_m: [number, number, number] = [
        Math.round((target_m[0] + dist_m * Math.sin(rad)) * 1000) / 1000,
        Math.round((p.eyeHeight_cm / 100) * 1000) / 1000,
        Math.round((target_m[2] + dist_m * Math.cos(rad)) * 1000) / 1000,
      ];

      const upwardPitch_deg =
        Math.round(
          (180 / Math.PI) *
            Math.atan2(Math.max(0, mount.centerY_cm - p.eyeHeight_cm), p.dist_cm) *
            10
        ) / 10;

      const fontHeight = mount.placard?.fontHeight_mm ?? 28;
      const placardAngularHeight_deg =
        Math.round(
          2 * (180 / Math.PI) * Math.atan((fontHeight / 10) / (2 * p.dist_cm)) * 100
        ) / 100;

      cones.push({
        id: `cone-${mount.id}-${p.posture}`,
        mountId: mount.id,
        wallId: wall.id,
        posture: p.posture,
        eyeHeight_cm: p.eyeHeight_cm,
        viewingDistance_cm: p.dist_cm,
        origin_m,
        target_m,
        upwardPitch_deg,
        placardAngularHeight_deg,
        withinFovComfortCone: upwardPitch_deg <= 25.0,
        status,
      });
    }
  }

  return cones;
}

export function createTruthEngine(): SightlineTruthEngine {
  return {
    checkExhibition,
    computeSightlineFrustums,
    validateAdaCompliance,
    checkFovLabelLegibility,
    checkConservationLux,
    checkWallBoundsAndClearance,
  };
}
