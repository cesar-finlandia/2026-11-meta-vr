/**
 * Browser UI control for the evaluation control arm: generic screen actions
 * (snapshot, click, type, press) against the running app, with no access to the typed actions.
 */
import { chromium, type Browser, type Page } from "@playwright/test";
import { existsSync } from "node:fs";

export interface UiControlTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
}

const WIN_CHROME = "C:\\Users\\cesar\\AppData\\Local\\ms-playwright\\chromium-1255\\chrome-win64\\chrome.exe";
const ROLES = ["button", "link", "tab", "menuitem", "checkbox", "option"];

export async function createUiControlSession(baseUrl: string, seed: string): Promise<{
  page: Page;
  browser: Browser;
  tools: UiControlTool[];
  readAppState: () => Promise<Record<string, unknown>>;
  close: () => Promise<void>;
}> {
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH ?? (existsSync(WIN_CHROME) ? WIN_CHROME : undefined);
  const browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
    args: ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--disable-frame-rate-limit"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${baseUrl}/?seed=${encodeURIComponent(seed)}`);
  await page.waitForFunction(() => Boolean((window as unknown as { __SIGHTLINE_SESSION__?: unknown }).__SIGHTLINE_SESSION__), null, { timeout: 30000 });
  await page.waitForTimeout(800);

  const tools: UiControlTool[] = [
    {
      name: "ui_snapshot",
      description: "Read what is on the screen as an outline of roles and names. Call this first and after every change.",
      inputSchema: { type: "object", additionalProperties: false, properties: {} },
      execute: async () => ({ ok: true, summary: (await page.locator("body").ariaSnapshot()).slice(0, 6000) }),
    },
    {
      name: "ui_click",
      description: 'Click the element whose visible name is `text`. Example: ui_click({"text":"Undo","role":"button"}).',
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["text"],
        properties: {
          text: { type: "string", description: "The visible name of the element to click." },
          role: { type: "string", description: "The role of the element to click.", enum: ROLES },
        },
      },
      execute: async (args) => {
        const text = String(args.text ?? "");
        const role = args.role === undefined ? undefined : String(args.role);
        if (!text || (role !== undefined && !ROLES.includes(role))) return { ok: false, error: "Invalid arguments", invalid_args: true };
        const target = role ? page.getByRole(role as "button", { name: text }).first() : page.getByText(text, { exact: false }).first();
        if ((await target.count()) === 0) return { ok: false, error: `No element named "${text}" is on the screen. Call ui_snapshot to see what is there.` };
        await target.click({ timeout: 4000 });
        await page.waitForTimeout(300);
        return { ok: true, summary: `Clicked "${text}".` };
      },
    },
    {
      name: "ui_type",
      description: "Type `value` into the field labelled `label`, replacing what is there.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["label", "value"],
        properties: {
          label: { type: "string", description: "The label of the field to type into." },
          value: { type: "string", description: "The text to type." },
        },
      },
      execute: async (args) => {
        if (typeof args.label !== "string" || typeof args.value !== "string") return { ok: false, error: "Invalid arguments", invalid_args: true };
        const field = page.getByLabel(args.label, { exact: false }).first();
        if ((await field.count()) === 0) return { ok: false, error: `No field labelled "${args.label}" is on the screen.` };
        await field.fill(args.value, { timeout: 4000 });
        return { ok: true, summary: `Typed into "${args.label}".` };
      },
    },
    {
      name: "ui_press",
      description: "Press one keyboard key such as Enter or Escape.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["key"],
        properties: { key: { type: "string", description: "The key to press." } },
      },
      execute: async (args) => {
        if (typeof args.key !== "string") return { ok: false, error: "Invalid arguments", invalid_args: true };
        await page.keyboard.press(args.key);
        await page.waitForTimeout(200);
        return { ok: true, summary: `Pressed ${args.key}.` };
      },
    },
  ];

  return {
    page,
    browser,
    tools,
    readAppState: () =>
      page.evaluate(() => {
        const s = (window as unknown as { __SIGHTLINE_SESSION__: { getModel: () => unknown; audit: () => unknown } }).__SIGHTLINE_SESSION__;
        return { model: s.getModel(), issues: s.audit() } as Record<string, unknown>;
      }),
    close: async () => {
      await browser.close();
    },
  };
}
