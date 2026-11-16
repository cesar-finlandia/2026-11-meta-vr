#!/usr/bin/env node
/**
 * Writes disclosure.md from package.json and the licences of installed dependencies.
 * Usage: node scripts/generate-disclosure.mjs
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

const ROOT = process.cwd();
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));

const PURPOSE = {
  "@iwsdk/core": "Immersive Web SDK: entity sync and WebXR session handling for the Quest 3 experience",
  "@drawcall/uikitml": "Markup for the in-headset placard panels",
  "three": "3D rendering of the gallery, the 1:8 maquette and the sightline cones",
  "@react-three/fiber": "React renderer for the three.js scene",
  "iwer": "Meta Quest 3 runtime emulation and hand-gesture simulation on desktop",
  "react": "User interface components",
  "react-dom": "Browser rendering for the React interface",
  "express": "HTTP server for the API, the event stream and the built client",
  "google-auth-library": "Application Default Credentials for Vertex AI calls",
  "lil-gui": "Lighting and material tuning panel on the lab route",
  "lucide-react": "Interface icons",
  "@fontsource-variable/fraunces": "Self-hosted display typeface",
  "@fontsource-variable/jetbrains-mono": "Self-hosted monospace typeface",
  "@fontsource-variable/plus-jakarta-sans": "Self-hosted body typeface",
  "@playwright/test": "Real-browser end-to-end test runner",
  "vitest": "Unit and integration test runner",
  "vite": "Development server and production bundler",
  "typescript": "Static type checking",
  "tsx": "Runs the TypeScript server and scripts",
  "jsdom": "DOM environment for component tests",
  "@vitejs/plugin-react": "React support in the bundler",
  "@types/express": "Type definitions",
  "@types/node": "Type definitions",
  "@types/react": "Type definitions",
  "@types/react-dom": "Type definitions",
  "@types/three": "Type definitions",
};

function licenceOf(name) {
  const p = join(ROOT, "node_modules", name, "package.json");
  if (!existsSync(p)) return { version: "not installed", license: "unknown" };
  const j = JSON.parse(readFileSync(p, "utf8"));
  const lic = typeof j.license === "string" ? j.license : j.license?.type ?? (Array.isArray(j.licenses) ? j.licenses.map((l) => l.type).join(" OR ") : "unknown");
  return { version: j.version, license: lic && lic !== "unknown" ? lic : "no licence declared in the published package metadata" };
}

const deps = Object.keys(pkg.dependencies ?? {}).sort();
const devDeps = Object.keys(pkg.devDependencies ?? {}).sort();

const line = (name) => {
  const { version, license } = licenceOf(name);
  return `- \`${name}\` ${version} (${license}): ${PURPOSE[name] ?? "Supporting package"}`;
};

const doc = `# Disclosure

## Originality

Every line of application source code in this repository was written during the Meta VR Start Developer Competition 2026 (New Experience division, after September 24, 2026). No application code the entrant wrote earlier is present.

## Runtime dependencies

${deps.map(line).join("\n")}

## Development dependencies

${devDeps.map(line).join("\n")}

## Museum data

24 public-domain works from the Art Institute of Chicago Open Access collection, released under Creative Commons Zero (CC0 1.0 Universal). See \`UPSTREAM-NOTICE.md\`.

## Generated media in the demonstration video

- Three short concept clips were generated with Google Veo 3.1 (SynthID watermarked) and reused from a shared clip library. Each is labelled CONCEPT VISUALIZATION on screen; every product capability shown comes from live capture of the deployed app.
- The narration is synthesized speech: Gemini 2.5 Pro text-to-speech through Vertex AI, voice Sulafat.
- The music bed is AI-generated instrumental music (Google Lyria, SynthID watermarked), reused from a shared music library.
- The cover and the two slide backgrounds are images generated with a Gemini image model through Vertex AI, checked for the absence of text, and laid out with real text in HTML.

## AI assistance

- The architecture and design plans were written with AI assistance.
- The application modules were implemented and checked with AI coding agents together with automated browser and unit test suites.
- The running application uses Google Gemini through Vertex AI for curatorial reasoning: planning, layout strategy, repair critique and placard writing. Every wall change that persists passes through the curator's approval, and all compliance verdicts come from a deterministic rule engine, not from the model.
`;

writeFileSync(join(ROOT, "disclosure.md"), doc, "utf8");
console.log(`disclosure.md generated (${deps.length + devDeps.length} dependencies)`);
