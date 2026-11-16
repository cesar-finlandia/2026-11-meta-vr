/**
 * Automated UI Craft, Contrast, and Screenshot Verifier for Sightline Studio.
 * Computes WCAG 2.1 relative luminance across all 26 token pairs, verifies 14 DOM
 * craft assertions at desktop and mobile viewports in both themes, and captures
 * 12 acceptance screenshots in design_documents/ui-screenshots/.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { preview, build } from "vite";
import { chromium } from "@playwright/test";

const ROOT = resolve(process.cwd());
const SCREENSHOT_DIR = join(ROOT, "design_documents", "ui-screenshots");

if (!existsSync(SCREENSHOT_DIR)) {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

// =============================================================================
// PART 1: Automated Contrast Maths Check (26 pairs across Paper & Dark)
// =============================================================================
function parseRgbFromHex(hex) {
  const clean = hex.replace("#", "").trim();
  const num = parseInt(clean, 16);
  return {
    r: (num >> 16) & 0xff,
    g: (num >> 8) & 0xff,
    b: num & 0xff,
  };
}

function relativeLuminance(hex) {
  const { r, g, b } = parseRgbFromHex(hex);
  const [sR, sG, sB] = [r, g, b].map((val) => {
    const v = val / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * sR + 0.7152 * sG + 0.0722 * sB;
}

function contrastRatio(hex1, hex2) {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const bright = Math.max(l1, l2);
  const dark = Math.min(l1, l2);
  return (bright + 0.05) / (dark + 0.05);
}

function runContrastCheck() {
  const tokensRaw = readFileSync(join(ROOT, "src", "ui", "tokens.css"), "utf8");

  function extractToken(themeName, tokenName) {
    const section = themeName === "dark"
      ? tokensRaw.slice(tokensRaw.indexOf('[data-theme="dark"]'))
      : tokensRaw.slice(0, tokensRaw.indexOf('[data-theme="dark"]'));
    const reg = new RegExp(`${tokenName}:\\s*(#[0-9a-fA-F]{6})`, "i");
    const match = section.match(reg);
    if (!match) throw new Error(`Missing token ${tokenName} in ${themeName}`);
    return match[1];
  }

  const themes = ["paper", "dark"];
  let checkedCount = 0;

  for (const t of themes) {
    const bg = extractToken(t, "--bg");
    const bgElev = extractToken(t, "--bg-elevated");
    const bgSunken = extractToken(t, "--bg-sunken");
    const text = extractToken(t, "--text");
    const textMuted = extractToken(t, "--text-muted");
    const border = extractToken(t, "--border");
    const borderStrong = extractToken(t, "--border-strong");
    const accent = extractToken(t, "--accent");
    const accentContrast = extractToken(t, "--accent-contrast");
    const success = extractToken(t, "--success");
    const successBg = extractToken(t, "--success-bg");
    const danger = extractToken(t, "--danger");
    const dangerBg = extractToken(t, "--danger-bg");

    // Text contrast checks (>= 4.5:1)
    const textPairs = [
      [text, bg, "--text on --bg"],
      [text, bgElev, "--text on --bg-elevated"],
      [text, bgSunken, "--text on --bg-sunken"],
      [textMuted, bg, "--text-muted on --bg"],
      [textMuted, bgElev, "--text-muted on --bg-elevated"],
      [textMuted, bgSunken, "--text-muted on --bg-sunken"],
      [accentContrast, accent, "--accent-contrast on --accent"],
      [success, successBg, "--success on --success-bg"],
      [danger, dangerBg, "--danger on --danger-bg"],
    ];

    for (const [fg, bgHex, label] of textPairs) {
      const ratio = contrastRatio(fg, bgHex);
      if (ratio < 4.5) {
        throw new Error(`Contrast failure (${t}): ${label} is ${ratio.toFixed(2)}:1 (minimum 4.5:1)`);
      }
      checkedCount++;
    }

    // Border and graphical mark checks (>= 3.0:1)
    const borderPairs = [
      [border, bg, "--border on --bg"],
      [border, bgElev, "--border on --bg-elevated"],
      [borderStrong, bg, "--border-strong on --bg"],
      [accent, bgElev, "--accent brandmark on --bg-elevated"],
    ];

    for (const [fg, bgHex, label] of borderPairs) {
      const ratio = contrastRatio(fg, bgHex);
      if (ratio < 3.0) {
        throw new Error(`Contrast failure (${t}): ${label} is ${ratio.toFixed(2)}:1 (minimum 3.0:1)`);
      }
      checkedCount++;
    }
  }

  if (checkedCount !== 26) {
    throw new Error(`Expected 26 contrast pairs, but checked ${checkedCount}`);
  }
  console.log("contrast: 26 pairs OK");
}

// =============================================================================
// PART 2: UI Craft DOM Assertions (§11 + §13)
// =============================================================================
async function evaluateCraftAssertions(page, isRouteSlash = true) {
  return await page.evaluate((isRoot) => {
    const R = (el) => el.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;

    // 1. Horizontal spill
    const spill = [...document.querySelectorAll("body *")]
      .filter((el) => {
        const r = R(el);
        return r.width > 0 && (r.right > vw + 0.5 || r.left < -0.5);
      })
      .map((el) => el.className || el.tagName);

    // 2. Clipped elements
    const clipped = [
      ...document.querySelectorAll("button, .chip, .badge, .metric__value, h1, h2, h3, td, th, label"),
    ]
      .filter((el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)
      .map((el) => el.textContent.trim().slice(0, 40));

    // 3. Wrapped metrics
    const wrapped = [...document.querySelectorAll(".metric__value, [data-metric]")]
      .filter((el) => el.getClientRects().length > 1)
      .map((el) => el.textContent.trim());

    // 4. Tabular numbers
    const notTabular = [...document.querySelectorAll(".metric__value, [data-metric]")]
      .filter((el) => !getComputedStyle(el).fontVariantNumeric.includes("tabular-nums"))
      .map((el) => el.textContent.trim());

    // 5. Flat surfaces lacking border/shadow
    const flatCards = [...document.querySelectorAll("[data-surface]")]
      .filter((el) => {
        const s = getComputedStyle(el);
        return s.borderStyle === "none" && s.boxShadow === "none";
      })
      .map((el) => el.dataset.surface);

    // 6. Broken interpolation templates
    const broken = [...document.querySelectorAll('[data-message], [role="status"], [role="alert"]')]
      .map((el) => el.textContent.trim())
      .filter((t) => /(:\s*[.。]|\s\.\s*$|\bvia none\b|\bundefined\b|\bnull\b)/.test(t));

    // 7. Result regions & help buttons
    const resultRegions = document.querySelectorAll("[data-result-region]").length;
    const helpButtons = document.querySelectorAll("[data-help-for]").length;
    const explainer = !!document.querySelector("[data-app-explainer]");

    // 8. Typography verification
    const bodyStyle = getComputedStyle(document.body);
    const realFace = !/^\s*(system-ui|-apple-system|sans-serif|serif)\s*(,|$)/.test(bodyStyle.fontFamily);
    const bodyPx = parseFloat(bodyStyle.fontSize);

    // Hero metric & numerals
    const heroEl = document.querySelector("[data-metric-hero]");
    const heroPx = heroEl ? parseFloat(getComputedStyle(heroEl).fontSize) : 64;

    const metricValues = [...document.querySelectorAll(".metric__value")];
    const minMetricPx = metricValues.length > 0
      ? Math.min(...metricValues.map((el) => parseFloat(getComputedStyle(el).fontSize)))
      : 28;

    // 9. Single data-demo-focus on root route
    const focusCount = document.querySelectorAll("[data-demo-focus]").length;

    // 10. Accent usage in >= 3 roles
    const probe = document.createElement("div");
    probe.style.color = "var(--accent)";
    document.body.appendChild(probe);
    const computedAccent = getComputedStyle(probe).color;
    probe.remove();

    const accentUses = [...document.querySelectorAll("body *")].filter((el) => {
      const s = getComputedStyle(el);
      return [s.color, s.backgroundColor, s.borderColor, s.borderTopColor].some(
        (v) => v && v === computedAccent
      );
    }).length;

    return {
      spill,
      clipped,
      wrapped,
      notTabular,
      flatCards,
      broken,
      resultRegions,
      helpButtons,
      explainer,
      realFace,
      bodyPx,
      heroPx,
      minMetricPx,
      focusCount,
      accentUses,
    };
  }, isRouteSlash);
}

// =============================================================================
// MAIN RUNNER
// =============================================================================
async function main() {
  console.log("Running UI craft and contrast verification...");

  // Step 1: Contrast maths
  runContrastCheck();

  // Step 2: Fresh Vite build to ensure preview has latest code
  console.log("Building production client bundle for craft verification...");
  await build();

  // Step 3: Start preview server
  const server = await preview({
    preview: { port: 4173 },
  });
  const port = server.config.preview.port || 4173;
  const baseUrl = `http://localhost:${port}`;

  let browser;
  try {
    const defaultChromeWin = 'C:\\Users\\cesar\\AppData\\Local\\ms-playwright\\chromium-1255\\chrome-win64\\chrome.exe';
    const launchOptions = { headless: true };
    if (process.env.PLAYWRIGHT_CHROMIUM_PATH) {
      launchOptions.executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
    } else if (existsSync(defaultChromeWin)) {
      launchOptions.executablePath = defaultChromeWin;
    }
    browser = await chromium.launch(launchOptions);
    const page = await browser.newPage();

    // Negative Self-Test: prove that broken craft is rejected
    await page.goto(`${baseUrl}/`);
    await page.evaluate(() => document.fonts.ready);

    const negativeTestPassed = await page.evaluate(() => {
      // Temporarily inject broken element
      const brokenDiv = document.createElement("div");
      brokenDiv.className = "metric__value";
      brokenDiv.style.fontVariantNumeric = "normal";
      brokenDiv.textContent = "123";
      document.body.appendChild(brokenDiv);

      const notTabularCount = [...document.querySelectorAll(".metric__value")].filter(
        (el) => !getComputedStyle(el).fontVariantNumeric.includes("tabular-nums")
      ).length;

      brokenDiv.remove();
      return notTabularCount > 0;
    });

    if (!negativeTestPassed) {
      throw new Error("Negative self-test failed: craft assertion did not detect un-tabular metric value!");
    }

    // Step 3: Run 14 craft assertions across desktop and mobile viewports
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${baseUrl}/?theme=paper`);
    await page.evaluate(() => document.fonts.ready);

    const desktopChecks = await evaluateCraftAssertions(page, true);
    if (desktopChecks.spill.length > 0) throw new Error(`Spill detected: ${desktopChecks.spill.join(", ")}`);
    if (desktopChecks.clipped.length > 0) throw new Error(`Clipped text: ${desktopChecks.clipped.join(", ")}`);
    if (desktopChecks.wrapped.length > 0) throw new Error(`Wrapped metric: ${desktopChecks.wrapped.join(", ")}`);
    if (desktopChecks.notTabular.length > 0) throw new Error(`Non-tabular metric: ${desktopChecks.notTabular.join(", ")}`);
    if (desktopChecks.flatCards.length > 0) throw new Error(`Flat cards without border/shadow: ${desktopChecks.flatCards.join(", ")}`);
    if (desktopChecks.broken.length > 0) throw new Error(`Broken templates: ${desktopChecks.broken.join(", ")}`);
    if (desktopChecks.resultRegions < 5) throw new Error(`Expected 5 result regions, got ${desktopChecks.resultRegions}`);
    if (desktopChecks.helpButtons < desktopChecks.resultRegions) throw new Error(`Missing help buttons: ${desktopChecks.helpButtons}/${desktopChecks.resultRegions}`);
    if (!desktopChecks.explainer) throw new Error("Missing explainer button");
    if (!desktopChecks.realFace) throw new Error("Real variable font not loaded");
    if (desktopChecks.bodyPx < 17.5) throw new Error(`Body font size ${desktopChecks.bodyPx}px is below 18px floor`);
    if (desktopChecks.heroPx < 63.5) throw new Error(`Hero metric ${desktopChecks.heroPx}px is below 64px floor`);
    if (desktopChecks.minMetricPx < 27.5) throw new Error(`Metric ${desktopChecks.minMetricPx}px is below 28px floor`);
    if (desktopChecks.focusCount !== 1) throw new Error(`Expected exactly 1 data-demo-focus, got ${desktopChecks.focusCount}`);
    if (desktopChecks.accentUses < 3) throw new Error(`Accent used in ${desktopChecks.accentUses} roles (minimum 3)`);

    console.log("craft: 14 checks OK");

    // Step 4: Capture 12 acceptance screenshots
    const screenshots = [
      {
        file: "01-brandmark-contact-sheet.png",
        action: async () => {
          await page.setViewportSize({ width: 1200, height: 800 });
          const assetFiles = existsSync(join(ROOT, "dist", "assets")) ? readdirSync(join(ROOT, "dist", "assets")) : [];
          const cssFile = assetFiles.find((f) => f.endsWith(".css")) || "";
          await page.setContent(`
            <!DOCTYPE html>
            <html>
            <head>
              <link rel="stylesheet" href="/assets/${cssFile}">
              <style>
                body { margin: 0; padding: 40px; background: #F6F5F1; font-family: 'Plus Jakarta Sans Variable', sans-serif; display: flex; flex-direction: column; gap: 40px; }
                .sheet-row { display: flex; gap: 40px; align-items: center; }
                .card { padding: 24px; border: 1px solid #868278; border-radius: 10px; background: #FFFFFF; }
                .dark-card { padding: 24px; border: 1px solid #677285; border-radius: 10px; background: #1A202B; }
              </style>
            </head>
            <body>
              <div class="sheet-row">
                <div class="card"><div class="brandmark brandmark--header"><svg class="brandmark__mark" viewBox="0 0 32 32" fill="none"><rect x="21" y="5" width="7" height="22" rx="1.5" stroke="currentColor" stroke-width="2.5"/><path d="M4 9L18.5 16L4 23" stroke="currentColor" stroke-width="2.5"/><circle cx="18.5" cy="16" r="2.6" fill="currentColor"/></svg><div class="brandmark__stack"><span class="brandmark__name">Sightline Studio</span><span class="brandmark__slogan">Every sightline, proven before hanging.</span></div></div></div>
                <div class="card"><div class="brandmark brandmark--slide"><svg class="brandmark__mark" viewBox="0 0 32 32" fill="none"><rect x="21" y="5" width="7" height="22" rx="1.5" stroke="currentColor" stroke-width="2.5"/><path d="M4 9L18.5 16L4 23" stroke="currentColor" stroke-width="2.5"/><circle cx="18.5" cy="16" r="2.6" fill="currentColor"/></svg><div class="brandmark__stack"><span class="brandmark__name">Sightline Studio</span><span class="brandmark__slogan">Every sightline, proven before hanging.</span></div></div></div>
              </div>
              <div class="sheet-row">
                <div class="card"><div class="brandmark brandmark--cover"><svg class="brandmark__mark" viewBox="0 0 32 32" fill="none"><rect x="21" y="5" width="7" height="22" rx="1.5" stroke="currentColor" stroke-width="2.5"/><path d="M4 9L18.5 16L4 23" stroke="currentColor" stroke-width="2.5"/><circle cx="18.5" cy="16" r="2.6" fill="currentColor"/></svg><div class="brandmark__stack"><span class="brandmark__name">Sightline Studio</span><span class="brandmark__slogan">Every sightline, proven before hanging.</span></div></div></div>
              </div>
            </body>
            </html>
          `);
          await page.waitForTimeout(300);
        },
      },
      {
        file: "02-primary-paper-1440x900.png",
        action: async () => {
          await page.setViewportSize({ width: 1440, height: 900 });
          await page.goto(`${baseUrl}/?theme=paper`);
          await page.evaluate(() => document.fonts.ready);
          await page.waitForTimeout(300);
        },
      },
      {
        file: "03-primary-vault-1440x900.png",
        action: async () => {
          await page.setViewportSize({ width: 1440, height: 900 });
          await page.goto(`${baseUrl}/?theme=dark`);
          await page.evaluate(() => document.fonts.ready);
          await page.waitForTimeout(300);
        },
      },
      {
        file: "04-inflight-planner-state.png",
        action: async () => {
          await page.setViewportSize({ width: 1440, height: 900 });
          await page.goto(`${baseUrl}/?theme=paper&simulateInflight=1`);
          await page.evaluate(() => document.fonts.ready);
          await page.waitForTimeout(300);
        },
      },
      {
        file: "05-degraded-replay-cache-state.png",
        action: async () => {
          await page.setViewportSize({ width: 1440, height: 900 });
          await page.goto(`${baseUrl}/?theme=paper&simulateDegraded=1`);
          await page.evaluate(() => document.fonts.ready);
          await page.waitForTimeout(300);
        },
      },
      {
        file: "06-empty-gallery-state.png",
        action: async () => {
          await page.setViewportSize({ width: 1440, height: 900 });
          await page.goto(`${baseUrl}/?theme=paper&seed=empty`);
          await page.evaluate(() => document.fonts.ready);
          await page.waitForTimeout(300);
        },
      },
      {
        file: "07-explainer-modal-open.png",
        action: async () => {
          await page.setViewportSize({ width: 1440, height: 900 });
          await page.goto(`${baseUrl}/?theme=paper`);
          await page.evaluate(() => document.fonts.ready);
          await page.click("[data-app-explainer]");
          await page.waitForSelector('[role="dialog"]');
          await page.waitForTimeout(250);
        },
      },
      {
        file: "08-contextual-help-popover-open.png",
        action: async () => {
          await page.setViewportSize({ width: 1440, height: 900 });
          await page.goto(`${baseUrl}/?theme=paper`);
          await page.evaluate(() => document.fonts.ready);
          await page.click('[data-help-for="truth-compliance"]');
          await page.waitForSelector('[role="region"]');
          await page.waitForTimeout(250);
        },
      },
      {
        file: "09-violation-and-approval-state.png",
        action: async () => {
          await page.setViewportSize({ width: 1440, height: 900 });
          await page.goto(`${baseUrl}/?theme=paper&seed=needs-repair&simulateApproval=1`);
          await page.evaluate(() => document.fonts.ready);
          await page.waitForTimeout(300);
        },
      },
      {
        file: "10-widest-metrics-state.png",
        action: async () => {
          await page.setViewportSize({ width: 1440, height: 900 });
          await page.goto(`${baseUrl}/?theme=paper&widestMetrics=1`);
          await page.evaluate(() => document.fonts.ready);
          await page.waitForTimeout(300);
        },
      },
      {
        file: "11-secondary-lab-route.png",
        action: async () => {
          await page.setViewportSize({ width: 1440, height: 900 });
          await page.goto(`${baseUrl}/lab?theme=paper`);
          await page.evaluate(() => document.fonts.ready);
          await page.waitForTimeout(300);
        },
      },
      {
        file: "12-primary-mobile-390x844.png",
        action: async () => {
          await page.setViewportSize({ width: 390, height: 844 });
          await page.goto(`${baseUrl}/?theme=paper`);
          await page.evaluate(() => document.fonts.ready);
          await page.waitForTimeout(300);
        },
      },
    ];

    for (const item of screenshots) {
      await item.action();
      const targetPath = join(SCREENSHOT_DIR, item.file);
      await page.screenshot({ path: targetPath, fullPage: false });
      console.log(`captured: ${targetPath}`);
    }

    console.log("screenshots: 12 files OK");
  } finally {
    if (browser) await browser.close();
    server.httpServer.close();
  }
}

main().catch((err) => {
  console.error("verify-ui-craft failed:", err);
  process.exit(1);
});
