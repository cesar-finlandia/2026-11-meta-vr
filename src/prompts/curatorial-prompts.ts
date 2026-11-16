/**
 * System instructions, dynamic user-turn builders, and strict JSON response schemas
 * for all four Gemini curatorial model roles.
 */
import type { ExhibitionModel, StrictActionInputSchema, TruthIssue } from "../domain/types";

export type CuratorialModelRole =
  | "curatorial_planner"
  | "layout_strategist"
  | "repair_critic"
  | "interpretive_writer";

export interface RolePromptBundle {
  role: CuratorialModelRole;
  capabilityTier: "pro" | "flash";
  temperature: number;
  system: string;
  userMessage: string;
  responseSchema: StrictActionInputSchema;
}

export function buildPlannerPrompt(
  model: ExhibitionModel,
  userBrief: string
): RolePromptBundle {
  const catalogInventory = model.catalog.map((c) => ({
    id: c.id,
    title: c.title,
    artist: c.artist,
    year: c.year,
    medium: c.medium,
    luxCap: c.luxCap,
    width_cm: c.width_cm,
    height_cm: c.height_cm,
    themes: c.themes,
  }));

  const wallCaps = model.walls.map((w) => ({
    id: w.id,
    name: w.name,
    width_cm: w.width_cm,
    height_cm: w.height_cm,
  }));

  return {
    role: "curatorial_planner",
    capabilityTier: "pro",
    temperature: 0.2,
    system: `You are the Lead Exhibition Curator and Registrar for Sightline Studio, a museum spatial planning workstation.
Your responsibility is to interpret the curator's exhibition brief, select 5 to 7 cohesive works from the available Art Institute of Chicago open-access catalog, and assign a primary curatorial theme and exhibition title.
Rules you must obey:
1. Reference artworks strictly by their exact catalog \`id\` values provided in the catalog inventory.
2. Balance visual rhythm across mediums while noting which selected works are light-sensitive works on paper (\`luxCap: 50\`) versus durable paintings (\`luxCap: 200\`).
3. Ensure the total width of works assigned to any single gallery wall leaves generous breathing room inside that wall's physical \`width_cm\`.
4. Return strictly valid JSON matching the requested schema with no markdown fences and no commentary outside JSON.`,
    userMessage: JSON.stringify({
      brief: userBrief,
      availableWalls: wallCaps,
      catalogInventory,
    }),
    responseSchema: {
      type: "object",
      properties: {
        exhibitionTitle: {
          type: "string",
          description: "Curated title for the exhibition.",
        },
        theme: {
          type: "string",
          description: "Primary curatorial theme.",
          enum: ["botanical", "architectural", "impressionist", "modernist"],
        },
        selectedArtworkIds: {
          type: "array",
          description: "List of 5 to 7 catalog artwork IDs chosen for the exhibition.",
          items: {
            type: "string",
            description: "Catalog artwork ID (e.g. 'aic-24645').",
          },
        },
        layoutTemplate: {
          type: "string",
          description: "Recommended parametric layout topology.",
          enum: ["chronological_spine", "salon_cluster", "symmetrical_pair"],
        },
        curatorialRationale: {
          type: "string",
          description: "Curatorial rationale explaining the thematic harmony and pacing.",
        },
      },
      required: [
        "exhibitionTitle",
        "theme",
        "selectedArtworkIds",
        "layoutTemplate",
        "curatorialRationale",
      ],
      additionalProperties: false,
    },
  };
}

export function buildLayoutStrategistPrompt(
  model: ExhibitionModel,
  selectedArtworkIds: string[],
  templateHint: string
): RolePromptBundle {
  const selectedArtworks = model.catalog
    .filter((a) => selectedArtworkIds.includes(a.id))
    .map((a) => ({
      id: a.id,
      title: a.title,
      artist: a.artist,
      year: a.year,
      medium: a.medium,
      outerWidth_cm: a.width_cm + 2 * a.frame_border_cm,
      outerHeight_cm: a.height_cm + 2 * a.frame_border_cm,
      luxCap: a.luxCap,
    }));

  const walls = model.walls.map((w) => ({
    id: w.id,
    name: w.name,
    width_cm: w.width_cm,
    height_cm: w.height_cm,
  }));

  return {
    role: "layout_strategist",
    capabilityTier: "pro",
    temperature: 0.2,
    system: `You are the Spatial Gallery Preparator and Lighting Designer for Sightline Studio.
Given the gallery wall dimensions in centimeters (\`width_cm\`, \`height_cm\`) and the selected artworks with physical frame sizes and conservation lux ceilings, propose exact wall assignments, \`(centerX_cm, centerY_cm)\` coordinates, and spotlight illuminance (\`spotLux\`) for each work.
Rules you must obey:
1. Keep at least 20 cm margin from left and right wall edges and aim for >= 18 cm horizontal gap between adjacent frames and their 18 cm wall placards.
2. Target a 144 to 150 cm vertical centerline so seated wheelchair visitors (115 cm eye height at 120 cm viewing distance) experience an upward viewing pitch <= 25.0 degrees.
3. Respect conservation lighting: works on paper (\`luxCap: 50\`) require \`spotLux <= 50\` (typically 42 to 48 lux); oil on canvas (\`luxCap: 200\`) typically uses 150 to 180 lux.
4. Distribute works across \`wall-north\`, \`wall-west\`, and \`wall-east\` so no wall overflows horizontally.
5. Return strictly valid JSON matching the schema with no markdown wrappers.`,
    userMessage: JSON.stringify({
      templateHint,
      galleryWalls: walls,
      artworksToPlace: selectedArtworks,
    }),
    responseSchema: {
      type: "object",
      properties: {
        placements: {
          type: "array",
          description: "List of spatial placements for every selected artwork.",
          items: {
            type: "object",
            description: "A single artwork placement on a wall.",
            properties: {
              artworkId: {
                type: "string",
                description: "Catalog artwork ID matching one of the artworks to place.",
              },
              wallId: {
                type: "string",
                description: "Target wall ID (e.g. 'wall-north', 'wall-west', or 'wall-east').",
              },
              centerX_cm: {
                type: "number",
                description: "Horizontal centerline coordinate along the wall in centimeters.",
              },
              centerY_cm: {
                type: "number",
                description: "Vertical centerline height above gallery floor in centimeters (144 to 150 cm).",
              },
              spotLux: {
                type: "number",
                description: "Track spotlight illuminance in lux (<= 50 for paper, <= 200 for canvas).",
              },
            },
            required: ["artworkId", "wallId", "centerX_cm", "centerY_cm", "spotLux"],
            additionalProperties: false,
          },
        },
      },
      required: ["placements"],
      additionalProperties: false,
    },
  };
}

export function buildRepairCriticPrompt(
  model: ExhibitionModel,
  issues: TruthIssue[],
  repairAttempt: number
): RolePromptBundle {
  const currentMounts = model.mounts.map((m) => {
    const art = model.catalog.find((a) => a.id === m.artworkId);
    return {
      mountId: m.id,
      artworkId: m.artworkId,
      wallId: m.wallId,
      title: art?.title,
      mediumTier: art?.mediumTier,
      luxCap: art?.luxCap,
      centerX_cm: m.centerX_cm,
      centerY_cm: m.centerY_cm,
      spotLux: m.spotLux,
      placardFontHeight_mm: m.placard.fontHeight_mm,
    };
  });

  const formattedIssues = issues.map((iss) => ({
    id: iss.id,
    ruleId: iss.ruleId,
    severity: iss.severity,
    wallId: iss.wallId,
    mountId: iss.mountId,
    measuredValue: iss.measuredValue,
    limitValue: iss.limitValue,
    unit: iss.unit,
    message: iss.message,
    suggestedAction: iss.suggestedAction,
    suggestedArgs: iss.suggestedArgs,
  }));

  return {
    role: "repair_critic",
    capabilityTier: "flash",
    temperature: 0.1,
    system: `You are the Accessibility and Conservation Compliance Critic for Sightline Studio.
Deterministic geometry and conservation code (\`SightlineTruthEngine\`) has audited the current gallery hang and reported concrete violations in centimeters (\`cm\`), viewing degrees (\`deg\`), or illuminance (\`lux\`).
Your task is to emit precise repair instructions that resolve every reported violation to zero errors while preserving curatorial order:
1. For \`RULE_ADA_PITCH\` or \`RULE_CENTERLINE_BAND\`: lower \`targetCenterY_cm\` to \`145\` cm so 115 cm wheelchair viewing pitch drops well below 25.0 degrees.
2. For \`RULE_CCI_LUX\`: set \`targetSpotLux\` to \`45\` lux for paper works (\`50 lux\` cap) or \`170\` lux for oil works (\`200 lux\` cap).
3. For \`RULE_FRAME_CLEARANCE\` or \`RULE_WALL_BOUNDS\`: include the \`wallId\` in \`wallsToReflow\` with \`minGap_cm: 18\`.
4. For \`RULE_XAUR_LEGIBILITY\` or \`RULE_PLACARD_PLACEMENT\`: set \`targetFontHeight_mm\` to \`28\` mm (\`>= 1.2\` degrees at 120 cm) and \`placardCenterY_cm\` to \`130\` cm.
Return strictly valid JSON matching the repair schema.`,
    userMessage: JSON.stringify({
      repairAttempt,
      activeIssues: formattedIssues,
      currentMounts,
    }),
    responseSchema: {
      type: "object",
      properties: {
        repairs: {
          type: "array",
          description: "Targeted mount repairs addressing specific issues.",
          items: {
            type: "object",
            description: "Targeted repair parameters for a mount issue.",
            properties: {
              issueId: {
                type: "string",
                description: "ID of the issue being addressed.",
              },
              mountId: {
                type: "string",
                description: "Mounted artwork ID to adjust.",
              },
              targetCenterY_cm: {
                type: "number",
                description: "Corrected vertical centerline height above floor in centimeters (145 cm).",
              },
              targetSpotLux: {
                type: "number",
                description: "Corrected spotlight illuminance in lux (45 lux paper, 170 lux canvas).",
              },
              targetFontHeight_mm: {
                type: "number",
                description: "Corrected placard headline font height in millimeters (28 mm).",
              },
            },
            required: [
              "issueId",
              "mountId",
              "targetCenterY_cm",
              "targetSpotLux",
              "targetFontHeight_mm",
            ],
            additionalProperties: false,
          },
        },
        wallsToReflow: {
          type: "array",
          description: "List of wall IDs requiring horizontal spacing reflow.",
          items: {
            type: "string",
            description: "Wall ID to reflow (e.g. 'wall-north').",
          },
        },
        criticSummary: {
          type: "string",
          description: "Summary of compliance adjustments made to reach zero errors.",
        },
      },
      required: ["repairs", "wallsToReflow", "criticSummary"],
      additionalProperties: false,
    },
  };
}

export function buildInterpretiveWriterPrompt(
  model: ExhibitionModel,
  targetMountIds?: string[]
): RolePromptBundle {
  const mountsToDescribe = (
    targetMountIds
      ? model.mounts.filter((m) => targetMountIds.includes(m.id))
      : model.mounts
  ).map((m) => {
    const art = model.catalog.find((a) => a.id === m.artworkId);
    return {
      mountId: m.id,
      artworkId: m.artworkId,
      title: art?.title ?? "Untitled",
      artist: art?.artist ?? "Unknown",
      year: art?.year ?? 1900,
      medium: art?.medium ?? "Mixed media",
      themes: art?.themes ?? [],
    };
  });

  return {
    role: "interpretive_writer",
    capabilityTier: "flash",
    temperature: 0.35,
    system: `You are the Interpretive Museum Educator for Sightline Studio.
Write concise, accessible wall placard copy (\`42\` to \`68\` words per mounted artwork) suitable for reading inside a mixed-reality headset and on physical museum plaques at 120 cm distance.
Rules you must obey:
1. Mention the artwork's medium, visual structure, and connection to the exhibition theme in clear, concrete prose.
2. Avoid academic jargon, superlatives, or self-referential AI phrasing.
3. Keep every \`curatorialNote\` between 42 and 68 words and set \`fontHeight_mm\` to \`28\` so angular text height exceeds the 1.2-degree legibility standard.
4. Return strictly valid JSON matching the placard schema.`,
    userMessage: JSON.stringify({
      exhibitionTitle: model.exhibitionTitle,
      curatorialBrief: model.curatorialBrief,
      activeTheme: model.activeTheme,
      mounts: mountsToDescribe,
    }),
    responseSchema: {
      type: "object",
      properties: {
        placards: {
          type: "array",
          description: "Drafted museum placards for mounts.",
          items: {
            type: "object",
            description: "Drafted interpretive placard for a mounted artwork.",
            properties: {
              mountId: {
                type: "string",
                description: "Mounted artwork ID.",
              },
              curatorialNote: {
                type: "string",
                description: "42 to 68 word interpretive wall text.",
              },
              fontHeight_mm: {
                type: "number",
                description: "Placard font height in millimeters (28 mm).",
              },
            },
            required: ["mountId", "curatorialNote", "fontHeight_mm"],
            additionalProperties: false,
          },
        },
      },
      required: ["placards"],
      additionalProperties: false,
    },
  };
}
