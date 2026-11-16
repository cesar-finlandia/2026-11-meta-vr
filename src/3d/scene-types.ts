/**
 * Pure scene-description contracts shared by the 3D canvas, the 2D fallback and the XR bridge.
 */
import type { ExhibitionModel } from "../domain/types";

export type SceneEntityKind =
  | "gallery_wall"
  | "framed_artwork"
  | "placard_label"
  | "sightline_ray"
  | "maquette_base"
  | "fov_hud";

export type SceneMaterialName =
  | "wall"
  | "frame-walnut"
  | "frame-gilt"
  | "frame-ebony"
  | "matboard"
  | "cone-pass"
  | "cone-warn"
  | "cone-fail"
  | "plaque"
  | "maquette-base"
  | "accent";

export interface SceneEntityNode {
  id: string;
  kind: SceneEntityKind;
  position: [number, number, number];
  rotationEuler: [number, number, number];
  size: [number, number, number];
  materialName: SceneMaterialName;
  label: string;
  subLabel?: string;
  selected: boolean;
  status: "pass" | "warning" | "fail" | "neutral";
  metadata: Record<string, string | number | boolean | null>;
}

export interface SceneEntityLink {
  id: string;
  fromId: string;
  toId: string;
  kind: "mounted_on" | "placard_for" | "sightline_to";
  materialName: SceneMaterialName;
  thickness_m: number;
}

export interface SceneDescription {
  revision: number;
  viewMode: ExhibitionModel["viewMode"];
  passthroughActive: boolean;
  scaleTwinActive: boolean;
  maquetteScale: 0.125;
  maquetteOffset_m: [number, number, number];
  entities: SceneEntityNode[];
  links: SceneEntityLink[];
  namedShots: string[];
}
