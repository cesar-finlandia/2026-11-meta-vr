/**
 * Persistent top workbench header across /, /lab, and /watch.
 * Features brandmark lockup, primary explainer button, IWSDK status pill,
 * segmented View Mode controls, call budget gauge, and conservation theme toggle.
 */
import type { JSX } from "react";
import type { ViewMode } from "../../domain/types";
import type { BudgetSnapshot } from "../../agent/cost-guard";
import { Brandmark } from "../Brandmark";
import { MetricBlock } from "./MetricBlock";
import { useTheme } from "../theme";
import { Sparkles, Sun, Moon, HelpCircle } from "lucide-react";

export interface AppBarProps {
  viewMode: ViewMode;
  onSelectViewMode: (mode: ViewMode) => void;
  budget: BudgetSnapshot;
  aiDegraded: boolean;
  onOpenExplainer: () => void;
  currentPath: string;
  onNavigate: (path: string) => void;
}

export function AppBar({
  viewMode,
  onSelectViewMode,
  budget,
  aiDegraded,
  onOpenExplainer,
  currentPath,
  onNavigate,
}: AppBarProps): JSX.Element {
  const { theme, toggleTheme } = useTheme();

  const viewModes: Array<{ mode: ViewMode; label: string; testId: string }> = [
    { mode: "tabletop_maquette", label: "1:8 Tabletop", testId: "view-mode-tabletop" },
    { mode: "passthrough_room", label: "1:1 Passthrough", testId: "view-mode-passthrough" },
    { mode: "wheelchair_115", label: "115cm ADA", testId: "view-mode-wheelchair" },
    { mode: "standing_152", label: "152cm Stand", testId: "view-mode-standing" },
  ];

  const navRoutes = [
    { path: "/", label: "Workbench" },
    { path: "/lab", label: "Spatial Lab" },
    { path: "/watch", label: "Replay Watch" },
  ];

  return (
    <header className="app-header elev-2">
      <div className="grid-shell app-header__desktop">
        {/* Left: Brandmark + Explainer + Navigation */}
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexShrink: 0 }}>
          <Brandmark variant="header" />

          <button
            type="button"
            className="btn btn--sm"
            onClick={onOpenExplainer}
            data-app-explainer="true"
            style={{
              fontWeight: 600,
              gap: "4px",
              padding: "4px 8px",
              fontSize: "13px",
              whiteSpace: "nowrap",
            }}
          >
            <HelpCircle size={14} style={{ color: "var(--accent)" }} />
            <span>How it works</span>
          </button>

          <nav
            style={{
              display: "flex",
              alignItems: "center",
              gap: "2px",
              marginLeft: "2px",
            }}
            aria-label="Workbench sections"
          >
            {navRoutes.map((r) => {
              const active = currentPath === r.path;
              return (
                <button
                  key={r.path}
                  type="button"
                  onClick={() => onNavigate(r.path)}
                  style={{
                    padding: "5px 10px",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid transparent",
                    borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
                    background: active ? "var(--accent-soft)" : "transparent",
                    color: active ? "var(--accent)" : "var(--text-muted)",
                    fontWeight: active ? 700 : 500,
                    fontSize: "12px",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  {r.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Center: Mandated-Tech Badge & Segmented View Modes */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-2)",
            flexShrink: 0,
            justifyContent: "center",
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "2px 6px",
              borderRadius: "var(--radius-pill)",
              background: "var(--bg-sunken)",
              border: "1px solid var(--border)",
              fontSize: "11px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              color: "var(--text)",
              whiteSpace: "nowrap",
            }}
            title="Meta Immersive Web SDK active with bare-hand pinch interaction"
          >
            <span
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                background: "var(--success)",
                display: "inline-block",
              }}
            />
            <span>IWSDK Ready</span>
          </div>

          {/* Segmented View Mode Tabs */}
          <div
            role="tablist"
            aria-label="Spatial view mode"
            style={{
              display: "inline-flex",
              background: "var(--bg-sunken)",
              padding: "2px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border)",
              gap: "2px",
            }}
          >
            {viewModes.map(({ mode, label, testId }) => {
              const isActive = viewMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  data-testid={testId}
                  onClick={() => onSelectViewMode(mode)}
                  style={{
                    padding: "4px 12px",
                    borderRadius: "4px",
                    border: "none",
                    cursor: "pointer",
                    fontSize: "12px",
                    fontWeight: isActive ? 700 : 500,
                    background: isActive ? "var(--accent)" : "transparent",
                    color: isActive ? "var(--accent-contrast)" : "var(--text)",
                    transition: "all var(--dur-enter) var(--ease-standard)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right utility cluster: Metric call budget + Theme toggle */}
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexShrink: 0 }}>
          {aiDegraded ? (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                padding: "4px 8px",
                borderRadius: "var(--radius-sm)",
                background: "var(--degraded-bg)",
                border: "1px solid var(--degraded)",
                color: "var(--degraded)",
                fontSize: "12px",
                fontWeight: 700,
              }}
            >
              <span>Replay Cache</span>
            </div>
          ) : (
            <div
              className="appbar-calls"
              style={{
                background: "transparent",
                border: "none",
                padding: "0 8px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
              }}
            >
              <MetricBlock
                size="md"
                eyebrow="Agent Calls"
                value={budget.runCalls}
                pairedValue={budget.limits.maxCallsPerRun}
                support="budget"
              />
            </div>
          )}

          <button
            type="button"
            className="btn btn--sm"
            onClick={toggleTheme}
            style={{
              fontWeight: 600,
              gap: "4px",
              padding: "0 10px",
              height: "44px",
              fontSize: "13px",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            title="Toggle between sunlit paper elevation and darkened conservation vault"
          >
            {theme === "paper" ? (
              <>
                <Moon size={14} />
                <span>Vault</span>
              </>
            ) : (
              <>
                <Sun size={14} />
                <span>Paper</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Mobile-optimized compact layout (2 clean rows) */}
      <div className="grid-shell app-header__mobile">
        {/* Row 1: Brandmark + Calls budget + Help + Vault */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", gap: "8px" }}>
          <Brandmark variant="header" />

          <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
            <div
              style={{
                background: "var(--bg-sunken)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-pill)",
                padding: "2px 8px",
                fontSize: "11px",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
              title="Agent call budget"
            >
              <span className="caption-mono" style={{ color: "var(--text-muted)", fontSize: "11px" }}>Calls:</span>
              <span className="caption-mono" style={{ fontWeight: 700, color: "var(--text)", fontSize: "11px" }}>
                {budget.runCalls}/{budget.limits.maxCallsPerRun}
              </span>
            </div>

            <button
              type="button"
              className="btn btn--sm"
              onClick={onOpenExplainer}
              data-app-explainer="true"
              style={{ padding: "4px 8px", minHeight: "28px", height: "28px" }}
              title="How Sightline Studio works"
              aria-label="How Sightline Studio works"
            >
              <HelpCircle size={14} style={{ color: "var(--accent)" }} />
            </button>

            <button
              type="button"
              className="btn btn--sm"
              onClick={toggleTheme}
              style={{ padding: "4px 8px", minHeight: "28px", height: "28px" }}
              title="Toggle theme"
              aria-label="Toggle theme"
            >
              {theme === "paper" ? <Moon size={14} /> : <Sun size={14} />}
            </button>
          </div>
        </div>

        {/* Row 2: Consolidated Navigation & View Mode Selectors (Unified Segmented Control) */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            width: "100%",
            background: "var(--bg-sunken)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-pill)",
            padding: "2px",
            boxSizing: "border-box",
            gap: "2px",
          }}
        >
          <div style={{ flex: "1 1 50%", position: "relative", minWidth: 0 }}>
            <select
              value={currentPath}
              onChange={(e) => onNavigate(e.target.value)}
              aria-label="Navigate workbench section"
              style={{
                width: "100%",
                WebkitAppearance: "none",
                MozAppearance: "none",
                appearance: "none",
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888888' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
                backgroundRepeat: "no-repeat",
                backgroundPosition: "right 10px center",
                paddingLeft: "10px",
                paddingRight: "22px",
                height: "24px",
                borderRadius: "var(--radius-pill)",
                border: "none",
                background: "var(--bg-elevated)",
                color: "var(--text)",
                fontFamily: "var(--font-sans)",
                fontSize: "11px",
                fontWeight: 600,
                cursor: "pointer",
                outline: "none",
                boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
                display: "block",
              }}
            >
              {navRoutes.map((r) => (
                <option key={r.path} value={r.path}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          <div style={{ flex: "1 1 50%", position: "relative", minWidth: 0 }}>
            <select
              value={viewMode}
              onChange={(e) => onSelectViewMode(e.target.value as ViewMode)}
              aria-label="Select spatial view mode"
              style={{
                width: "100%",
                WebkitAppearance: "none",
                MozAppearance: "none",
                appearance: "none",
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888888' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
                backgroundRepeat: "no-repeat",
                backgroundPosition: "right 10px center",
                paddingLeft: "10px",
                paddingRight: "22px",
                height: "24px",
                borderRadius: "var(--radius-pill)",
                border: "none",
                background: "var(--bg-elevated)",
                color: "var(--text)",
                fontFamily: "var(--font-sans)",
                fontSize: "11px",
                fontWeight: 600,
                cursor: "pointer",
                outline: "none",
                boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
                display: "block",
              }}
            >
              {viewModes.map(({ mode, label }) => (
                <option key={mode} value={mode}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </header>
  );
}
