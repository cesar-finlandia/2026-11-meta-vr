/**
 * Hidden /lab route: live look-development controls (lil-gui), curatorial nudge buttons,
 * one-click IIIF import and a UIKitML placard preview over the shared gallery canvas.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from "react";
import GUI from "lil-gui";
import type { ExhibitionModel, SightlineCone, TruthIssue } from "../domain/types";
import type { LabRouteMountProps } from "../ui/stage-registry";
import { GalleryCanvas } from "./SightlineSpatialCanvas";
import { DEFAULT_LAB_PARAMS, type LabLightingParams } from "./materials";
import { createIwsdkGalleryBridge } from "../xr/iwsdk-bridge";

export const SAMPLE_IIIF_MANIFEST = JSON.stringify({
  "@context": "http://iiif.io/api/presentation/3/context.json",
  id: "https://iiif.example.org/manifest/study-sheets",
  type: "Manifest",
  label: { en: ["Study Sheets"] },
  metadata: [
    { label: { en: ["Artist"] }, value: { en: ["Anonymous Studio"] } },
    { label: { en: ["Medium"] }, value: { en: ["Graphite on paper"] } },
    { label: { en: ["Date"] }, value: { en: ["1812"] } },
    { label: { en: ["Dimensions"] }, value: { en: ["42 x 30 cm"] } },
  ],
  items: [
    { id: "https://iiif.example.org/canvas/1", type: "Canvas", label: { en: ["Study of Hands"] }, width: 4200, height: 3000 },
    { id: "https://iiif.example.org/canvas/2", type: "Canvas", label: { en: ["Study of a Window"] }, width: 3000, height: 4200 },
  ],
});

export function LabTuningRoute({ session, theme }: LabRouteMountProps): JSX.Element {
  const [params, setParams] = useState<LabLightingParams>({ ...DEFAULT_LAB_PARAMS });
  const guiHost = useRef<HTMLDivElement>(null);
  const [model, setModel] = useState<ExhibitionModel>(() => session.store.getState());
  const [issues, setIssues] = useState<TruthIssue[]>(() => session.truthEngine.checkExhibition(session.store.getState()));
  const [cones, setCones] = useState<SightlineCone[]>(() => session.truthEngine.computeSightlineFrustums(session.store.getState()));
  const [status, setStatus] = useState<string>("");
  const bridge = useMemo(() => createIwsdkGalleryBridge(), []);

  useEffect(() => () => bridge.dispose(), [bridge]);

  useEffect(
    () =>
      session.store.subscribe((m) => {
        setModel(m);
        setIssues(session.truthEngine.checkExhibition(m));
        setCones(session.truthEngine.computeSightlineFrustums(m));
      }),
    [session]
  );

  useEffect(() => {
    if (!guiHost.current) return;
    const state = { ...DEFAULT_LAB_PARAMS };
    const gui = new GUI({ container: guiHost.current, title: "Look development", width: 280 });
    const push = (): void => setParams({ ...state });
    gui.add(state, "keyIntensity", 0, 4, 0.05).onChange(push);
    gui.add(state, "keyAzimuthDeg", -90, 90, 1).onChange(push);
    gui.add(state, "keyElevationDeg", 15, 85, 1).onChange(push);
    gui.add(state, "envIntensity", 0, 2, 0.05).onChange(push);
    gui.add(state, "wallRoughness", 0, 1, 0.01).onChange(push);
    gui.add(state, "frameRoughness", 0, 1, 0.01).onChange(push);
    gui.add(state, "frameMetalness", 0, 1, 0.01).onChange(push);
    return () => gui.destroy();
  }, []);

  const target = model.mounts.find((m) => m.id === model.selectedMountId) ?? model.mounts[0];

  const nudge = useCallback(
    async (deltaCm: number) => {
      if (!target) return;
      const res = await session.registry.call(
        "adjust_frame_height",
        { mountIdOrTitle: target.id, centerX_cm: target.centerX_cm + deltaCm },
        { source: "ui", bypassGate: true }
      );
      if (res.ok) {
        const reflow = await session.registry.call(
          "reflow_wall_spacing",
          { wallIdOrName: target.wallId },
          { source: "ui", bypassGate: true }
        );
        setStatus(reflow.ok ? `Nudged ${deltaCm > 0 ? "+" : ""}${deltaCm} cm and reflowed ${target.wallId}.` : reflow.summary);
      } else {
        setStatus(res.summary);
      }
    },
    [session, target]
  );

  const importIiif = useCallback(async () => {
    const res = await session.registry.call(
      "load_iiif_collection",
      { manifestJson: SAMPLE_IIIF_MANIFEST },
      { source: "ui", bypassGate: true }
    );
    setStatus(res.summary);
  }, [session]);

  const errors = issues.filter((i) => i.severity === "error").length;
  const warnings = issues.filter((i) => i.severity === "warning").length;
  const minLegibility = cones.length ? Math.min(...cones.map((c) => c.placardAngularHeight_deg)) : 0;
  const placard = target
    ? (() => {
        const art = model.catalog.find((c) => c.id === target.artworkId);
        try {
          return bridge.uikitPlacardMarkup(art?.title ?? target.placard.titleText, target.placard.artistLine, target.placard.curatorialNote);
        } catch {
          return "";
        }
      })()
    : "";

  return (
    <section data-demo-focus="lab-inspector" aria-label="Spatial lab" style={{ display: "grid", gap: "var(--space-4)", gridTemplateColumns: "minmax(0, 1fr)" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-4)", alignItems: "flex-start" }}>
        <div style={{ flex: "1 1 520px", minWidth: 0 }}>
          <GalleryCanvas session={session} issues={issues} cones={cones} theme={theme} labParams={params} />
        </div>
        <div style={{ flex: "0 0 280px", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          <div ref={guiHost} data-testid="lab-gui" />
          <div className="surface" style={{ padding: "var(--space-3)", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            <span className="eyebrow">Curatorial co-authoring</span>
            <div style={{ display: "flex", gap: "var(--space-2)" }}>
              <button type="button" className="btn btn--sm" data-testid="lab-nudge-left" onClick={() => void nudge(-5)}>
                Nudge -5 cm
              </button>
              <button type="button" className="btn btn--sm" data-testid="lab-nudge-right" onClick={() => void nudge(5)}>
                Nudge +5 cm
              </button>
            </div>
            <button type="button" className="btn btn--sm" data-testid="lab-iiif-import" onClick={() => void importIiif()}>
              Import sample IIIF manifest
            </button>
            <span data-testid="lab-compliance-badge" role="status">
              {errors === 0 ? "Compliant" : `${errors} open ${errors === 1 ? "error" : "errors"}`}
              {warnings > 0 ? `, ${warnings} ${warnings === 1 ? "warning" : "warnings"}` : ""}
            </span>
            <span data-testid="lab-status" role="status" style={{ fontSize: 12 }}>
              {status}
            </span>
          </div>
          <div className="surface" style={{ padding: "var(--space-3)", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            <span className="eyebrow">Placard preview (UIKitML)</span>
            <span data-testid="lab-legibility-badge">
              {minLegibility >= 1.2 ? "Legible" : "Too small"}: {minLegibility.toFixed(2)}° minimum (1.2° floor)
            </span>
            <pre style={{ margin: 0, fontSize: 11, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }} data-testid="lab-placard-markup">
              {placard}
            </pre>
          </div>
        </div>
      </div>
    </section>
  );
}
