/**
 * Keyless Google Cloud Vertex AI Gemini client using Application Default Credentials,
 * runtime project fallback, dynamic model discovery, and JSON schema validation retry.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { sanitizeSchemaForVertex } from "../agent/descriptor-linter";

export interface GenerateRequest {
  role: string;
  capability?: "pro" | "flash";
  system: string;
  messages: Array<{ role: "user" | "model"; content: string }>;
  tools?: Array<Record<string, unknown>>;
  responseSchema?: Record<string, unknown>;
  temperature?: number;
  signal?: AbortSignal;
}

export interface GenerateResponse {
  text: string;
  toolCalls: Array<{ name: string; args: Record<string, unknown> }>;
  model: string;
  project: string;
  location: string;
  usage: { promptTokens: number; outputTokens: number; totalTokens: number };
}

export type GenerateJsonOutcome<T> =
  | {
      ok: true;
      data: T;
      model: string;
      project: string;
      usage: { promptTokens: number; outputTokens: number; totalTokens: number };
    }
  | {
      ok: false;
      degraded: true;
      reason: string;
      model: string;
      usage: { promptTokens: number; outputTokens: number; totalTokens: number };
    };

export interface VertexTransport {
  fetchJson(
    url: string,
    init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal }
  ): Promise<{ status: number; body: unknown }>;
  getAccessToken(): Promise<{ token: string; quotaProject?: string }>;
  getGcloudConfiguredProject(): Promise<string | null>;
}

export interface VertexModelClient {
  discoverGeminiModel(
    capability: "pro" | "flash"
  ): Promise<{ model: string; project: string; location: string }>;
  generate(req: GenerateRequest): Promise<GenerateResponse>;
  generateJson<T>(
    req: GenerateRequest,
    validate?: (val: unknown) => string[]
  ): Promise<GenerateJsonOutcome<T>>;
}

let envLoaded = false;
function ensureDotEnvLoaded(): void {
  if (envLoaded) return;
  envLoaded = true;
  if (typeof process === "undefined" || !process.cwd) return;

  try {
    const envPath = resolve(process.cwd(), ".env");
    if (existsSync(envPath)) {
      const content = readFileSync(envPath, "utf8");
      const lines = content.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (process.env[key] === undefined) {
            process.env[key] = val;
          }
        }
      }
    }
  } catch {
    // Ignore error if fs is unavailable
  }
}

export function createDefaultVertexTransport(): VertexTransport {
  ensureDotEnvLoaded();

  return {
    async fetchJson(url, init) {
      const res = await fetch(url, {
        method: init.method,
        headers: init.headers,
        body: init.body,
        signal: init.signal,
      });
      const body = await res.json().catch(() => ({}));
      return { status: res.status, body };
    },
    async getAccessToken() {
      const { GoogleAuth } = await import("google-auth-library");
      const auth = new GoogleAuth({
        scopes: ["https://www.googleapis.com/auth/cloud-platform"],
      });
      const client = await auth.getClient();
      const tokenResponse = await client.getAccessToken();
      const token = tokenResponse.token ?? "";
      const projectId = await auth.getProjectId().catch(() => undefined);
      return { token, quotaProject: projectId };
    },
    async getGcloudConfiguredProject() {
      try {
        const { execFile } = await import("node:child_process");
        return await new Promise<string | null>((resolve) => {
          execFile("gcloud", ["config", "get-value", "project"], (err, stdout) => {
            if (err) resolve(null);
            else resolve(stdout.trim() || null);
          });
        });
      } catch {
        return null;
      }
    },
  };
}

export function createVertexModelClient(options?: {
  transport?: VertexTransport;
  preferredProject?: string;
  location?: string;
}): VertexModelClient {
  ensureDotEnvLoaded();

  const transport = options?.transport ?? createDefaultVertexTransport();

  function getApiKey(): string | null {
    if (typeof process === "undefined") return null;
    const useVertex = process.env.GOOGLE_GENAI_USE_VERTEXAI === "true";
    if (useVertex) return null;
    return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || null;
  }

  function getNormalizedProject(): string {
    let proj = options?.preferredProject ?? process.env.GOOGLE_CLOUD_PROJECT ?? "hacka-2026-09-agentic-cinema1";
    if (proj.startsWith("projects/")) {
      proj = proj.slice("projects/".length);
    }
    return proj;
  }

  const location = options?.location ?? process.env.GOOGLE_CLOUD_LOCATION ?? "us-central1";

  const discoveredModels = new Map<string, { model: string; project: string; location: string }>();

  async function discoverGeminiModel(
    capability: "pro" | "flash"
  ): Promise<{ model: string; project: string; location: string }> {
    const cached = discoveredModels.get(capability);
    if (cached) return cached;

    const apiKey = getApiKey();

    if (apiKey) {
      // Path A: Gemini Developer API discovery
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
        const res = await transport.fetchJson(url, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        });

        if (res.status === 200 && res.body && typeof res.body === "object") {
          const modelsList = (res.body as { models?: Array<{ name: string }> }).models ?? [];
          const modelNames = modelsList.map((m) => m.name.replace(/^models\//, ""));

          const proCandidates = ["gemini-3.1-pro-preview", "gemini-2.5-pro", "gemini-pro-latest"];
          const flashCandidates = ["gemini-3.8-flash", "gemini-2.5-flash", "gemini-flash-latest"];
          const candidateList = capability === "pro" ? proCandidates : flashCandidates;

          let chosenModel = candidateList.find((c) => modelNames.includes(c)) ??
            modelNames.find((n) => (capability === "pro" ? n.includes("pro") : n.includes("flash"))) ??
            (capability === "pro" ? "gemini-3.1-pro-preview" : "gemini-3.8-flash");

          const record = { model: chosenModel, project: "developer-api", location: "global" };
          discoveredModels.set(capability, record);
          return record;
        }
      } catch {
        // Fall back to default model
      }

      const fallback = {
        model: capability === "pro" ? "gemini-3.1-pro-preview" : "gemini-3.8-flash",
        project: "developer-api",
        location: "global",
      };
      discoveredModels.set(capability, fallback);
      return fallback;
    }

    // Path B: Vertex AI model discovery
    const project = getNormalizedProject();
    const fallback = {
      model: capability === "pro" ? "gemini-2.5-pro" : "gemini-2.5-flash",
      project,
      location,
    };
    discoveredModels.set(capability, fallback);
    return fallback;
  }

  async function dispatchGenerate(
    req: GenerateRequest,
    modelInfo: { model: string; project: string; location: string },
    userProjectHeader?: string
  ): Promise<{ status: number; body: unknown }> {
    const apiKey = getApiKey();

    const contents = req.messages.map((m) => ({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: m.content }],
    }));

    const bodyPayload: Record<string, unknown> = {
      systemInstruction: {
        parts: [{ text: req.system }],
      },
      contents,
      generationConfig: {
        temperature: req.temperature ?? 0.2,
      },
    };

    if (req.responseSchema) {
      (bodyPayload.generationConfig as Record<string, unknown>).responseMimeType =
        "application/json";
      (bodyPayload.generationConfig as Record<string, unknown>).responseSchema =
        sanitizeSchemaForVertex(req.responseSchema as never);
    }

    if (req.tools && req.tools.length > 0) {
      bodyPayload.tools = req.tools;
    }

    if (apiKey) {
      // Path A: Developer API
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelInfo.model}:generateContent`;
      return transport.fetchJson(url, {
        method: "POST",
        headers: {
          "x-goog-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(bodyPayload),
        signal: req.signal,
      });
    }

    // Path B: Vertex AI
    const auth = await transport.getAccessToken();
    const url = `https://${modelInfo.location}-aiplatform.googleapis.com/v1beta1/projects/${modelInfo.project}/locations/${modelInfo.location}/publishers/google/models/${modelInfo.model}:generateContent`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${auth.token}`,
      "Content-Type": "application/json",
    };

    if (userProjectHeader) {
      headers["x-goog-user-project"] = userProjectHeader;
    }

    return transport.fetchJson(url, {
      method: "POST",
      headers,
      body: JSON.stringify(bodyPayload),
      signal: req.signal,
    });
  }

  async function generate(req: GenerateRequest): Promise<GenerateResponse> {
    const capability = req.capability ?? (req.role.includes("pro") ? "pro" : "flash");
    const modelInfo = await discoverGeminiModel(capability);

    let res = await dispatchGenerate(req, modelInfo);

    // 403 fallback on Vertex AI: check configured gcloud project
    if (res.status === 403 && !getApiKey()) {
      const gcloudProj = await transport.getGcloudConfiguredProject();
      if (gcloudProj && gcloudProj !== modelInfo.project) {
        modelInfo.project = gcloudProj;
        res = await dispatchGenerate(req, modelInfo, gcloudProj);
      }
    }

    // 429 backoff retry once
    if (res.status === 429 || res.status === 503) {
      const jitter = Math.floor(Math.random() * 250);
      await new Promise((r) => setTimeout(r, 400 + jitter));
      res = await dispatchGenerate(req, modelInfo);
    }

    if (res.status !== 200) {
      const errStr = JSON.stringify(res.body);
      throw new Error(`Model API call failed with HTTP ${res.status}: ${errStr}`);
    }

    const bodyObj = res.body as {
      candidates?: Array<{
        content?: {
          parts?: Array<{
            text?: string;
            functionCall?: { name: string; args: Record<string, unknown> };
          }>;
        };
      }>;
      usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        totalTokenCount?: number;
      };
    };

    const firstCandidate = bodyObj.candidates?.[0];
    const parts = firstCandidate?.content?.parts ?? [];
    const textPart = parts.find((p) => typeof p.text === "string")?.text ?? "";
    const toolCalls = parts
      .filter((p) => p.functionCall)
      .map((p) => ({
        name: p.functionCall!.name,
        args: p.functionCall!.args ?? {},
      }));

    const usage = {
      promptTokens: bodyObj.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: bodyObj.usageMetadata?.candidatesTokenCount ?? 0,
      totalTokens: bodyObj.usageMetadata?.totalTokenCount ?? 0,
    };

    return {
      text: textPart,
      toolCalls,
      model: modelInfo.model,
      project: modelInfo.project,
      location: modelInfo.location,
      usage,
    };
  }

  function extractCleanJson(text: string): string {
    let clean = text.trim();
    if (clean.startsWith("```")) {
      clean = clean.replace(/^```[a-z]*\s*/i, "").replace(/\s*```$/, "");
    }
    return clean.trim();
  }

  async function generateJson<T>(
    req: GenerateRequest,
    validate?: (val: unknown) => string[]
  ): Promise<GenerateJsonOutcome<T>> {
    const capability = req.capability ?? (req.role.includes("pro") ? "pro" : "flash");
    const modelInfo = await discoverGeminiModel(capability);

    let currentReq: GenerateRequest = { ...req };
    let lastError = "";
    let usageAcc = { promptTokens: 0, outputTokens: 0, totalTokens: 0 };

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await generate(currentReq);
        usageAcc = {
          promptTokens: usageAcc.promptTokens + response.usage.promptTokens,
          outputTokens: usageAcc.outputTokens + response.usage.outputTokens,
          totalTokens: usageAcc.totalTokens + response.usage.totalTokens,
        };

        const clean = extractCleanJson(response.text);
        let parsed: unknown;
        try {
          parsed = JSON.parse(clean);
        } catch (parseErr) {
          lastError = `JSON parse error: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`;
          if (attempt === 0) {
            currentReq = {
              ...currentReq,
              messages: [
                ...currentReq.messages,
                { role: "model", content: response.text },
                {
                  role: "user",
                  content: `Previous response failed to parse as valid JSON: ${lastError}. Return corrected JSON only.`,
                },
              ],
            };
            continue;
          }
          break;
        }

        if (validate) {
          const validationErrors = validate(parsed);
          if (validationErrors.length > 0) {
            lastError = `Validation errors: ${validationErrors.join("; ")}`;
            if (attempt === 0) {
              currentReq = {
                ...currentReq,
                messages: [
                  ...currentReq.messages,
                  { role: "model", content: response.text },
                  {
                    role: "user",
                    content: `Previous response failed validation: ${lastError}. Return corrected JSON only.`,
                  },
                ],
              };
              continue;
            }
            break;
          }
        }

        return {
          ok: true,
          data: parsed as T,
          model: response.model,
          project: response.project,
          usage: usageAcc,
        };
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        break;
      }
    }

    return {
      ok: false,
      degraded: true,
      reason: lastError,
      model: modelInfo.model,
      usage: usageAcc,
    };
  }

  return {
    discoverGeminiModel,
    generate,
    generateJson,
  };
}
