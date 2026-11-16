/**
 * Camera-ready museum curatorial workbench for Sightline Studio.
 * Wires the domain store, deterministic truth engine, human approval gate,
 * active activity feed, live or simulated agent workflows, and the 2D/3D spatial stage.
 */
import { useCallback, useEffect, useMemo, useState, type JSX } from "react";
import type {
  ExhibitionModel,
  SightlineCone,
  SightlineSession,
  TraceEntry,
  TruthIssue,
  ViewMode,
} from "./domain/types";
import { parseIiifManifest } from "./domain/collection-loader";
import { createSession } from "./domain/session";
import { bindCuratorialActions } from "./agent/actions";
import { createCostGuard, type BudgetSnapshot } from "./agent/cost-guard";
import { runCuratorialWorkflow, runInteractiveReflow } from "./agent/orchestrator";
import {
  getLabRoute,
  getSpatialStage,
  getWatchRoute,
  subscribeStageRegistry,
} from "./ui/stage-registry";
import { useTheme } from "./ui/theme";
import { AppBar } from "./ui/components/AppBar";
import {
  InFlightIndicator,
  PageBanner,
  ToastHost,
  type MessageSeverity,
} from "./ui/components/SystemMessages";
import { ApprovalBar } from "./ui/components/ApprovalBar";
import { CuratorialControlBar } from "./ui/components/CuratorialControlBar";
import { ElevationFallbackSvg } from "./ui/components/ElevationFallbackSvg";
import { ContextualHelpPopover } from "./ui/components/ContextualHelpPopover";
import { ComplianceVerdictPanel } from "./ui/components/ComplianceVerdictPanel";
import { ActivityFeedPanel } from "./ui/components/ActivityFeedPanel";
import { TimelineAndManualRunner } from "./ui/components/TimelineAndManualRunner";
import { ExplainerModal } from "./ui/components/ExplainerModal";

export function App(): JSX.Element {
  const { theme } = useTheme();

  // Read URL query hooks for deterministic verification and screenshot testing
  const urlParams = useMemo(() => {
    if (typeof window === "undefined") return new URLSearchParams();
    return new URLSearchParams(window.location.search);
  }, []);

  const seedParam = (urlParams.get("seed") as "default" | "needs-repair" | "empty") || "default";
  const simulateInflight = urlParams.get("simulateInflight") === "1";
  const simulateDegraded = urlParams.get("simulateDegraded") === "1";
  const simulateApproval = urlParams.get("simulateApproval") === "1";
  const widestMetrics = urlParams.get("widestMetrics") === "1";

  // Route tracking
  const [currentPath, setCurrentPath] = useState<string>(() => {
    if (typeof window === "undefined") return "/";
    return window.location.pathname || "/";
  });

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname || "/");
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigateTo = useCallback((path: string) => {
    if (typeof window !== "undefined") {
      window.history.pushState({}, "", path);
      setCurrentPath(path);
    }
  }, []);

  // Initialize session, cost guard, and bind curatorial actions
  const [session] = useState<SightlineSession>(() => {
    const sess = createSession({ seed: seedParam });
    bindCuratorialActions(sess);
    return sess;
  });

  // Read-only handle for automated verification (model snapshot and compliance audit).
  useEffect(() => {
    (window as unknown as { __SIGHTLINE_SESSION__?: unknown }).__SIGHTLINE_SESSION__ = {
      getModel: () => session.store.getState(),
      audit: () => session.truthEngine.checkExhibition(session.store.getState()),
    };
    return () => {
      delete (window as unknown as { __SIGHTLINE_SESSION__?: unknown }).__SIGHTLINE_SESSION__;
    };
  }, [session]);

  const [costGuard] = useState(() => createCostGuard());
  const [budget, setBudget] = useState<BudgetSnapshot>(() => costGuard.getSnapshot());

  useEffect(() => {
    return costGuard.subscribe((snap) => setBudget(snap));
  }, [costGuard]);

  // Reactive state from session store
  const [model, setModel] = useState<ExhibitionModel>(() => session.store.getState());
  const [curatorialBrief, setCuratorialBrief] = useState<string>(() => session.store.getState().curatorialBrief);
  const [issues, setIssues] = useState<TruthIssue[]>(() =>
    session.truthEngine.checkExhibition(session.store.getState())
  );
  const [cones, setCones] = useState<SightlineCone[]>(() =>
    session.truthEngine.computeSightlineFrustums(session.store.getState())
  );
  const [traceEntries, setTraceEntries] = useState<TraceEntry[]>(() =>
    session.trace.toDocument().entries
  );

  // Subscribe to store updates and recompute truth audits deterministically
  useEffect(() => {
    const unsubscribeStore = session.store.subscribe((newModel) => {
      setModel(newModel);
      setCuratorialBrief(newModel.curatorialBrief);
      const newIssues = session.truthEngine.checkExhibition(newModel);
      const newCones = session.truthEngine.computeSightlineFrustums(newModel);
      setIssues(newIssues);
      setCones(newCones);
    });

    const unsubscribeTrace = session.trace.subscribe((entries) => {
      setTraceEntries([...entries]);
    });

    return () => {
      unsubscribeStore();
      unsubscribeTrace();
    };
  }, [session]);

  // Stage registry subscription for hot-mounted 3D and watch modules
  const [, setRegistryTick] = useState(0);
  useEffect(() => {
    return subscribeStageRegistry(() => setRegistryTick((t) => t + 1));
  }, []);

  // In-flight execution status & toasts
  const [isInflight, setIsInflight] = useState<boolean>(false);
  const [inflightStage, setInflightStage] = useState<{ index: number; label: string }>({
    index: 3,
    label: "Positioning framed works and placards along 145 cm datum",
  });
  const [degradedMessage, setDegradedMessage] = useState<string | null>(
    simulateDegraded ? "Running from verified curatorial replay cache" : null
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeToast, setActiveToast] = useState<{
    id: string;
    severity: MessageSeverity;
    title: string;
    detail: string;
  } | null>(null);
  const [isExplainerOpen, setIsExplainerOpen] = useState<boolean>(false);

  const showToast = useCallback((severity: MessageSeverity, title: string, detail: string) => {
    const id = `toast-${Date.now()}`;
    setActiveToast({ id, severity, title, detail });
  }, []);

  // Curatorial action handlers
  const handleViewModeChange = useCallback(
    (viewMode: ViewMode) => {
      session.store.dispatch({ type: "SET_VIEW_MODE", viewMode });
      if (viewMode === "passthrough_room") {
        session.store.dispatch({ type: "SET_PASSTHROUGH_MODE", enabled: true });
        session.store.dispatch({ type: "SET_SCALE_TWIN_MODE", enabled: false });
      } else if (viewMode === "tabletop_maquette") {
        session.store.dispatch({ type: "SET_PASSTHROUGH_MODE", enabled: false });
        session.store.dispatch({ type: "SET_SCALE_TWIN_MODE", enabled: true, viewMode });
      } else {
        session.store.dispatch({ type: "SET_PASSTHROUGH_MODE", enabled: false });
      }
    },
    [session]
  );

  const handleSelectMount = useCallback(
    (mountId: string | null) => {
      session.store.dispatch({ type: "SELECT_ENTITY", mountId });
    },
    [session]
  );

  const handleRunCurate = useCallback(
    async (briefOverride?: string) => {
      const brief = briefOverride || curatorialBrief;
      try {
        setIsInflight(true);
        setErrorMessage(null);
        setDegradedMessage(simulateDegraded ? "Running from verified curatorial replay cache" : null);

        const result = await runCuratorialWorkflow(session, {
          brief,
          costGuard,
          onStageChange: (index, label) => {
            setInflightStage({ index, label });
          },
        });

        if (result.ok) {
          if (result.degraded) {
            setDegradedMessage(
              result.degradedReason || "Running from verified curatorial replay cache"
            );
          }
          showToast("success", "Curation Complete", `${result.verifyRepairRounds} verify-repair passes completed.`);
        } else {
          setErrorMessage(result.degradedReason || "Live model request did not complete");
        }
      } catch (err) {
        setErrorMessage((err as Error).message || "Live model request did not complete");
      } finally {
        setIsInflight(false);
      }
    },
    [session, curatorialBrief, costGuard, simulateDegraded, showToast]
  );

  const handleRepairIssue = useCallback(
    async (issue: TruthIssue) => {
      try {
        setIsInflight(true);
        setInflightStage({
          index: 4,
          label: `Repairing ${issue.ruleId}: adjusting frame spacing and sightline pitch`,
        });

        const result = await runInteractiveReflow(session, issue.mountId ?? issue.entityIds[0] ?? issue.id);
        if (result.ok) {
          showToast("success", "Violation Resolved", result.summary);
        } else {
          showToast("warning", "Reflow Notice", result.summary);
        }
      } catch (err) {
        showToast("danger", "Repair Failed", (err as Error).message);
      } finally {
        setIsInflight(false);
      }
    },
    [session, showToast]
  );

  const handleImportIiif = useCallback(
    (rawJsonText: string): { ok: boolean; message: string } => {
      try {
        const parsed = JSON.parse(rawJsonText);
        const catalogItems = parseIiifManifest(parsed);
        session.store.dispatch({ type: "LOAD_CATALOG", items: catalogItems, merge: true });
        showToast("success", "IIIF Manifest Loaded", `Imported ${catalogItems.length} works from IIIF manifest.`);
        return { ok: true, message: `Imported ${catalogItems.length} works from IIIF manifest.` };
      } catch (err) {
        const msg = (err as Error).message || "Invalid IIIF manifest JSON.";
        showToast("danger", "IIIF Import Error", msg);
        return { ok: false, message: msg };
      }
    },
    [session, showToast]
  );

  const handleExportManifest = useCallback(() => {
    try {
      const state = session.store.getState();
      const exportDoc = {
        exhibitionTitle: state.exhibitionTitle,
        curatorialBrief: state.curatorialBrief,
        exportedAtIso: new Date().toISOString(),
        units: "cm",
        walls: state.walls,
        hangSchedule: state.mounts.map((mount) => {
          const artwork = state.catalog.find((c) => c.id === mount.artworkId);
          return {
            mountId: mount.id,
            wallId: mount.wallId,
            artworkTitle: artwork?.title || mount.artworkId,
            artist: artwork?.artist || "Unknown",
            medium: artwork?.medium || "Unknown",
            centerX_cm: mount.centerX_cm,
            centerY_cm: mount.centerY_cm,
            spotLux: mount.spotLux,
            luxLimit: artwork?.luxCap || 200,
            placard: mount.placard,
          };
        }),
      };

      const blob = new Blob([JSON.stringify(exportDoc, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sightline-hang-schedule-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("success", "Export Complete", "Metric installation hang schedule exported successfully.");
    } catch (err) {
      showToast("danger", "Export Failed", (err as Error).message);
    }
  }, [session, showToast]);

  // Determine stage component: WebGL spatial stage (if registered) or editorial 2D wall elevation
  const SpatialStageComponent = getSpatialStage();
  const LabRouteComponent = getLabRoute();
  const WatchRouteComponent = getWatchRoute();

  // Secondary route: /lab
  if (currentPath === "/lab") {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
        <AppBar
          viewMode={model.viewMode}
          onSelectViewMode={handleViewModeChange}
          budget={budget}
          aiDegraded={Boolean(degradedMessage)}
          onOpenExplainer={() => setIsExplainerOpen(true)}
          currentPath={currentPath}
          onNavigate={navigateTo}
        />
        <main className="grid-shell" style={{ flex: 1, padding: "var(--space-5) 0" }}>
          {LabRouteComponent ? (
            <LabRouteComponent session={session} theme={theme} />
          ) : (
            <div
              data-demo-focus="lab-inspector"
              data-surface="lab-fallback"
              className="elev-1"
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-lg)",
                padding: "var(--space-6)",
              }}
            >
              <span className="eyebrow">Spatial Tuning Lab</span>
              <h2 style={{ margin: "var(--space-2) 0", fontSize: "var(--text-h2)" }}>
                Placard Legibility & Sightline Frustum Calibration
              </h2>
              <p className="body" style={{ color: "var(--text-muted)", maxWidth: "680px" }}>
                Interactive field-of-view comfort cone calibrator and live XAUR placard typography
                tester. Calibrated against U.S. Access Board 115 cm wheelchair datum.
              </p>
            </div>
          )}
        </main>
        <ExplainerModal
          open={isExplainerOpen}
          onClose={() => setIsExplainerOpen(false)}
          onRunDemo={() => {
            setIsExplainerOpen(false);
            navigateTo("/");
            handleRunCurate("Botanical studies");
          }}
        />
        <ToastHost toast={activeToast} onDismiss={() => setActiveToast(null)} />
      </div>
    );
  }

  // Secondary route: /watch
  if (currentPath === "/watch") {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
        <AppBar
          viewMode={model.viewMode}
          onSelectViewMode={handleViewModeChange}
          budget={budget}
          aiDegraded={Boolean(degradedMessage)}
          onOpenExplainer={() => setIsExplainerOpen(true)}
          currentPath={currentPath}
          onNavigate={navigateTo}
        />
        <main className="grid-shell" style={{ flex: 1, padding: "var(--space-5) 0" }}>
          {WatchRouteComponent ? (
            <WatchRouteComponent theme={theme} />
          ) : (
            <div
              data-demo-focus="replay-stage"
              data-surface="watch-fallback"
              className="elev-1"
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-lg)",
                padding: "var(--space-6)",
              }}
            >
              <span className="eyebrow">Curatorial Replay Stream</span>
              <h2 style={{ margin: "var(--space-2) 0", fontSize: "var(--text-h2)" }}>
                Deterministic Session Trace Player
              </h2>
              <p className="body" style={{ color: "var(--text-muted)", maxWidth: "680px" }}>
                Frame-accurate timeline player replaying multi-agent curatorial calls, spatial
                transforms, and human approval checkpoints.
              </p>
            </div>
          )}
        </main>
        <ExplainerModal
          open={isExplainerOpen}
          onClose={() => setIsExplainerOpen(false)}
          onRunDemo={() => {
            setIsExplainerOpen(false);
            navigateTo("/");
            handleRunCurate("Botanical studies");
          }}
        />
        <ToastHost toast={activeToast} onDismiss={() => setActiveToast(null)} />
      </div>
    );
  }

  // Primary Curatorial Workbench (route: /)
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Row 1: Header Bar */}
      <AppBar
        viewMode={model.viewMode}
        onSelectViewMode={handleViewModeChange}
        budget={budget}
        aiDegraded={Boolean(degradedMessage)}
        onOpenExplainer={() => setIsExplainerOpen(true)}
        currentPath={currentPath}
        onNavigate={navigateTo}
      />

      {/* Degradation or Error Banners */}
      {degradedMessage && (
        <PageBanner
          severity="degraded"
          title="Verified curatorial cache active"
          detail={degradedMessage}
        />
      )}
      {errorMessage && (
        <PageBanner
          severity="danger"
          title="Curatorial run notice"
          detail={errorMessage}
        />
      )}

      {/* Main Workbench Body */}
      <main className="sightline-main">
        {/* Row 2: Curator Approval Checkpoint Bar */}
        <ApprovalBar
          gate={session.gate}
          onOpenExplainer={() => setIsExplainerOpen(true)}
          simulateApproval={simulateApproval}
        />

        {/* Row 3: Curatorial Control Bar */}
        <CuratorialControlBar
          brief={curatorialBrief}
          onBriefChange={setCuratorialBrief}
          onRunCurate={handleRunCurate}
          onImportIiifJson={handleImportIiif}
          onEnterXr={() => handleViewModeChange("passthrough_room")}
          running={isInflight || simulateInflight}
        />

        {/* In-Flight Multi-Stage Planner Indicator */}
        {(isInflight || simulateInflight) && (
          <InFlightIndicator
            active={isInflight || simulateInflight}
            stageLabel={inflightStage.label}
          />
        )}

        {/* Row 4: Primary Curatorial Workspace (7fr 5fr split at >=1024px, stacked on mobile) */}
        <div className="grid-shell">
          <div className="curatorial-workbench__grid-4">
            {/* Left Column: Spatial Gallery Stage or Architectural Elevation Preview */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "var(--space-4)",
                minWidth: 0,
                width: "100%",
              }}
            >
              {SpatialStageComponent ? (
                <div data-result-region="spatial-stage" data-surface="spatial-stage">
                  <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "var(--space-2)" }}>
                    <ContextualHelpPopover regionId="spatial-stage" onOpenExplainer={() => setIsExplainerOpen(true)} />
                  </div>
                  <SpatialStageComponent
                    session={session}
                    issues={issues}
                    cones={cones}
                    theme={theme}
                  />
                </div>
              ) : (
                <ElevationFallbackSvg
                  model={model}
                  cones={cones}
                  viewMode={model.viewMode}
                  selectedMountId={model.selectedMountId}
                  onSelectMountId={handleSelectMount}
                  onOpenExplainer={() => setIsExplainerOpen(true)}
                  onRunDemo={() => handleRunCurate("Botanical studies")}
                />
              )}
            </div>

            {/* Right Column: ADA Compliance Verdict Panel + Curatorial Activity Feed */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "var(--space-5)",
                minWidth: 0,
                width: "100%",
              }}
            >
              {/* Compliance Verdict Panel carries route /'s SOLE data-demo-focus */}
              <ComplianceVerdictPanel
                model={model}
                issues={issues}
                cones={cones}
                inFlight={isInflight || simulateInflight}
                inFlightLabel={(isInflight || simulateInflight) ? inflightStage.label : null}
                onRepairIssue={handleRepairIssue}
                onOpenExplainer={() => setIsExplainerOpen(true)}
                widestMetricTestMode={widestMetrics}
              />

              <ActivityFeedPanel
                entries={traceEntries}
                selectedMountId={model.selectedMountId}
                onSelectEntity={handleSelectMount}
                onOpenExplainer={() => setIsExplainerOpen(true)}
              />
            </div>
          </div>
        </div>

        {/* Row 5: Curatorial Timeline Milestone Scrubber & Manual Spatial Tool Runner */}
        <TimelineAndManualRunner
          session={session}
          onExportManifest={handleExportManifest}
          onOpenExplainer={() => setIsExplainerOpen(true)}
        />
      </main>

      {/* Explainer Modal */}
      <ExplainerModal
        open={isExplainerOpen}
        onClose={() => setIsExplainerOpen(false)}
        onRunDemo={() => {
          setIsExplainerOpen(false);
          handleRunCurate("Botanical studies");
        }}
      />

      {/* System Toast Notification Container */}
      <ToastHost toast={activeToast} onDismiss={() => setActiveToast(null)} />
    </div>
  );
}
