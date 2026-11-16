/**
 * Meta Immersive Web SDK + UIKitML bridge: spatial placard markup, FoV-clamped HUD,
 * ECS entity mirroring and spatial-anchor persistence.
 */
import { parse } from "@drawcall/uikitml";
import type { SpatialAnchorRecord } from "../domain/types";
import type { SceneDescription } from "../3d/scene-types";
import { clampHudAngles } from "../3d/adapter";

export const ANCHOR_STORAGE_KEY = "sightline-spatial-anchors";
export const IWSDK_VERSION = "1.1.0";

export interface IwsdkBridgeHandle {
  sdkVersion: string;
  worldReady: boolean;
  uikitPlacardMarkup: (title: string, artistLine: string, note: string) => string;
  syncSceneEntities: (desc: SceneDescription) => { ecsEntityCount: number; fovClamped: boolean };
  persistAnchorSnapshot: (anchors: SpatialAnchorRecord[]) => void;
  loadPersistedAnchors: () => SpatialAnchorRecord[];
  dispose: () => void;
}

const esc = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export function createIwsdkGalleryBridge(): IwsdkBridgeHandle {
  let ready = false;
  let disposed = false;
  const ecs = new Map<string, string>();

  // The SDK loads lazily so desktop and test runs never pay for it up front.
  void import("@iwsdk/core")
    .then((sdk) => {
      if (!disposed) ready = typeof (sdk as { World?: unknown }).World === "function";
    })
    .catch(() => {
      ready = false;
    });

  return {
    sdkVersion: IWSDK_VERSION,
    get worldReady() {
      return ready;
    },
    uikitPlacardMarkup(title, artistLine, note) {
      const markup =
        `<div style="flex-direction: column; padding: 12px; background-color: #FFFFFF; border-radius: 6px; gap: 4px">` +
        `<span style="font-size: 20px; font-weight: bold; color: #16191F">${esc(title)}</span>` +
        `<span style="font-size: 14px; color: #3B4250">${esc(artistLine)}</span>` +
        `<span style="font-size: 12px; color: #3B4250">${esc(note)}</span>` +
        `</div>`;
      const res = parse(markup) as { success?: boolean };
      if (!res.success) throw new Error("placard markup failed to parse");
      return markup;
    },
    syncSceneEntities(desc) {
      ecs.clear();
      for (const e of desc.entities) ecs.set(e.id, e.kind);
      const hud = desc.entities.find((e) => e.kind === "fov_hud");
      const yaw = Number(hud?.metadata.yaw_deg ?? 0);
      const pitch = Number(hud?.metadata.pitch_deg ?? 0);
      return {
        ecsEntityCount: ecs.size,
        fovClamped: clampHudAngles(yaw, pitch).clamped || Boolean(hud?.metadata.fov_clamped),
      };
    },
    persistAnchorSnapshot(anchors) {
      try {
        localStorage.setItem(ANCHOR_STORAGE_KEY, JSON.stringify(anchors));
      } catch {
        /* storage unavailable */
      }
    },
    loadPersistedAnchors() {
      try {
        const raw = localStorage.getItem(ANCHOR_STORAGE_KEY);
        const parsed: unknown = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? (parsed as SpatialAnchorRecord[]) : [];
      } catch {
        return [];
      }
    },
    dispose() {
      disposed = true;
      ecs.clear();
    },
  };
}
