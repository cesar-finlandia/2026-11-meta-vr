/**
 * Museum-grade standalone 2D architectural wall elevation preview.
 * Renders inside [data-result-region="spatial-stage"] when WebGL 3D stage is not yet mounted,
 * displaying true centimeter proportions, palette swatches, 115/152 cm sightline vectors,
 * and interactive artwork selection.
 */
import { useState, useEffect, type JSX } from "react";
import type { ExhibitionModel, MountedArtwork, SightlineCone, ViewMode } from "../../domain/types";
import { ContextualHelpPopover } from "./ContextualHelpPopover";
import { Eye, Maximize2, Sparkles, X } from "lucide-react";

export interface ElevationFallbackSvgProps {
  model: ExhibitionModel;
  cones: SightlineCone[];
  viewMode: ViewMode;
  selectedMountId: string | null;
  onSelectMountId: (id: string) => void;
  onOpenExplainer: () => void;
  onRunDemo?: () => void;
}

export function ElevationFallbackSvg({
  model,
  cones,
  viewMode,
  selectedMountId,
  onSelectMountId,
  onOpenExplainer,
  onRunDemo,
}: ElevationFallbackSvgProps): JSX.Element {
  const [activeShot, setActiveShot] = useState<string>("Overview");
  const [showDetailModal, setShowDetailModal] = useState<boolean>(false);
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.innerWidth < 640 : false
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const wall = model.walls.find((w) => w.id === "wall-north") || model.walls[0] || {
    id: "wall-north",
    name: "North Gallery Wall",
    width_cm: 600,
    height_cm: 320,
    position_m: [0, 0, 0] as [number, number, number],
    rotation_deg: 0,
    source: "virtual_twin" as const,
  };

  const mountedOnWall = model.mounts.filter((m: MountedArtwork) => m.wallId === wall.id);
  const isEmpty = mountedOnWall.length === 0;

  // Coordinate mapping: SVG viewBox is -40 0 980 412
  // Left margin: -40 to 90 for Stand/ADA observer datum pills
  // Gallery wall occupies x: 92 to 804 (width 712), y: 26 to 356 (height 330)
  // Right margin: 804 to 940 for Centerline datum pill
  const svgLeft = 92;
  const svgRight = 804;
  const svgBottom = 356;
  const svgTop = 26;
  const wallSvgWidth = svgRight - svgLeft;
  const wallSvgHeight = svgBottom - svgTop;

  const cmToSvgX = (cm: number) => svgLeft + (cm / wall.width_cm) * wallSvgWidth;
  // y in cm is measured from floor (0 at floor, 320 at ceiling)
  const cmToSvgY = (cm: number) => svgBottom - (cm / wall.height_cm) * wallSvgHeight;

  // Observer coordinates: start flush at the right border of margin pills
  const standingEyeX = 90;
  const standingEyeY = cmToSvgY(152);
  const wheelchairEyeX = 90;
  const wheelchairEyeY = cmToSvgY(115);
  const centerlineY = cmToSvgY(145);

  const shotOptions = ["Overview", "Tabletop 1:8", "Wheelchair 115", "Passthrough 1:1"];

  return (
    <div
      data-surface="spatial-stage"
      data-result-region="spatial-stage"
      className="elevation-fallback"
      style={{
        display: "flex",
        flexDirection: "column",
        background: "var(--scene-bg)",
        border: "1px solid rgba(45, 38, 30, 0.08)",
        borderRadius: "var(--radius-md)",
        boxShadow: "0 6px 20px -2px rgba(45, 38, 30, 0.09), 0 2px 6px rgba(45, 38, 30, 0.04)",
        position: "relative",
        overflow: "hidden",
        maxWidth: "100%",
        boxSizing: "border-box",
      }}
    >
      {/* Header bar over stage */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "var(--space-3) var(--space-4)",
          background: "var(--bg-elevated)",
          borderBottom: "1px solid var(--border)",
          flexWrap: "wrap",
          gap: "var(--space-2)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", minWidth: 0, flex: "1 1 200px" }}>
          <Eye size={18} style={{ color: "var(--accent)", flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <span className="eyebrow" style={{ fontSize: "11px", display: "block" }}>
              Architectural Elevation · 1:20 Metric Projection
            </span>
            <div className="subject" style={{ fontSize: "15px", margin: "1px 0 0", wordBreak: "break-word" }}>
              {wall.name}{" "}
              <span style={{ whiteSpace: "nowrap" }}>({wall.width_cm}&nbsp;×&nbsp;{wall.height_cm}&nbsp;cm)</span>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexShrink: 0 }}>
          {isMobile && !isEmpty && (
            <button
              type="button"
              className="btn btn--sm"
              onClick={() => setShowDetailModal(true)}
              title="Open full-resolution elevation detail modal"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                padding: "2px 8px",
                fontSize: "11px",
                height: "26px",
              }}
            >
              <Maximize2 size={12} />
              <span>Detail</span>
            </button>
          )}
          <span
            className="caption-mono"
            style={{
              padding: "2px 8px",
              borderRadius: "4px",
              background: "var(--bg-sunken)",
              border: "1px solid var(--border)",
              fontSize: "12px",
            }}
          >
            {viewMode === "wheelchair_115"
              ? "115cm ADA"
              : viewMode === "standing_152"
              ? "152cm Stand"
              : viewMode === "tabletop_maquette"
              ? "1:8 Tabletop"
              : "1:1 Passthrough"}
          </span>
          <ContextualHelpPopover regionId="spatial-stage" onOpenExplainer={onOpenExplainer} />
        </div>
      </div>

      {/* SVG Canvas Area */}
      <div className="elevation-canvas-area">
        {isEmpty ? (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "var(--space-3)",
              padding: "var(--space-6)",
              textAlign: "center",
              zIndex: 10,
            }}
          >
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "50%",
                background: "var(--accent-soft)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--accent)",
              }}
            >
              <Sparkles size={24} />
            </div>
            <div style={{ maxWidth: "460px", display: "flex", flexDirection: "column", gap: "6px" }}>
              <span className="subject" style={{ fontSize: "18px" }}>
                Gallery walls are ready for curation
              </span>
              <span className="support" style={{ fontSize: "14px" }}>
                Twenty-four public-domain works from the Art Institute of Chicago are loaded with
                physical centimeter dimensions and conservation lux limits. Choose a theme above or
                press Curate exhibition to place and verify your first hang.
              </span>
            </div>
            {onRunDemo && (
              <button
                type="button"
                className="btn btn--primary"
                onClick={onRunDemo}
                style={{ marginTop: "var(--space-2)" }}
              >
                Curate botanical exhibition
              </button>
            )}
          </div>
        ) : null}

        <svg
          className="elevation-fallback__svg"
          viewBox="-45 0 970 412"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={`Architectural elevation of ${wall.name}`}
        >
          <defs>
            {/* Museum picture moulding drop shadow */}
            <filter id="moulding-shadow" x="-15%" y="-15%" width="130%" height="135%">
              <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="rgba(0,0,0,0.32)" />
            </filter>

            {/* Archival woven linen matboard texture */}
            <pattern id="linen-texture" width="6" height="6" patternUnits="userSpaceOnUse">
              <rect width="6" height="6" fill="var(--scene-mat-matboard)" />
              <path d="M 0 3 L 6 3 M 3 0 L 3 6" stroke="rgba(0,0,0,0.05)" strokeWidth="0.6" />
            </pattern>

            {/* Fine gallery plaster wall texture */}
            <pattern id="plaster-texture" width="24" height="24" patternUnits="userSpaceOnUse">
              <rect width="24" height="24" fill="var(--scene-mat-wall)" />
              <circle cx="6" cy="6" r="0.6" fill="rgba(0,0,0,0.025)" />
              <circle cx="18" cy="18" r="0.6" fill="rgba(0,0,0,0.025)" />
            </pattern>

            {/* Gallery 4000K museum grazing wall lighting gradient */}
            <linearGradient id="wall-plaster-lighting" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.45" />
              <stop offset="25%" stopColor="#FAF7F2" stopOpacity="0.2" />
              <stop offset="75%" stopColor="#ECE6DC" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#D8D0C3" stopOpacity="0.4" />
            </linearGradient>

            {/* Gilt picture moulding bevel gradient */}
            <linearGradient id="frame-gilt-bevel" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#DFB750" />
              <stop offset="30%" stopColor="#F5E8BA" />
              <stop offset="65%" stopColor="#A68326" />
              <stop offset="100%" stopColor="#694F10" />
            </linearGradient>

            {/* Walnut picture moulding bevel gradient */}
            <linearGradient id="frame-walnut-bevel" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#78563E" />
              <stop offset="45%" stopColor="#553C29" />
              <stop offset="100%" stopColor="#352417" />
            </linearGradient>

            {/* Ebony picture moulding bevel gradient */}
            <linearGradient id="frame-ebony-bevel" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#414754" />
              <stop offset="50%" stopColor="#252830" />
              <stop offset="100%" stopColor="#14151A" />
            </linearGradient>
          </defs>

          {/* Gallery Floor line */}
          <line
            x1="-30"
            y1={svgBottom}
            x2="930"
            y2={svgBottom}
            stroke="var(--border-strong)"
            strokeWidth="2.5"
          />
          <text
            x="-20"
            y={svgBottom + 22}
            fill="#2D3748"
            fontSize={isMobile ? "14" : "12"}
            fontFamily="var(--font-mono)"
            fontWeight="700"
            letterSpacing="0.04em"
            style={{ paintOrder: "stroke fill", stroke: "var(--bg-elevated)", strokeWidth: "4px", strokeLinejoin: "round" }}
          >
            FINISHED GALLERY FLOOR ±0.00
          </text>

          {/* Wall Plaster Surface Background */}
          <rect
            x={svgLeft}
            y={svgTop}
            width={wallSvgWidth}
            height={wallSvgHeight}
            fill="url(#plaster-texture)"
            stroke="var(--border)"
            strokeWidth="1.5"
            rx="2"
          />
          <rect
            x={svgLeft}
            y={svgTop}
            width={wallSvgWidth}
            height={wallSvgHeight}
            fill="url(#wall-plaster-lighting)"
            rx="2"
            pointerEvents="none"
          />

          {/* 145 cm Museum Centerline guideline */}
          <line
            x1={svgLeft}
            y1={centerlineY}
            x2="808"
            y2={centerlineY}
            stroke="var(--border)"
            strokeWidth="1"
            strokeDasharray="4 4"
          />
          {/* Opaque knockout pill badge in right margin */}
          <rect
            x={isMobile ? "770" : "780"}
            y={centerlineY - (isMobile ? 14 : 12)}
            width={isMobile ? "86" : "110"}
            height={isMobile ? 28 : 24}
            fill="var(--bg-elevated)"
            stroke="var(--border-strong)"
            strokeWidth="1.2"
            rx="4"
          />
          <text
            x={isMobile ? "813" : "835"}
            y={centerlineY + (isMobile ? 5 : 4.5)}
            textAnchor="middle"
            fill="var(--text)"
            fontSize={isMobile ? 14 : 13.5}
            fontFamily="var(--font-mono)"
            fontWeight="700"
            style={{ paintOrder: "stroke fill", stroke: "var(--bg-elevated)", strokeWidth: "3px", strokeLinejoin: "round" }}
          >
            {isMobile ? "145 cm" : "145cm Center"}
          </text>

          {/* 152 cm Standing Sightline guideline */}
          <line
            x1="94"
            y1={standingEyeY}
            x2={svgRight}
            y2={standingEyeY}
            stroke="var(--success)"
            strokeWidth="2.0"
            strokeDasharray="6 3"
            opacity={viewMode === "standing_152" || viewMode === "tabletop_maquette" ? "1.0" : "0.55"}
          />

          {/* 115 cm Wheelchair Sightline guideline */}
          <line
            x1="94"
            y1={wheelchairEyeY}
            x2={svgRight}
            y2={wheelchairEyeY}
            stroke="var(--success)"
            strokeWidth="2.2"
            strokeDasharray="5 3"
            opacity={viewMode === "wheelchair_115" ? "1.0" : "0.75"}
          />

          {/* Sightline Rays / Cones */}
          {!isEmpty &&
            mountedOnWall.map((mount: MountedArtwork) => {
              const art = model.catalog.find((c) => c.id === mount.artworkId);
              if (!art) return null;
              const targetX = cmToSvgX(mount.centerX_cm);
              const targetY = cmToSvgY(mount.centerY_cm);

              return (
                <g key={`rays-${mount.id}`} opacity="0.6">
                  {/* Wheelchair ray */}
                  <line
                    x1={wheelchairEyeX}
                    y1={wheelchairEyeY}
                    x2={targetX}
                    y2={targetY}
                    stroke="var(--success)"
                    strokeWidth="1.2"
                    strokeDasharray="4 3"
                  />
                  {/* Standing ray */}
                  <line
                    x1={standingEyeX}
                    y1={standingEyeY}
                    x2={targetX}
                    y2={targetY}
                    stroke="var(--success)"
                    strokeWidth="1"
                    strokeDasharray="4 4"
                  />
                  {/* Convergence dot */}
                  <circle cx={targetX} cy={targetY} r="3" fill="var(--accent)" />
                </g>
              );
            })}

          {/* Observer Datum Pills in left margin (rendered on top of lines & rays) */}
          <rect
            x={isMobile ? "-10" : "-24"}
            y={standingEyeY - (isMobile ? 14 : 12)}
            width={isMobile ? "80" : "108"}
            height={isMobile ? 28 : 24}
            fill="var(--bg-elevated)"
            stroke="var(--success)"
            strokeWidth="1.4"
            rx="4"
          />
          <text
            x={isMobile ? "30" : "30"}
            y={standingEyeY + (isMobile ? 5 : 4.5)}
            textAnchor="middle"
            fill="var(--success)"
            fontSize={isMobile ? 14 : 13.5}
            fontFamily="var(--font-mono)"
            fontWeight="700"
          >
            {isMobile ? "152 cm" : "152 cm Stand"}
          </text>

          <rect
            x={isMobile ? "-10" : "-24"}
            y={wheelchairEyeY - (isMobile ? 14 : 12)}
            width={isMobile ? "80" : "108"}
            height={isMobile ? 28 : 24}
            fill="var(--bg-elevated)"
            stroke="var(--success)"
            strokeWidth="1.4"
            rx="4"
          />
          <text
            x={isMobile ? "30" : "30"}
            y={wheelchairEyeY + (isMobile ? 5 : 4.5)}
            textAnchor="middle"
            fill="var(--success)"
            fontSize={isMobile ? 14 : 13.5}
            fontFamily="var(--font-mono)"
            fontWeight="700"
          >
            {isMobile ? "115 cm" : "115 cm ADA"}
          </text>

          {/* Mounted Artworks & Placards */}
          {mountedOnWall.map((mount: MountedArtwork) => {
            const art = model.catalog.find((c) => c.id === mount.artworkId);
            if (!art) return null;

            const isSelected = selectedMountId === mount.id;
            const widthSvg = (art.width_cm / wall.width_cm) * wallSvgWidth;
            const heightSvg = (art.height_cm / wall.height_cm) * wallSvgHeight;
            const leftSvg = cmToSvgX(mount.centerX_cm) - widthSvg / 2;
            const topSvg = cmToSvgY(mount.centerY_cm) - heightSvg / 2;

            const frameFill =
              art.frameFinish === "gilt"
                ? "url(#frame-gilt-bevel)"
                : art.frameFinish === "ebony"
                ? "url(#frame-ebony-bevel)"
                : "url(#frame-walnut-bevel)";

            // Placard position & true museum scale
            const placardW = 22;
            const placardH = 26;
            const placardLeftSvg =
              mount.placard.side === "right"
                ? leftSvg + widthSvg + 6
                : leftSvg - placardW - 6;
            const placardTopSvg = cmToSvgY(mount.placard.centerY_cm) - placardH / 2;

            // Centered dimension chip below frame
            const dimBoxWidth = Math.max(widthSvg, isMobile ? 134 : 126);
            const dimLeftSvg = leftSvg + (widthSvg - dimBoxWidth) / 2;
            const dimTopSvg = topSvg + heightSvg + 4;
            const dimBoxHeight = 24;

            return (
              <g
                key={mount.id}
                onClick={() => onSelectMountId(mount.id)}
                style={{ cursor: "pointer" }}
              >
                {/* Frame border */}
                <rect
                  x={leftSvg}
                  y={topSvg}
                  width={widthSvg}
                  height={heightSvg}
                  fill={frameFill}
                  stroke={isSelected ? "var(--accent)" : "rgba(0,0,0,0.3)"}
                  strokeWidth={isSelected ? "3" : "1.5"}
                  rx="2"
                  filter={isSelected ? "drop-shadow(0 0 6px var(--accent))" : "url(#moulding-shadow)"}
                />

                {/* Archival Matboard */}
                <rect
                  x={leftSvg + 5}
                  y={topSvg + 5}
                  width={Math.max(10, widthSvg - 10)}
                  height={Math.max(10, heightSvg - 10)}
                  fill="url(#linen-texture)"
                  stroke="rgba(0,0,0,0.12)"
                  strokeWidth="0.8"
                />

                {/* Canvas artwork plate */}
                <rect
                  x={leftSvg + 8}
                  y={topSvg + 8}
                  width={Math.max(6, widthSvg - 16)}
                  height={Math.max(6, heightSvg - 16)}
                  fill={art.paletteHex[0] || "#3D5A80"}
                />

                {/* Museum catalog plate badge & concise title */}
                {(() => {
                  const plateNum = String(mountedOnWall.indexOf(mount) + 1).padStart(2, "0");
                  const shortArtist = art.artist.split(" ").slice(-1)[0] || "Artist";
                  const displayTitle =
                    isMobile && art.title.length > 14
                      ? art.title.slice(0, 12).trim() + "…"
                      : art.title.length > 20
                      ? art.title.slice(0, 18).trim() + "…"
                      : art.title;
                  const isCompact = widthSvg < 90;
                  const badgeW = isCompact
                    ? Math.max(isMobile ? 88 : 84, widthSvg)
                    : Math.max(isMobile ? 120 : 116, widthSvg - 8);
                  const badgeX = leftSvg + (widthSvg - badgeW) / 2;
                  const rectH = isCompact ? (isMobile ? 28 : 26) : (isMobile ? 42 : 40);
                  const rectY = topSvg + heightSvg / 2 - rectH / 2;

                  return (
                    <g>
                      <rect
                        x={badgeX}
                        y={rectY}
                        width={badgeW}
                        height={rectH}
                        fill="rgba(14, 18, 26, 0.95)"
                        stroke="rgba(255, 255, 255, 0.3)"
                        strokeWidth="0.8"
                        rx="4"
                      />
                      {isCompact ? (
                        <text
                          x={leftSvg + widthSvg / 2}
                          y={rectY + (isMobile ? 18 : 17)}
                          textAnchor="middle"
                          fill="#FFFFFF"
                          fontSize={isMobile ? 12.5 : 13}
                          fontFamily="var(--font-mono)"
                          fontWeight="700"
                          letterSpacing="0.04em"
                        >
                          {shortArtist}
                        </text>
                      ) : (
                        <text
                          x={leftSvg + widthSvg / 2}
                          y={rectY + (isMobile ? 17 : 16)}
                          textAnchor="middle"
                          fill="#FFFFFF"
                          fontSize={14}
                          fontFamily="var(--font-sans)"
                          fontWeight="700"
                        >
                          <tspan
                            x={leftSvg + widthSvg / 2}
                            dy="0"
                            fill="var(--accent-contrast)"
                          >
                            {displayTitle}
                          </tspan>
                          <tspan
                            x={leftSvg + widthSvg / 2}
                            dy="16"
                            fontSize={11.5}
                            fontFamily="var(--font-mono)"
                            fill="#E0E6ED"
                          >
                            Plate {plateNum} · {shortArtist}
                          </tspan>
                        </text>
                      )}
                    </g>
                  );
                })()}

                {/* Metric Dimensions & Lux Pill below frame with solid knockout badge */}
                <g>
                  <rect
                    x={dimLeftSvg}
                    y={dimTopSvg}
                    width={dimBoxWidth}
                    height={dimBoxHeight}
                    fill="var(--bg-elevated)"
                    stroke="var(--border-strong)"
                    strokeWidth="1.2"
                    rx="3"
                  />
                  <text
                    x={dimLeftSvg + dimBoxWidth / 2}
                    y={dimTopSvg + 16}
                    textAnchor="middle"
                    fill="var(--text)"
                    fontSize={12}
                    fontFamily="var(--font-mono)"
                    fontWeight="600"
                    style={{ paintOrder: "stroke fill", stroke: "var(--bg-elevated)", strokeWidth: "3px", strokeLinejoin: "round" }}
                  >
                    {art.width_cm}×{art.height_cm}cm · {mount.spotLux}lx
                  </text>
                </g>

                {/* Museum Placard */}
                <rect
                  x={placardLeftSvg}
                  y={placardTopSvg}
                  width={placardW}
                  height={placardH}
                  fill="var(--bg-elevated)"
                  stroke="var(--border-strong)"
                  strokeWidth="1.2"
                  rx="2"
                />
                <text
                  x={placardLeftSvg + placardW / 2}
                  y={placardTopSvg + placardH / 2 + 4.5}
                  textAnchor="middle"
                  fill="var(--text-muted)"
                  fontSize={12}
                  fontFamily="var(--font-mono)"
                  fontWeight="700"
                  style={{ paintOrder: "stroke fill", stroke: "var(--bg-elevated)", strokeWidth: "2px" }}
                >
                  P{mountedOnWall.indexOf(mount) + 1}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Shot Selector Pill bar below elevation canvas */}
      <div
        className="elevation-viewport-bar"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "8px",
          padding: "var(--space-2) var(--space-4)",
          background: "var(--bg-elevated)",
          borderTop: "1px solid var(--border)",
          fontSize: "12px",
          maxWidth: "100%",
          boxSizing: "border-box",
          overflow: "hidden",
        }}
      >
        <span className="caption-mono" style={{ color: "var(--text-muted)", fontSize: "11px" }}>
          Interactive Viewport
        </span>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            flexWrap: "wrap",
            maxWidth: "100%",
            paddingBottom: "2px",
          }}
        >
          {shotOptions.map((shot) => {
            const isActive = activeShot === shot;
            return (
              <button
                key={shot}
                type="button"
                onClick={() => setActiveShot(shot)}
                style={{
                  padding: "4px 13px",
                  borderRadius: "var(--radius-pill)",
                  border: isActive ? "1px solid var(--accent)" : "1px solid var(--border)",
                  background: isActive ? "var(--accent)" : "var(--bg-sunken)",
                  color: isActive ? "var(--accent-contrast)" : "var(--text)",
                  fontSize: "12px",
                  fontWeight: isActive ? 700 : 500,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                  textAlign: "center",
                }}
              >
                {shot}
              </button>
            );
          })}
        </div>
      </div>

      {/* Mobile inspectable wall list (< 640px) */}
      {isMobile && !isEmpty && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "6px",
            padding: "var(--space-2) var(--space-3)",
            background: "var(--bg-sunken)",
            borderTop: "1px solid var(--border)",
            maxWidth: "100%",
            boxSizing: "border-box",
          }}
        >
          <span className="eyebrow" style={{ fontSize: "10px", color: "var(--text-muted)" }}>
            Mounted Works On {wall.name} ({mountedOnWall.length})
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {mountedOnWall.map((mount, idx) => {
              const art = model.catalog.find((c) => c.id === mount.artworkId);
              if (!art) return null;
              const isSelected = selectedMountId === mount.id;
              return (
                <div
                  key={mount.id}
                  onClick={() => onSelectMountId(mount.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "6px 8px",
                    borderRadius: "var(--radius-sm)",
                    background: isSelected ? "var(--accent-soft)" : "var(--bg-elevated)",
                    border: isSelected ? "1px solid var(--accent)" : "1px solid var(--border)",
                    cursor: "pointer",
                    fontSize: "11px",
                    gap: "8px",
                    maxWidth: "100%",
                    boxSizing: "border-box",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0, flex: "1 1 auto", overflow: "hidden" }}>
                    <span
                      style={{
                        padding: "1px 5px",
                        borderRadius: "2px",
                        background: "var(--bg-sunken)",
                        fontFamily: "var(--font-mono)",
                        fontWeight: 700,
                        fontSize: "10px",
                        flexShrink: 0,
                      }}
                    >
                      P{idx + 1}
                    </span>
                    <span style={{ fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {art.title}
                    </span>
                    <span style={{ color: "var(--text-muted)", flexShrink: 0, whiteSpace: "nowrap" }}>
                      · {art.artist.split(" ").slice(-1)[0]}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0, fontFamily: "var(--font-mono)", fontSize: "10px" }}>
                    <span style={{ whiteSpace: "nowrap" }}>{art.width_cm}×{art.height_cm}cm</span>
                    <span style={{ color: "var(--accent)", fontWeight: 600, whiteSpace: "nowrap" }}>{mount.spotLux}lx</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Mobile High-Resolution Elevation Detail Modal */}
      {showDetailModal && (
        <div
          role="presentation"
          onClick={() => setShowDetailModal(false)}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(18, 22, 29, 0.72)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2200,
            padding: "var(--space-3)",
            boxSizing: "border-box",
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Elevation Detail Inspector"
            onClick={(e) => e.stopPropagation()}
            className="elev-3"
            style={{
              width: "100%",
              maxWidth: "540px",
              maxHeight: "90vh",
              overflowY: "auto",
              background: "var(--bg-elevated)",
              borderRadius: "var(--radius-lg)",
              border: "1px solid var(--border)",
              padding: "var(--space-4)",
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-3)",
              boxSizing: "border-box",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Eye size={18} style={{ color: "var(--accent)" }} />
                <span className="subject" style={{ fontSize: "16px" }}>
                  {wall.name} · Elevation Detail
                </span>
              </div>
              <button
                type="button"
                className="btn btn--sm"
                onClick={() => setShowDetailModal(false)}
                aria-label="Close detail modal"
                style={{ padding: "4px 8px" }}
              >
                <X size={16} />
              </button>
            </div>

            <p className="support" style={{ fontSize: "12px", margin: 0 }}>
              Physical centimeter dimensions, conservation lux readings, and eye-level pitch angles for all artworks mounted on this wall.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {mountedOnWall.map((mount, idx) => {
                const art = model.catalog.find((c) => c.id === mount.artworkId);
                if (!art) return null;
                const isSelected = selectedMountId === mount.id;
                return (
                  <div
                    key={mount.id}
                    onClick={() => {
                      onSelectMountId(mount.id);
                      setShowDetailModal(false);
                    }}
                    style={{
                      padding: "10px 12px",
                      borderRadius: "var(--radius-sm)",
                      background: isSelected ? "var(--accent-soft)" : "var(--bg-sunken)",
                      border: isSelected ? "1px solid var(--accent)" : "1px solid var(--border)",
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      gap: "4px",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontWeight: 700, fontSize: "13px", color: "var(--text)" }}>
                        Plate {String(idx + 1).padStart(2, "0")} · {art.title}
                      </span>
                      <span className="caption-mono" style={{ fontSize: "11px", color: "var(--accent)", fontWeight: 700 }}>
                        {mount.spotLux} lx
                      </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--text-muted)" }}>
                      <span>{art.artist} ({art.medium})</span>
                      <span className="caption-mono">{art.width_cm} × {art.height_cm} cm</span>
                    </div>
                    <div className="caption-mono" style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "2px" }}>
                      Center: ({mount.centerX_cm} cm, {mount.centerY_cm} cm) · Frame: {art.frameFinish}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
