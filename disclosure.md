# Disclosure

## Originality

Every line of application source code in this repository was written during the Meta VR Start Developer Competition 2026 (New Experience division, after September 24, 2026). No application code the entrant wrote earlier is present.

## Runtime dependencies

- `@drawcall/uikitml` 0.1.8 (no licence declared in the published package metadata): Markup for the in-headset placard panels
- `@fontsource-variable/fraunces` 5.3.0 (OFL-1.1): Self-hosted display typeface
- `@fontsource-variable/jetbrains-mono` 5.3.0 (OFL-1.1): Self-hosted monospace typeface
- `@fontsource-variable/plus-jakarta-sans` 5.3.0 (OFL-1.1): Self-hosted body typeface
- `@iwsdk/core` 1.1.0 (MIT): Immersive Web SDK: entity sync and WebXR session handling for the Quest 3 experience
- `@react-three/fiber` 9.8.2 (MIT): React renderer for the three.js scene
- `express` 5.1.0 (MIT): HTTP server for the API, the event stream and the built client
- `google-auth-library` 11.3.4 (Apache-2.0): Application Default Credentials for Vertex AI calls
- `iwer` 2.8.0 (MIT): Meta Quest 3 runtime emulation and hand-gesture simulation on desktop
- `lil-gui` 0.21.0 (MIT): Lighting and material tuning panel on the lab route
- `lucide-react` 1.73.0 (ISC): Interface icons
- `react` 19.3.1 (MIT): User interface components
- `react-dom` 19.3.1 (MIT): Browser rendering for the React interface
- `three` 0.185.0 (MIT): 3D rendering of the gallery, the 1:8 maquette and the sightline cones

## Development dependencies

- `@playwright/test` 1.65.1 (Apache-2.0): Real-browser end-to-end test runner
- `@types/express` 5.0.6 (MIT): Type definitions
- `@types/node` 22.19.1 (MIT): Type definitions
- `@types/react` 19.2.14 (MIT): Type definitions
- `@types/react-dom` 19.2.3 (MIT): Type definitions
- `@types/three` 0.185.0 (MIT): Type definitions
- `@vitejs/plugin-react` 5.1.4 (MIT): React support in the bundler
- `jsdom` 26.1.0 (MIT): DOM environment for component tests
- `tsx` 4.21.0 (MIT): Runs the TypeScript server and scripts
- `typescript` 5.9.3 (Apache-2.0): Static type checking
- `vite` 7.3.1 (MIT): Development server and production bundler
- `vitest` 4.0.18 (MIT): Unit and integration test runner

## Museum data

24 public-domain works from the Art Institute of Chicago Open Access collection, released under Creative Commons Zero (CC0 1.0 Universal). See `UPSTREAM-NOTICE.md`.

## Generated media in the demonstration video

- Three short concept clips were generated with Google Veo 3.1 (SynthID watermarked) and reused from a shared clip library. Each is labelled CONCEPT VISUALIZATION on screen; every product capability shown comes from live capture of the deployed app.
- The narration is synthesized speech: Gemini 2.5 Pro text-to-speech through Vertex AI, voice Sulafat.
- The music bed is AI-generated instrumental music (Google Lyria, SynthID watermarked), reused from a shared music library.
- The cover and the two slide backgrounds are images generated with a Gemini image model through Vertex AI, checked for the absence of text, and laid out with real text in HTML.

## AI assistance

- The architecture and design plans were written with AI assistance.
- The application modules were implemented and checked with AI coding agents together with automated browser and unit test suites.
- The running application uses Google Gemini through Vertex AI for curatorial reasoning: planning, layout strategy, repair critique and placard writing. Every wall change that persists passes through the curator's approval, and all compliance verdicts come from a deterministic rule engine, not from the model.
