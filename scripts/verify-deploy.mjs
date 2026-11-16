#!/usr/bin/env node
/**
 * Verifies the deployed service: health endpoint (build sha + XR permissions policy) and the
 * BASE_URL smoke spec, then marks the receipt as smoke verified.
 * Usage: node scripts/verify-deploy.mjs
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const receiptPath = resolve(process.cwd(), "design_documents", "deploy-receipt.json");
const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
const url = String(receipt.url || "");

if (!url.startsWith("https://")) {
  console.error(`verify-deploy: receipt url must be https (got "${url}")`);
  process.exit(1);
}

const res = await fetch(`${url}/api/health`);
if (res.status !== 200) {
  console.error(`verify-deploy: /api/health returned ${res.status}`);
  process.exit(1);
}
const body = await res.json();
if (body.buildSha !== receipt.buildSha) {
  console.error(`verify-deploy: buildSha mismatch (receipt ${receipt.buildSha}, service ${body.buildSha})`);
  process.exit(1);
}
const policy = res.headers.get("permissions-policy") || "";
if (!policy.includes("xr-spatial-tracking")) {
  console.error(`verify-deploy: Permissions-Policy missing xr-spatial-tracking (got "${policy}")`);
  process.exit(1);
}

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const t = spawnSync(npx, ["playwright", "test", "-c", "e2e/playwright.config.ts", "e2e/smoke.spec.ts"], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, BASE_URL: url },
});
if (t.status !== 0) {
  console.error("verify-deploy: smoke spec failed");
  process.exit(t.status ?? 1);
}

receipt.smokeVerified = true;
receipt.smokeVerifiedAt = new Date().toISOString();
writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + "\n", "utf8");
console.log(`deploy-verified: PASS ${url}`);
