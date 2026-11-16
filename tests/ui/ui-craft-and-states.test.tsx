// @vitest-environment jsdom
/**
 * UI Craft, component state, theme persistence, and total-template verification tests.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Brandmark } from "../../src/ui/Brandmark";
import { ThemeProvider, useTheme } from "../../src/ui/theme";
import { ExplainerModal } from "../../src/ui/components/ExplainerModal";
import { ContextualHelpPopover } from "../../src/ui/components/ContextualHelpPopover";
import { HELP_CONTENT, type ResultRegionId } from "../../src/ui/help-content";
import { ApprovalBar } from "../../src/ui/components/ApprovalBar";
import { createApprovalGate } from "../../src/domain/session";
import { PageBanner, InFlightIndicator } from "../../src/ui/components/SystemMessages";
import { App } from "../../src/App";

// Configure React act environment for JSDOM
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("UI Craft and State Verification", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.dataset.theme = "paper";
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("WU-UI-02: Brandmark lockup renders canonical slogan and geometry", async () => {
    await act(async () => {
      root.render(<Brandmark variant="header" />);
    });

    const mark = container.querySelector(".brandmark");
    expect(mark).not.toBeNull();
    const slogan = container.querySelector(".brandmark__slogan");
    expect(slogan?.textContent).toBe("Every sightline, proven before hanging.");

    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("viewBox")).toBe("0 0 32 32");
  });

  it("WU-UI-03: ThemeProvider toggles and persists theme in localStorage", async () => {
    function ThemeTestComponent() {
      const { theme, toggleTheme } = useTheme();
      return (
        <button type="button" data-testid="theme-toggle" onClick={toggleTheme}>
          Current: {theme}
        </button>
      );
    }

    await act(async () => {
      root.render(
        <ThemeProvider>
          <ThemeTestComponent />
        </ThemeProvider>
      );
    });

    const btn = container.querySelector('[data-testid="theme-toggle"]') as HTMLButtonElement;
    expect(btn.textContent).toContain("Current: paper");
    expect(document.documentElement.dataset.theme).toBe("paper");

    // Toggle to vault (dark)
    await act(async () => {
      btn.click();
    });

    expect(btn.textContent).toContain("Current: dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("sightline-theme")).toBe("dark");

    // Toggle back to paper
    await act(async () => {
      btn.click();
    });

    expect(btn.textContent).toContain("Current: paper");
    expect(document.documentElement.dataset.theme).toBe("paper");
    expect(localStorage.getItem("sightline-theme")).toBe("paper");
  });

  it("WU-UI-04: ExplainerModal opens, displays steps, and closes on Escape", async () => {
    let closed = false;
    let demoRun = false;

    await act(async () => {
      root.render(
        <ExplainerModal
          open={true}
          onClose={() => {
            closed = true;
          }}
          onRunDemo={() => {
            demoRun = true;
          }}
        />
      );
    });

    expect(container.textContent).toContain("How Sightline Studio Works");
    expect(container.textContent).toContain("Scan room walls in WebXR passthrough");
    expect(container.textContent).toContain("Run botanical curation demo");

    // Press Escape
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    expect(closed).toBe(true);

    // Click CTA
    const cta = container.querySelector(".btn--primary") as HTMLButtonElement;
    await act(async () => {
      cta.click();
    });
    expect(demoRun).toBe(true);
  });

  it("WU-UI-04B: ContextualHelpPopover renders across all 5 result regions with accessible dialog", async () => {
    const regions: ResultRegionId[] = [
      "spatial-stage",
      "truth-compliance",
      "approval-bar",
      "activity-feed",
      "manual-runner",
    ];

    for (const r of regions) {
      await act(async () => {
        root.render(<ContextualHelpPopover key={r} regionId={r} />);
      });

      const helpBtn = container.querySelector(`[data-help-for="${r}"]`) as HTMLButtonElement;
      expect(helpBtn).not.toBeNull();
      expect(helpBtn.getAttribute("aria-label")).toBe(HELP_CONTENT[r].ariaLabel);

      // Open popover
      await act(async () => {
        helpBtn.click();
      });

      const popover = container.querySelector('[role="region"]');
      expect(popover).not.toBeNull();
      expect(popover?.textContent).toContain(HELP_CONTENT[r].title);
      expect(popover?.textContent).toContain(HELP_CONTENT[r].body);
    }
  });

  it("WU-UI-05: Total-template messages have zero : . or undefined", async () => {
    await act(async () => {
      root.render(
        <div>
          <PageBanner
            severity="degraded"
            title="Verified curatorial cache active"
            detail="Running from verified curatorial replay cache"
          />
          <PageBanner
            severity="danger"
            title="Curatorial run notice"
            detail="Live model request did not complete"
          />
          <InFlightIndicator
            active={true}
            stageLabel="Positioning framed works and placards along 145 cm datum"
          />
        </div>
      );
    });

    const rendered = container.textContent || "";
    expect(rendered).toContain("Running from verified curatorial replay cache");
    expect(rendered).toContain("Live model request did not complete");
    expect(rendered).toContain("Positioning framed works and placards along 145 cm datum");

    // Zero broken template artifacts
    expect(/(:\s*[.。]|\s\.\s*$|\bvia none\b|\bundefined\b|\bnull\b)/.test(rendered)).toBe(false);
  });

  it("WU-UI-05B: ApprovalBar displays checkpoint and triggers gate approval/rejection", async () => {
    const gate = createApprovalGate(true);

    await act(async () => {
      root.render(<ApprovalBar gate={gate} />);
    });

    // Currently no pending approval
    expect(container.textContent).toContain("Approval checkpoint active");

    // Simulate an approval request on the gate
    let approvedResult: boolean | null = null;
    act(() => {
      gate
        .requestApproval({
          actionName: "swap_rejected_artwork",
          plainSummary: "Replace over-illuminated paper print with oil painting",
          args: { mountId: "mount-1" },
          source: "agent",
        })
        .then((res) => {
          approvedResult = res.approved;
        });
    });

    // Re-render to observe state
    await act(async () => {
      root.render(<ApprovalBar gate={gate} />);
    });

    const pendingSummary = container.querySelector(".subject");
    expect(pendingSummary?.textContent).toContain("Replace over-illuminated paper print with oil painting");

    // Click Approve
    const approveBtn = container.querySelector('[data-testid="approval-approve-btn"]') as HTMLButtonElement;
    expect(approveBtn).not.toBeNull();

    await act(async () => {
      approveBtn.click();
    });

    expect(approvedResult).toBe(true);
  });

  it("WU-UI-05C: Workbench App mounts with single data-demo-focus and all result regions", async () => {
    await act(async () => {
      root.render(
        <ThemeProvider>
          <App />
        </ThemeProvider>
      );
    });

    // Exactly ONE data-demo-focus per route
    const foci = container.querySelectorAll("[data-demo-focus]");
    expect(foci.length).toBe(1);
    expect(foci[0].getAttribute("data-demo-focus")).toBe("curatorial-verdict");

    // All 5 result regions present
    const regions = container.querySelectorAll("[data-result-region]");
    expect(regions.length).toBe(5);

    // Hero metric present and tagged
    const hero = container.querySelector('[data-metric-hero="true"]');
    expect(hero).not.toBeNull();
  });
});
