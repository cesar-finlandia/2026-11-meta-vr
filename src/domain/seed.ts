/**
 * Deterministic exhibition seed factory producing compliant, violation-bearing,
 * and empty gallery configurations over the 24-work Art Institute of Chicago catalog.
 */
import { BUNDLED_AIC_CATALOG } from "./collection-loader";
import { computeHangLayout } from "./hang-layouts";
import type {
  ArtworkCatalogItem,
  ExhibitionModel,
  MountedArtwork,
  SpatialAnchorRecord,
  TimelineSnapshot,
  WallPlane,
} from "./types";

export type SeedPreset = "default" | "needs-repair" | "empty";

export function createDefaultGalleryWalls(): WallPlane[] {
  return [
    {
      id: "wall-north",
      name: "North Limestone Gallery Wall",
      width_cm: 420,
      height_cm: 280,
      position_m: [0, 0, -2.1],
      rotation_deg: 0,
      source: "virtual_twin",
    },
    {
      id: "wall-west",
      name: "West Study Alcove",
      width_cm: 360,
      height_cm: 280,
      position_m: [-2.1, 0, 0],
      rotation_deg: 90,
      source: "virtual_twin",
    },
    {
      id: "wall-east",
      name: "East Conservation Wall",
      width_cm: 360,
      height_cm: 280,
      position_m: [2.1, 0, 0],
      rotation_deg: -90,
      source: "virtual_twin",
    },
  ];
}

function findArtwork(catalog: readonly ArtworkCatalogItem[], id: string): ArtworkCatalogItem {
  const found = catalog.find((c) => c.id === id);
  if (!found) throw new Error(`Seed catalog missing required artwork: ${id}`);
  return found;
}

export function createSeedExhibition(preset: SeedPreset = "default"): ExhibitionModel {
  const walls = createDefaultGalleryWalls();
  const catalog = BUNDLED_AIC_CATALOG.map((item) => ({ ...item }));

  const base: ExhibitionModel = {
    exhibitionTitle: "Sightline Curatorial Suite: Art Institute Masterworks",
    curatorialBrief:
      "Curated spatial arrangement of 18th-20th century Art Institute works balancing conservation illuminance, wheelchair viewing geometry, and rhythmic wall spacing.",
    activeTheme: "botanical_and_architectural",
    selectedArtworkIds: [
      "aic-80607",
      "aic-24645",
      "aic-16568",
      "aic-109439",
      "aic-81539",
      "aic-151363",
    ],
    rejectedArtworkIds: [],
    walls,
    catalog,
    mounts: [],
    anchors: [],
    snapshots: [],
    viewMode: "tabletop_maquette",
    passthroughActive: false,
    scaleTwinActive: true,
    selectedMountId: null,
    selectedWallId: "wall-north",
    hudPitchOffset_deg: 0,
    hudYawOffset_deg: 0,
    revision: 1,
  };

  if (preset === "empty") {
    return base;
  }

  // Selected works for default hang
  const northWorks = [
    findArtwork(catalog, "aic-80607"), // Korin 1705 (paper 50 lux)
    findArtwork(catalog, "aic-24645"), // Hokusai 1831 (paper 50 lux)
    findArtwork(catalog, "aic-16568"), // Monet 1906 (canvas 200 lux)
  ];
  const westWorks = [
    findArtwork(catalog, "aic-109439"), // Redoute 1812 (paper 50 lux)
    findArtwork(catalog, "aic-81539"),  // Cezanne 1893 (canvas 200 lux)
  ];
  const eastWorks = [
    findArtwork(catalog, "aic-151363"), // Sullivan 1922 (paper 50 lux)
  ];

  const northMounts = computeHangLayout("chronological_spine", walls[0], northWorks);
  const westMounts = computeHangLayout("chronological_spine", walls[1], westWorks);
  const eastMounts = computeHangLayout("chronological_spine", walls[2], eastWorks);

  const mounts: MountedArtwork[] = [...northMounts, ...westMounts, ...eastMounts];

  const anchorNorth: SpatialAnchorRecord = {
    id: "anchor-north-1",
    wallId: "wall-north",
    label: "North Limestone Anchor",
    referenceSpace: "virtual-twin",
    poseMatrix16: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -2.1, 1],
    pinnedMountIds: northMounts.map((m) => m.id),
    savedAtIso: "2026-11-14T10:00:00.000Z",
  };

  const initialSnapshot: TimelineSnapshot = {
    id: "snapshot-seed-initial",
    label: "Seed Curated Hang",
    revision: 1,
    createdAtIso: "2026-11-14T10:00:00.000Z",
    mounts: structuredClone(mounts),
    anchors: [anchorNorth],
    activeTheme: base.activeTheme,
    curatorialBrief: base.curatorialBrief,
    issueCount: 0,
  };

  if (preset === "default") {
    return {
      ...base,
      mounts,
      anchors: [anchorNorth],
      snapshots: [initialSnapshot],
    };
  }

  // preset === "needs-repair"
  // Inject deliberate ADA pitch, lux, frame clearance, and legibility violations
  const mutatedMounts: MountedArtwork[] = mounts.map((mount) => {
    // 1. Hokusai Great Wave on North Wall: hung too high (176 cm) and over-lit (135 lux)
    if (mount.artworkId === "aic-24645") {
      return {
        ...mount,
        centerY_cm: 176, // Violates RULE_ADA_PITCH and RULE_CENTERLINE_BAND
        spotLux: 135,    // Violates RULE_CCI_LUX (paper luxCap = 50)
      };
    }

    // 2. Monet Water Lilies on North Wall: moved close to Hokusai (clearance 9 cm) + cramped font (16 mm)
    if (mount.artworkId === "aic-16568") {
      const hokusaiMount = mounts.find((m) => m.artworkId === "aic-24645")!;
      const hokusaiRight = hokusaiMount.centerX_cm + 46 / 2; // 46 outerW
      const monetOuterW = 104; // 94 + 2 * 5
      const newMonetCenter = hokusaiRight + 9 + monetOuterW / 2; // only 9 cm clearance
      return {
        ...mount,
        centerX_cm: Math.round(newMonetCenter * 10) / 10,
        placard: {
          ...mount.placard,
          fontHeight_mm: 16, // Violates RULE_XAUR_LEGIBILITY (0.76° < 1.2°)
        },
      };
    }

    return mount;
  });

  return {
    ...base,
    mounts: mutatedMounts,
    anchors: [anchorNorth],
    snapshots: [
      {
        ...initialSnapshot,
        mounts: structuredClone(mutatedMounts),
        issueCount: 4,
      },
    ],
  };
}
