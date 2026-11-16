/**
 * Human-in-the-loop curator approval gate bar.
 * Pauses destructive or hang-replacing agent actions until the curator explicitly
 * approves or rejects them, with accessible testid hooks and contextual help.
 */
import { useEffect, useState, type JSX } from "react";
import type { ApprovalGate, PendingApproval } from "../../domain/types";
import { ContextualHelpPopover } from "./ContextualHelpPopover";
import { ShieldAlert, Check, X } from "lucide-react";

const ACTION_LABELS: Record<string, string> = {
  scan_room_planes: "Scan Room Planes",
  toggle_passthrough_wall_mode: "Toggle Passthrough",
  toggle_seated_scale_twin: "Toggle Seated Twin",
  load_iiif_collection: "Load IIIF Collection",
  filter_curatorial_theme: "Filter Curatorial Theme",
  propose_wall_layout: "Propose Wall Layout",
  place_framed_artwork: "Place Framed Artwork",
  adjust_frame_height: "Adjust Frame Height",
  reflow_wall_spacing: "Reflow Wall Spacing",
  set_spot_illumination: "Set Spot Illumination",
  compute_sightline_frustum: "Compute Sightline Frustum",
  preview_wheelchair_eye_level: "Preview Wheelchair Sightline",
  validate_ada_compliance: "Validate ADA Compliance",
  check_fov_label_legibility: "Check Label Legibility",
  repair_layout_violation: "Repair Layout Violation",
  draft_curatorial_placard: "Draft Curatorial Placard",
  swap_rejected_artwork: "Swap Rejected Artwork",
  pin_spatial_anchor: "Pin Spatial Anchor",
  scrub_timeline_snapshot: "Restore Timeline Snapshot",
  export_exhibition_manifest: "Export Manifest",
  adjust_artwork_elevation: "Adjust Artwork Elevation",
  redistribute_wall_spacing: "Redistribute Wall Spacing",
  rebalance_lux_exposure: "Rebalance Lux Exposure",
  nudge_artwork: "Nudge Placement",
  set_baseline_elevation: "Set Baseline Elevation",
  rehang_cluster: "Rehang Cluster",
};

function formatActionName(actionName: string): string {
  if (ACTION_LABELS[actionName]) {
    return ACTION_LABELS[actionName];
  }
  return actionName
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export interface ApprovalBarProps {
  gate: ApprovalGate;
  onOpenExplainer?: () => void;
  simulateApproval?: boolean;
}

export function ApprovalBar({
  gate,
  onOpenExplainer,
  simulateApproval = false,
}: ApprovalBarProps): JSX.Element {
  const [pending, setPending] = useState<PendingApproval | null>(() => gate.getPending());
  const [enabled, setEnabled] = useState<boolean>(() => gate.isEnabled());

  useEffect(() => {
    // If simulateApproval is true and there is no pending approval from the engine,
    // generate an architectural simulated checkpoint for screenshot and visual inspection
    if (simulateApproval && !gate.getPending()) {
      setPending({
        id: "sim-appr-01",
        actionName: "swap_rejected_artwork",
        plainSummary:
          "Replace paper woodblock print on wall-north with oil painting to clear 50 lux limit",
        args: {
          currentArtworkId: "aic-111",
          replacementArtworkId: "aic-204",
          wallId: "wall-north",
        },
        source: "agent",
        requestedAtIso: new Date().toISOString(),
      });
      return;
    }

    const unsubscribe = gate.subscribe((p, e) => {
      setPending(p);
      setEnabled(e);
    });

    return unsubscribe;
  }, [gate, simulateApproval]);

  const handleApprove = () => {
    if (pending) {
      gate.approve(pending.id);
      setPending(null);
    }
  };

  const handleReject = () => {
    if (pending) {
      gate.reject(pending.id, "Refused by curator via workbench approval bar.");
      setPending(null);
    }
  };

  const handleToggleEnabled = () => {
    const next = !enabled;
    gate.setEnabled(next);
    setEnabled(next);
  };

  // If no approval is pending, render a quiet, collapsed confirmation status inside the grid
  if (!pending) {
    return (
      <div className="grid-shell">
        <div
          data-result-region="approval-bar"
          data-testid="approval-bar"
          data-surface="approval-bar"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            padding: "var(--space-2) var(--space-4)",
            fontSize: "13px",
            color: "var(--text-muted)",
            flexWrap: "wrap",
            gap: "var(--space-2)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", minWidth: 0, flex: "1 1 auto" }}>
            <span
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: enabled ? "var(--success)" : "var(--text-muted)",
                display: "inline-block",
                flexShrink: 0,
              }}
            />
            <span className="support" style={{ color: "var(--text)" }}>
              {enabled
                ? "Approval checkpoint active · AI requires curator confirmation on wall changes"
                : "Approval gate bypassed · Direct agent execution enabled"}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap", minWidth: 0 }}>
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                cursor: "pointer",
                fontSize: "12px",
                userSelect: "none",
                whiteSpace: "nowrap",
              }}
            >
              <input
                type="checkbox"
                checked={enabled}
                onChange={handleToggleEnabled}
                style={{ accentColor: "var(--accent)" }}
              />
              <span>Require curator approval</span>
            </label>
            <ContextualHelpPopover regionId="approval-bar" onOpenExplainer={onOpenExplainer} />
          </div>
        </div>
      </div>
    );
  }

  // Active Pending Approval Gate Request
  return (
    <div className="grid-shell">
      <div
        data-result-region="approval-bar"
        data-testid="approval-bar"
        data-surface="approval-bar"
        role="alert"
        className="elev-2"
        style={{
          background: "var(--warning-bg)",
          border: "1px solid var(--warning)",
          borderLeft: "5px solid var(--warning)",
          borderRadius: "var(--radius-md)",
          padding: "var(--space-3) var(--space-4)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--space-4)",
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-3)",
            flex: "1 1 260px",
            minWidth: 0,
          }}
        >
          <ShieldAlert size={24} style={{ color: "var(--warning)", flexShrink: 0 }} />
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
              <span className="eyebrow" style={{ color: "var(--warning)" }}>
                Curator Checkpoint Required
              </span>
              <span
                className="caption-mono"
                style={{
                  background: "var(--bg-elevated)",
                  color: "var(--warning)",
                  border: "1px solid var(--warning)",
                  padding: "3px 12px",
                  borderRadius: "var(--radius-pill)",
                  fontSize: "11px",
                  fontWeight: 700,
                  letterSpacing: "0.02em",
                  whiteSpace: "nowrap",
                }}
              >
                {formatActionName(pending.actionName)}
              </span>
            </div>
            <span className="subject" style={{ fontSize: "16px" }}>
              {pending.plainSummary}
            </span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap", minWidth: 0 }}>
          <button
            type="button"
            className="btn btn--sm"
            data-testid="approval-reject-btn"
            onClick={handleReject}
            style={{
              borderColor: "var(--danger)",
              color: "var(--danger)",
              gap: "4px",
            }}
          >
            <X size={15} />
            <span>Reject</span>
          </button>

          <button
            type="button"
            className="btn btn--primary btn--sm"
            data-testid="approval-approve-btn"
            onClick={handleApprove}
            style={{
              gap: "4px",
            }}
          >
            <Check size={15} />
            <span>Approve change</span>
          </button>

          <ContextualHelpPopover regionId="approval-bar" onOpenExplainer={onOpenExplainer} />
        </div>
      </div>
    </div>
  );
}
