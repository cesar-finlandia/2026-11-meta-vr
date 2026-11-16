import { expect, type Page } from "@playwright/test";

export interface ConsoleErrorTracker {
  errors: string[];
  allowlist: (exactSubstring: string) => void;
  assertClean: () => void;
}

/** Collects console.error and pageerror output; allowlisted substrings are dropped. */
export function attachConsoleErrorTracker(page: Page): ConsoleErrorTracker {
  const errors: string[] = [];
  const allowed: string[] = [];
  const push = (text: string): void => {
    if (allowed.some((a) => text.includes(a))) return;
    errors.push(text);
  };
  page.on("console", (m) => {
    if (m.type() === "error") push(m.text());
  });
  page.on("pageerror", (e) => push(String(e)));
  return {
    errors,
    allowlist: (s) => {
      allowed.push(s);
    },
    assertClean: () => {
      expect(errors, `console errors:\n${errors.join("\n")}`).toEqual([]);
    },
  };
}

/** Polls until trace length, revision and entity count are unchanged for 6 consecutive 250 ms ticks. */
export async function waitForCuratorialSettle(page: Page, timeoutMs = 45000): Promise<void> {
  const started = Date.now();
  let last = "";
  let stable = 0;
  while (stable < 6) {
    if (Date.now() - started > timeoutMs) throw new Error(`curatorial state did not settle within ${timeoutMs} ms (last: ${last})`);
    await page.waitForTimeout(250);
    const sig = await page.evaluate(() => {
      const w = window as unknown as {
        __runTrace?: unknown[];
        __SIGHTLINE_STATE__?: { revision: number; entityCount: number };
      };
      return `${w.__runTrace?.length ?? 0}:${w.__SIGHTLINE_STATE__?.revision ?? 0}:${w.__SIGHTLINE_STATE__?.entityCount ?? 0}`;
    });
    stable = sig === last ? stable + 1 : 0;
    last = sig;
  }
}

/** Clicks Approve or Reject strictly inside the approval bar and fails fast on a visible error banner. */
export async function decideApprovalBar(page: Page, decision: "Approve" | "Reject"): Promise<void> {
  const testId = decision === "Approve" ? "approval-approve-btn" : "approval-reject-btn";
  const button = page.locator('[data-result-region="approval-bar"]').getByTestId(testId);
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (await button.isVisible().catch(() => false)) {
      await button.click();
      return;
    }
    const banner = page.locator('[role="alert"]').filter({ hasNotText: /checkpoint/i }).first();
    if (await banner.isVisible().catch(() => false)) {
      throw new Error(`error banner before approval bar: ${(await banner.innerText()).slice(0, 300)}`);
    }
    await page.waitForTimeout(200);
  }
  throw new Error(`${decision} button never appeared in the approval bar`);
}

/** Waits until the 3D stage has published its state hook (set in an effect after first paint). */
export async function waitForStageState(page: Page): Promise<void> {
  await page.waitForSelector('[data-demo-3d="sightline-gallery"]', { timeout: 30000 });
  await page.waitForFunction(() => Boolean((window as unknown as { __SIGHTLINE_STATE__?: unknown }).__SIGHTLINE_STATE__), null, { timeout: 30000 });
}
