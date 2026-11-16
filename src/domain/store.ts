/**
 * Single-source curatorial state container with immutable revisions,
 * bounded undo/redo stacks, and named timeline snapshots.
 */
import { createSeedExhibition } from "./seed";
import type {
  DispatchEffect,
  DispatchResult,
  DomainCommand,
  DomainStore,
  ExhibitionModel,
  StoreListener,
  TimelineSnapshot,
} from "./types";

const MAX_HISTORY_DEPTH = 40;

function cloneModel<T>(val: T): T {
  return structuredClone(val);
}

export function createDomainStore(initialModel?: ExhibitionModel): DomainStore {
  let state: ExhibitionModel = cloneModel(initialModel ?? createSeedExhibition("default"));
  const past: ExhibitionModel[] = [];
  const future: ExhibitionModel[] = [];
  const listeners = new Set<StoreListener>();

  function notify(effects: DispatchEffect[]): void {
    const frozen = cloneModel(state);
    for (const listener of listeners) {
      try {
        listener(frozen, effects);
      } catch (err) {
        console.error("Store listener error:", err);
      }
    }
  }

  function commitMutation(nextState: ExhibitionModel, effects: DispatchEffect[]): DispatchResult {
    past.push(cloneModel(state));
    if (past.length > MAX_HISTORY_DEPTH) {
      past.shift();
    }
    future.length = 0; // Clear redo on new action
    nextState.revision = state.revision + 1;
    state = nextState;
    notify(effects);
    return {
      ok: true,
      state_version: state.revision,
      effects,
      model: cloneModel(state),
    };
  }

  function dispatch(command: DomainCommand): DispatchResult {
    switch (command.type) {
      case "SET_WALL_PLANES": {
        if (!Array.isArray(command.walls) || command.walls.length === 0) {
          return {
            ok: false,
            reason: "Cannot set walls with an empty array.",
            state_version: state.revision,
          };
        }
        const next = cloneModel(state);
        next.walls = cloneModel(command.walls);
        next.passthroughActive = Boolean(command.passthroughActive);
        return commitMutation(next, [
          {
            kind: "walls_updated",
            entityIds: next.walls.map((w) => w.id),
            detail: `Updated ${next.walls.length} gallery wall planes.`,
          },
        ]);
      }

      case "SET_PASSTHROUGH_MODE": {
        const next = cloneModel(state);
        next.passthroughActive = Boolean(command.enabled);
        return commitMutation(next, [
          {
            kind: "view_changed",
            entityIds: [],
            detail: `Passthrough mode set to ${next.passthroughActive}.`,
          },
        ]);
      }

      case "SET_SCALE_TWIN_MODE": {
        const next = cloneModel(state);
        next.scaleTwinActive = Boolean(command.enabled);
        if (command.viewMode) {
          next.viewMode = command.viewMode;
        }
        return commitMutation(next, [
          {
            kind: "view_changed",
            entityIds: [],
            detail: `Scale twin mode set to ${next.scaleTwinActive}.`,
          },
        ]);
      }

      case "SET_VIEW_MODE": {
        const next = cloneModel(state);
        next.viewMode = command.viewMode;
        return commitMutation(next, [
          {
            kind: "view_changed",
            entityIds: [],
            detail: `View mode updated to ${next.viewMode}.`,
          },
        ]);
      }

      case "LOAD_CATALOG": {
        if (!Array.isArray(command.items)) {
          return {
            ok: false,
            reason: "Catalog items must be an array.",
            state_version: state.revision,
          };
        }
        const next = cloneModel(state);
        if (command.merge) {
          const map = new Map(next.catalog.map((c) => [c.id, c]));
          for (const item of command.items) {
            map.set(item.id, cloneModel(item));
          }
          next.catalog = Array.from(map.values());
        } else {
          next.catalog = cloneModel(command.items);
        }
        return commitMutation(next, [
          {
            kind: "catalog_loaded",
            entityIds: command.items.map((i) => i.id),
            detail: `Loaded ${command.items.length} catalog items.`,
          },
        ]);
      }

      case "SET_CURATORIAL_THEME": {
        const next = cloneModel(state);
        // Validates all selected IDs exist in catalog
        const catalogIds = new Set(next.catalog.map((c) => c.id));
        for (const id of command.selectedArtworkIds) {
          if (!catalogIds.has(id)) {
            return {
              ok: false,
              reason: `Artwork id '${id}' not found in catalog.`,
              state_version: state.revision,
            };
          }
        }
        return commitMutation(next, [
          {
            kind: "theme_filtered",
            entityIds: command.selectedArtworkIds,
            detail: `Applied curatorial theme '${command.theme}': ${command.brief}`,
          },
        ]);
      }

      case "REPLACE_WALL_MOUNTS": {
        const wall = state.walls.find((w) => w.id === command.wallId);
        if (!wall) {
          return {
            ok: false,
            reason: `Gallery wall '${command.wallId}' does not exist.`,
            state_version: state.revision,
          };
        }
        const catalogIds = new Set(state.catalog.map((c) => c.id));
        for (const m of command.mounts) {
          if (!catalogIds.has(m.artworkId)) {
            return {
              ok: false,
              reason: `Artwork '${m.artworkId}' on mount '${m.id}' not found in catalog.`,
              state_version: state.revision,
            };
          }
        }
        const next = cloneModel(state);
        next.mounts = next.mounts
          .filter((m) => m.wallId !== command.wallId)
          .concat(cloneModel(command.mounts));
        return commitMutation(next, [
          {
            kind: "mount_changed",
            entityIds: command.mounts.map((m) => m.id),
            detail: `Replaced ${command.mounts.length} mounts on wall '${command.wallId}'.`,
          },
        ]);
      }

      case "UPSERT_MOUNT": {
        const wall = state.walls.find((w) => w.id === command.mount.wallId);
        if (!wall) {
          return {
            ok: false,
            reason: `Target wall '${command.mount.wallId}' not found.`,
            state_version: state.revision,
          };
        }
        const art = state.catalog.find((c) => c.id === command.mount.artworkId);
        if (!art) {
          return {
            ok: false,
            reason: `Artwork '${command.mount.artworkId}' not found in catalog.`,
            state_version: state.revision,
          };
        }
        const next = cloneModel(state);
        const idx = next.mounts.findIndex((m) => m.id === command.mount.id);
        if (idx >= 0) {
          next.mounts[idx] = cloneModel(command.mount);
        } else {
          next.mounts.push(cloneModel(command.mount));
        }
        return commitMutation(next, [
          {
            kind: "mount_changed",
            entityIds: [command.mount.id],
            detail: `Upserted mount '${command.mount.id}' for '${art.title}'.`,
          },
        ]);
      }

      case "ADJUST_MOUNT_POSITION": {
        const idx = state.mounts.findIndex((m) => m.id === command.mountId);
        if (idx < 0) {
          return {
            ok: false,
            reason: `Mount '${command.mountId}' not found in current exhibition.`,
            state_version: state.revision,
          };
        }
        const next = cloneModel(state);
        const target = next.mounts[idx];
        const oldCenterX = target.centerX_cm;
        const oldCenterY = target.centerY_cm;

        if (typeof command.centerX_cm === "number") {
          target.centerX_cm = Math.round(command.centerX_cm * 10) / 10;
        }
        if (typeof command.centerY_cm === "number") {
          target.centerY_cm = Math.round(command.centerY_cm * 10) / 10;
        }

        // Shift placard relatively if mount moved
        if (target.placard) {
          const deltaX = target.centerX_cm - oldCenterX;
          const deltaY = target.centerY_cm - oldCenterY;
          target.placard.centerX_cm = Math.round((target.placard.centerX_cm + deltaX) * 10) / 10;
          target.placard.centerY_cm = Math.round((target.placard.centerY_cm + deltaY) * 10) / 10;
        }

        return commitMutation(next, [
          {
            kind: "mount_changed",
            entityIds: [target.id],
            detail: `Adjusted position of mount '${target.id}' to (${target.centerX_cm}, ${target.centerY_cm}) cm.`,
          },
        ]);
      }

      case "SET_MOUNT_LUX": {
        if (command.spotLux < 0) {
          return {
            ok: false,
            reason: `Spotlight lux cannot be negative (received ${command.spotLux} lux).`,
            state_version: state.revision,
          };
        }
        const idx = state.mounts.findIndex((m) => m.id === command.mountId);
        if (idx < 0) {
          return {
            ok: false,
            reason: `Mount '${command.mountId}' not found.`,
            state_version: state.revision,
          };
        }
        const next = cloneModel(state);
        next.mounts[idx].spotLux = Math.round(command.spotLux);
        return commitMutation(next, [
          {
            kind: "lux_changed",
            entityIds: [command.mountId],
            detail: `Set illumination for mount '${command.mountId}' to ${next.mounts[idx].spotLux} lux.`,
          },
        ]);
      }

      case "UPDATE_PLACARD": {
        const idx = state.mounts.findIndex((m) => m.id === command.mountId);
        if (idx < 0) {
          return {
            ok: false,
            reason: `Mount '${command.mountId}' not found.`,
            state_version: state.revision,
          };
        }
        const next = cloneModel(state);
        const mount = next.mounts[idx];
        if (!mount.placard) {
          return {
            ok: false,
            reason: `Mount '${command.mountId}' does not have an attached placard.`,
            state_version: state.revision,
          };
        }
        if (typeof command.curatorialNote === "string" && command.curatorialNote.trim().length > 0) {
          mount.placard.curatorialNote = command.curatorialNote;
          mount.placard.wordCount = command.curatorialNote.trim().split(/\s+/).filter(Boolean).length;
        }
        if (typeof command.fontHeight_mm === "number") {
          mount.placard.fontHeight_mm = command.fontHeight_mm;
        }
        if (typeof command.centerY_cm === "number") {
          mount.placard.centerY_cm = command.centerY_cm;
        }
        return commitMutation(next, [
          {
            kind: "placard_updated",
            entityIds: [mount.id, mount.placard.id],
            detail: `Updated placard for mount '${mount.id}'.`,
          },
        ]);
      }

      case "SWAP_MOUNT_ARTWORK": {
        const mountIdx = state.mounts.findIndex((m) => m.id === command.mountId);
        if (mountIdx < 0) {
          return {
            ok: false,
            reason: `Mount '${command.mountId}' not found.`,
            state_version: state.revision,
          };
        }
        const newArt = state.catalog.find((c) => c.id === command.replacementArtworkId);
        if (!newArt) {
          return {
            ok: false,
            reason: `Replacement artwork '${command.replacementArtworkId}' not found in catalog.`,
            state_version: state.revision,
          };
        }
        const next = cloneModel(state);
        const mount = next.mounts[mountIdx];
        mount.artworkId = newArt.id;
        if (typeof command.newSpotLux === "number") {
          mount.spotLux = command.newSpotLux;
        } else {
          mount.spotLux = newArt.luxCap === 50 ? 45 : 165;
        }
        return commitMutation(next, [
          {
            kind: "mount_changed",
            entityIds: [mount.id, newArt.id],
            detail: `Swapped artwork on mount '${mount.id}' to '${newArt.title}'.`,
          },
        ]);
      }

      case "REMOVE_MOUNT": {
        const idx = state.mounts.findIndex((m) => m.id === command.mountId);
        if (idx < 0) {
          return {
            ok: false,
            reason: `Mount '${command.mountId}' does not exist.`,
            state_version: state.revision,
          };
        }
        const next = cloneModel(state);
        next.mounts.splice(idx, 1);
        if (next.selectedMountId === command.mountId) {
          next.selectedMountId = null;
        }
        return commitMutation(next, [
          {
            kind: "mount_changed",
            entityIds: [command.mountId],
            detail: `Removed mount '${command.mountId}'.`,
          },
        ]);
      }

      case "SELECT_ENTITY": {
        // Selection does not pollute undo history
        const next = cloneModel(state);
        next.selectedMountId = command.mountId ?? null;
        if (typeof command.wallId === "string") {
          next.selectedWallId = command.wallId;
        }
        next.revision = state.revision + 1;
        state = next;
        const effects: DispatchEffect[] = [
          {
            kind: "selection_changed",
            entityIds: command.mountId ? [command.mountId] : [],
            detail: `Selected mount '${command.mountId ?? "none"}'.`,
          },
        ];
        notify(effects);
        return {
          ok: true,
          state_version: state.revision,
          effects,
          model: cloneModel(state),
        };
      }

      case "PIN_ANCHOR": {
        const next = cloneModel(state);
        const idx = next.anchors.findIndex((a) => a.id === command.anchor.id);
        if (idx >= 0) {
          next.anchors[idx] = cloneModel(command.anchor);
        } else {
          next.anchors.push(cloneModel(command.anchor));
        }
        return commitMutation(next, [
          {
            kind: "anchor_pinned",
            entityIds: [command.anchor.id],
            detail: `Pinned spatial anchor '${command.anchor.id}'.`,
          },
        ]);
      }

      case "SAVE_SNAPSHOT": {
        const snapId = command.id ?? `snap-${Date.now()}`;
        const next = cloneModel(state);
        const snapshot: TimelineSnapshot = {
          id: snapId,
          label: command.label,
          revision: next.revision,
          createdAtIso: new Date().toISOString(),
          mounts: cloneModel(next.mounts),
          anchors: cloneModel(next.anchors),
          activeTheme: next.activeTheme,
          curatorialBrief: next.curatorialBrief,
          issueCount: command.issueCount,
        };
        next.snapshots.push(snapshot);
        return commitMutation(next, [
          {
            kind: "snapshot_saved",
            entityIds: [snapId],
            detail: `Saved curatorial snapshot '${command.label}'.`,
          },
        ]);
      }

      case "RESTORE_SNAPSHOT": {
        const snap = state.snapshots.find((s) => s.id === command.snapshotId);
        if (!snap) {
          return {
            ok: false,
            reason: `Snapshot '${command.snapshotId}' not found.`,
            state_version: state.revision,
          };
        }
        const next = cloneModel(state);
        next.mounts = cloneModel(snap.mounts);
        return commitMutation(next, [
          {
            kind: "snapshot_restored",
            entityIds: [snap.id],
            detail: `Restored snapshot '${snap.label}' (${snap.mounts.length} mounts).`,
          },
        ]);
      }

      case "RESET_EXHIBITION": {
        const next = cloneModel(command.model);
        return commitMutation(next, [
          {
            kind: "walls_updated",
            entityIds: next.walls.map((w) => w.id),
            detail: "Reset exhibition state to clean baseline.",
          },
        ]);
      }

      default: {
        const exhaustiveCheck: never = command;
        return {
          ok: false,
          reason: `Unknown command type: ${(exhaustiveCheck as { type: string }).type}`,
          state_version: state.revision,
        };
      }
    }
  }

  function undo(): DispatchResult {
    if (past.length === 0) {
      return {
        ok: false,
        reason: "No actions available to undo.",
        state_version: state.revision,
      };
    }
    const previous = past.pop()!;
    future.push(cloneModel(state));
    previous.revision = state.revision + 1;
    state = previous;

    const effects: DispatchEffect[] = [
      {
        kind: "mount_changed",
        entityIds: [],
        detail: `Reverted to revision ${state.revision}.`,
      },
    ];
    notify(effects);

    return {
      ok: true,
      state_version: state.revision,
      effects,
      model: cloneModel(state),
    };
  }

  function redo(): DispatchResult {
    if (future.length === 0) {
      return {
        ok: false,
        reason: "No actions available to redo.",
        state_version: state.revision,
      };
    }
    const next = future.pop()!;
    past.push(cloneModel(state));
    next.revision = state.revision + 1;
    state = next;

    const effects: DispatchEffect[] = [
      {
        kind: "mount_changed",
        entityIds: [],
        detail: `Reapplied revision ${state.revision}.`,
      },
    ];
    notify(effects);

    return {
      ok: true,
      state_version: state.revision,
      effects,
      model: cloneModel(state),
    };
  }

  return {
    getState(): ExhibitionModel {
      return cloneModel(state);
    },
    dispatch,
    undo,
    redo,
    canUndo(): boolean {
      return past.length > 0;
    },
    canRedo(): boolean {
      return future.length > 0;
    },
    subscribe(listener: StoreListener): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
