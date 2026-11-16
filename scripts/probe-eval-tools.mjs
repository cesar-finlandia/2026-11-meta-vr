#!/usr/bin/env node
/**
 * Probes Vertex AI once with the real treatment-arm tool declarations, before any evaluation
 * session is spent. Exits 1 with the exact error when the declarations are rejected.
 * Usage: node --import tsx scripts/probe-eval-tools.mjs
 */
import { createSession } from "../src/domain/session.ts";
import { bindCuratorialActions } from "../src/agent/actions.ts";
import { sanitizeSchemaForVertex } from "../src/agent/descriptor-linter.ts";

if (!process.execArgv.some((a) => a.includes("tsx"))) {
  console.error("Usage: node --import tsx scripts/probe-eval-tools.mjs");
  process.exit(1);
}

const project = process.env.GOOGLE_CLOUD_PROJECT;
const location = process.env.GOOGLE_CLOUD_LOCATION || "us-central1";
if (!project) {
  console.error("probe: set GOOGLE_CLOUD_PROJECT");
  process.exit(1);
}

const session = createSession({ seed: "default", attachWindow: false });
bindCuratorialActions(session);
const declarations = session.registry.list().map((d) => ({
  name: d.name,
  description: d.description,
  parameters: sanitizeSchemaForVertex(d.inputSchema),
}));

const { GoogleAuth } = await import("google-auth-library");
const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
const token = await auth.getAccessToken();
const model = process.env.PROBE_MODEL || "gemini-2.5-flash";
const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:generateContent`;

const res = await fetch(url, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    contents: [{ role: "user", parts: [{ text: "Check the exhibition for compliance problems." }] }],
    tools: [{ functionDeclarations: declarations }],
  }),
});
const body = await res.json();
if (!res.ok) {
  console.error(`probe FAILED (${res.status}): ${JSON.stringify(body.error ?? body).slice(0, 600)}`);
  process.exit(1);
}
const part = body.candidates?.[0]?.content?.parts?.find((p) => p.functionCall);
console.log(`probe OK: ${declarations.length} declarations accepted; first call: ${part ? part.functionCall.name : "(text reply)"}`);
