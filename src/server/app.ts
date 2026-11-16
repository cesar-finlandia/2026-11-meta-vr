/**
 * Express 5 API server providing health, SSE progress streaming,
 * model generation proxy, and static WebXR client serving.
 */
import express, { type Express } from "express";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  computeGoldenHash,
  createNodeGoldenCache,
  type GoldenCacheKeyInput,
  type GoldenCacheStore,
} from "../resilience/golden-cache";
import { createEventStreamHub, type EventStreamHub } from "./event-stream";
import { createVertexModelClient, type VertexModelClient } from "./vertex-client";

export function createApiApp(options?: {
  vertexClient?: VertexModelClient;
  goldenCache?: GoldenCacheStore;
  streamHub?: EventStreamHub;
  staticDistDir?: string;
}): Express {
  const app: Express = express();
  app.use(express.json());

  // WebXR spatial tracking permissions policy header
  app.use((_req, res, next) => {
    res.setHeader("Permissions-Policy", "xr-spatial-tracking=(self)");
    next();
  });

  const vertexClient = options?.vertexClient ?? createVertexModelClient();
  const goldenCache = options?.goldenCache ?? createNodeGoldenCache();
  const streamHub = options?.streamHub ?? createEventStreamHub();

  // GET /api/health
  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      service: "sightline-studio",
      aiMode: goldenCache.getMode(),
      buildSha: process.env.SIGHTLINE_BUILD_SHA ?? "dev",
      timestamp: new Date().toISOString(),
    });
  });

  // POST /api/agent/generate
  app.post("/api/agent/generate", async (req, res) => {
    const t0 = performance.now();
    const {
      runId = `run-${Date.now().toString(36)}`,
      role = "curatorial_planner",
      capability = "pro",
      system = "",
      userMessage = "",
      responseSchema,
      temperature = 0.2,
      mode: requestedMode,
    } = req.body ?? {};

    // A server pinned to replay never reaches a live model, whatever the client asks for.
    const activeMode = goldenCache.getMode() === "replay" ? "replay" : (requestedMode ?? goldenCache.getMode());

    streamHub.publish(runId, "stage_started", {
      role,
      capability,
      ts: new Date().toISOString(),
    });

    const cacheKey: GoldenCacheKeyInput = {
      provider: "vertex-gemini",
      role,
      system,
      messages: [{ role: "user", content: userMessage }],
      responseSchema,
      temperature,
    };
    const hash = computeGoldenHash(cacheKey);

    // 1. Check golden cache in replay or auto mode
    if (activeMode === "replay" || activeMode === "auto") {
      const cached = await goldenCache.read<Record<string, unknown>>(hash);
      if (cached) {
        streamHub.publish(runId, "model_completed", {
          role,
          model: cached.model,
          fromCache: true,
          usage: cached.usage,
        });

        return res.json({
          ok: true,
          data: cached.payload,
          fromCache: true,
          degraded: false,
          hash,
          model: cached.model,
          usage: cached.usage,
          latencyMs: Math.round(performance.now() - t0),
        });
      }

      if (activeMode === "replay") {
        const reason = `Golden cache miss for hash ${hash} in replay mode.`;
        streamHub.publish(runId, "degraded_notice", { role, reason });
        return res.json({
          ok: false,
          data: {},
          fromCache: false,
          degraded: true,
          reason,
          hash,
          model: "gemini-2.5-pro",
          usage: { promptTokens: 0, outputTokens: 0, totalTokens: 0 },
          latencyMs: Math.round(performance.now() - t0),
        });
      }
    }

    // 2. Call live model (mode: live, record, or auto after cache miss)
    const outcome = await vertexClient.generateJson<Record<string, unknown>>({
      role,
      capability,
      system,
      messages: [{ role: "user", content: userMessage }],
      responseSchema,
      temperature,
    });

    const elapsed = Math.round(performance.now() - t0);

    if (outcome.ok) {
      if (activeMode === "record") {
        await goldenCache.write({
          hash,
          role,
          model: outcome.model,
          recordedAt: new Date().toISOString(),
          usage: outcome.usage,
          payload: outcome.data,
        });
      }

      streamHub.publish(runId, "model_completed", {
        role,
        model: outcome.model,
        fromCache: false,
        usage: outcome.usage,
      });

      return res.json({
        ok: true,
        data: outcome.data,
        fromCache: false,
        degraded: false,
        hash,
        model: outcome.model,
        usage: outcome.usage,
        latencyMs: elapsed,
      });
    }

    // 3. Degradation path: try fallback cache if in auto mode
    if (activeMode === "auto") {
      const fallback = await goldenCache.read<Record<string, unknown>>(hash);
      if (fallback) {
        streamHub.publish(runId, "model_completed", {
          role,
          model: fallback.model,
          fromCache: true,
          usage: fallback.usage,
        });

        return res.json({
          ok: true,
          data: fallback.payload,
          fromCache: true,
          degraded: false,
          hash,
          model: fallback.model,
          usage: fallback.usage,
          latencyMs: elapsed,
        });
      }
    }

    streamHub.publish(runId, "degraded_notice", {
      role,
      reason: outcome.reason,
    });

    return res.json({
      ok: false,
      data: {},
      fromCache: false,
      degraded: true,
      reason: outcome.reason,
      hash,
      model: outcome.model,
      usage: outcome.usage,
      latencyMs: elapsed,
    });
  });

  // GET /api/events
  app.get("/api/events", (req, res) => {
    const runId = String(req.query.runId ?? "");
    const afterIdHeader = req.headers["last-event-id"];
    const afterIdQuery = req.query.afterId;
    const afterId = Number(afterIdQuery ?? afterIdHeader ?? 0);

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    // Replay historical events
    const history = streamHub.getHistory(runId, afterId);
    for (const ev of history) {
      res.write(`id: ${ev.id}\nevent: ${ev.type}\ndata: ${JSON.stringify(ev.payload)}\n\n`);
    }

    // Subscribe to new events
    const unsubscribe = streamHub.subscribe(runId, (ev) => {
      res.write(`id: ${ev.id}\nevent: ${ev.type}\ndata: ${JSON.stringify(ev.payload)}\n\n`);
    });

    req.on("close", () => {
      unsubscribe();
    });
  });

  // Static serving & Express 5 SPA fallback
  const distDir = options?.staticDistDir ?? resolve(process.cwd(), "dist");
  if (existsSync(distDir)) {
    app.use(express.static(distDir));

    // Trailing SPA fallback middleware compatible with Express 5
    app.use((req, res, next) => {
      if (req.method === "GET" && !req.path.startsWith("/api/")) {
        const indexHtml = join(distDir, "index.html");
        if (existsSync(indexHtml)) {
          return res.sendFile(indexHtml);
        }
      }
      next();
    });
  }

  return app;
}
