/**
 * Pooled PBR materials. Colours come exclusively from the `--scene-*` CSS custom properties,
 * and the 11 material instances are mutated in place so shader programs are never re-linked.
 */
import * as THREE from "three";
import type { SceneMaterialName } from "./scene-types";

export interface ScenePaletteHexes {
  bg: string;
  ground: string;
  accent: string;
  text: string;
  materials: Record<SceneMaterialName, string>;
}

export interface LabLightingParams {
  keyIntensity: number;
  keyAzimuthDeg: number;
  keyElevationDeg: number;
  envIntensity: number;
  wallRoughness: number;
  frameRoughness: number;
  frameMetalness: number;
}

export const DEFAULT_LAB_PARAMS: LabLightingParams = {
  keyIntensity: 2.6,
  keyAzimuthDeg: 25,
  keyElevationDeg: 42,
  envIntensity: 0.38,
  wallRoughness: 0.92,
  frameRoughness: 0.45,
  frameMetalness: 0.18,
};

export const MATERIAL_NAMES: SceneMaterialName[] = [
  "wall",
  "frame-walnut",
  "frame-gilt",
  "frame-ebony",
  "matboard",
  "cone-pass",
  "cone-warn",
  "cone-fail",
  "plaque",
  "maquette-base",
  "accent",
];

const CSS_VAR_FOR: Record<SceneMaterialName, string> = {
  wall: "--scene-mat-wall",
  "frame-walnut": "--scene-mat-frame-walnut",
  "frame-gilt": "--scene-mat-frame-gilt",
  "frame-ebony": "--scene-mat-frame-ebony",
  matboard: "--scene-mat-matboard",
  "cone-pass": "--scene-mat-cone-pass",
  "cone-warn": "--scene-mat-cone-warn",
  "cone-fail": "--scene-mat-cone-fail",
  plaque: "--scene-mat-plaque",
  "maquette-base": "--scene-mat-maquette-base",
  accent: "--scene-accent",
};

// Used only when the stylesheet is not loaded (unit tests, detached documents).
const FALLBACK_PALETTE: ScenePaletteHexes = {
  bg: "#EFECE6",
  ground: "#E2DDD3",
  accent: "#1B4D8E",
  text: "#16191F",
  materials: {
    wall: "#FAF9F5",
    "frame-walnut": "#5A4231",
    "frame-gilt": "#9E7B3B",
    "frame-ebony": "#26282E",
    matboard: "#F7F5EE",
    "cone-pass": "#0E6B50",
    "cone-warn": "#8F5106",
    "cone-fail": "#A61E1C",
    plaque: "#FFFFFF",
    "maquette-base": "#DFDBD0",
    accent: "#1B4D8E",
  },
};

export function readScenePaletteFromCss(rootEl?: HTMLElement): ScenePaletteHexes {
  if (typeof document === "undefined") return FALLBACK_PALETTE;
  const el = rootEl ?? document.documentElement;
  const cs = getComputedStyle(el);
  const read = (name: string, fallback: string): string => {
    const v = cs.getPropertyValue(name).trim();
    return v || fallback;
  };
  const materials = {} as Record<SceneMaterialName, string>;
  for (const name of MATERIAL_NAMES) {
    materials[name] = read(CSS_VAR_FOR[name], FALLBACK_PALETTE.materials[name]);
  }
  return {
    bg: read("--scene-bg", FALLBACK_PALETTE.bg),
    ground: read("--scene-ground", FALLBACK_PALETTE.ground),
    accent: read("--scene-accent", FALLBACK_PALETTE.accent),
    text: read("--scene-text", FALLBACK_PALETTE.text),
    materials,
  };
}

function roughnessFor(name: SceneMaterialName, p: LabLightingParams): number {
  if (name === "wall" || name === "maquette-base") return p.wallRoughness;
  if (name.startsWith("frame-")) return p.frameRoughness;
  if (name.startsWith("cone-") || name === "accent") return 0.35;
  return 0.7;
}

function metalnessFor(name: SceneMaterialName, p: LabLightingParams): number {
  if (name === "frame-gilt") return Math.min(1, p.frameMetalness + 0.67);
  if (name.startsWith("frame-")) return p.frameMetalness;
  return 0;
}

/** Mutates the pooled materials in place (colour, roughness, metalness): never allocates. */
export function applyPaletteToMaterials(
  mats: Record<SceneMaterialName, THREE.MeshStandardMaterial>,
  palette: ScenePaletteHexes,
  params: LabLightingParams = DEFAULT_LAB_PARAMS
): void {
  for (const name of MATERIAL_NAMES) {
    const m = mats[name];
    m.color.set(palette.materials[name]);
    m.roughness = roughnessFor(name, params);
    m.metalness = metalnessFor(name, params);
    if (name.startsWith("cone-") || name === "accent") {
      m.emissive.set(palette.materials[name]);
      m.emissiveIntensity = 0.35;
    }
    if (name.startsWith("cone-")) {
      m.transparent = true;
      m.opacity = 0.3;
      m.depthWrite = false;
      m.side = THREE.DoubleSide;
    }
  }
}

export function createPooledSceneMaterials(
  palette: ScenePaletteHexes,
  params: LabLightingParams = DEFAULT_LAB_PARAMS
): Record<SceneMaterialName, THREE.MeshStandardMaterial> {
  const mats = {} as Record<SceneMaterialName, THREE.MeshStandardMaterial>;
  for (const name of MATERIAL_NAMES) {
    mats[name] = new THREE.MeshStandardMaterial({ name });
  }
  applyPaletteToMaterials(mats, palette, params);
  return mats;
}
