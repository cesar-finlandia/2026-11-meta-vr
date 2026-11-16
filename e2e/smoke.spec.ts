import { test, expect } from "@playwright/test";
import { attachConsoleErrorTracker, decideApprovalBar, waitForCuratorialSettle, waitForStageState } from "./support/fixtures";

/**
 * Reads BASE_URL through the Playwright config, so the same spec runs unchanged against
 * localhost and a deployed Cloud Run URL.
 */
test("smoke: health, first paint, 3D stage and one repair", async ({ page, baseURL }) => {
  const tracker = attachConsoleErrorTracker(page);

  const health = await page.request.get(`${baseURL}/api/health`);
  expect(health.ok()).toBeTruthy();
  expect((await health.json()).ok).toBe(true);

  await page.goto("/");
  await expect(page.getByText("Every sightline, proven before hanging.").first()).toBeVisible();
  await waitForStageState(page);
  const entityCount = await page.evaluate(() => (window as unknown as { __SIGHTLINE_STATE__: { entityCount: number } }).__SIGHTLINE_STATE__.entityCount);
  expect(entityCount).toBeGreaterThanOrEqual(12);

  await page.getByTestId("shot-wheelchair-115").click();
  await page.goto("/?seed=needs-repair");
  await waitForStageState(page);
  const before = await page.evaluate(() => (window as unknown as { __SIGHTLINE_STATE__: { openErrorCount: number } }).__SIGHTLINE_STATE__.openErrorCount);
  expect(before).toBeGreaterThan(0);

  const repair = page.getByRole("button", { name: /Repair/ }).first();
  await repair.click();
  await decideApprovalBar(page, "Approve");
  await waitForCuratorialSettle(page);
  await expect
    .poll(async () => page.evaluate(() => (window as unknown as { __SIGHTLINE_STATE__: { openErrorCount: number } }).__SIGHTLINE_STATE__.openErrorCount), { timeout: 20000 })
    .toBeLessThan(before);

  tracker.assertClean();
  console.log(`smoke: PASS against ${baseURL}`);
});
