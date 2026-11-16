import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
import { glLaunchArgs } from "./support/gl-args";

const remote = process.env.BASE_URL;
const baseURL = remote ?? "http://127.0.0.1:8787";

const winChrome = "C:\\Users\\cesar\\AppData\\Local\\ms-playwright\\chromium-1255\\chrome-win64\\chrome.exe";
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_PATH ?? (process.platform === "win32" && existsSync(winChrome) ? winChrome : undefined);

export default defineConfig({
  testDir: ".",
  testMatch: ["smoke.spec.ts", "scenarios/*.spec.ts"],
  workers: 1,
  timeout: 60000,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL,
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: { args: glLaunchArgs(), ...(executablePath ? { executablePath } : {}) },
  },
  webServer: remote
    ? undefined
    : {
        command: "npm run build && npm run start",
        url: "http://127.0.0.1:8787/api/health",
        reuseExistingServer: true,
        timeout: 180000,
        env: { SIGHTLINE_AI_MODE: "replay", PORT: "8787" },
      },
});
