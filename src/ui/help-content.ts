/**
 * Single source of truth for the primary product explainer and every contextual ? popover.
 */

export type ResultRegionId =
  | "spatial-stage"
  | "truth-compliance"
  | "approval-bar"
  | "activity-feed"
  | "manual-runner";

export interface HelpEntry {
  regionId: ResultRegionId;
  ariaLabel: string;
  title: string;
  body: string;
  goodResultHint: string;
}

export interface ExplainerContent {
  buttonLabel: string;
  dialogTitle: string;
  whatItDoes: string;
  whoItServes: string;
  workflowSteps: [string, string, string, string, string];
  howToReadVerdict: string;
  tryItCtaLabel: string;
}

export const EXPLAINER_CONTENT: ExplainerContent = {
  buttonLabel: "How Sightline works",
  dialogTitle: "How Sightline Studio Works",
  whatItDoes:
    "Sightline Studio lets museum curators and gallery preparators arrange real open-access artworks on 3D room walls or a seated 1:8 tabletop gallery twin while checking wheelchair sightlines and conservation lighting automatically.",
  whoItServes:
    "Built for exhibition curators and registrars like Elena, it catches neck-straining hang heights, cramped frame gaps, and over-lit works on paper before anyone drills into a physical gallery wall.",
  workflowSteps: [
    "Scan room walls in WebXR passthrough or use the 2-foot seated 1:8 tabletop maquette.",
    "Choose or type a curatorial theme over the 24-work Art Institute of Chicago collection, or import your own IIIF v3 JSON.",
    "Watch the multi-stage Gemini planner hang works while the deterministic Truth Engine flags wheelchair pitch (>25°) and paper lux (>50 lux) issues and repairs them.",
    "Approve or reject proposed changes in the approval bar, or pinch-drag and dismiss frames directly with bare hands.",
    "Pin your spatial anchor and export a metric hang schedule JSON.",
  ],
  howToReadVerdict:
    "A green 0 open issues hero readout means every mounted frame clears 15 cm spacing, stays under 25° upward viewing pitch from a 115 cm wheelchair eye level, keeps sensitive paper works at <=50 lux, and places wall placards at >=1.2° visual angle inside the central 30° headset field of view.",
  tryItCtaLabel: "Run botanical curation demo",
};

export const HELP_CONTENT: Record<ResultRegionId, HelpEntry> = {
  "spatial-stage": {
    regionId: "spatial-stage",
    ariaLabel: "What is the dual-scale spatial gallery stage?",
    title: "Dual-Scale Spatial Gallery Stage",
    body: "Displays your curated walls in real-time 3D and WebXR. Switch between the 1:8 seated tabletop maquette (55 cm ahead for desk or airplane use) and 1:1 room passthrough, or preview exact 115 cm wheelchair and 152 cm standing sightline cones.",
    goodResultHint: "Unobstructed view cones and aligned artwork frames without wall overlap.",
  },
  "truth-compliance": {
    regionId: "truth-compliance",
    ariaLabel: "What is the ADA and conservation compliance verdict?",
    title: "ADA & Conservation Compliance Verdict",
    body: "Deterministic geometric audit computed by code, never guessed by a model. Checks 15 cm inter-frame gaps, <=25° upward pitch from 115 cm wheelchair eye level, <=50 lux illumination on paper works, and >=1.2° placard legibility.",
    goodResultHint: "0 open issues with green indicator and all metrics within comfortable thresholds.",
  },
  "approval-bar": {
    regionId: "approval-bar",
    ariaLabel: "How does the curator approval gate work?",
    title: "Curator Approval Gate",
    body: "Pauses destructive or hang-replacing agent actions until you press Approve or Reject. Rejecting sends your refusal back to the curatorial agent so it adapts without overwriting your wall.",
    goodResultHint: "Curator oversight confirmed before modifying exhibition layouts.",
  },
  "activity-feed": {
    regionId: "activity-feed",
    ariaLabel: "What is the curatorial activity ledger?",
    title: "Curatorial Activity Ledger",
    body: "Live record of every Gemini role call, IWSDK spatial update, and bare-hand gesture with measured latency and state revision. Select any entry to frame the affected artwork in 3D.",
    goodResultHint: "Complete audit trail with low latency and clear source attribution.",
  },
  "manual-runner": {
    regionId: "manual-runner",
    ariaLabel: "What are timeline snapshots and the manual tool runner?",
    title: "Timeline Snapshots & Manual Runner",
    body: "Scrub backward and forward across saved curatorial milestones, export your metric hang schedule JSON, or execute any of the 20 typed spatial actions directly without AI.",
    goodResultHint: "Reliable manual fallback and downloadable metric installation schedule.",
  },
};
