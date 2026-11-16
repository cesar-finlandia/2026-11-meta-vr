import { test, expect } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { attachConsoleErrorTracker, decideApprovalBar, waitForCuratorialSettle, waitForStageState } from "../support/fixtures";

type Win = {
  __exportRunTrace: () => { summary: Record<string, unknown>; entries: unknown[] };
  __SIGHTLINE_STATE__: { openErrorCount: number; mountCount: number };
};

test("curate from an empty gallery, approve, and meet the product-depth floor", async ({ page }) => {
  const tracker = attachConsoleErrorTracker(page);
  await page.goto("/?seed=empty");
  await waitForStageState(page);
  expect(await page.evaluate(() => (window as unknown as Win).__SIGHTLINE_STATE__.mountCount)).toBe(0);

  await page.getByRole("button", { name: "Botanical", exact: true }).click();
  await page.getByRole("button", { name: /Curate exhibition/ }).click();

  await decideApprovalBar(page, "Approve");
  await waitForCuratorialSettle(page);

  const doc = await page.evaluate(() => (window as unknown as Win).__exportRunTrace());
  const out = resolve(process.cwd(), "run-trace.json");
  writeFileSync(out, JSON.stringify(doc, null, 2) + "\n", "utf8");
  execFileSync(process.execPath, ["scripts/validate-run-trace.mjs", out], { stdio: "inherit" });

  const summary = doc.summary as { final_truth: { errors: number }; model_calls: number };
  // The UI tells the truth: on-screen numbers equal the trace numbers.
  await expect(page.locator("[data-metric-hero]").first()).toHaveText(String(summary.final_truth.errors));
  const state = await page.evaluate(() => (window as unknown as Win).__SIGHTLINE_STATE__);
  expect(state.openErrorCount).toBe(summary.final_truth.errors);
  expect(state.mountCount).toBeGreaterThan(0);

  tracker.assertClean();
});

test("rejecting the gallery pin keeps anchors unchanged and logs the refusal", async ({ page }) => {
  const tracker = attachConsoleErrorTracker(page);
  await page.goto("/?seed=needs-repair");
  await waitForStageState(page);
  const anchorCount = (): Promise<number> =>
    page.evaluate(() => JSON.parse(localStorage.getItem("sightline-spatial-anchors") ?? "[]").length);
  await expect.poll(anchorCount).toBeGreaterThanOrEqual(0);
  const anchorsBefore = await anchorCount();

  await page.getByRole("button", { name: "Botanical", exact: true }).click();
  await page.getByRole("button", { name: /Curate exhibition/ }).click();
  await decideApprovalBar(page, "Reject");
  await waitForCuratorialSettle(page);

  expect(await anchorCount()).toBe(anchorsBefore);
  await expect(page.locator('[data-result-region="activity-feed"]')).toContainText(/pin_spatial_anchor/);
  tracker.assertClean();
});
