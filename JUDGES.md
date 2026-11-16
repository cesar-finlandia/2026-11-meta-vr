# Judges' guide

**Live:** (available in the hackathon submission)
**Video:** https://youtu.be/gPcY1CrTlsM
**Repository:** https://github.com/cesar-finlandia/2026-11-meta-vr

## The 60-second path
1. Open the live HTTPS URL on a Quest 3 browser or desktop Chrome; inspect the 3-wall gallery and floating 1:8 seated tabletop twin. — you should see: The gallery renders immediately at 0 open issues with sightline cones for both 152 cm standing and 115 cm seated eyes.
2. Press the 'Botanical' theme chip, then press 'Curate exhibition'. — you should see: Four Gemini roles propose a hang from the Art Institute of Chicago collection, the rule engine flags over-high or over-lit works, and the repair loop brings errors to 0.
3. When the curator checkpoint bar appears, press 'Approve change' to pin the spatial anchor. — you should see: The north wall pins to local-floor storage and the hero compliance counter settles on 0 issues.
4. Switch to 'Wheelchair 115 cm' view or visit '/watch' to step through the recorded trace. — you should see: The camera drops to a seated eye level so you can read the upward pitch and the paper lux values behind every verdict.

## Three prompts to try
1. `Curate six botanical works on paper and canvas with strict 50 lux conservation caps and wheelchair sightlines.`
2. `Arrange Piranesi architectural etchings and Wright window elevations across the north and west gallery walls.`
3. `Build an Impressionist color and scale study balanced around a 145 cm inclusive museum centerline.`

## Where it runs
Supported: Meta Quest 3 family browsers (WebXR immersive-ar + hand-tracking), Desktop Chromium, Edge or Chrome with the IWER Quest 3 emulator
Known gaps:
- Physical room wall plane scanning requires a Meta Quest 3 family headset; desktop browsers automatically use the calibrated 3-wall virtual gallery and 1:8 seated tabletop maquette.
- Live IIIF image fetching falls back to deterministic museum color-field plates when offline.

## Criteria → evidence
| Criterion | Where to see it |
|---|---|
| Innovation & Creativity | [Typed curatorial action surface](actions.manifest.json) · [Four-role curation workflow](src/agent/orchestrator.ts) |
| Experience Design | [Hand-driven interaction model](src/xr/hands-first.ts) · [In-context help copy](src/ui/help-content.ts) |
| Technical Implementation | [Deterministic rule engine](src/domain/truth-engine.ts) · [Treatment versus control evaluation](evals/report.json) |
| Polish & Presentation | [Design tokens](src/ui/tokens.css) · [Recorded run trace](run-trace.json) |
