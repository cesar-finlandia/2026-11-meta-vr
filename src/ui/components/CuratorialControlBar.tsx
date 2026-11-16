/**
 * Curatorial control bar featuring brief entry, theme presets, IIIF manifest import,
 * primary curation trigger, and hands-first WebXR session launch.
 */
import { useState, type JSX } from "react";
import { Sparkles, FileText, Glasses, ArrowRight, X } from "lucide-react";

export interface CuratorialControlBarProps {
  brief: string;
  onBriefChange: (next: string) => void;
  onRunCurate: (briefOverride?: string) => void;
  onImportIiifJson: (rawJsonText: string) => { ok: boolean; message: string };
  onEnterXr: () => void;
  running: boolean;
}

export const PRESET_BRIEFS = [
  {
    id: "botanical",
    label: "Botanical",
    brief:
      "Curate a focused salon exhibition of Japanese woodblock prints and botanical studies on the north wall, keeping paper lux under 50 lux and wheelchair viewing pitch comfortable.",
  },
  {
    id: "etchings",
    label: "Etchings",
    brief:
      "Arrange architectural etchings and prints with precise 145 cm eye-level centerlines and balanced 20 cm inter-frame clearances.",
  },
  {
    id: "impressionist",
    label: "Impressionist",
    brief:
      "Hang vibrant oil paintings with appropriate 200 lux illumination while ensuring all wall placards remain readable from wheelchair eye level.",
  },
];

export function CuratorialControlBar({
  brief,
  onBriefChange,
  onRunCurate,
  onImportIiifJson,
  onEnterXr,
  running,
}: CuratorialControlBarProps): JSX.Element {
  const [showIiifModal, setShowIiifModal] = useState(false);
  const [iiifInput, setIiifInput] = useState("");
  const [iiifFeedback, setIiifFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const isMobile = typeof window !== "undefined" ? window.innerWidth < 640 : false;

  const handleSelectPreset = (presetBrief: string) => {
    onBriefChange(presetBrief);
  };

  const handleApplyIiif = () => {
    if (!iiifInput.trim()) {
      setIiifFeedback({
        ok: false,
        message: "Please paste a valid IIIF Presentation v2/v3 manifest JSON.",
      });
      return;
    }
    const result = onImportIiifJson(iiifInput);
    setIiifFeedback(result);
    if (result.ok) {
      setTimeout(() => {
        setShowIiifModal(false);
        setIiifInput("");
        setIiifFeedback(null);
      }, 1200);
    }
  };

  return (
    <div className="grid-shell">
      <div
        className="curatorial-control-bar"
        data-surface="control-bar"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          padding: "12px 20px",
          overflow: "hidden",
          maxWidth: "100%",
          boxSizing: "border-box",
        }}
      >
        {/* Preset Chips */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            gap: "var(--space-2)",
            maxWidth: "100%",
            boxSizing: "border-box",
          }}
        >
          <span className="eyebrow" style={{ whiteSpace: "nowrap" }}>
            Exhibition Themes:
          </span>
          <div
            data-testid="preset-brief-select"
            className="curatorial-control-bar__presets"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-2)",
              flexWrap: "wrap",
              maxWidth: "100%",
              width: "100%",
              boxSizing: "border-box",
            }}
          >
            {PRESET_BRIEFS.map((preset) => {
              const isSelected = brief === preset.brief;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleSelectPreset(preset.brief)}
                  style={{
                    padding: "4px 12px",
                    borderRadius: "var(--radius-pill)",
                    border: isSelected ? "1px solid var(--accent)" : "1px solid var(--border)",
                    background: isSelected ? "var(--accent-soft)" : "var(--bg-sunken)",
                    color: isSelected ? "var(--accent)" : "var(--text)",
                    fontSize: "13px",
                    fontWeight: isSelected ? 700 : 500,
                    cursor: "pointer",
                    transition: "all var(--dur-enter) var(--ease-standard)",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                  }}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Archival Curatorial Brief Editorial Pad */}
        <div
          style={{
            width: "100%",
            position: "relative",
            background: "var(--bg-sunken)",
            borderRadius: "var(--radius-sm)",
            borderLeft: "3px solid var(--accent)",
            borderTop: "1px solid var(--border)",
            borderRight: "1px solid var(--border)",
            borderBottom: "1px solid var(--border)",
            padding: "8px 12px",
            boxSizing: "border-box",
          }}
        >
          <textarea
            value={brief}
            onChange={(e) => onBriefChange(e.target.value)}
            placeholder="Describe curatorial intent, focal works, wall rhythm, or accessibility limits..."
            disabled={running}
            aria-label="Curatorial brief input"
            rows={isMobile ? 3 : 2}
            style={{
              width: "100%",
              maxWidth: "100%",
              boxSizing: "border-box",
              padding: 0,
              border: "none",
              background: "transparent",
              color: "var(--text)",
              fontFamily: "var(--font-sans)",
              fontSize: "14px",
              lineHeight: "1.5",
              outline: "none",
              resize: "none",
              minHeight: isMobile ? "72px" : "40px",
            }}
          />
        </div>

        {/* Dedicated primary exhibition action dock below prompt */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "var(--space-2)",
            width: "100%",
          }}
        >
          <span
            className="support"
            style={{
              color: "var(--text-muted)",
              fontSize: "12.5px",
              fontWeight: 500,
              display: "inline-flex",
              alignItems: "center",
              gap: "10px",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            <span
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                background: "var(--accent)",
                display: "inline-block",
                flexShrink: 0,
              }}
            />
            Art Institute of Chicago · 24 Accessioned Masterpieces
          </span>

          <div
            className="curatorial-control-bar__actions"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-2)",
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              className="btn btn--sm"
              data-testid="import-iiif-btn"
              onClick={() => setShowIiifModal(true)}
              disabled={running}
              title="Import open-access works via IIIF Presentation v3 manifest"
            >
              <FileText size={14} />
              <span>Import IIIF</span>
            </button>

            <button
              type="button"
              className="btn btn--primary btn--sm"
              data-testid="run-brief-btn"
              onClick={() => onRunCurate()}
              disabled={running}
              style={{
                padding: "6px 14px",
                fontSize: "13px",
              }}
            >
              <Sparkles size={14} />
              <span>{running ? "Curating..." : "Curate exhibition"}</span>
              <ArrowRight size={14} />
            </button>

            <button
              type="button"
              className="btn btn--sm"
              onClick={onEnterXr}
              title="Launch WebXR spatial passthrough with bare-hand pinch controls"
              style={{
                border: "1px solid var(--accent)",
                color: "var(--accent)",
              }}
            >
              <Glasses size={15} />
              <span>Enter Mixed Reality</span>
            </button>
          </div>
        </div>
      </div>

      {/* IIIF Import Modal */}
      {showIiifModal && (
        <div
          role="presentation"
          onClick={() => setShowIiifModal(false)}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(18, 22, 29, 0.65)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2100,
            padding: "var(--space-4)",
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="iiif-modal-title"
            onClick={(e) => e.stopPropagation()}
            className="elev-3"
            style={{
              width: "100%",
              maxWidth: "600px",
              borderRadius: "var(--radius-lg)",
              padding: "var(--space-5)",
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-4)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                borderBottom: "1px solid var(--border)",
                paddingBottom: "var(--space-3)",
              }}
            >
              <div>
                <span className="eyebrow">Collection Integration</span>
                <h3 id="iiif-modal-title" style={{ margin: "2px 0 0" }}>
                  Import IIIF Presentation v3 Manifest
                </h3>
              </div>
              <button
                type="button"
                className="btn btn--sm"
                onClick={() => setShowIiifModal(false)}
                style={{ width: "32px", height: "32px", padding: 0, borderRadius: "50%" }}
              >
                <X size={16} />
              </button>
            </div>

            <p style={{ margin: 0, fontSize: "14px", color: "var(--text-muted)" }}>
              Paste raw JSON for an open-access IIIF Presentation v2/v3 collection or manifest.
              Sightline will extract physical frame dimensions, medium classifications, and image tiles.
            </p>

            <textarea
              value={iiifInput}
              onChange={(e) => setIiifInput(e.target.value)}
              placeholder='{ "@context": "http://iiif.io/api/presentation/3/context.json", "id": "...", "type": "Manifest", ... }'
              rows={8}
              style={{
                width: "100%",
                padding: "var(--space-3)",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border)",
                background: "var(--bg-sunken)",
                color: "var(--text)",
                fontFamily: "var(--font-mono)",
                fontSize: "12px",
                outline: "none",
                resize: "vertical",
              }}
            />

            {iiifFeedback && (
              <div
                style={{
                  padding: "var(--space-2) var(--space-3)",
                  borderRadius: "var(--radius-sm)",
                  background: iiifFeedback.ok ? "var(--success-bg)" : "var(--danger-bg)",
                  color: iiifFeedback.ok ? "var(--success)" : "var(--danger)",
                  border: `1px solid ${iiifFeedback.ok ? "var(--success)" : "var(--danger)"}`,
                  fontSize: "13px",
                }}
              >
                {iiifFeedback.message}
              </div>
            )}

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                gap: "var(--space-3)",
              }}
            >
              <button type="button" className="btn" onClick={() => setShowIiifModal(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn--primary" onClick={handleApplyIiif}>
                Import Manifest
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
