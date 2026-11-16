/**
 * Zero-conflict extension registry allowing the 3D spatial gallery, /lab tuning view,
 * and /watch trace replay route to mount without modifying core UI shell files.
 */
import type { ComponentType } from "react";
import type { SightlineSession, SightlineCone, TruthIssue } from "../domain/types";
import type { SightlineTheme } from "./theme";

export interface SpatialStageMountProps {
  session: SightlineSession;
  issues: TruthIssue[];
  cones: SightlineCone[];
  theme: SightlineTheme;
  quality?: "high" | "low";
  forceFallback2d?: boolean;
}

export interface LabRouteMountProps {
  session: SightlineSession;
  theme: SightlineTheme;
}

export interface WatchRouteMountProps {
  theme: SightlineTheme;
}

let spatialStageComponent: ComponentType<SpatialStageMountProps> | null = null;
let labRouteComponent: ComponentType<LabRouteMountProps> | null = null;
let watchRouteComponent: ComponentType<WatchRouteMountProps> | null = null;

const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch (err) {
      console.error("StageRegistry listener error:", err);
    }
  }
}

export function registerSpatialStage(component: ComponentType<SpatialStageMountProps>): void {
  spatialStageComponent = component;
  notify();
}

export function getSpatialStage(): ComponentType<SpatialStageMountProps> | null {
  return spatialStageComponent;
}

export function registerLabRoute(component: ComponentType<LabRouteMountProps>): void {
  labRouteComponent = component;
  notify();
}

export function getLabRoute(): ComponentType<LabRouteMountProps> | null {
  return labRouteComponent;
}

export function registerWatchRoute(component: ComponentType<WatchRouteMountProps>): void {
  watchRouteComponent = component;
  notify();
}

export function getWatchRoute(): ComponentType<WatchRouteMountProps> | null {
  return watchRouteComponent;
}

export function subscribeStageRegistry(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
