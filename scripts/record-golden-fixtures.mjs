#!/usr/bin/env node
/**
 * Golden fixture recorder for Sightline Studio.
 * Executes live multi-round curatorial workflows across all preset briefs using
 * hackathon .env credentials and populates public/golden/*.json and manifest.json.
 */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";

// If run via plain 'node' without tsx loader, re-exec with tsx loader
if (!process.execArgv.some((arg) => arg.includes("tsx"))) {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", resolve(process.cwd(), "scripts/record-golden-fixtures.mjs")],
    { stdio: "inherit", env: process.env }
  );
  process.exit(result.status ?? 0);
}

// Ensure .env is loaded
const envPath = resolve(process.cwd(), ".env");
if (existsSync(envPath)) {
  const content = readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq > 0) {
      const k = trimmed.slice(0, eq).trim();
      let v = trimmed.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (process.env[k] === undefined) {
        process.env[k] = v;
      }
    }
  }
}

async function main() {
  const { createSession } = await import("../src/domain/session.ts");
  const { bindCuratorialActions } = await import("../src/agent/actions.ts");
  const { createVertexModelClient } = await import("../src/server/vertex-client.ts");
  const { createNodeGoldenCache, computeGoldenHash } = await import("../src/resilience/golden-cache.ts");
  const { runCuratorialWorkflow } = await import("../src/agent/orchestrator.ts");

  console.log("Initializing Gemini model client & golden cache in 'record' mode...");
  const vertexClient = createVertexModelClient();
  const cache = createNodeGoldenCache({ mode: "record" });

  const pro = await vertexClient.discoverGeminiModel("pro");
  const flash = await vertexClient.discoverGeminiModel("flash");
  console.log(`Discovered Pro model: ${pro.model} (${pro.project})`);
  console.log(`Discovered Flash model: ${flash.model} (${flash.project})`);

  async function recordingInvoker(req) {
    const hash = computeGoldenHash({
      provider: "vertex-gemini",
      role: req.role,
      system: req.system,
      messages: [{ role: "user", content: req.userMessage }],
      responseSchema: req.responseSchema,
      temperature: req.temperature,
    });

    // Check if already in cache
    const existing = await cache.read(hash);
    if (existing) {
      console.log(`  [CACHE HIT] role=${req.role} hash=${hash.slice(0, 12)}...`);
      return {
        ok: true,
        data: existing.payload,
        fromCache: true,
        degraded: false,
        model: existing.model,
        usage: existing.usage,
        latencyMs: 10,
      };
    }

    console.log(`  [RECORDING] role=${req.role} capability=${req.capability} hash=${hash.slice(0, 12)}...`);
    const t0 = performance.now();
    const outcome = await vertexClient.generateJson({
      role: req.role,
      capability: req.capability,
      system: req.system,
      messages: [{ role: "user", content: req.userMessage }],
      responseSchema: req.responseSchema,
      temperature: req.temperature,
    });
    const elapsed = Math.round(performance.now() - t0);

    if (outcome.ok) {
      await cache.write({
        hash,
        role: req.role,
        model: outcome.model,
        recordedAt: new Date().toISOString(),
        usage: outcome.usage,
        payload: outcome.data,
      });
      console.log(`  [RECORDED] role=${req.role} (${elapsed}ms, ${outcome.usage.totalTokens} tokens)`);
      return {
        ok: true,
        data: outcome.data,
        fromCache: false,
        degraded: false,
        model: outcome.model,
        usage: outcome.usage,
        latencyMs: elapsed,
      };
    } else {
      console.error(`  [FAILED] role=${req.role}:`, outcome.reason);
      return {
        ok: false,
        data: {},
        fromCache: false,
        degraded: true,
        reason: outcome.reason,
        model: outcome.model,
        usage: outcome.usage,
        latencyMs: elapsed,
      };
    }
  }

  const { PRESET_BRIEFS } = await import("../src/ui/components/CuratorialControlBar.tsx");
  const { createSeedExhibition } = await import("../src/domain/seed.ts");
  const defaultBrief = createSeedExhibition("default").curatorialBrief;
  const botanical = PRESET_BRIEFS.find((p) => p.id === "botanical").brief;
  // Every (seed, brief) pair a browser run can send, so SIGHTLINE_AI_MODE=replay never misses.
  const briefs = [
    ...PRESET_BRIEFS.map((p) => ({ title: p.brief, seed: "default" })),
    { title: defaultBrief, seed: "default" },
    { title: botanical, seed: "empty" },
    { title: defaultBrief, seed: "empty" },
    { title: botanical, seed: "needs-repair" },
    { title: defaultBrief, seed: "needs-repair" },
    { title: "Botanical studies", seed: "default" },
    { title: "Botanical studies", seed: "empty" },
    { title: "Botanical studies", seed: "needs-repair" },
  ];

  for (let i = 0; i < briefs.length; i++) {
    const { title, seed } = briefs[i];
    console.log(`\n============================================================`);
    console.log(`Recording Run ${i + 1}/${briefs.length}: "${title}" (seed: ${seed})`);
    console.log(`============================================================`);

    const session = createSession({ seed, gateEnabled: true });
    bindCuratorialActions(session);

    // Auto-approve spatial anchor gate request when it fires
    session.gate.subscribe((pending) => {
      if (pending) {
        console.log(`  [GATE PROMPT] Auto-approving: "${pending.plainSummary}"`);
        session.gate.approve(pending.id);
      }
    });

    const result = await runCuratorialWorkflow(session, {
      brief: title,
      mode: "record",
      modelInvoker: recordingInvoker,
      onStageChange: (stage, label) => console.log(`Stage ${stage}: ${label}`),
    });

    console.log(`Run completed: ok=${result.ok}, verifyRepairRounds=${result.verifyRepairRounds}, finalErrorCount=${result.finalErrorCount}`);
    console.log(`Trace summary: model_calls=${result.traceDocument.summary.model_calls}, actions=${result.traceDocument.summary.actions}`);
  }

  const manifestPath = resolve(process.cwd(), "public/golden/manifest.json");
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    console.log(`\nGolden recording complete! Total fixtures in manifest: ${manifest.count}`);
    for (const r of manifest.records) {
      console.log(`  - ${r.hash.slice(0, 16)}... | ${r.role} | ${r.model}`);
    }
  }
}

main().catch((err) => {
  console.error("Recording error:", err);
  process.exit(1);
});
