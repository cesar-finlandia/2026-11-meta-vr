/**
 * Structured system message components adhering to the 3-tier craft contract:
 * PageBanner (grid-inset), InlineCallout (within panel), InFlightIndicator, and ToastHost.
 */
import { useEffect, type JSX } from "react";
import { AlertTriangle, CheckCircle2, Info, Archive, AlertOctagon } from "lucide-react";

export type MessageSeverity = "info" | "success" | "warning" | "danger" | "degraded";

function SeverityIcon({ severity }: { severity: MessageSeverity }): JSX.Element {
  switch (severity) {
    case "success":
      return <CheckCircle2 size={20} strokeWidth={2.2} style={{ color: "var(--success)" }} />;
    case "warning":
      return <AlertTriangle size={20} strokeWidth={2.2} style={{ color: "var(--warning)" }} />;
    case "danger":
      return <AlertOctagon size={20} strokeWidth={2.2} style={{ color: "var(--danger)" }} />;
    case "degraded":
      return <Archive size={20} strokeWidth={2.2} style={{ color: "var(--degraded)" }} />;
    case "info":
    default:
      return <Info size={20} strokeWidth={2.2} style={{ color: "var(--accent)" }} />;
  }
}

function getSeverityStyles(severity: MessageSeverity): {
  bg: string;
  border: string;
} {
  switch (severity) {
    case "success":
      return { bg: "var(--success-bg)", border: "var(--success)" };
    case "warning":
      return { bg: "var(--warning-bg)", border: "var(--warning)" };
    case "danger":
      return { bg: "var(--danger-bg)", border: "var(--danger)" };
    case "degraded":
      return { bg: "var(--degraded-bg)", border: "var(--degraded)" };
    case "info":
    default:
      return { bg: "var(--accent-soft)", border: "var(--accent)" };
  }
}

export function PageBanner({
  severity,
  title,
  detail,
  actionLabel,
  onAction,
}: {
  severity: MessageSeverity;
  title: string;
  detail: string;
  actionLabel?: string;
  onAction?: () => void;
}): JSX.Element {
  const styles = getSeverityStyles(severity);

  return (
    <div
      className="grid-shell"
      style={{ marginTop: "var(--space-3)", marginBottom: "var(--space-3)" }}
    >
      <div
        data-message="banner"
        role="status"
        style={{
          background: styles.bg,
          border: `1px solid ${styles.border}`,
          borderLeft: `4px solid ${styles.border}`,
          borderRadius: "var(--radius-md)",
          padding: "var(--space-3) var(--space-4)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--space-4)",
          boxShadow: "var(--elev-1-shadow)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
          <SeverityIcon severity={severity} />
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            <span className="subject" style={{ fontSize: "16px" }}>
              {title}
            </span>
            <span className="support" style={{ fontSize: "14px" }}>
              {detail}
            </span>
          </div>
        </div>
        {actionLabel && onAction && (
          <button
            type="button"
            className="btn btn--sm"
            onClick={onAction}
            style={{ flexShrink: 0 }}
          >
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}

export function InlineCallout({
  severity,
  title,
  detail,
  actionLabel,
  onAction,
}: {
  severity: MessageSeverity;
  title: string;
  detail: string;
  actionLabel?: string;
  onAction?: () => void;
}): JSX.Element {
  const styles = getSeverityStyles(severity);

  return (
    <div
      data-message="callout"
      role={severity === "danger" ? "alert" : "status"}
      style={{
        background: styles.bg,
        border: `1px solid ${styles.border}`,
        borderLeft: `3px solid ${styles.border}`,
        borderRadius: "var(--radius-sm)",
        padding: "var(--space-3)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: "var(--space-3)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-3)" }}>
        <div style={{ paddingTop: "2px" }}>
          <SeverityIcon severity={severity} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          <span className="subject" style={{ fontSize: "15px" }}>
            {title}
          </span>
          <span className="support" style={{ fontSize: "13px" }}>
            {detail}
          </span>
        </div>
      </div>
      {actionLabel && onAction && (
        <button
          type="button"
          className="btn btn--sm"
          onClick={onAction}
          style={{ flexShrink: 0 }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export function InFlightIndicator({
  active,
  stageLabel,
  elapsedMs,
}: {
  active: boolean;
  stageLabel: string | null;
  elapsedMs?: number;
}): JSX.Element {
  if (!active) return <></>;

  const label = stageLabel || "Preparing curatorial workspace and gallery wall bounds.";

  return (
    <div
      data-message="inflight"
      role="status"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-2)",
        padding: "var(--space-3)",
        background: "var(--accent-soft)",
        border: "1px solid var(--accent)",
        borderRadius: "var(--radius-sm)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <div
            style={{
              width: "10px",
              height: "10px",
              borderRadius: "50%",
              background: "var(--accent)",
              animation: "pulse 1.2s infinite ease-in-out",
            }}
          />
          <span className="subject" style={{ fontSize: "14px" }}>
            {label}
          </span>
        </div>
        {elapsedMs !== undefined && (
          <span className="caption-mono" style={{ fontSize: "12px" }}>
            {Math.round(elapsedMs)} ms
          </span>
        )}
      </div>
      <div
        style={{
          width: "100%",
          height: "3px",
          background: "var(--border)",
          borderRadius: "2px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            background: "var(--accent)",
            width: "60%",
            animation: "shimmer 1.8s infinite linear",
          }}
        />
      </div>
    </div>
  );
}

export function ToastHost({
  toast,
  onDismiss,
}: {
  toast: { id: string; severity: MessageSeverity; title: string; detail: string } | null;
  onDismiss: () => void;
}): JSX.Element {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => {
      onDismiss();
    }, 4500);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  if (!toast) return <></>;

  const styles = getSeverityStyles(toast.severity);

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        bottom: "var(--space-5)",
        right: "var(--space-5)",
        zIndex: 1000,
        maxWidth: "400px",
        background: styles.bg,
        border: `1px solid ${styles.border}`,
        borderLeft: `4px solid ${styles.border}`,
        borderRadius: "var(--radius-md)",
        padding: "var(--space-3) var(--space-4)",
        boxShadow: "var(--elev-3-shadow)",
        display: "flex",
        alignItems: "flex-start",
        gap: "var(--space-3)",
      }}
    >
      <div style={{ paddingTop: "2px" }}>
        <SeverityIcon severity={toast.severity} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "2px", flex: 1 }}>
        <span className="subject" style={{ fontSize: "14px" }}>
          {toast.title}
        </span>
        <span className="support" style={{ fontSize: "12px" }}>
          {toast.detail}
        </span>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--text-muted)",
          padding: "2px",
          fontSize: "16px",
          lineHeight: 1,
        }}
      >
        ×
      </button>
    </div>
  );
}
