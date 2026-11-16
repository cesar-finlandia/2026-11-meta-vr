/**
 * Metric 2D wall elevation drawn from the same SceneDescription the WebGL stage uses.
 * Shown automatically when WebGL is unavailable or `?fallback2d=1` is present.
 */
import type { JSX } from "react";
import type { SceneDescription } from "./scene-types";

export interface WebGlFallbackSvgProps {
  desc: SceneDescription;
  onSelectMount: (mountId: string) => void;
  reason?: string;
}

const PX_PER_CM = 0.9;
const GAP = 56;
const PAD = 28;

const STATUS_VAR: Record<string, string> = {
  pass: "var(--scene-mat-cone-pass)",
  warning: "var(--scene-mat-cone-warn)",
  fail: "var(--scene-mat-cone-fail)",
  neutral: "var(--scene-text)",
};

export function WebGlFallbackSvg({ desc, onSelectMount, reason }: WebGlFallbackSvgProps): JSX.Element {
  const walls = desc.entities.filter((e) => e.kind === "gallery_wall");
  const frames = desc.entities.filter((e) => e.kind === "framed_artwork");
  const rays = desc.entities.filter((e) => e.kind === "sightline_ray");
  const maxW = Math.max(100, ...walls.map((w) => w.size[0] * 100));
  const rowH = (w: { size: [number, number, number] }) => w.size[1] * 100 * PX_PER_CM;
  let cursorY = PAD;
  const rows = walls.map((w) => {
    const y = cursorY;
    cursorY += rowH(w) + GAP;
    return { wall: w, y };
  });
  const width = maxW * PX_PER_CM + PAD * 2;
  const height = Math.max(cursorY, 120);

  return (
    <div data-demo-3d="sightline-gallery" data-fallback2d="true" style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      <div role="status" className="surface" style={{ padding: "var(--space-3)" }} data-testid="webgl-fallback-callout">
        <strong>WebGL is unavailable, so the 2D metric elevation is active.</strong>{" "}
        {reason ?? "Every frame, placard and sightline below is measured from the same exhibition model."}
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Metric wall elevation of the exhibition"
        style={{ width: "100%", height: "auto", background: "var(--scene-bg)", borderRadius: 8 }}
      >
        {rows.map(({ wall, y }) => {
          const wCm = wall.size[0] * 100;
          const hCm = wall.size[1] * 100;
          const x0 = PAD + ((maxW - wCm) / 2) * PX_PER_CM;
          return (
            <g key={wall.id}>
              <rect x={x0} y={y} width={wCm * PX_PER_CM} height={hCm * PX_PER_CM} fill="var(--scene-mat-wall)" stroke="var(--scene-text)" strokeWidth={1} />
              <text x={x0} y={y - 8} fontSize={12} fill="var(--scene-text)">{wall.label}</text>
              {frames
                .filter((f) => f.metadata.wallId === wall.id)
                .map((f) => {
                  const cx = Number(f.metadata.centerX_cm);
                  const cy = Number(f.metadata.centerY_cm);
                  const fw = f.size[0] * 100 * PX_PER_CM;
                  const fh = f.size[1] * 100 * PX_PER_CM;
                  const px = x0 + cx * PX_PER_CM - fw / 2;
                  const py = y + (hCm - cy) * PX_PER_CM - fh / 2;
                  const sel = f.selected;
                  return (
                    <g
                      key={f.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`${f.label}, status ${f.status}`}
                      data-testid={`fallback-frame-${f.id}`}
                      style={{ cursor: "pointer" }}
                      onClick={() => onSelectMount(f.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") onSelectMount(f.id);
                      }}
                    >
                      <rect x={px} y={py} width={fw} height={fh} fill="var(--scene-mat-matboard)" stroke={STATUS_VAR[f.status]} strokeWidth={sel ? 4 : 2} />
                      <text x={px + 4} y={py + fh + 12} fontSize={10} fill="var(--scene-text)">{f.label.slice(0, 22)}</text>
                    </g>
                  );
                })}
              {/* 115 cm and 152 cm eye-height datums */}
              {[115, 152].map((eye) => (
                <g key={eye}>
                  <line x1={x0} x2={x0 + wCm * PX_PER_CM} y1={y + (hCm - eye) * PX_PER_CM} y2={y + (hCm - eye) * PX_PER_CM} stroke="var(--scene-accent)" strokeDasharray="4 4" strokeWidth={1} />
                  <text x={x0 + wCm * PX_PER_CM - 4} y={y + (hCm - eye) * PX_PER_CM - 3} fontSize={10} textAnchor="end" fill="var(--scene-accent)">{eye} cm eye</text>
                </g>
              ))}
            </g>
          );
        })}
      </svg>
      <p style={{ margin: 0, fontSize: 13 }} data-testid="webgl-fallback-summary">
        {frames.length} framed works, {rays.length} sightlines, {rays.filter((r) => r.status === "fail").length} failing.
      </p>
    </div>
  );
}
