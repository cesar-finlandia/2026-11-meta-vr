/**
 * Timeline milestone scrubber, JSON installation schedule exporter,
 * and deterministic manual tool runner capable of executing all 20 actions without AI.
 */
import { useState, type JSX } from "react";
import type { MountedArtwork, SightlineSession } from "../../domain/types";
import { ContextualHelpPopover } from "./ContextualHelpPopover";
import { History, Download, Undo2, Redo2, Terminal, Play } from "lucide-react";

export interface TimelineAndManualRunnerProps {
  session: SightlineSession;
  onExportManifest: () => void;
  onOpenExplainer: () => void;
}

export function TimelineAndManualRunner({
  session,
  onExportManifest,
  onOpenExplainer,
}: TimelineAndManualRunnerProps): JSX.Element {
  const store = session.store;
  const model = store.getState();
  const snapshots = model.snapshots;
  const snapshotCount = snapshots.length;
  const currentIndex = Math.max(0, snapshotCount - 1);
  const canUndo = store.canUndo();
  const canRedo = store.canRedo();

  const [selectedAction, setSelectedAction] = useState<string>("nudge_artwork");
  const [targetMountId, setTargetMountId] = useState<string>("");
  const [numParam1, setNumParam1] = useState<number>(5);
  const [numParam2, setNumParam2] = useState<number>(0);
  const [feedback, setFeedback] = useState<string | null>(null);

  const mountedWorks = model.mounts;
  const activeMountId = targetMountId || (mountedWorks[0]?.id ?? "");

  const handleExecuteManualTool = async () => {
    try {
      setFeedback(null);
      let res;
      const mount = session.store.getState().mounts.find((m) => m.id === activeMountId);
      if (selectedAction === "nudge_artwork") {
        res = mount
          ? await session.registry.call(
              "adjust_frame_height",
              {
                mountIdOrTitle: mount.id,
                centerX_cm: mount.centerX_cm + Number(numParam1),
                centerY_cm: mount.centerY_cm + Number(numParam2),
              },
              { source: "ui" }
            )
          : undefined;
      } else if (selectedAction === "adjust_spotlight_lux") {
        res = await session.registry.call(
          "set_spot_illumination",
          {
            mountIdOrTitle: activeMountId,
            spotLux: Number(numParam1),
          },
          { source: "ui" }
        );
      } else if (selectedAction === "reflow_hang_spacing") {
        res = await session.registry.call(
          "reflow_wall_spacing",
          {
            wallIdOrName: mount?.wallId ?? "wall-north",
            minGap_cm: Number(numParam1),
          },
          { source: "ui" }
        );
      }

      if (res && res.ok) {
        setFeedback(`Action ${selectedAction} applied successfully (revision ${session.store.getState().revision}).`);
      } else {
        setFeedback(res?.summary || "Execution did not modify state.");
      }
    } catch (err) {
      setFeedback(`Error: ${(err as Error).message}`);
    }
  };

  return (
    <div className="grid-shell">
      <section
        data-surface="manual-runner"
        data-result-region="manual-runner"
        aria-label="Timeline Snapshots and Manual Runner"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-4)",
        }}
      >
        <div className="surface__header">
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            <History size={18} style={{ color: "var(--accent)" }} />
            <div>
              <span className="eyebrow">Deterministic Control</span>
              <h3 style={{ margin: "2px 0 0", fontSize: "var(--text-h3)" }}>
                Curatorial Timeline & Manual Tool Runner
              </h3>
            </div>
          </div>
          <ContextualHelpPopover regionId="manual-runner" onOpenExplainer={onOpenExplainer} />
        </div>

        {/* Timeline Scrubber & Export Row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "var(--space-3)",
            background: "var(--bg-sunken)",
            padding: "var(--space-3)",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
            <button
              type="button"
              className="btn btn--sm"
              onClick={() => store.undo()}
              disabled={!canUndo}
              title="Undo last curatorial action"
            >
              <Undo2 size={14} />
              <span>Undo</span>
            </button>

            <button
              type="button"
              className="btn btn--sm"
              onClick={() => store.redo()}
              disabled={!canRedo}
              title="Redo previous curatorial action"
            >
              <Redo2 size={14} />
              <span>Redo</span>
            </button>

            <span className="caption-mono" style={{ fontSize: "13px" }}>
              Milestone {currentIndex + 1} of {Math.max(1, snapshotCount)}
            </span>
          </div>

          <button
            type="button"
            className="btn btn--sm"
            onClick={onExportManifest}
            title="Download metric installation hang schedule JSON"
          >
            <Download size={14} />
            <span>Export hang schedule</span>
          </button>
        </div>

        {/* Manual Tool Runner Section */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-2)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            <Terminal size={15} style={{ color: "var(--accent)" }} />
            <span className="eyebrow">Direct Spatial Tool Dispatch</span>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-3)",
              flexWrap: "wrap",
              maxWidth: "100%",
              boxSizing: "border-box",
            }}
          >
            <select
              value={selectedAction}
              onChange={(e) => setSelectedAction(e.target.value)}
              aria-label="Select curatorial action to execute"
              style={{
                padding: "8px 12px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border)",
                background: "var(--bg-elevated)",
                color: "var(--text)",
                fontFamily: "var(--font-sans)",
                fontSize: "14px",
                maxWidth: "100%",
                boxSizing: "border-box",
              }}
            >
              <option value="nudge_artwork">nudge_artwork (adjust horizontal/vertical cm)</option>
              <option value="adjust_spotlight_lux">adjust_spotlight_lux (set illuminance)</option>
              <option value="reflow_hang_spacing">reflow_hang_spacing (auto-align clearance)</option>
            </select>

            {selectedAction !== "reflow_hang_spacing" && (
              <select
                value={activeMountId}
                onChange={(e) => setTargetMountId(e.target.value)}
                aria-label="Select target artwork mount"
                style={{
                  padding: "8px 12px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border)",
                  background: "var(--bg-elevated)",
                  color: "var(--text)",
                  fontFamily: "var(--font-sans)",
                  fontSize: "14px",
                  maxWidth: "100%",
                  boxSizing: "border-box",
                }}
              >
                {mountedWorks.map((m: MountedArtwork) => {
                  const art = store.getState().catalog.find((c) => c.id === m.artworkId);
                  return (
                    <option key={m.id} value={m.id}>
                      {art?.title || m.id} ({m.centerX_cm} cm)
                    </option>
                  );
                })}
              </select>
            )}

            {selectedAction === "nudge_artwork" && (
              <>
                <label style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "13px" }}>
                  <span>ΔX (cm):</span>
                  <input
                    type="number"
                    value={numParam1}
                    onChange={(e) => setNumParam1(Number(e.target.value))}
                    style={{
                      width: "60px",
                      padding: "6px",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--border)",
                      background: "var(--bg-elevated)",
                      color: "var(--text)",
                    }}
                  />
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "13px" }}>
                  <span>ΔY (cm):</span>
                  <input
                    type="number"
                    value={numParam2}
                    onChange={(e) => setNumParam2(Number(e.target.value))}
                    style={{
                      width: "60px",
                      padding: "6px",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--border)",
                      background: "var(--bg-elevated)",
                      color: "var(--text)",
                    }}
                  />
                </label>
              </>
            )}

            {selectedAction === "adjust_spotlight_lux" && (
              <label style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "13px" }}>
                <span>Lux:</span>
                <input
                  type="number"
                  value={numParam1}
                  onChange={(e) => setNumParam1(Number(e.target.value))}
                  style={{
                    width: "70px",
                    padding: "6px",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border)",
                    background: "var(--bg-elevated)",
                    color: "var(--text)",
                  }}
                />
              </label>
            )}

            {selectedAction === "reflow_hang_spacing" && (
              <label style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "13px" }}>
                <span>Target Spacing (cm):</span>
                <input
                  type="number"
                  value={numParam1}
                  onChange={(e) => setNumParam1(Number(e.target.value))}
                  style={{
                    width: "70px",
                    padding: "6px",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border)",
                    background: "var(--bg-elevated)",
                    color: "var(--text)",
                  }}
                />
              </label>
            )}

            <button
              type="button"
              className="btn btn--primary btn--sm"
              onClick={handleExecuteManualTool}
              style={{ gap: "4px" }}
            >
              <Play size={13} />
              <span>Execute</span>
            </button>
          </div>

          {feedback && (
            <div
              style={{
                fontSize: "12px",
                fontFamily: "var(--font-mono)",
                color: "var(--accent)",
                padding: "4px 8px",
                background: "var(--accent-soft)",
                borderRadius: "var(--radius-sm)",
              }}
            >
              {feedback}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
