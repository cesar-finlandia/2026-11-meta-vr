/**
 * Deterministic executor for design_documents/demo-scenario.json steps.
 */
import type { Page } from "@playwright/test";

type Action = DemoScenarioDocument["steps"][number]["actions"][number];

export interface DemoScenarioDocument {
  version: "1.0.0";
  base_url: string;
  viewport: { width: number; height: number };
  steps: Array<{
    id: string;
    title: string;
    actions: Array<
      | { route: string }
      | { click: string; role?: string }
      | { type: { label: string; value: string } }
      | { press: string }
      | { wait_ms: number }
      | { play3d: string }
      | { expect_text: string }
    >;
    settle_ms: number;
  }>;
  stills: Array<{
    id: string;
    after_step: string;
    selector: string | null;
    claim: string;
    claim_id: string | null;
    alt: string;
  }>;
  hero: { from_step: string; to_step: string } | null;
}

const WAIT_FOR_ELEMENT_MS = 30000;

/** One handler per action key; the key present on the action picks the handler. */
const HANDLERS: Record<string, (page: Page, action: Action, root: string) => Promise<void>> = {
  route: async (page, action, root) => {
    await page.goto(root + (action as { route: string }).route);
  },
  click: async (page, action) => {
    const { click, role } = action as { click: string; role?: string };
    const locator = role
      ? page.getByRole(role as "button", { name: click, exact: true })
      : page.getByText(click, { exact: true });
    await locator.first().click({ timeout: WAIT_FOR_ELEMENT_MS });
  },
  type: async (page, action) => {
    const { type } = action as { type: { label: string; value: string } };
    await page.getByLabel(type.label).first().fill(type.value);
  },
  press: async (page, action) => {
    await page.keyboard.press((action as { press: string }).press);
  },
  wait_ms: async (page, action) => {
    await page.waitForTimeout((action as { wait_ms: number }).wait_ms);
  },
  play3d: async (page, action) => {
    const shot = (action as { play3d: string }).play3d;
    await page.evaluate((name) => {
      (window as unknown as { __demo3d?: { play: (n: string) => void } }).__demo3d?.play(name);
    }, shot);
  },
  expect_text: async (page, action) => {
    await page
      .getByText((action as { expect_text: string }).expect_text)
      .first()
      .waitFor({ state: "visible", timeout: WAIT_FOR_ELEMENT_MS });
  },
};

export async function runDemoScenario(
  page: Page,
  scenario: DemoScenarioDocument,
  baseUrlOverride?: string
): Promise<{ completedStepIds: string[] }> {
  const root = (baseUrlOverride ?? scenario.base_url).replace(/\/+$/, "");
  await page.setViewportSize(scenario.viewport);

  const completedStepIds: string[] = [];
  for (const step of scenario.steps) {
    for (const action of step.actions) {
      const key = Object.keys(action)[0];
      const handler = HANDLERS[key];
      if (!handler) throw new Error(`step ${step.id}: unknown action "${key}"`);
      await handler(page, action, root);
    }
    await page.waitForTimeout(step.settle_ms);
    completedStepIds.push(step.id);
  }
  return { completedStepIds };
}
