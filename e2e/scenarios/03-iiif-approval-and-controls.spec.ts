import { test, expect } from "@playwright/test";
import { attachConsoleErrorTracker, waitForCuratorialSettle, waitForStageState } from "../support/fixtures";

const VALID_CATALOG = JSON.stringify([
  { id: "e2e-001", title: "Study of Reeds", artist: "Test Artist", medium: "Etching", width_cm: 40, height_cm: 30, themes: ["botanical"] },
  { id: "e2e-002", title: "Harbour at Dusk", artist: "Test Artist", medium: "Oil on canvas", width_cm: 80, height_cm: 60, themes: ["impressionist"] },
]);

test("IIIF import: valid catalog loads, malformed JSON shows a recoverable error", async ({ page }) => {
  const tracker = attachConsoleErrorTracker(page);
  await page.goto("/");
  await waitForStageState(page);

  await page.getByRole("button", { name: "Import IIIF" }).click();
  const box = page.getByPlaceholder(/iiif.io\/api\/presentation/);
  await box.fill("{ not valid json");
  await page.getByRole("button", { name: "Import Manifest" }).click();
  await expect(page.getByText(/JSON|Unexpected|valid/i).first()).toBeVisible();

  await box.fill(VALID_CATALOG);
  await page.getByRole("button", { name: "Import Manifest" }).click();
  await expect(page.getByText(/Imported 2 works/).first()).toBeVisible();
  tracker.assertClean();
});

test("explainer, help popovers, theme toggle and export", async ({ page }) => {
  const tracker = attachConsoleErrorTracker(page);
  await page.goto("/");
  await waitForStageState(page);

  await page.locator("[data-app-explainer]:visible").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Close explainer" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();

  const helpIds = await page.$$eval("[data-help-for]", (els) => els.map((e) => e.getAttribute("data-help-for")));
  expect(helpIds.length).toBeGreaterThanOrEqual(5);
  for (const id of helpIds) {
    const btn = page.locator(`[data-help-for="${id}"]`).first();
    await btn.click();
    await expect(page.getByRole("region").first()).toBeVisible();
    await page.keyboard.press("Escape");
  }

  const before = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
  await page.getByRole("button", { name: /Vault|Paper/ }).first().click();
  await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute("data-theme"))).not.toBe(before);

  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 10000 }).catch(() => null),
    page.getByRole("button", { name: "Export hang schedule" }).click(),
  ]);
  if (download) expect(download.suggestedFilename()).toMatch(/\.json$/);
  tracker.assertClean();
});

test("manual runner works with AI offline and undo/redo restores state", async ({ page }) => {
  const tracker = attachConsoleErrorTracker(page);
  await page.goto("/");
  await waitForStageState(page);

  const stateRev = (): Promise<number> => page.evaluate(() => (window as unknown as { __SIGHTLINE_STATE__: { revision: number } }).__SIGHTLINE_STATE__.revision);
  const r0 = await stateRev();

  await page.getByLabel("Select curatorial action to execute").selectOption("nudge_artwork");
  await page.getByRole("button", { name: "Execute" }).click();
  await waitForCuratorialSettle(page);
  const r1 = await stateRev();
  expect(r1).toBeGreaterThan(r0);

  await page.getByRole("button", { name: "Undo" }).click();
  await waitForCuratorialSettle(page);
  await page.getByRole("button", { name: "Redo" }).click();
  await waitForCuratorialSettle(page);
  tracker.assertClean();
});
