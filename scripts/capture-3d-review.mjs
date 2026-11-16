/**
 * 3D capture + assertion runner for Sightline Studio.
 * Builds the client, serves it with vite preview, drives the spatial canvas in Chromium
 * (hardware ANGLE first, SwiftShader fallback), asserts the 3D acceptance gates and saves
 * review screenshots into design_documents/3d-screenshots/.
 */
import { existsSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { preview, build } from "vite";
import { chromium } from "@playwright/test";

const ROOT = resolve(process.cwd());
const OUT = join(ROOT, "design_documents", "3d-screenshots");
mkdirSync(OUT, { recursive: true });

const ARG_SETS = [
  ["--use-angle=d3d11", "--ignore-gpu-blocklist"],
  ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
];

function launchOptions(args) {
  const opts = { headless: true, args };
  const win = "C:\\Users\\cesar\\AppData\\Local\\ms-playwright\\chromium-1255\\chrome-win64\\chrome.exe";
  if (process.env.PLAYWRIGHT_CHROMIUM_PATH) opts.executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
  else if (existsSync(win)) opts.executablePath = win;
  return opts;
}

async function frameVariance(page, selector) {
  const buf = await page.locator(selector).first().screenshot({ type: "png" });
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = "data:image/png;base64," + b64;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 64;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0, 64, 64);
    const d = ctx.getImageData(0, 0, 64, 64).data;
    let sum = 0;
    let sq = 0;
    const n = 64 * 64;
    for (let i = 0; i < d.length; i += 4) {
      const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      sum += l;
      sq += l * l;
    }
    const mean = sum / n;
    return sq / n - mean * mean;
  }, buf.toString("base64"));
}

async function run(args, baseUrl) {
  const browser = await chromium.launch(launchOptions(args));
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    page.on("pageerror", (e) => errors.push(String(e)));

    await page.goto(`${baseUrl}/?theme=paper`);
    await page.waitForSelector('[data-demo-3d="sightline-gallery"]', { timeout: 30000 });
    await page.waitForFunction(() => !!window.__demo3d, null, { timeout: 30000 });
    await page.waitForTimeout(1200);

    const sel = '[data-demo-3d="sightline-gallery"] canvas';
    const variance = await frameVariance(page, sel);
    if (!(variance > 25)) throw new Error(`blank canvas: variance ${variance.toFixed(1)} <= 25`);

    const shaderLinks = await page.evaluate(() => window.__SIGHTLINE_SHADER_LINKS__ ?? 0);
    if (shaderLinks > 15) throw new Error(`shaderLinks ${shaderLinks} > 15`);

    const shots = await page.evaluate(() => window.__demo3d.shots);
    if (shots.length < 6) throw new Error(`only ${shots.length} shots: ${shots.join(",")}`);

    await page.addStyleTag({ content: "header, [role=banner] { visibility: hidden !important; }" });
    await page.evaluate(() => window.__demo3d.play("overview"));
    await page.click('[data-testid="shot-overview"]');
    await page.waitForTimeout(1500);
    await page.locator('[data-demo-3d="sightline-gallery"]').first().screenshot({
      path: join(OUT, "overview-1280x720.png"),
    });

    await page.click('[data-testid="shot-wheelchair-115"]');
    await page.waitForTimeout(1500);
    await page.locator('[data-demo-3d="sightline-gallery"]').first().screenshot({
      path: join(OUT, "focus-wheelchair-1280x720.png"),
    });
    await page.screenshot({ path: join(OUT, "page-full-1280x720.png") });

    const fps = await page.evaluate(() => window.__demo3d.fpsProbe(2000));
    if (!(fps >= 20)) throw new Error(`fps ${fps} < 20`);

    await page.goto(`${baseUrl}/lab?theme=paper`);
    await page.waitForSelector("[data-demo-focus]", { timeout: 30000 });
    await page.waitForTimeout(800);
    const focusCount = await page.locator("[data-demo-focus]").count();
    if (focusCount !== 1) throw new Error(`/lab has ${focusCount} [data-demo-focus] (want 1)`);
    await page.screenshot({ path: join(OUT, "lab-1280x720.png") });

    if (errors.length) throw new Error(`console errors:\n${errors.join("\n")}`);
    return { variance, shaderLinks, shots: shots.length, fps };
  } finally {
    await browser.close();
  }
}

async function main() {
  await build({ logLevel: "warn" });
  const server = await preview({ preview: { port: 4174 } });
  const baseUrl = `http://localhost:${server.config.preview.port || 4174}`;
  let result;
  let lastErr;
  try {
    for (const args of ARG_SETS) {
      try {
        result = await run(args, baseUrl);
        console.log(`renderer args: ${args.join(" ")}`);
        break;
      } catch (e) {
        lastErr = e;
        console.warn(`attempt failed (${args[0]}): ${e.message}`);
      }
    }
  } finally {
    await new Promise((r) => server.httpServer.close(r));
  }
  if (!result) {
    console.error("3d-capture FAILED:", lastErr?.message);
    process.exit(1);
  }
  console.log(`measured: variance=${result.variance.toFixed(0)} shaderLinks=${result.shaderLinks} shots=${result.shots} fps=${result.fps}`);
  console.log("3d-capture: variance OK, shaderLinks<=15 OK, shots OK, fps OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
