/**
 * Live curatorial activity ledger showing every Gemini role turn,
 * IWSDK ECS spatial update, and bare-hand gesture with measured latency.
 */
import type { JSX } from "react";
import type { TraceEntry } from "../../domain/types";
import { ContextualHelpPopover } from "./ContextualHelpPopover";
import { Activity, Clock } from "lucide-react";

export interface ActivityFeedPanelProps {
  entries: TraceEntry[];
  selectedMountId: string | null;
  onSelectEntity: (mountId: string) => void;
  onOpenExplainer: () => void;
}

export function ActivityFeedPanel({
  entries,
  selectedMountId,
  onSelectEntity,
  onOpenExplainer,
}: ActivityFeedPanelProps): JSX.Element {
  const reversed = [...entries].reverse();

  return (
    <section
      data-surface="activity-feed"
      data-result-region="activity-feed"
      aria-label="Curatorial Activity Ledger"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-3)",
      }}
    >
      <div className="surface__header">
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <Activity size={18} style={{ color: "var(--accent)" }} />
          <div>
            <span className="eyebrow">Auditable Ledger</span>
            <h3 style={{ margin: "2px 0 0", fontSize: "var(--text-h3)" }}>
              Curatorial Activity Feed
            </h3>
          </div>
        </div>
        <ContextualHelpPopover regionId="activity-feed" onOpenExplainer={onOpenExplainer} />
      </div>

      {reversed.length === 0 ? (
        <div
          style={{
            padding: "var(--space-4)",
            background: "var(--bg-sunken)",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border)",
            fontSize: "14px",
            color: "var(--text-muted)",
            textAlign: "center",
          }}
        >
          No curatorial actions recorded yet. Choose a theme above or trigger curation to start.
        </div>
      ) : (
        <div
          style={{
            maxHeight: "320px",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: "6px",
            padding: "4px",
            background: "var(--bg-sunken)",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border)",
          }}
        >
          {reversed.map((entry) => {
            const isAgent = entry.source === "agent";
            const isHuman = entry.source === "human";
            const affectedMount =
              (entry.args?.mountId as string) ||
              (entry.args?.artworkId as string) ||
              (entry.state_change?.entity_ids?.[0]) ||
              null;
            const isSelected = Boolean(affectedMount && affectedMount === selectedMountId);

            return (
              <div
                key={`${entry.seq}-${entry.name}`}
                onClick={() => {
                  if (affectedMount) onSelectEntity(affectedMount);
                }}
                style={{
                  background: isSelected ? "var(--accent-soft)" : "var(--bg-elevated)",
                  border: isSelected ? "1px solid var(--accent)" : "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  padding: "var(--space-2) var(--space-3)",
                  cursor: affectedMount ? "pointer" : "default",
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: "var(--space-3)",
                  transition: "background-color var(--dur-enter) var(--ease-standard)",
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span
                      className="eyebrow"
                      style={{
                        padding: "1px 6px",
                        borderRadius: "3px",
                        fontSize: "10px",
                        background: isAgent
                          ? "var(--accent-soft)"
                          : isHuman
                          ? "var(--success-bg)"
                          : "var(--bg-sunken)",
                        color: isAgent
                          ? "var(--accent)"
                          : isHuman
                          ? "var(--success)"
                          : "var(--text-muted)",
                      }}
                    >
                      {entry.source.toUpperCase()}
                    </span>
                    <span className="caption-mono" style={{ fontSize: "12px", fontWeight: 700 }}>
                      {entry.name}
                    </span>
                  </div>
                  <span className="subject" style={{ fontSize: "14px", fontWeight: 600 }}>
                    {entry.decision || (entry.ok ? `${entry.name} completed successfully` : `${entry.name} failed`)}
                  </span>
                </div>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-end",
                    gap: "2px",
                    flexShrink: 0,
                  }}
                >
                  <span className="caption-mono" style={{ fontSize: "11px" }}>
                    {entry.state_change?.revision_after ? `r${entry.state_change.revision_after}` : `r${entry.round}`}
                  </span>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "3px",
                      color: "var(--text-muted)",
                      fontSize: "11px",
                    }}
                  >
                    <Clock size={11} />
                    <span>{Math.round(entry.latency_ms)} ms</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
