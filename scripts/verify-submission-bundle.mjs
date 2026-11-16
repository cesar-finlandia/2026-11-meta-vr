#!/usr/bin/env node
/**
 * Verifies the submission bundle: required root files, the ten Devpost fields, tagline and
 * description limits, deploy URL consistency, hygiene on the text files, and a clean git index.
 * Usage: node scripts/verify-submission-bundle.mjs
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const failures = [];
const fail = (m) => failures.push(m);

const REQUIRED = ["LICENSE", "UPSTREAM-NOTICE.md", "disclosure.md", "README.md", "JUDGES.md", "claims.json", "actions.manifest.json", "run-trace.json"];
for (const f of REQUIRED) {
  const p = join(ROOT, f);
  if (!existsSync(p) || statSync(p).size === 0) fail(`missing or empty root file: ${f}`);
}

const descPath = join(ROOT, "design_documents", "submission_description.md");
const HEADINGS = [
  "Submission name",
  "Submission tagline",
  "Track",
  "Division",
  "Playable Build Access",
  "Demonstration Video",
  "Text Description",
  "Hand Interactions & Future of VR",
  "Target Launch Date",
  "Team Members",
];

let tagline = "";
let words = 0;
if (!existsSync(descPath)) {
  fail("design_documents/submission_description.md is missing");
} else {
  const text = readFileSync(descPath, "utf8");
  const sections = {};
  const parts = text.split(/^##\s+/m).slice(1);
  for (const part of parts) {
    const nl = part.indexOf("\n");
    sections[part.slice(0, nl).trim()] = part.slice(nl + 1).trim();
  }
  for (const h of HEADINGS) if (!(h in sections)) fail(`missing heading: ${h}`);
  tagline = (sections["Submission tagline"] ?? "").replace(/\s+/g, " ").trim();
  if (tagline.length > 140) fail(`tagline is ${tagline.length} characters (max 140)`);
  words = (sections["Text Description"] ?? "").split(/\s+/).filter(Boolean).length;
  if (words > 500) fail(`Text Description is ${words} words (max 500)`);
  if ((sections["Track"] ?? "").trim() !== "Productivity") fail('Track must be "Productivity"');
  if ((sections["Division"] ?? "").trim() !== "New Experience") fail('Division must be "New Experience"');

  const receiptPath = join(ROOT, "design_documents", "deploy-receipt.json");
  if (!existsSync(receiptPath)) fail("design_documents/deploy-receipt.json is missing");
  else {
    const url = JSON.parse(readFileSync(receiptPath, "utf8")).url;
    if (!String(url).startsWith("https://")) fail(`deploy url is not https: ${url}`);
    else if (!(sections["Playable Build Access"] ?? "").includes(url)) fail("Playable Build Access does not contain the deployed URL");
  }
}

const hyg = spawnSync(process.execPath, [resolve(ROOT, "scripts", "verify-hygiene.mjs")], { encoding: "utf8" });
if (hyg.status !== 0) fail(`hygiene failed:\n${hyg.stdout}${hyg.stderr}`);

const staged = spawnSync("git", ["diff", "--cached", "--name-only"], { encoding: "utf8", cwd: ROOT });
if (staged.status === 0) {
  const bad = staged.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((f) => /^(design_documents\/|\.claude\/|config\/|models\.json$|run_[a-z_]+\.(conf|sh)$)/.test(f));
  if (bad.length) fail(`operator files are staged: ${bad.join(", ")}`);
}

if (failures.length) {
  console.error("submission-bundle: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`submission-bundle: PASS (tagline<=140 [${tagline.length}], description<=500 words [${words}], 10 fields, root files OK, git index clean)`);
