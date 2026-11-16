#!/usr/bin/env node
/**
 * Copies the validated run-trace.json to public/run-trace.json so the /watch route can load it.
 * Usage: node scripts/sync-public-trace.mjs
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const src = resolve(process.cwd(), "run-trace.json");
const dest = resolve(process.cwd(), "public", "run-trace.json");

if (!existsSync(src)) {
  console.error("sync-public-trace: run-trace.json not found; run the curation scenario first (npm run test:e2e)");
  process.exit(1);
}
mkdirSync(resolve(process.cwd(), "public"), { recursive: true });
copyFileSync(src, dest);
console.log("public/run-trace.json synced");
