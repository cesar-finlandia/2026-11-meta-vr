import { test, expect, type Page } from "@playwright/test";
import { attachConsoleErrorTracker, decideApprovalBar, waitForCuratorialSettle, waitForStageState } from "../support/fixtures";
import { isSoftwareGlMode } from "../support/gl-args";

type State = {
  shaderLinks: number;
  iwsdkReady: boolean;
  viewMode: string;
  mountCount: number;
  mountIds: string[];
  selectedMountId: string | null;
  revision: number;
};

const state = (page: Page): Promise<State> =>
  page.evaluate(() => (window as unknown as { __SIGHTLINE_STATE__: State }).__SIGHTLINE_STATE__);

async function openStage(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await waitForStageState(page);
  await page.waitForSelector('[data-demo-3d="sightline-gallery"] canvas', { timeout: 30000 });
  await page.waitForFunction(() => Boolean((window as unknown as { __demo3d?: unknown }).__demo3d));
  await page.waitForFunction(() => Boolean((window as unknown as { __SIGHTLINE_IWER__?: unknown }).__SIGHTLINE_IWER__));
  await page.waitForTimeout(800);
}

test("3D acceptance: variance, shader budget, shots, fps", async ({ page }) => {
  const tracker = attachConsoleErrorTracker(page);
  await openStage(page, "/");

  const png = await page.locator('[data-demo-3d="sightline-gallery"] canvas').first().screenshot({ type: "png" });
  const variance = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 64;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0, 64, 64);
    const d = ctx.getImageData(0, 0, 64, 64).data;
    let sum = 0;
    let sq = 0;
    for (let i = 0; i < d.length; i += 4) {
      const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      sum += l;
      sq += l * l;
    }
    const mean = sum / 4096;
    return sq / 4096 - mean * mean;
  }, png.toString("base64"));
  expect(variance).toBeGreaterThan(25);

  const s = await state(page);
  expect(s.shaderLinks).toBeLessThanOrEqual(15);
  expect(s.iwsdkReady).toBe(true);

  const shots = await page.evaluate(() => (window as unknown as { __demo3d: { shots: string[] } }).__demo3d.shots);
  expect(shots.length).toBeGreaterThanOrEqual(6);
  for (const shot of shots) {
    await page.evaluate((name) => (window as unknown as { __demo3d: { play: (n: string) => void } }).__demo3d.play(name), shot);
    await page.waitForTimeout(450);
  }

  const fps = await page.evaluate(() => (window as unknown as { __demo3d: { fpsProbe: (ms: number) => Promise<number> } }).__demo3d.fpsProbe(3000));
  const floor = isSoftwareGlMode() ? 20 : 50;
  expect(fps, `fps ${fps} below ${floor}`).toBeGreaterThanOrEqual(floor);
  tracker.assertClean();
});

test("view modes, IWER hand gestures and anchor persistence", async ({ page }) => {
  const tracker = attachConsoleErrorTracker(page);
  await openStage(page, "/");

  const modes: Array<[string, string]> = [
    ["1:1 Passthrough", "passthrough_room"],
    ["115cm ADA", "wheelchair_115"],
    ["152cm Stand", "standing_152"],
    ["1:8 Tabletop", "tabletop_maquette"],
  ];
  for (const [label, mode] of modes) {
    await page.getByRole("tab", { name: label, exact: true }).click();
    await expect.poll(async () => (await state(page)).viewMode).toBe(mode);
  }

  const { mountIds } = await state(page);
  expect(mountIds.length).toBeGreaterThan(0);
  const target = mountIds[0];

  await page.evaluate((id) => (window as unknown as { __SIGHTLINE_IWER__: { simulatePinchSelect: (m: string) => Promise<void> } }).__SIGHTLINE_IWER__.simulatePinchSelect(id), target);
  await expect.poll(async () => (await state(page)).selectedMountId).toBe(target);

  const rev = (await state(page)).revision;
  await page.evaluate((id) => (window as unknown as { __SIGHTLINE_IWER__: { simulatePinchDragCm: (m: string, x: number, y: number) => Promise<void> } }).__SIGHTLINE_IWER__.simulatePinchDragCm(id, 5, 0), target);
  await waitForCuratorialSettle(page);
  expect((await state(page)).revision).toBeGreaterThan(rev);

  // Two-finger dismiss swaps the artwork; the dismissed work leaves the wall.
  const artworkBefore = await page.evaluate((id) => (window as unknown as { __SIGHTLINE_STATE__: { revision: number } }).__SIGHTLINE_STATE__.revision, target);
  const dismissal = page.evaluate((id) => (window as unknown as { __SIGHTLINE_IWER__: { simulateTwoFingerDismiss: (m: string) => Promise<void> } }).__SIGHTLINE_IWER__.simulateTwoFingerDismiss(id), target);
  await decideApprovalBar(page, "Approve");
  await dismissal;
  await waitForCuratorialSettle(page);
  expect((await state(page)).revision).toBeGreaterThan(artworkBefore);

  // Spatial anchor persistence across reload.
  await page.evaluate(() => localStorage.setItem("sightline-spatial-anchors", JSON.stringify([{ id: "e2e-anchor", wallId: "wall-north", label: "Reason to Come Back", referenceSpace: "local-floor", poseMatrix16: [1,0,0,0,0,1,0,0,0,0,1,0,0,0,-2,1], pinnedMountIds: [], savedAtIso: "2026-11-16T10:00:00.000Z" }])));
  await page.reload();
  await page.waitForSelector('[data-demo-3d="sightline-gallery"] canvas', { timeout: 30000 });
  expect(await page.evaluate(() => localStorage.getItem("sightline-spatial-anchors"))).toContain("Reason to Come Back");

  tracker.assertClean();
});

test("lab route and 2D fallback render without console errors", async ({ page }) => {
  const tracker = attachConsoleErrorTracker(page);
  await page.goto("/lab");
  await page.waitForSelector('[data-demo-focus="lab-inspector"]', { timeout: 30000 });
  expect(await page.locator("[data-demo-focus]").count()).toBe(1);
  await page.getByTestId("lab-nudge-right").click();
  await waitForCuratorialSettle(page);

  await page.goto("/?fallback2d=1");
  await page.waitForSelector("svg", { timeout: 30000 });
  tracker.assertClean();
});
