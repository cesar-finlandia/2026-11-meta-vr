#!/usr/bin/env node
/**
 * Deploys Sightline Studio to Cloud Run from source and writes design_documents/deploy-receipt.json.
 * Usage: node scripts/deploy-cloud-run.mjs [--service sightline-studio] [--region us-central1] [--project <id>]
 * Secrets are never printed; only non-secret environment values are passed to the service.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";

const ROOT = process.cwd();
const gcloud = process.platform === "win32" ? "gcloud.cmd" : "gcloud";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function loadEnv() {
  const p = resolve(ROOT, ".env");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { encoding: "utf8", shell: process.platform === "win32", ...opts });
}

loadEnv();

const service = arg("service", "sightline-studio");
const region = arg("region", process.env.CLOUD_RUN_REGION || "us-central1");
let project = arg("project", process.env.GOOGLE_CLOUD_PROJECT || "");
if (project.startsWith("projects/")) project = project.slice("projects/".length);
if (!project || /^\d+$/.test(project)) {
  const r = run(gcloud, ["config", "get-value", "project"]);
  project = (r.stdout || "").trim();
}
if (!project) {
  console.error("deploy: no GCP project resolved (set GOOGLE_CLOUD_PROJECT or run gcloud config set project)");
  process.exit(1);
}

let buildSha = "cleanroom";
const sha = run("git", ["rev-parse", "--short", "HEAD"]);
if (sha.status === 0 && sha.stdout.trim()) buildSha = sha.stdout.trim();
const dirty = run("git", ["status", "--porcelain"]);
if (dirty.status === 0 && dirty.stdout.trim()) buildSha = `${buildSha}-${Date.now().toString(36)}`;

const envVars = [
  "NODE_ENV=production",
  `GOOGLE_CLOUD_PROJECT=${project}`,
  "GOOGLE_CLOUD_LOCATION=us-central1",
  "GOOGLE_GENAI_USE_VERTEXAI=true",
  "SIGHTLINE_AI_MODE=auto",
  `SIGHTLINE_BUILD_SHA=${buildSha}`,
].join(",");

console.log(`deploying ${service} to ${project}/${region} (build ${buildSha})`);
const d = run(
  gcloud,
  [
    "run", "deploy", service,
    "--source", ".",
    "--project", project,
    "--region", region,
    "--allow-unauthenticated",
    "--port", "8080",
    "--memory", "1Gi",
    "--cpu", "1",
    "--min-instances", "0",
    "--max-instances", "4",
    "--set-env-vars", envVars,
    "--quiet",
  ],
  { stdio: ["ignore", "inherit", "inherit"] }
);
if (d.status !== 0) {
  console.error(`deploy FAILED (gcloud exit ${d.status})`);
  process.exit(d.status ?? 1);
}

const u = run(gcloud, ["run", "services", "describe", service, "--project", project, "--region", region, "--format", "value(status.url)"]);
const url = (u.stdout || "").trim();
if (!url.startsWith("https://")) {
  console.error(`deploy: could not read service URL (got "${url}")`);
  process.exit(1);
}

const receipt = {
  serviceName: "sightline-studio",
  project,
  region,
  url,
  serviceUrl: url,
  buildSha,
  aiMode: "auto",
  deployedAt: new Date().toISOString(),
  smokeVerified: false,
  smokeVerifiedAt: "",
};
const out = resolve(ROOT, "design_documents", "deploy-receipt.json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(receipt, null, 2) + "\n", "utf8");
console.log(`deployed: ${url}`);
