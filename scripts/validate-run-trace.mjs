#!/usr/bin/env node
/**
 * Validates a run-trace.json against the product-depth floor:
 * >= 3 model roles (4 expected), >= 15 actions, >= 1 verify-repair round, >= 1 human checkpoint,
 * final truth with 0 errors, and internally consistent counts.
 * Usage: node scripts/validate-run-trace.mjs <path-to-run-trace.json>
 */
import { readFileSync } from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/validate-run-trace.mjs <run-trace.json>");
  process.exit(1);
}

const doc = JSON.parse(readFileSync(file, "utf8"));
const failures = [];
const check = (ok, msg) => {
  if (!ok) failures.push(msg);
};

const s = doc.summary ?? {};
const entries = Array.isArray(doc.entries) ? doc.entries : [];

check(doc.version === "1.0.0", `version must be 1.0.0 (got ${doc.version})`);
check(entries.length > 0, "entries must be non-empty");
check(Array.isArray(s.model_roles) && s.model_roles.length >= 3, `model_roles >= 3 (got ${s.model_roles?.length})`);
check(s.actions >= 15, `actions >= 15 (got ${s.actions})`);
check(s.verify_repair_rounds >= 1, `verify_repair_rounds >= 1 (got ${s.verify_repair_rounds})`);
check(s.human_checkpoints >= 1, `human_checkpoints >= 1 (got ${s.human_checkpoints})`);
check(s.final_truth && s.final_truth.errors === 0, `final_truth.errors === 0 (got ${JSON.stringify(s.final_truth)})`);

const actionEntries = entries.filter((e) => e.kind === "action").length;
const modelEntries = entries.filter((e) => e.kind === "model").length;
check(actionEntries === s.actions, `summary.actions (${s.actions}) equals action entries (${actionEntries})`);
check(modelEntries === s.model_calls, `summary.model_calls (${s.model_calls}) equals model entries (${modelEntries})`);
const seqOk = entries.every((e, i) => e.seq === i + 1);
check(seqOk, "entry seq numbers must run 1..n without gaps");

if (failures.length) {
  console.error(`run-trace INVALID (${file}):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  `run-trace OK: roles=${s.model_roles.length} actions=${s.actions} model_calls=${s.model_calls} ` +
    `verify_repair=${s.verify_repair_rounds} checkpoints=${s.human_checkpoints} final_errors=${s.final_truth.errors}`
);
