/**
 * Primary product explainer modal dialog for judges and curators.
 * Outlines purpose, persona, 5-step workflow, verdict interpretation, and 1-click demo run.
 */
import { useEffect, useRef, type JSX } from "react";
import { X, CheckCircle2, ArrowRight } from "lucide-react";
import { EXPLAINER_CONTENT } from "../help-content";

export function ExplainerModal({
  open,
  onClose,
  onRunDemo,
}: {
  open: boolean;
  onClose: () => void;
  onRunDemo: () => void;
}): JSX.Element {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return <></>;

  return (
    <div
      role="presentation"
      onClick={onClose}
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
        zIndex: 2000,
        padding: "var(--space-4)",
      }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="explainer-dialog-title"
        onClick={(e) => e.stopPropagation()}
        className="elev-3"
        style={{
          width: "100%",
          maxWidth: "760px",
          maxHeight: "90vh",
          overflowY: "auto",
          borderRadius: "var(--radius-lg)",
          padding: "var(--space-6)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-5)",
          color: "var(--text)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "1px solid var(--border)",
            paddingBottom: "var(--space-4)",
          }}
        >
          <div>
            <span className="eyebrow">Exhibition & Spatial Accessibility Guide</span>
            <h2
              id="explainer-dialog-title"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "var(--text-h2)",
                margin: "4px 0 0",
              }}
            >
              {EXPLAINER_CONTENT.dialogTitle}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close explainer"
            className="btn btn--sm"
            style={{ width: "36px", height: "36px", padding: 0, borderRadius: "50%" }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Section 1: What it does */}
        <section style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          <span className="eyebrow">1. Purpose</span>
          <p style={{ margin: 0, fontSize: "var(--text-body)", lineHeight: 1.5 }}>
            {EXPLAINER_CONTENT.whatItDoes}
          </p>
        </section>

        {/* Section 2: Who it serves */}
        <section style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          <span className="eyebrow">2. Audience & Pain Removed</span>
          <p style={{ margin: 0, fontSize: "var(--text-body)", lineHeight: 1.5 }}>
            {EXPLAINER_CONTENT.whoItServes}
          </p>
        </section>

        {/* Section 3: 5-step workflow */}
        <section style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          <span className="eyebrow">3. Five-Step Curatorial Workflow</span>
          <ol
            style={{
              margin: 0,
              paddingLeft: "var(--space-4)",
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-2)",
              fontSize: "var(--text-body)",
            }}
          >
            {EXPLAINER_CONTENT.workflowSteps.map((step, idx) => (
              <li key={idx} style={{ lineHeight: 1.45 }}>
                {step}
              </li>
            ))}
          </ol>
        </section>

        {/* Section 4: How to read the verdict */}
        <section style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          <span className="eyebrow">4. Reading ADA & Conservation Verdicts</span>
          <div
            style={{
              background: "var(--bg-sunken)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              padding: "var(--space-3) var(--space-4)",
              display: "flex",
              alignItems: "flex-start",
              gap: "var(--space-3)",
            }}
          >
            <CheckCircle2 size={22} style={{ color: "var(--success)", flexShrink: 0, marginTop: "2px" }} />
            <p style={{ margin: 0, fontSize: "var(--text-body)", lineHeight: 1.5 }}>
              {EXPLAINER_CONTENT.howToReadVerdict}
            </p>
          </div>
        </section>

        {/* Action footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: "var(--space-3)",
            borderTop: "1px solid var(--border)",
            paddingTop: "var(--space-4)",
          }}
        >
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => {
              onClose();
              onRunDemo();
            }}
          >
            <span>{EXPLAINER_CONTENT.tryItCtaLabel}</span>
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
