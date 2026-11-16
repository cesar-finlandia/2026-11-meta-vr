/**
 * Quest 3 runtime emulation (iwer) with deterministic hand-gesture helpers routed
 * through the action registry as `xr-hand` calls.
 */
import type { SightlineSession } from "../domain/types";
import { quantizeWallDragCm } from "./hands-first";

export interface IwerRuntimeHandle {
  emulated: boolean;
  deviceName: string;
  simulatePinchSelect: (mountId: string) => Promise<void>;
  simulatePinchDragCm: (mountId: string, deltaXCm: number, deltaYCm: number) => Promise<void>;
  simulateTwoFingerDismiss: (mountId: string) => Promise<void>;
}

export async function initIwerQuest3Runtime(session: SightlineSession): Promise<IwerRuntimeHandle> {
  let emulated = false;
  let deviceName = "native";
  const nav = typeof navigator !== "undefined" ? (navigator as Navigator & { xr?: unknown }) : undefined;

  if (nav && !nav.xr) {
    try {
      const iwer = await import("iwer");
      const device = new iwer.XRDevice(iwer.metaQuest3);
      device.installRuntime();
      emulated = true;
      deviceName = "Meta Quest 3 (iwer)";
    } catch {
      emulated = false;
      deviceName = "unavailable";
    }
  }

  const call = async (name: string, args: Record<string, unknown>): Promise<void> => {
    await session.registry.call(name, args, { source: "xr-hand" });
  };

  return {
    emulated,
    deviceName,
    async simulatePinchSelect(mountId) {
      const mount = session.store.getState().mounts.find((m) => m.id === mountId);
      session.store.dispatch({ type: "SELECT_ENTITY", mountId, wallId: mount?.wallId });
    },
    async simulatePinchDragCm(mountId, deltaXCm, deltaYCm) {
      const mount = session.store.getState().mounts.find((m) => m.id === mountId);
      if (!mount) return;
      await call("adjust_frame_height", {
        mountIdOrTitle: mountId,
        centerX_cm: mount.centerX_cm + quantizeWallDragCm(deltaXCm),
        centerY_cm: mount.centerY_cm + quantizeWallDragCm(deltaYCm),
      });
    },
    async simulateTwoFingerDismiss(mountId) {
      const model = session.store.getState();
      const mount = model.mounts.find((m) => m.id === mountId);
      if (!mount) return;
      session.store.dispatch({ type: "SELECT_ENTITY", mountId, wallId: mount.wallId });
      const used = new Set(model.mounts.map((m) => m.artworkId));
      const replacement = model.catalog.find((c) => !used.has(c.id) && !model.rejectedArtworkIds.includes(c.id));
      if (!replacement) return;
      await call("swap_rejected_artwork", {
        mountIdOrTitle: mountId,
        replacementArtworkIdOrTitle: replacement.id,
      });
    },
  };
}
