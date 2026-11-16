/**
 * Contextual ? popover button rendered beside every result region header.
 * Click-activated with subject-naming aria-label and accessible dismiss.
 */
import { useEffect, useRef, useState, type JSX } from "react";
import { HELP_CONTENT, type ResultRegionId } from "../help-content";
import { HelpCircle, ExternalLink } from "lucide-react";

export function ContextualHelpPopover({
  regionId,
  onOpenExplainer,
}: {
  regionId: ResultRegionId;
  onOpenExplainer?: () => void;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const entry = HELP_CONTENT[regionId];

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  if (!entry) return <></>;

  return (
    <div
      ref={containerRef}
      style={{ position: "relative", display: "inline-block", verticalAlign: "middle" }}
    >
      <button
        type="button"
        className="help-btn"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={entry.ariaLabel}
        aria-expanded={open}
        data-help-for={regionId}
      >
        <HelpCircle size={16} strokeWidth={2.2} />
      </button>

      {open && (
        <div
          role="region"
          aria-label={entry.title}
          className="elev-3"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            width: "320px",
            zIndex: 1100,
            borderRadius: "var(--radius-md)",
            padding: "var(--space-4)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-3)",
            fontSize: "14px",
            lineHeight: 1.45,
            color: "var(--text)",
          }}
        >
          <div>
            <span className="eyebrow" style={{ fontSize: "11px" }}>
              Region Help
            </span>
            <div className="subject" style={{ fontSize: "15px", marginTop: "2px" }}>
              {entry.title}
            </div>
          </div>

          <p style={{ margin: 0, color: "var(--text)" }}>{entry.body}</p>

          <div
            style={{
              background: "var(--bg-sunken)",
              padding: "var(--space-2) var(--space-3)",
              borderRadius: "var(--radius-sm)",
              fontSize: "12px",
            }}
          >
            <span style={{ fontWeight: 600, color: "var(--text)" }}>Expected result: </span>
            <span style={{ color: "var(--text-muted)" }}>{entry.goodResultHint}</span>
          </div>

          {onOpenExplainer && (
            <button
              type="button"
              className="btn btn--sm"
              onClick={() => {
                setOpen(false);
                onOpenExplainer();
              }}
              style={{
                alignSelf: "flex-start",
                padding: "2px 8px",
                fontSize: "12px",
                marginTop: "2px",
              }}
            >
              <span>Full explainer guide</span>
              <ExternalLink size={12} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
