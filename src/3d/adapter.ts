/**
 * Pure, deterministic domain-to-3D mapper. No Three.js, no DOM, no side effects.
 */
import type { ExhibitionModel, SightlineCone, TruthIssue, WallPlane } from "../domain/types";
import type {
  SceneDescription,
  SceneEntityLink,
  SceneEntityNode,
  SceneMaterialName,
} from "./scene-types";

export type { SceneDescription } from "./scene-types";

export const HUD_YAW_LIMIT_DEG = 15;
export const HUD_PITCH_LIMIT_DEG = 11;
export const HUD_DISTANCE_M = 0.8;
export const HUD_EYE_HEIGHT_M = 1.3;
export const MAQUETTE_OFFSET_M: [number, number, number] = [0, 0.95, -0.55];

const WALL_THICKNESS_M = 0.06;
const FRAME_DEPTH_M = 0.04;
const FRAME_STANDOFF_M = WALL_THICKNESS_M / 2 + FRAME_DEPTH_M / 2;
const PLACARD_DEPTH_M = 0.012;
const RAY_THICKNESS_M = 0.006;

const r3 = (n: number): number => Math.round(n * 1000) / 1000;

export function clampHudAngles(
  yawDeg: number,
  pitchDeg: number
): { yawDeg: number; pitchDeg: number; clamped: boolean } {
  const yaw = Math.max(-HUD_YAW_LIMIT_DEG, Math.min(HUD_YAW_LIMIT_DEG, yawDeg));
  const pitch = Math.max(-HUD_PITCH_LIMIT_DEG, Math.min(HUD_PITCH_LIMIT_DEG, pitchDeg));
  return { yawDeg: yaw, pitchDeg: pitch, clamped: yaw !== yawDeg || pitch !== pitchDeg };
}

function wallPoint(
  wall: WallPlane,
  xCm: number,
  yCm: number,
  standoff_m: number
): [number, number, number] {
  const rad = (wall.rotation_deg * Math.PI) / 180;
  const u = (xCm - wall.width_cm / 2) / 100;
  const [wx, wy, wz] = wall.position_m;
  return [
    r3(wx + u * Math.cos(rad) + standoff_m * Math.sin(rad)),
    r3(wy + yCm / 100),
    r3(wz - u * Math.sin(rad) + standoff_m * Math.cos(rad)),
  ];
}

function statusFrom(issues: TruthIssue[]): "pass" | "warning" | "fail" {
  if (issues.some((i) => i.severity === "error")) return "fail";
  if (issues.some((i) => i.severity === "warning")) return "warning";
  return "pass";
}

export function toSceneDescription(
  model: ExhibitionModel,
  issues: TruthIssue[],
  cones: SightlineCone[]
): SceneDescription {
  const entities: SceneEntityNode[] = [];
  const links: SceneEntityLink[] = [];

  entities.push({
    id: "maquette-base",
    kind: "maquette_base",
    position: [...MAQUETTE_OFFSET_M],
    rotationEuler: [0, 0, 0],
    size: [0.62, 0.03, 0.42],
    materialName: "maquette-base",
    label: "1:8 tabletop maquette",
    selected: false,
    status: "neutral",
    metadata: { scale: 0.125, reach_cm: 55 },
  });

  const hud = clampHudAngles(model.hudYawOffset_deg, model.hudPitchOffset_deg);
  const yawR = (hud.yawDeg * Math.PI) / 180;
  const pitchR = (hud.pitchDeg * Math.PI) / 180;
  entities.push({
    id: "fov-hud",
    kind: "fov_hud",
    position: [
      r3(HUD_DISTANCE_M * Math.sin(yawR) * Math.cos(pitchR)),
      r3(HUD_EYE_HEIGHT_M + HUD_DISTANCE_M * Math.sin(pitchR)),
      r3(-HUD_DISTANCE_M * Math.cos(yawR) * Math.cos(pitchR)),
    ],
    rotationEuler: [0, 0, 0],
    size: [0.32, 0.18, 0.005],
    materialName: "plaque",
    label: "Curatorial HUD",
    selected: false,
    status: issues.some((i) => i.severity === "error") ? "fail" : "neutral",
    metadata: {
      yaw_deg: hud.yawDeg,
      pitch_deg: hud.pitchDeg,
      fov_clamped: hud.clamped,
      cone_w_deg: 30,
      cone_h_deg: 22,
    },
  });

  const wallById = new Map(model.walls.map((w) => [w.id, w]));
  for (const wall of model.walls) {
    entities.push({
      id: wall.id,
      kind: "gallery_wall",
      position: [
        wall.position_m[0],
        r3(wall.position_m[1] + wall.height_cm / 200),
        wall.position_m[2],
      ],
      rotationEuler: [0, r3((wall.rotation_deg * Math.PI) / 180), 0],
      size: [r3(wall.width_cm / 100), r3(wall.height_cm / 100), WALL_THICKNESS_M],
      materialName: "wall",
      label: wall.name,
      selected: model.selectedWallId === wall.id,
      status: "neutral",
      metadata: { source: wall.source },
    });
  }

  const catalogById = new Map(model.catalog.map((c) => [c.id, c]));
  const mountIds = new Set<string>();
  for (const mount of model.mounts) {
    const wall = wallById.get(mount.wallId);
    const art = catalogById.get(mount.artworkId);
    if (!wall || !art) continue;
    mountIds.add(mount.id);
    const rotY = r3((wall.rotation_deg * Math.PI) / 180);
    const status = statusFrom(issues.filter((i) => i.mountId === mount.id));
    const border = art.frame_border_cm;
    const material = `frame-${art.frameFinish}` as SceneMaterialName;
    entities.push({
      id: mount.id,
      kind: "framed_artwork",
      position: wallPoint(wall, mount.centerX_cm, mount.centerY_cm, FRAME_STANDOFF_M),
      rotationEuler: [0, rotY, 0],
      size: [
        r3((art.width_cm + 2 * border) / 100),
        r3((art.height_cm + 2 * border) / 100),
        FRAME_DEPTH_M,
      ],
      materialName: material,
      label: art.title,
      subLabel: `${art.artist}, ${art.year}`,
      selected: model.selectedMountId === mount.id,
      status,
      metadata: {
        artworkId: art.id,
        wallId: wall.id,
        spotLux: mount.spotLux,
        luxCap: art.luxCap,
        centerX_cm: mount.centerX_cm,
        centerY_cm: mount.centerY_cm,
        art_w_m: r3(art.width_cm / 100),
        art_h_m: r3(art.height_cm / 100),
      },
    });
    links.push({
      id: `link-mounted-${mount.id}`,
      fromId: mount.id,
      toId: wall.id,
      kind: "mounted_on",
      materialName: "wall",
      thickness_m: 0.002,
    });

    const p = mount.placard;
    entities.push({
      id: p.id,
      kind: "placard_label",
      position: wallPoint(
        wall,
        p.centerX_cm,
        p.centerY_cm,
        WALL_THICKNESS_M / 2 + PLACARD_DEPTH_M / 2
      ),
      rotationEuler: [0, rotY, 0],
      size: [r3(p.width_cm / 100), r3(p.height_cm / 100), PLACARD_DEPTH_M],
      materialName: "plaque",
      label: p.titleText,
      subLabel: p.artistLine,
      selected: model.selectedMountId === mount.id,
      status,
      metadata: { mountId: mount.id, fontHeight_mm: p.fontHeight_mm, side: p.side },
    });
    links.push({
      id: `link-placard-${p.id}`,
      fromId: p.id,
      toId: mount.id,
      kind: "placard_for",
      materialName: "plaque",
      thickness_m: 0.002,
    });
  }

  for (const cone of cones) {
    if (!mountIds.has(cone.mountId)) continue;
    const [ox, oy, oz] = cone.origin_m;
    const [tx, ty, tz] = cone.target_m;
    const length = Math.hypot(tx - ox, ty - oy, tz - oz);
    const material: SceneMaterialName =
      cone.status === "fail" ? "cone-fail" : cone.status === "warning" ? "cone-warn" : "cone-pass";
    entities.push({
      id: cone.id,
      kind: "sightline_ray",
      position: [r3((ox + tx) / 2), r3((oy + ty) / 2), r3((oz + tz) / 2)],
      rotationEuler: [0, 0, 0],
      size: [RAY_THICKNESS_M, r3(length), RAY_THICKNESS_M],
      materialName: material,
      label: cone.posture === "wheelchair_115" ? "115 cm sightline" : "152 cm sightline",
      selected: false,
      status: cone.status,
      metadata: {
        posture: cone.posture,
        ox,
        oy,
        oz,
        tx,
        ty,
        tz,
        pitch_deg: cone.upwardPitch_deg,
        withinFov: cone.withinFovComfortCone,
      },
    });
    links.push({
      id: `link-sightline-${cone.id}`,
      fromId: cone.id,
      toId: cone.mountId,
      kind: "sightline_to",
      materialName: material,
      thickness_m: RAY_THICKNESS_M,
    });
  }

  return {
    revision: model.revision,
    viewMode: model.viewMode,
    passthroughActive: model.passthroughActive,
    scaleTwinActive: model.scaleTwinActive,
    maquetteScale: 0.125,
    maquetteOffset_m: [...MAQUETTE_OFFSET_M],
    entities,
    links,
    namedShots: [
      "overview",
      "tabletop-maquette",
      "wheelchair-115",
      "standing-152",
      "passthrough-wall",
      ...model.mounts.map((m) => `focus:${m.id}`),
    ],
  };
}

export function validateSceneDescription(desc: SceneDescription): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const e of desc.entities) {
    if (ids.has(e.id)) errors.push(`duplicate entity id ${e.id}`);
    ids.add(e.id);
    if (e.size.some((s) => !(s > 0))) errors.push(`entity ${e.id} has non-positive size`);
    if (e.position.some((p) => !Number.isFinite(p))) {
      errors.push(`entity ${e.id} has non-finite position`);
    }
  }
  for (const l of desc.links) {
    if (!ids.has(l.fromId)) errors.push(`link ${l.id} missing fromId ${l.fromId}`);
    if (!ids.has(l.toId)) errors.push(`link ${l.id} missing toId ${l.toId}`);
  }
  return errors;
}
