import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { attachConsoleErrorTracker } from "../support/fixtures";
import { runDemoScenario, type DemoScenarioDocument } from "../support/scenario-runner";

test("demo scenario runs end to end and /watch has a single focus target", async ({ page, baseURL }) => {
  const tracker = attachConsoleErrorTracker(page);
  const scenario = JSON.parse(readFileSync(resolve(process.cwd(), "design_documents", "demo-scenario.json"), "utf8")) as DemoScenarioDocument;

  const result = await runDemoScenario(page, scenario, baseURL);
  expect(result.completedStepIds).toEqual(scenario.steps.map((s) => s.id));

  expect(await page.locator("[data-demo-focus]").count()).toBe(1);
  tracker.assertClean();
});
