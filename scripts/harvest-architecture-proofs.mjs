#!/usr/bin/env node
/**
 * Completes architecture.json by attaching runtime proofs to every edge. A proof is the 1-based
 * line and verbatim text found in run-trace.json; nothing is written unless it is found there.
 * Usage: node scripts/harvest-architecture-proofs.mjs --draft <path> --trace <run-trace.json> --out <architecture.json>
 * The output sits next to a copy of the trace so the architecture lint can open the proof file.
 */
import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";

if (process.argv.length <= 2) {
  console.error("Usage: node scripts/harvest-architecture-proofs.mjs --draft <path> --trace <run-trace.json> --out <architecture.json>");
  process.exit(1);
}

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

const draftPath = arg("draft");
const tracePath = arg("trace");
const outPath = arg("out");
if (!draftPath || !tracePath || !outPath) {
  console.error("Usage: node scripts/harvest-architecture-proofs.mjs --draft <path> --trace <run-trace.json> --out <architecture.json>");
  process.exit(1);
}

const draft = JSON.parse(readFileSync(resolve(draftPath), "utf8"));
const traceFile = resolve(tracePath);
const traceLines = readFileSync(traceFile, "utf8").split(/\r?\n/);

// Edge id -> trace needles, tried in order. Each needle must exist verbatim in the real trace.
const NEEDLES = {
  "e-ui-reg": ['"name": "filter_curatorial_theme"', '"name": "scan_room_planes"'],
  "e-reg-store": ['"name": "reflow_wall_spacing"', '"name": "place_artwork"', '"name": "toggle_seated_scale_twin"'],
  "e-store-xr": ['"name": "toggle_seated_scale_twin"', '"name": "preview_wheelchair_eye_level"'],
  "e-xr-reg": ['"name": "scan_room_planes"', '"name": "preview_wheelchair_eye_level"'],
  "e-store-truth": ['"name": "validate_ada_compliance"'],
  "e-api-plan": ['"name": "curatorial_planner"', '"name": "layout_strategist"'],
  "e-api-critic": ['"name": "repair_critic"', '"name": "interpretive_writer"'],
  "e-sse-ui": ['"kind": "approval"', '"name": "pin_spatial_anchor"'],
};

const proofFile = basename(traceFile);
const missing = [];
for (const edge of draft.edges) {
  const needles = NEEDLES[edge.id] ?? [];
  let found = null;
  for (const needle of needles) {
    const idx = traceLines.findIndex((l) => l.includes(needle));
    if (idx >= 0) {
      found = { file: proofFile, line: idx + 1, text: traceLines[idx].trim().replace(/,$/, "") };
      break;
    }
  }
  if (!found) missing.push(edge.id);
  else edge.proof = found;
}

if (missing.length) {
  console.error(`harvest: no proof line found in ${proofFile} for edges: ${missing.join(", ")}`);
  process.exit(1);
}

const out = resolve(outPath);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(draft, null, 2) + "\n", "utf8");
copyFileSync(traceFile, resolve(dirname(out), proofFile));
console.log(`harvest: ${draft.edges.length} edges proven from ${proofFile} -> ${out}`);
