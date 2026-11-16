import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCostGuard } from "../../src/agent/cost-guard";
import { createEventStreamHub } from "../../src/server/event-stream";
import { createApiApp } from "../../src/server/app";
import type { VertexModelClient } from "../../src/server/vertex-client";
import type { GoldenCacheStore } from "../../src/resilience/golden-cache";

describe("Cost Guard and Server-Sent Events Progress Stream", () => {
  it("CR-3: CostGuard ceiling of 2 calls refuses the 3rd call before dispatch with a clear reason", () => {
    const guard = createCostGuard({ maxCallsPerRun: 2, maxTokensPerRun: 1000 });

    // Call 1: Allowed
    expect(guard.checkCanCall()).toEqual({ allowed: true });
    guard.recordUsage({ prompt: 100, output: 50, total: 150 });

    // Call 2: Allowed
    expect(guard.checkCanCall()).toEqual({ allowed: true });
    guard.recordUsage({ prompt: 100, output: 50, total: 150 });

    // Call 3: Refused before dispatch
    const check3 = guard.checkCanCall();
    expect(check3.allowed).toBe(false);
    if (!check3.allowed) {
      expect(check3.reason).toContain("Budget exceeded");
      expect(check3.reason).toContain("run calls ceiling reached (2/2)");
    }

    // Start new run resets run counters but retains session counters
    guard.startNewRun();
    const snap = guard.getSnapshot();
    expect(snap.runCalls).toBe(0);
    expect(snap.sessionCalls).toBe(2);
    expect(guard.checkCanCall()).toEqual({ allowed: true });
  });

  it("CR-3: CostGuard refuses calls when token budget ceiling is reached", () => {
    const guard = createCostGuard({ maxTokensPerRun: 500 });
    expect(guard.checkCanCall()).toEqual({ allowed: true });

    guard.recordUsage({ prompt: 300, output: 250, total: 550 });

    const check = guard.checkCanCall();
    expect(check.allowed).toBe(false);
    if (!check.allowed) {
      expect(check.reason).toContain("run tokens ceiling reached (550/500)");
    }
  });

  it("CR-4: EventStreamHub mid-run disconnect + reconnect with afterId delivers all events in exact order with zero loss and zero duplicates", () => {
    const hub = createEventStreamHub();
    const runId = "test-run-reconnect-123";

    // Initial listener collects events 1 and 2
    const collectedClientA: Array<{ id: number; type: string }> = [];
    const unsubscribeA = hub.subscribe(runId, (ev) => {
      collectedClientA.push({ id: ev.id, type: ev.type });
    });

    hub.publish(runId, "stage_started", { role: "curatorial_planner", step: 1 });
    hub.publish(runId, "model_completed", { role: "curatorial_planner", ok: true });

    expect(collectedClientA.length).toBe(2);
    expect(collectedClientA[0].id).toBe(1);
    expect(collectedClientA[1].id).toBe(2);

    // Client A drops connection (disconnect)
    unsubscribeA();

    // Workflow continues while client is disconnected (events 3 and 4)
    hub.publish(runId, "stage_started", { role: "layout_strategist", step: 2 });
    hub.publish(runId, "model_completed", { role: "layout_strategist", ok: true });

    // Client reconnects with afterId = 2
    const missedEvents = hub.getHistory(runId, 2);
    expect(missedEvents.length).toBe(2);
    expect(missedEvents[0].id).toBe(3);
    expect(missedEvents[1].id).toBe(4);

    const collectedClientB: Array<{ id: number; type: string }> = [...missedEvents];
    const unsubscribeB = hub.subscribe(runId, (ev) => {
      collectedClientB.push({ id: ev.id, type: ev.type });
    });

    // Workflow emits event 5
    hub.publish(runId, "run_finished", { ok: true, totalEvents: 5 });

    unsubscribeB();

    expect(collectedClientB.length).toBe(3);
    expect(collectedClientB.map((e) => e.id)).toEqual([3, 4, 5]);

    // Entire stream for runId has all 5 events monotonically ordered
    const fullHistory = hub.getHistory(runId, 0);
    expect(fullHistory.length).toBe(5);
    expect(fullHistory.map((e) => e.id)).toEqual([1, 2, 3, 4, 5]);
  });

  describe("HTTP Routes (/api/health & /api/agent/generate)", () => {
    let server: Server;
    let baseUrl = "";

    beforeAll(async () => {
      const mockVertex: VertexModelClient = {
        discoverGeminiModel: async (cap) => ({
          model: cap === "pro" ? "gemini-2.5-pro" : "gemini-2.5-flash",
          project: "test-project",
          location: "us-central1",
        }),
        generate: async () => ({
          text: "mock",
          toolCalls: [],
          model: "gemini-2.5-pro",
          project: "test-project",
          location: "us-central1",
          usage: { promptTokens: 10, outputTokens: 10, totalTokens: 20 },
        }),
        generateJson: async <T>() => ({
          ok: true as const,
          data: { generated: "from-mock-vertex" } as unknown as T,
          model: "gemini-2.5-pro",
          project: "test-project",
          usage: { promptTokens: 10, outputTokens: 10, totalTokens: 20 },
        }),
      };

      const mockCache: GoldenCacheStore = {
        getMode: () => "auto",
        read: async () => null,
        write: async () => {},
      };

      const streamHub = createEventStreamHub();
      const app = createApiApp({ vertexClient: mockVertex, goldenCache: mockCache, streamHub });

      await new Promise<void>((resolve) => {
        server = app.listen(0, () => {
          const addr = server.address() as AddressInfo;
          baseUrl = `http://localhost:${addr.port}`;
          resolve();
        });
      });
    });

    afterAll(async () => {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    });

    it("GET /api/health returns service status and aiMode", async () => {
      const res = await fetch(`${baseUrl}/api/health`);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.service).toBe("sightline-studio");
      expect(json.aiMode).toBe("auto");
      expect(json.timestamp).toBeDefined();
    });

    it("POST /api/agent/generate returns structured JSON outcome", async () => {
      const res = await fetch(`${baseUrl}/api/agent/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId: "run-http-test-1",
          role: "curatorial_planner",
          capability: "pro",
          system: "system instructions",
          userMessage: "User exhibition brief",
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.data.generated).toBe("from-mock-vertex");
      expect(json.fromCache).toBe(false);
      expect(json.degraded).toBe(false);
      expect(json.hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });
});
