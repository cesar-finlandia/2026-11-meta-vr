import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  computeGoldenHash,
  createNodeGoldenCache,
  type GoldenCacheKeyInput,
} from "../../src/resilience/golden-cache";
import {
  createVertexModelClient,
  type VertexTransport,
} from "../../src/server/vertex-client";

describe("Vertex AI Client and Content-Addressed Golden Cache", () => {
  const testCacheDir = resolve(process.cwd(), "tests", "agent", "tmp-golden-cache");

  beforeAll(() => {
    mkdirSync(testCacheDir, { recursive: true });
  });

  afterAll(() => {
    try {
      rmSync(testCacheDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  it("Path A: routes via Developer API with x-goog-api-key when API key is set", async () => {
    const prevKey = process.env.GEMINI_API_KEY;
    const prevVertex = process.env.GOOGLE_GENAI_USE_VERTEXAI;
    process.env.GEMINI_API_KEY = "test-fake-gemini-key";
    process.env.GOOGLE_GENAI_USE_VERTEXAI = "false";

    let interceptedHeaders: Record<string, string> = {};
    let interceptedUrl = "";

    const transport: VertexTransport = {
      async fetchJson(url, init) {
        interceptedUrl = url;
        interceptedHeaders = init.headers;
        return {
          status: 200,
          body: {
            candidates: [
              {
                content: {
                  parts: [{ text: JSON.stringify({ message: "path-a-success" }) }],
                },
              },
            ],
            usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 15, totalTokenCount: 25 },
          },
        };
      },
      async getAccessToken() {
        return { token: "unused-token" };
      },
      async getGcloudConfiguredProject() {
        return null;
      },
    };

    const client = createVertexModelClient({ transport });
    const res = await client.generateJson<{ message: string }>({
      role: "curatorial_planner",
      system: "system prompt",
      messages: [{ role: "user", content: "test" }],
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.message).toBe("path-a-success");
      expect(interceptedUrl).toContain("generativelanguage.googleapis.com");
      expect(interceptedHeaders["x-goog-api-key"]).toBe("test-fake-gemini-key");
    }

    process.env.GEMINI_API_KEY = prevKey;
    process.env.GOOGLE_GENAI_USE_VERTEXAI = prevVertex;
  });

  it("Path B: routes via Vertex AI Bearer token and retries with gcloud configured project on 403", async () => {
    const prevKey = process.env.GEMINI_API_KEY;
    const prevGoogleKey = process.env.GOOGLE_API_KEY;
    const prevVertex = process.env.GOOGLE_GENAI_USE_VERTEXAI;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    process.env.GOOGLE_GENAI_USE_VERTEXAI = "true";

    let callCount = 0;
    const urlsCalled: string[] = [];
    const headersList: Array<Record<string, string>> = [];

    const transport: VertexTransport = {
      async fetchJson(url, init) {
        callCount++;
        urlsCalled.push(url);
        headersList.push(init.headers);

        if (callCount === 1) {
          // First attempt returns 403 Permission denied on default project
          return {
            status: 403,
            body: { error: { message: "Permission denied on resource project 2026-09-agentic-cinema1" } },
          };
        }

        // Second attempt with operator gcloud project succeeds
        return {
          status: 200,
          body: {
            candidates: [
              {
                content: {
                  parts: [{ text: JSON.stringify({ status: "vertex-path-b-ok" }) }],
                },
              },
            ],
            usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 8, totalTokenCount: 20 },
          },
        };
      },
      async getAccessToken() {
        return { token: "adc-test-bearer-token" };
      },
      async getGcloudConfiguredProject() {
        return "operator-own-gcp-project";
      },
    };

    const client = createVertexModelClient({ transport, preferredProject: "2026-09-agentic-cinema1" });
    const res = await client.generateJson<{ status: string }>({
      role: "layout_strategist",
      system: "system prompt",
      messages: [{ role: "user", content: "test" }],
    });

    expect(callCount).toBe(2);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.status).toBe("vertex-path-b-ok");
      expect(urlsCalled[0]).toContain("projects/2026-09-agentic-cinema1");
      expect(urlsCalled[1]).toContain("projects/operator-own-gcp-project");
      expect(headersList[1]["x-goog-user-project"]).toBe("operator-own-gcp-project");
      expect(headersList[1]["Authorization"]).toBe("Bearer adc-test-bearer-token");
    }

    process.env.GEMINI_API_KEY = prevKey;
    process.env.GOOGLE_API_KEY = prevGoogleKey;
    process.env.GOOGLE_GENAI_USE_VERTEXAI = prevVertex;
  });

  it("retries once on malformed JSON and succeeds on second attempt", async () => {
    let callCount = 0;

    const transport: VertexTransport = {
      async fetchJson(url) {
        if (url.includes("/models?")) {
          return { status: 200, body: { models: [{ name: "models/gemini-2.5-flash" }] } };
        }
        callCount++;
        if (callCount === 1) {
          // First call: malformed JSON
          return {
            status: 200,
            body: {
              candidates: [{ content: { parts: [{ text: "{ incomplete_json:" }] } }],
              usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 5, totalTokenCount: 10 },
            },
          };
        }
        // Second call: valid JSON
        return {
          status: 200,
          body: {
            candidates: [{ content: { parts: [{ text: JSON.stringify({ repaired: true }) }] } }],
            usageMetadata: { promptTokenCount: 15, candidatesTokenCount: 10, totalTokenCount: 25 },
          },
        };
      },
      async getAccessToken() {
        return { token: "token" };
      },
      async getGcloudConfiguredProject() {
        return null;
      },
    };

    const client = createVertexModelClient({ transport });
    const res = await client.generateJson<{ repaired: boolean }>({
      role: "repair_critic",
      system: "repair critic prompt",
      messages: [{ role: "user", content: "repair request" }],
    });

    expect(callCount).toBe(2);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.repaired).toBe(true);
      expect(res.usage.totalTokens).toBe(35);
    }
  });

  it("handles 429 RESOURCE_EXHAUSTED with backoff retry", async () => {
    let callCount = 0;

    const transport: VertexTransport = {
      async fetchJson(url) {
        if (url.includes("/models?")) {
          return { status: 200, body: { models: [{ name: "models/gemini-2.5-flash" }] } };
        }
        callCount++;
        if (callCount === 1) {
          return {
            status: 429,
            body: { error: { message: "RESOURCE_EXHAUSTED quota limit" } },
          };
        }
        return {
          status: 200,
          body: {
            candidates: [{ content: { parts: [{ text: JSON.stringify({ ok: true }) }] } }],
            usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 5, totalTokenCount: 10 },
          },
        };
      },
      async getAccessToken() {
        return { token: "token" };
      },
      async getGcloudConfiguredProject() {
        return null;
      },
    };

    const client = createVertexModelClient({ transport });
    const res = await client.generateJson<{ ok: boolean }>({
      role: "interpretive_writer",
      system: "writer prompt",
      messages: [{ role: "user", content: "write placards" }],
    });

    expect(callCount).toBe(2);
    expect(res.ok).toBe(true);
  });

  it("aborts when AbortSignal is triggered", async () => {
    const controller = new AbortController();
    controller.abort();

    const transport: VertexTransport = {
      async fetchJson(_url, init) {
        if (init.signal?.aborted) {
          throw new Error("This operation was aborted");
        }
        return { status: 200, body: {} };
      },
      async getAccessToken() {
        return { token: "token" };
      },
      async getGcloudConfiguredProject() {
        return null;
      },
    };

    const client = createVertexModelClient({ transport });
    const outcome = await client.generateJson({
      role: "curatorial_planner",
      system: "sys",
      messages: [{ role: "user", content: "msg" }],
      signal: controller.signal,
    });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.degraded).toBe(true);
      expect(outcome.reason).toContain("aborted");
    }
  });

  it("returns DegradedResult on double failure without throwing unhandled exceptions", async () => {
    const transport: VertexTransport = {
      async fetchJson() {
        return {
          status: 500,
          body: { error: { message: "Internal server error" } },
        };
      },
      async getAccessToken() {
        return { token: "token" };
      },
      async getGcloudConfiguredProject() {
        return null;
      },
    };

    const client = createVertexModelClient({ transport });
    const outcome = await client.generateJson({
      role: "repair_critic",
      system: "sys",
      messages: [{ role: "user", content: "msg" }],
    });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.degraded).toBe(true);
      expect(outcome.reason).toContain("500");
    }
  });

  it("supports record -> replay workflow and isolated cache miss degradation", async () => {
    const cache = createNodeGoldenCache({ dirPath: testCacheDir, mode: "record" });

    const keyInput1: GoldenCacheKeyInput = {
      provider: "vertex-gemini",
      role: "curatorial_planner",
      system: "planner system prompt",
      messages: [{ role: "user", content: "Botanical Prints Brief" }],
      responseSchema: { type: "object" },
      temperature: 0.2,
    };

    const keyInput2: GoldenCacheKeyInput = {
      provider: "vertex-gemini",
      role: "layout_strategist",
      system: "layout strategist prompt",
      messages: [{ role: "user", content: "Layout Wall North" }],
      responseSchema: { type: "object" },
      temperature: 0.2,
    };

    const hash1 = computeGoldenHash(keyInput1);
    const hash2 = computeGoldenHash(keyInput2);

    expect(hash1).toMatch(/^[a-f0-9]{64}$/);
    expect(hash2).toMatch(/^[a-f0-9]{64}$/);
    expect(hash1).not.toBe(hash2);

    // Record turn 1 and turn 2
    await cache.write({
      hash: hash1,
      role: "curatorial_planner",
      model: "gemini-2.5-pro",
      recordedAt: new Date().toISOString(),
      usage: { promptTokens: 100, outputTokens: 50, totalTokens: 150 },
      payload: { exhibitionTitle: "Botanical Forms" },
    });

    await cache.write({
      hash: hash2,
      role: "layout_strategist",
      model: "gemini-2.5-pro",
      recordedAt: new Date().toISOString(),
      usage: { promptTokens: 120, outputTokens: 60, totalTokens: 180 },
      payload: { placements: [] },
    });

    // Replay mode: reads turn 1 and turn 2 from disk without network
    const replayCache = createNodeGoldenCache({ dirPath: testCacheDir, mode: "replay" });

    const turn1 = await replayCache.read<{ exhibitionTitle: string }>(hash1);
    expect(turn1).not.toBeNull();
    expect(turn1?.payload.exhibitionTitle).toBe("Botanical Forms");

    const turn2 = await replayCache.read(hash2);
    expect(turn2).not.toBeNull();

    // Delete single fixture file for turn 2 to verify isolated cache miss degradation
    rmSync(resolve(testCacheDir, `${hash2}.json`));

    const turn1After = await replayCache.read(hash1);
    expect(turn1After).not.toBeNull(); // Still succeeds

    const turn2After = await replayCache.read(hash2);
    expect(turn2After).toBeNull(); // Only turn 2 degrades
  });
});
