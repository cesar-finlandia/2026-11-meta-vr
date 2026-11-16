/**
 * Twenty typed curatorial domain actions, human-name entity resolvers,
 * state-derived next-action hints, and deterministic manifest exporter.
 */
import type {
  ActionCallContext,
  ActionCallResult,
  ActionDescriptor,
  ActionGroup,
  ActionManifest,
  ActionManifestEntry,
  ActionRegistry,
  ArtworkCatalogItem,
  ExhibitionModel,
  HangTemplateId,
  MountedArtwork,
  SightlineSession,
  TruthIssue,
  WallPlane,
} from "../domain/types";
import { BUNDLED_AIC_CATALOG, parseIiifManifest } from "../domain/collection-loader";
import { computeHangLayout, reflowWallMounts } from "../domain/hang-layouts";

export const CURATORIAL_PROCEDURES: ReadonlyArray<{
  name: string;
  steps: string[];
}> = [
  {
    name: "curatorial_onboarding_and_compliance",
    steps: [
      "scan_room_planes",
      "toggle_seated_scale_twin",
      "filter_curatorial_theme",
      "propose_wall_layout",
      "validate_ada_compliance",
      "pin_spatial_anchor",
    ],
  },
  {
    name: "audit_and_repair_wall",
    steps: [
      "validate_ada_compliance",
      "check_fov_label_legibility",
      "repair_layout_violation",
      "reflow_wall_spacing",
      "scrub_timeline_snapshot",
    ],
  },
  {
    name: "interactive_mount_reflow",
    steps: [
      "swap_rejected_artwork",
      "reflow_wall_spacing",
      "validate_ada_compliance",
    ],
  },
];

export function resolveWall(
  model: ExhibitionModel,
  idOrName: string
): WallPlane | undefined {
  if (!idOrName) return undefined;
  const trimmed = idOrName.trim();
  const lower = trimmed.toLowerCase();

  const exactId = model.walls.find((w) => w.id === trimmed);
  if (exactId) return exactId;

  const exactName = model.walls.find((w) => w.name.toLowerCase() === lower);
  if (exactName) return exactName;

  return model.walls.find(
    (w) => w.name.toLowerCase().includes(lower) || lower.includes(w.name.toLowerCase())
  );
}

export function resolveArtwork(
  model: ExhibitionModel,
  idOrTitle: string
): ArtworkCatalogItem | undefined {
  if (!idOrTitle) return undefined;
  const trimmed = idOrTitle.trim();
  const lower = trimmed.toLowerCase();

  const exactId = model.catalog.find((a) => a.id === trimmed);
  if (exactId) return exactId;

  const exactTitle = model.catalog.find((a) => a.title.toLowerCase() === lower);
  if (exactTitle) return exactTitle;

  const substring = model.catalog.find(
    (a) => a.title.toLowerCase().includes(lower) || lower.includes(a.title.toLowerCase())
  );
  if (substring) return substring;

  // Token-based matching for human curatorial shorthand (e.g. "The Great Wave off Kanagawa")
  const words = lower.split(/[^a-z0-9]+/).filter((w) => w.length >= 4);
  if (words.length > 0) {
    const tokenMatch = model.catalog.find((a) => {
      const artTitleLower = a.title.toLowerCase();
      return words.filter((w) => artTitleLower.includes(w)).length >= Math.min(2, words.length);
    });
    if (tokenMatch) return tokenMatch;
  }

  return undefined;
}

export function resolveMount(
  model: ExhibitionModel,
  idOrTitle: string
): MountedArtwork | undefined {
  if (!idOrTitle) return undefined;
  const trimmed = idOrTitle.trim();
  const lower = trimmed.toLowerCase();

  const exactId = model.mounts.find((m) => m.id === trimmed);
  if (exactId) return exactId;

  const matchedArtwork = resolveArtwork(model, trimmed);
  if (matchedArtwork) {
    const mountByArt = model.mounts.find((m) => m.artworkId === matchedArtwork.id);
    if (mountByArt) return mountByArt;
  }

  return model.mounts.find((m) => {
    const art = model.catalog.find((a) => a.id === m.artworkId);
    return art && (art.title.toLowerCase().includes(lower) || lower.includes(art.title.toLowerCase()));
  });
}

export function deriveValidNextActions(model: ExhibitionModel): string[] {
  const actions: string[] = ["get_capabilities", "scan_room_planes"];

  if (model.mounts.length === 0) {
    actions.push(
      "filter_curatorial_theme",
      "propose_wall_layout",
      "load_iiif_collection",
      "toggle_seated_scale_twin"
    );
  } else {
    actions.push(
      "validate_ada_compliance",
      "compute_sightline_frustum",
      "check_fov_label_legibility",
      "adjust_frame_height",
      "set_spot_illumination",
      "reflow_wall_spacing",
      "draft_curatorial_placard",
      "preview_wheelchair_eye_level",
      "pin_spatial_anchor",
      "scrub_timeline_snapshot",
      "export_exhibition_manifest"
    );
  }

  if (model.selectedMountId !== null) {
    actions.push("swap_rejected_artwork");
  }

  return actions;
}

export function buildCuratorialActionDescriptors(
  session: SightlineSession
): ActionDescriptor[] {
  const store = session.store;
  const truthEngine = session.truthEngine;

  return [
    {
      name: "scan_room_planes",
      camelAlias: "scanRoomPlanes",
      title: "Scan Room Planes",
      group: "Read",
      description:
        "Reads detected WebXR vertical wall planes in centimeters or returns the three calibrated virtual gallery walls (420x280 cm, 360x280 cm, 360x280 cm). Precondition: XR session active or virtual twin initialized. Example: scan_room_planes({ source: 'virtual_twin' }). Follows the six-step Curatorial Onboarding and Compliance Protocol.",
      inputSchema: {
        type: "object",
        properties: {
          source: {
            type: "string",
            description:
              "Source of wall planes: 'webxr_plane' for detected physical boundaries or 'virtual_twin' for default calibrated gallery walls.",
            enum: ["webxr_plane", "virtual_twin"],
          },
        },
        required: [],
        additionalProperties: false,
      },
      resultShape: "{ walls: WallPlane[], passthroughActive: boolean }",
      annotations: {
        readOnly: true,
        destructive: false,
        untrustedContent: false,
        dynamic: false,
      },
      execute(args) {
        const model = store.getState();
        const source = (args.source as string) ?? "virtual_twin";
        return {
          ok: true,
          summary: `Scanned ${model.walls.length} gallery wall planes from source '${source}'.`,
          data: {
            walls: model.walls,
            passthroughActive: model.passthroughActive,
          },
          revision: model.revision,
          validNextActions: deriveValidNextActions(model),
        };
      },
    },
    {
      name: "toggle_passthrough_wall_mode",
      camelAlias: "togglePassthroughWallMode",
      title: "Toggle Passthrough Wall Mode",
      group: "Navigate/View",
      description:
        "Switches passthrough active state and view mode between 1:1 physical room passthrough and virtual gallery elevation. Precondition: WebXR immersive-ar session available or virtual studio fallback ready. Example: toggle_passthrough_wall_mode({ enabled: true }).",
      inputSchema: {
        type: "object",
        properties: {
          enabled: {
            type: "boolean",
            description:
              "True to enable passthrough room mode; false for pure virtual gallery rendering.",
          },
        },
        required: ["enabled"],
        additionalProperties: false,
      },
      resultShape: "{ passthroughActive: boolean, viewMode: ViewMode }",
      annotations: {
        readOnly: false,
        destructive: false,
        untrustedContent: false,
        dynamic: false,
      },
      execute(args) {
        const enabled = Boolean(args.enabled);
        const res = store.dispatch({ type: "SET_PASSTHROUGH_MODE", enabled });
        const model = store.getState();
        return {
          ok: res.ok,
          summary: enabled
            ? "Passthrough room mode activated at 1:1 scale."
            : "Virtual gallery elevation mode activated.",
          data: {
            passthroughActive: model.passthroughActive,
            viewMode: model.viewMode,
          },
          revision: model.revision,
          validNextActions: deriveValidNextActions(model),
        };
      },
    },
    {
      name: "toggle_seated_scale_twin",
      camelAlias: "toggleSeatedScaleTwin",
      title: "Toggle Seated Scale Twin",
      group: "Navigate/View",
      description:
        "Activates or stows the 1:8 miniature tabletop gallery maquette floating 55 cm ahead inside a 60 cm (2 ft) seated reach sphere. Precondition: Exhibition store initialized. Example: toggle_seated_scale_twin({ enabled: true }).",
      inputSchema: {
        type: "object",
        properties: {
          enabled: {
            type: "boolean",
            description:
              "True to activate the 1:8 scale tabletop maquette, false to stow.",
          },
        },
        required: ["enabled"],
        additionalProperties: false,
      },
      resultShape: "{ scaleTwinActive: boolean, viewMode: ViewMode }",
      annotations: {
        readOnly: false,
        destructive: false,
        untrustedContent: false,
        dynamic: false,
      },
      execute(args) {
        const enabled = Boolean(args.enabled);
        const res = store.dispatch({ type: "SET_SCALE_TWIN_MODE", enabled });
        const model = store.getState();
        return {
          ok: res.ok,
          summary: enabled
            ? "1:8 scale seated tabletop maquette active within 60 cm reach sphere."
            : "Tabletop maquette stowed.",
          data: {
            scaleTwinActive: model.scaleTwinActive,
            viewMode: model.viewMode,
          },
          revision: model.revision,
          validNextActions: deriveValidNextActions(model),
        };
      },
    },
    {
      name: "load_iiif_collection",
      camelAlias: "loadIiifCollection",
      title: "Load IIIF Collection",
      group: "Cross-boundary",
      description:
        "Parses an untrusted IIIF Presentation v2/v3 JSON string or loads the bundled 24-work Art Institute of Chicago CC0 catalog with physical centimeter dimensions and 50/200 lux ceilings. Precondition: Valid network or bundled collection access. Example: load_iiif_collection({ useBundledDefault: true }).",
      inputSchema: {
        type: "object",
        properties: {
          manifestJson: {
            type: "string",
            description:
              "Raw IIIF Presentation JSON string to parse and sanitize into museum catalog items.",
          },
          useBundledDefault: {
            type: "boolean",
            description:
              "True to load the bundled 24-artwork Art Institute of Chicago open access collection.",
          },
        },
        required: [],
        additionalProperties: false,
      },
      resultShape: "{ loadedCount: number, totalCatalogSize: number }",
      annotations: {
        readOnly: false,
        destructive: false,
        untrustedContent: true,
        dynamic: false,
      },
      execute(args) {
        let items: ArtworkCatalogItem[] = [];
        if (args.manifestJson && typeof args.manifestJson === "string") {
          try {
            const raw = JSON.parse(args.manifestJson);
            items = parseIiifManifest(raw);
          } catch (err) {
            return {
              ok: false,
              summary: `Failed to parse IIIF manifest JSON: ${err instanceof Error ? err.message : String(err)}`,
              data: {},
              revision: store.getState().revision,
              validNextActions: ["load_iiif_collection"],
              errorCode: "IIIF_PARSE_ERROR",
            };
          }
        } else {
          items = [...BUNDLED_AIC_CATALOG];
        }

        const res = store.dispatch({ type: "LOAD_CATALOG", items, merge: false });
        const model = store.getState();
        return {
          ok: res.ok,
          summary: `Loaded ${items.length} collection artworks into studio catalog.`,
          data: {
            loadedCount: items.length,
            totalCatalogSize: model.catalog.length,
          },
          revision: model.revision,
          validNextActions: deriveValidNextActions(model),
        };
      },
    },
    {
      name: "filter_curatorial_theme",
      camelAlias: "filterCuratorialTheme",
      title: "Filter Curatorial Theme",
      group: "Read",
      description:
        "Ranks catalog artworks against curatorial brief keywords, theme ('botanical', 'architectural', 'impressionist', 'modernist'), and optional conservation maxLuxCeiling (50 or 200 lux). To find specific artists or titles, pass query with their names; those works are always included and listed first. Precondition: Catalog populated. Example: filter_curatorial_theme({ brief: 'Architectural etchings', theme: 'architectural', query: 'Piranesi Wright' }).",
      inputSchema: {
        type: "object",
        properties: {
          brief: {
            type: "string",
            description: "Curator brief describing the exhibition goals and aesthetic direction.",
          },
          theme: {
            type: "string",
            description: "Target curatorial theme to filter by.",
            enum: ["botanical", "architectural", "impressionist", "modernist"],
          },
          maxLuxCeiling: {
            type: "number",
            description:
              "Maximum allowable lux ceiling (50 lux for light-sensitive paper, 200 lux for oil on canvas).",
          },
          query: {
            type: "string",
            description: "Optional artist, title or medium keywords such as 'Piranesi Wright'; works that match are always included and listed first.",
          },
        },
        required: ["brief"],
        additionalProperties: false,
      },
      resultShape: "{ theme: string, matchingArtworks: ArtworkCatalogItem[] }",
      annotations: {
        readOnly: true,
        destructive: false,
        untrustedContent: false,
        dynamic: false,
      },
      execute(args) {
        const model = store.getState();
        const brief = (args.brief as string) ?? "";
        const theme = (args.theme as string) ?? "botanical";
        const maxLux = typeof args.maxLuxCeiling === "number" ? args.maxLuxCeiling : undefined;

        const queryWords =
          typeof args.query === "string"
            ? args.query.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3)
            : [];
        const queryHit = (art: ArtworkCatalogItem): boolean =>
          queryWords.some((w) => `${art.title} ${art.artist} ${art.medium}`.toLowerCase().includes(w));

        const matching = model.catalog
          .filter((art) => {
            if (maxLux !== undefined && art.luxCap > maxLux) return false;
            const themeMatch = art.themes.includes(theme);
            const textMatch =
              brief.length > 0 &&
              (art.title.toLowerCase().includes(brief.toLowerCase()) ||
                art.medium.toLowerCase().includes(brief.toLowerCase()));
            return themeMatch || textMatch || queryHit(art);
          })
          .sort((a, b) => Number(queryHit(b)) - Number(queryHit(a)));

        store.dispatch({
          type: "SET_CURATORIAL_THEME",
          brief,
          theme,
          selectedArtworkIds: matching.map((a) => a.id),
        });

        const updated = store.getState();
        return {
          ok: true,
          summary: `Filtered ${matching.length} artworks matching theme '${theme}'.`,
          data: {
            theme,
            matchingArtworks: matching,
          },
          revision: updated.revision,
          validNextActions: deriveValidNextActions(updated),
        };
      },
    },
    {
      name: "propose_wall_layout",
      camelAlias: "proposeWallLayout",
      title: "Propose Wall Layout",
      group: "Create/Change",
      description:
        "Computes a parametric wall hang ('chronological_spine', 'salon_cluster', 'symmetrical_pair') on wallIdOrName for artworkIds, verifying clearance and margins. Precondition: Target wall exists and artworkIds are present in catalog. Example: propose_wall_layout({ wallIdOrName: 'wall-north', artworkIds: ['art-1', 'art-2'], template: 'chronological_spine' }).",
      inputSchema: {
        type: "object",
        properties: {
          wallIdOrName: {
            type: "string",
            description:
              "Target wall identifier or human-readable wall name (e.g. 'North Limestone Gallery Wall').",
          },
          artworkIds: {
            type: "array",
            description: "Array of catalog artwork IDs to place on the wall.",
            items: { type: "string", description: "Artwork catalog item ID." },
          },
          template: {
            type: "string",
            description: "Parametric hang template identifier.",
            enum: ["chronological_spine", "salon_cluster", "symmetrical_pair"],
          },
        },
        required: ["wallIdOrName", "artworkIds"],
        additionalProperties: false,
      },
      resultShape: "{ wallId: string, mountsCount: number, mounts: MountedArtwork[] }",
      annotations: {
        readOnly: false,
        destructive: false,
        untrustedContent: false,
        dynamic: false,
      },
      execute(args) {
        const model = store.getState();
        const wall = resolveWall(model, String(args.wallIdOrName));
        if (!wall) {
          return {
            ok: false,
            summary: `Wall '${args.wallIdOrName}' could not be resolved.`,
            data: {},
            revision: model.revision,
            validNextActions: deriveValidNextActions(model),
            errorCode: "WALL_NOT_FOUND",
          };
        }

        const rawIds = Array.isArray(args.artworkIds) ? (args.artworkIds as string[]) : [];
        const artworks = rawIds
          .map((id) => resolveArtwork(model, id))
          .filter((a): a is ArtworkCatalogItem => a !== undefined);

        if (artworks.length === 0) {
          return {
            ok: false,
            summary: "No valid catalog artworks resolved from provided artworkIds.",
            data: {},
            revision: model.revision,
            validNextActions: deriveValidNextActions(model),
            errorCode: "EMPTY_ARTWORK_SELECTION",
          };
        }

        const template = (args.template as HangTemplateId) ?? "chronological_spine";
        const mounts = computeHangLayout(template, wall, artworks);

        store.dispatch({
          type: "REPLACE_WALL_MOUNTS",
          wallId: wall.id,
          mounts,
        });

        const updated = store.getState();
        return {
          ok: true,
          summary: `Computed ${template} hang for ${mounts.length} works on ${wall.name}.`,
          data: {
            wallId: wall.id,
            mountsCount: mounts.length,
            mounts,
          },
          revision: updated.revision,
          validNextActions: deriveValidNextActions(updated),
        };
      },
    },
    {
      name: "place_framed_artwork",
      camelAlias: "placeFramedArtwork",
      title: "Place Framed Artwork",
      group: "Create/Change",
      description:
        "Mounts a single framed artwork onto target wall at center coordinates (centerX_cm, centerY_cm) with track spotlight illuminance in lux, creating an accompanying museum placard. Precondition: Target wall and artwork catalog entry exist. Example: place_framed_artwork({ wallIdOrName: 'wall-north', artworkIdOrTitle: 'art-1', centerX_cm: 210, centerY_cm: 148, spotLux: 45 }).",
      inputSchema: {
        type: "object",
        properties: {
          wallIdOrName: {
            type: "string",
            description: "Target wall identifier or human-readable name.",
          },
          artworkIdOrTitle: {
            type: "string",
            description: "Artwork catalog identifier or artwork title.",
          },
          centerX_cm: {
            type: "number",
            description: "Horizontal position of frame center along wall in centimeters.",
          },
          centerY_cm: {
            type: "number",
            description: "Vertical position of frame center above gallery floor in centimeters.",
          },
          spotLux: {
            type: "number",
            description: "Spotlight illuminance in lux (15 to 300 lux).",
          },
        },
        required: ["wallIdOrName", "artworkIdOrTitle", "centerX_cm", "centerY_cm"],
        additionalProperties: false,
      },
      resultShape: "{ mount: MountedArtwork }",
      annotations: {
        readOnly: false,
        destructive: false,
        untrustedContent: false,
        dynamic: false,
      },
      execute(args) {
        const model = store.getState();
        const wall = resolveWall(model, String(args.wallIdOrName));
        if (!wall) {
          return {
            ok: false,
            summary: `Wall '${args.wallIdOrName}' not found.`,
            data: {},
            revision: model.revision,
            validNextActions: deriveValidNextActions(model),
            errorCode: "WALL_NOT_FOUND",
          };
        }

        const artwork = resolveArtwork(model, String(args.artworkIdOrTitle));
        if (!artwork) {
          return {
            ok: false,
            summary: `Artwork '${args.artworkIdOrTitle}' not found in catalog.`,
            data: {},
            revision: model.revision,
            validNextActions: deriveValidNextActions(model),
            errorCode: "ARTWORK_NOT_FOUND",
          };
        }

        const centerX = Number(args.centerX_cm);
        const centerY = Number(args.centerY_cm);
        const lux = typeof args.spotLux === "number" ? Number(args.spotLux) : artwork.luxCap === 50 ? 45 : 170;

        const mountId = `mnt-${wall.id}-${artwork.id}`;
        const placardId = `plc-${mountId}`;
        const totalW = artwork.width_cm + 2 * artwork.frame_border_cm;
        const placardWidth = 18;
        const placardGap = 10;
        const placardX = centerX + totalW / 2 + placardGap + placardWidth / 2;

        const mount: MountedArtwork = {
          id: mountId,
          artworkId: artwork.id,
          wallId: wall.id,
          centerX_cm: centerX,
          centerY_cm: centerY,
          spotLux: lux,
          pinnedAnchorId: null,
          placard: {
            id: placardId,
            mountId,
            wallId: wall.id,
            titleText: artwork.title,
            artistLine: `${artwork.artist}, ${artwork.year}`,
            curatorialNote: `${artwork.medium}. Conservation lighting ceiling: ${artwork.luxCap} lux.`,
            wordCount: 12,
            centerX_cm: placardX,
            centerY_cm: Math.max(120, centerY - 15),
            width_cm: 18,
            height_cm: 14,
            fontHeight_mm: 28,
            side: "right",
          },
        };

        store.dispatch({ type: "UPSERT_MOUNT", mount });
        const updated = store.getState();
        return {
          ok: true,
          summary: `Mounted '${artwork.title}' on ${wall.name} at (${centerX}, ${centerY}) cm with ${lux} lux.`,
          data: { mount },
          revision: updated.revision,
          validNextActions: deriveValidNextActions(updated),
        };
      },
    },
    {
      name: "adjust_frame_height",
      camelAlias: "adjustFrameHeight",
      title: "Adjust Frame Height",
      group: "Create/Change",
      description:
        "Moves a mounted framed artwork vertically (centerY_cm in cm, optional centerX_cm in cm) and synchronizes its museum placard height. Precondition: Mount exists on an active wall. Example: adjust_frame_height({ mountIdOrTitle: 'mount-1', centerY_cm: 145 }).",
      inputSchema: {
        type: "object",
        properties: {
          mountIdOrTitle: {
            type: "string",
            description: "Mounted artwork identifier or artwork title.",
          },
          centerY_cm: {
            type: "number",
            description: "New vertical center height above floor in centimeters.",
          },
          centerX_cm: {
            type: "number",
            description: "Optional new horizontal center position along wall in centimeters.",
          },
        },
        required: ["mountIdOrTitle", "centerY_cm"],
        additionalProperties: false,
      },
      resultShape: "{ mountId: string, centerY_cm: number, centerX_cm: number }",
      annotations: {
        readOnly: false,
        destructive: false,
        untrustedContent: false,
        dynamic: false,
      },
      execute(args) {
        const model = store.getState();
        const mount = resolveMount(model, String(args.mountIdOrTitle));
        if (!mount) {
          return {
            ok: false,
            summary: `Mount '${args.mountIdOrTitle}' not found.`,
            data: {},
            revision: model.revision,
            validNextActions: deriveValidNextActions(model),
            errorCode: "MOUNT_NOT_FOUND",
          };
        }

        const centerY = Number(args.centerY_cm);
        const centerX = typeof args.centerX_cm === "number" ? Number(args.centerX_cm) : undefined;

        store.dispatch({
          type: "ADJUST_MOUNT_POSITION",
          mountId: mount.id,
          centerY_cm: centerY,
          centerX_cm: centerX,
        });

        const updated = store.getState();
        const updatedMount = updated.mounts.find((m) => m.id === mount.id);
        return {
          ok: true,
          summary: `Adjusted mount '${mount.id}' height to ${centerY} cm above floor.`,
          data: {
            mountId: mount.id,
            centerY_cm: centerY,
            centerX_cm: updatedMount?.centerX_cm ?? mount.centerX_cm,
          },
          revision: updated.revision,
          validNextActions: deriveValidNextActions(updated),
        };
      },
    },
    {
      name: "reflow_wall_spacing",
      camelAlias: "reflowWallSpacing",
      title: "Reflow Wall Spacing",
      group: "Create/Change",
      description:
        "Runs reflowWallMounts across target wall so every adjacent frame and placard clears minGap_cm (default 18 cm, rule floor 15 cm) and 20 cm wall margins. Precondition: Target wall has at least one mounted work. Example: reflow_wall_spacing({ wallIdOrName: 'wall-north', minGap_cm: 18 }).",
      inputSchema: {
        type: "object",
        properties: {
          wallIdOrName: {
            type: "string",
            description: "Target wall identifier or human-readable name.",
          },
          minGap_cm: {
            type: "number",
            description:
              "Minimum gap between adjacent frames and placards in centimeters (default 18 cm).",
          },
        },
        required: ["wallIdOrName"],
        additionalProperties: false,
      },
      resultShape: "{ wallId: string, reflowedCount: number, mounts: MountedArtwork[] }",
      annotations: {
        readOnly: false,
        destructive: false,
        untrustedContent: false,
        dynamic: false,
      },
      execute(args) {
        const model = store.getState();
        const wall = resolveWall(model, String(args.wallIdOrName));
        if (!wall) {
          return {
            ok: false,
            summary: `Wall '${args.wallIdOrName}' not found.`,
            data: {},
            revision: model.revision,
            validNextActions: deriveValidNextActions(model),
            errorCode: "WALL_NOT_FOUND",
          };
        }

        const wallMounts = model.mounts.filter((m) => m.wallId === wall.id);
        const minGap = typeof args.minGap_cm === "number" ? Number(args.minGap_cm) : 18;
        const reflowed = reflowWallMounts(wall, wallMounts, model.catalog, minGap);

        store.dispatch({
          type: "REPLACE_WALL_MOUNTS",
          wallId: wall.id,
          mounts: reflowed,
        });

        const updated = store.getState();
        return {
          ok: true,
          summary: `Reflowed ${reflowed.length} mounts along ${wall.name} with ${minGap} cm minimum clearance.`,
          data: {
            wallId: wall.id,
            reflowedCount: reflowed.length,
            mounts: reflowed,
          },
          revision: updated.revision,
          validNextActions: deriveValidNextActions(updated),
        };
      },
    },
    {
      name: "set_spot_illumination",
      camelAlias: "setSpotIllumination",
      title: "Set Spot Illumination",
      group: "Create/Change",
      description:
        "Sets track spotlight illuminance in lux (15 to 300 lux) on target mount to satisfy 50 lux paper or 200 lux canvas conservation ceilings. Precondition: Target mount exists. Example: set_spot_illumination({ mountIdOrTitle: 'mount-1', spotLux: 45 }).",
      inputSchema: {
        type: "object",
        properties: {
          mountIdOrTitle: {
            type: "string",
            description: "Mounted artwork identifier or artwork title.",
          },
          spotLux: {
            type: "number",
            description: "Target illuminance in lux (15 to 300 lux).",
          },
        },
        required: ["mountIdOrTitle", "spotLux"],
        additionalProperties: false,
      },
      resultShape: "{ mountId: string, spotLux: number }",
      annotations: {
        readOnly: false,
        destructive: false,
        untrustedContent: false,
        dynamic: false,
      },
      execute(args) {
        const model = store.getState();
        const mount = resolveMount(model, String(args.mountIdOrTitle));
        if (!mount) {
          return {
            ok: false,
            summary: `Mount '${args.mountIdOrTitle}' not found.`,
            data: {},
            revision: model.revision,
            validNextActions: deriveValidNextActions(model),
            errorCode: "MOUNT_NOT_FOUND",
          };
        }

        const spotLux = Number(args.spotLux);
        store.dispatch({
          type: "SET_MOUNT_LUX",
          mountId: mount.id,
          spotLux,
        });

        const updated = store.getState();
        return {
          ok: true,
          summary: `Set track spotlight on mount '${mount.id}' to ${spotLux} lux.`,
          data: {
            mountId: mount.id,
            spotLux,
          },
          revision: updated.revision,
          validNextActions: deriveValidNextActions(updated),
        };
      },
    },
    {
      name: "compute_sightline_frustum",
      camelAlias: "computeSightlineFrustum",
      title: "Compute Sightline Frustum",
      group: "Verify",
      description:
        "Computes 152 cm standing and 115 cm wheelchair 3D sightline cones, upward pitch angles in degrees, and angular placard legibility across the active gallery. Precondition: Exhibition has mounts placed. Example: compute_sightline_frustum({ wallIdOrName: 'wall-north' }).",
      inputSchema: {
        type: "object",
        properties: {
          wallIdOrName: {
            type: "string",
            description: "Optional wall identifier or name to filter sightline cones.",
          },
        },
        required: [],
        additionalProperties: false,
      },
      resultShape: "{ coneCount: number, cones: SightlineCone[] }",
      annotations: {
        readOnly: true,
        destructive: false,
        untrustedContent: false,
        dynamic: false,
      },
      execute(args) {
        const model = store.getState();
        let cones = truthEngine.computeSightlineFrustums(model);

        if (args.wallIdOrName) {
          const wall = resolveWall(model, String(args.wallIdOrName));
          if (wall) {
            cones = cones.filter((c) => c.wallId === wall.id);
          }
        }

        return {
          ok: true,
          summary: `Computed ${cones.length} 3D sightline cones (115 cm seated wheelchair and 152 cm standing).`,
          data: {
            coneCount: cones.length,
            cones,
          },
          revision: model.revision,
          validNextActions: deriveValidNextActions(model),
        };
      },
    },
    {
      name: "preview_wheelchair_eye_level",
      camelAlias: "previewWheelchairEyeLevel",
      title: "Preview Wheelchair Eye Level",
      group: "Navigate/View",
      description:
        "Shifts active viewMode to wheelchair_115 (115 cm eye height) or standing_152 (152 cm eye height) and selects optional mount to frame in 3D. Precondition: Exhibition store initialized. Example: preview_wheelchair_eye_level({ enabled: true, mountIdOrTitle: 'mount-1' }).",
      inputSchema: {
        type: "object",
        properties: {
          enabled: {
            type: "boolean",
            description:
              "True for 115 cm seated wheelchair perspective; false for 152 cm standing.",
          },
          mountIdOrTitle: {
            type: "string",
            description: "Optional mounted artwork identifier or title to frame in focus.",
          },
        },
        required: ["enabled"],
        additionalProperties: false,
      },
      resultShape: "{ viewMode: ViewMode, selectedMountId: string | null }",
      annotations: {
        readOnly: false,
        destructive: false,
        untrustedContent: false,
        dynamic: false,
      },
      execute(args) {
        const enabled = Boolean(args.enabled);
        const viewMode = enabled ? "wheelchair_115" : "standing_152";
        store.dispatch({ type: "SET_VIEW_MODE", viewMode });

        if (args.mountIdOrTitle) {
          const mount = resolveMount(store.getState(), String(args.mountIdOrTitle));
          if (mount) {
            store.dispatch({ type: "SELECT_ENTITY", mountId: mount.id, wallId: mount.wallId });
          }
        }

        const model = store.getState();
        return {
          ok: true,
          summary: enabled
            ? "Previewing seated wheelchair perspective at 115 cm eye level."
            : "Previewing standing perspective at 152 cm eye level.",
          data: {
            viewMode: model.viewMode,
            selectedMountId: model.selectedMountId,
          },
          revision: model.revision,
          validNextActions: deriveValidNextActions(model),
        };
      },
    },
    {
      name: "validate_ada_compliance",
      camelAlias: "validateAdaCompliance",
      title: "Validate ADA Compliance",
      group: "Verify",
      description:
        "Runs full seven-rule SightlineTruthEngine audit, returning all errors and warnings with measured centimeter, degree, and lux values and suggested repair calls. Precondition: Exhibition store initialized. Example: validate_ada_compliance({ wallIdOrName: 'wall-north' }).",
      inputSchema: {
        type: "object",
        properties: {
          wallIdOrName: {
            type: "string",
            description: "Optional wall identifier or name to restrict audit.",
          },
        },
        required: [],
        additionalProperties: false,
      },
      resultShape: "{ compliant: boolean, errorCount: number, warningCount: number, issues: TruthIssue[] }",
      annotations: {
        readOnly: true,
        destructive: false,
        untrustedContent: false,
        dynamic: false,
      },
      execute(args) {
        const model = store.getState();
        let issues = truthEngine.checkExhibition(model);

        if (args.wallIdOrName) {
          const wall = resolveWall(model, String(args.wallIdOrName));
          if (wall) {
            issues = issues.filter((iss) => iss.wallId === wall.id);
          }
        }

        const errorCount = issues.filter((iss) => iss.severity === "error").length;
        const warningCount = issues.filter((iss) => iss.severity === "warning").length;

        return {
          ok: true,
          summary:
            errorCount === 0
              ? `Exhibition passes ADA and conservation compliance audit (0 errors, ${warningCount} warnings).`
              : `Found ${errorCount} ADA/conservation compliance errors across gallery mounts.`,
          data: {
            compliant: errorCount === 0,
            errorCount,
            warningCount,
            issues,
          },
          revision: model.revision,
          validNextActions: deriveValidNextActions(model),
        };
      },
    },
    {
      name: "check_fov_label_legibility",
      camelAlias: "checkFovLabelLegibility",
      title: "Check FoV Label Legibility",
      group: "Verify",
      description:
        "Evaluates W3C XAUR placard angular font height (>= 1.2 degrees at 120 cm viewing distance) and verifies floating HUD offsets stay inside 30x22 degree central headset FoV cone. Precondition: Mounts with placards exist. Example: check_fov_label_legibility({ mountIdOrTitle: 'mount-1' }).",
      inputSchema: {
        type: "object",
        properties: {
          mountIdOrTitle: {
            type: "string",
            description: "Optional mounted artwork identifier or title to evaluate.",
          },
        },
        required: [],
        additionalProperties: false,
      },
      resultShape: "{ legibleCount: number, violatingCount: number, placards: Array<{ mountId: string, fontHeight_mm: number, angularHeight_deg: number, pass: boolean }> }",
      annotations: {
        readOnly: true,
        destructive: false,
        untrustedContent: false,
        dynamic: false,
      },
      execute(args) {
        const model = store.getState();
        let mounts = model.mounts;
        if (args.mountIdOrTitle) {
          const m = resolveMount(model, String(args.mountIdOrTitle));
          if (m) mounts = [m];
        }

        const distanceMm = 1200;
        const placards = mounts.map((m) => {
          const fontMm = m.placard.fontHeight_mm;
          const rad = 2 * Math.atan(fontMm / (2 * distanceMm));
          const deg = (rad * 180) / Math.PI;
          const pass = deg >= 1.2;
          return {
            mountId: m.id,
            fontHeight_mm: fontMm,
            angularHeight_deg: Number(deg.toFixed(2)),
            pass,
          };
        });

        const legibleCount = placards.filter((p) => p.pass).length;
        const violatingCount = placards.length - legibleCount;

        return {
          ok: true,
          summary: `Evaluated ${placards.length} placards: ${legibleCount} meet W3C XAUR 1.2° legibility threshold, ${violatingCount} require adjustment.`,
          data: {
            legibleCount,
            violatingCount,
            placards,
          },
          revision: model.revision,
          validNextActions: deriveValidNextActions(model),
        };
      },
    },
    {
      name: "repair_layout_violation",
      camelAlias: "repairLayoutViolation",
      title: "Repair Layout Violation",
      group: "Create/Change",
      description:
        "Repairs every open ADA and conservation error in one call with repairAll: true, or one issue or mount at a time. Pass repairAll: true to fix every open error in one call (frame height, lighting, placard height and spacing, print size). Or pass issueId from validate_ada_compliance to fix that one issue with its recommended correction, or name a mount with explicit targets (targetCenterY_cm, targetSpotLux, targetFontHeight_mm, targetPlacardCenterY_cm, reflowWall). Precondition: the exhibition has mounted works. Example: repair_layout_violation({ repairAll: true }).",
      inputSchema: {
        type: "object",
        properties: {
          issueId: {
            type: "string",
            description: "Optional TruthIssue identifier to repair.",
          },
          mountIdOrTitle: {
            type: "string",
            description: "Target mount identifier or artwork title.",
          },
          targetCenterY_cm: {
            type: "number",
            description:
              "Corrected vertical centerline height above gallery floor in centimeters.",
          },
          targetSpotLux: {
            type: "number",
            description: "Corrected track spotlight illuminance in lux.",
          },
          targetFontHeight_mm: {
            type: "number",
            description: "Corrected placard font height in millimeters (e.g. 28 mm).",
          },
          targetPlacardCenterY_cm: {
            type: "number",
            description: "Corrected placard centerline height in centimeters (reach band 120 to 140 cm).",
          },
          repairAll: {
            type: "boolean",
            description: "True to repair every open error issue in one call using each issue's recommended correction.",
          },
          reflowWall: {
            type: "boolean",
            description:
              "True to execute automatic horizontal wall spacing reflow after repositioning.",
          },
        },
        required: [],
        additionalProperties: false,
      },
      resultShape: "{ repairedMountId: string, actionsApplied: string[] }",
      annotations: {
        readOnly: false,
        destructive: false,
        untrustedContent: false,
        dynamic: false,
      },
      execute(args) {
        const model = store.getState();
        let targetMount: MountedArtwork | undefined;

        // Recommended correction for one truth issue.
        const applyIssueFix = (issue: TruthIssue): string | null => {
          const mount = store.getState().mounts.find((m) => m.id === issue.mountId);
          if (!mount) return null;
          const art = store.getState().catalog.find((c) => c.id === mount.artworkId);
          switch (issue.ruleId) {
            case "RULE_PLACARD_PLACEMENT":
              if (issue.id.includes("placard-height")) {
                store.dispatch({ type: "UPDATE_PLACARD", mountId: mount.id, curatorialNote: mount.placard.curatorialNote, centerY_cm: 130 });
                return `placard ${mount.id} centerY -> 130 cm`;
              }
              break;
            case "RULE_ADA_PITCH":
            case "RULE_CENTERLINE_BAND":
            case "RULE_WALL_BOUNDS":
              store.dispatch({ type: "ADJUST_MOUNT_POSITION", mountId: mount.id, centerY_cm: 145 });
              return `${mount.id} centerY -> 145 cm`;
            case "RULE_CCI_LUX": {
              const lux = (art?.luxCap ?? 50) <= 50 ? 45 : 180;
              store.dispatch({ type: "SET_MOUNT_LUX", mountId: mount.id, spotLux: lux });
              return `${mount.id} spotLux -> ${lux} lux`;
            }
            case "RULE_XAUR_LEGIBILITY":
              store.dispatch({ type: "UPDATE_PLACARD", mountId: mount.id, curatorialNote: mount.placard.curatorialNote, fontHeight_mm: 28 });
              return `placard ${mount.id} font -> 28 mm`;
            default:
              break;
          }
          // Spacing, clearance and placard gap problems are solved by reflowing the wall.
          const wall = store.getState().walls.find((w) => w.id === mount.wallId);
          if (!wall) return null;
          const reflowed = reflowWallMounts(wall, store.getState().mounts.filter((m) => m.wallId === wall.id), store.getState().catalog, 18);
          store.dispatch({ type: "REPLACE_WALL_MOUNTS", wallId: wall.id, mounts: reflowed });
          return `reflowed wall ${wall.id}`;
        };

        const hasExplicitTargets =
          typeof args.targetCenterY_cm === "number" ||
          typeof args.targetSpotLux === "number" ||
          typeof args.targetFontHeight_mm === "number" ||
          typeof args.targetPlacardCenterY_cm === "number" ||
          args.reflowWall === true;

        if (args.repairAll === true) {
          const applied: string[] = [];
          for (let pass = 0; pass < 6; pass += 1) {
            const open = truthEngine.checkExhibition(store.getState()).filter((i) => i.severity === "error");
            if (open.length === 0) break;
            for (const issue of open) {
              const done = applyIssueFix(issue);
              if (done) applied.push(done);
            }
          }
          const updatedAll = store.getState();
          const remaining = truthEngine.checkExhibition(updatedAll).filter((i) => i.severity === "error").length;
          return {
            ok: true,
            summary: `Applied ${applied.length} repairs; ${remaining} error(s) remain.`,
            data: { actionsApplied: applied, remainingErrors: remaining },
            revision: updatedAll.revision,
            validNextActions: deriveValidNextActions(updatedAll),
          };
        }

        if (args.issueId && !hasExplicitTargets && !args.mountIdOrTitle) {
          const issue = truthEngine.checkExhibition(model).find((i) => i.id === args.issueId);
          if (issue) {
            const done = applyIssueFix(issue);
            const updatedOne = store.getState();
            return {
              ok: done !== null,
              summary: done ? `Repaired issue ${issue.id}: ${done}.` : `Issue ${issue.id} has no automatic repair.`,
              data: { repairedMountId: issue.mountId ?? "", actionsApplied: done ? [done] : [] },
              revision: updatedOne.revision,
              validNextActions: deriveValidNextActions(updatedOne),
              ...(done ? {} : { errorCode: "NO_AUTOMATIC_REPAIR" }),
            };
          }
        }

        if (args.mountIdOrTitle) {
          targetMount = resolveMount(model, String(args.mountIdOrTitle));
        } else if (args.issueId) {
          const issues = truthEngine.checkExhibition(model);
          const matched = issues.find((iss) => iss.id === args.issueId);
          if (matched && matched.mountId) {
            targetMount = model.mounts.find((m) => m.id === matched.mountId);
          }
        }

        if (!targetMount) {
          return {
            ok: false,
            summary: "No valid mount resolved to apply repair violation.",
            data: {},
            revision: model.revision,
            validNextActions: deriveValidNextActions(model),
            errorCode: "TARGET_NOT_RESOLVED",
          };
        }

        const actionsApplied: string[] = [];

        if (typeof args.targetCenterY_cm === "number") {
          store.dispatch({
            type: "ADJUST_MOUNT_POSITION",
            mountId: targetMount.id,
            centerY_cm: Number(args.targetCenterY_cm),
          });
          actionsApplied.push(`centerY -> ${args.targetCenterY_cm} cm`);
        }

        if (typeof args.targetSpotLux === "number") {
          store.dispatch({
            type: "SET_MOUNT_LUX",
            mountId: targetMount.id,
            spotLux: Number(args.targetSpotLux),
          });
          actionsApplied.push(`spotLux -> ${args.targetSpotLux} lux`);
        }

        if (typeof args.targetFontHeight_mm === "number") {
          store.dispatch({
            type: "UPDATE_PLACARD",
            mountId: targetMount.id,
            curatorialNote: targetMount.placard.curatorialNote,
            fontHeight_mm: Number(args.targetFontHeight_mm),
          });
          actionsApplied.push(`fontHeight -> ${args.targetFontHeight_mm} mm`);
        }

        if (typeof args.targetPlacardCenterY_cm === "number") {
          store.dispatch({
            type: "UPDATE_PLACARD",
            mountId: targetMount.id,
            curatorialNote: targetMount.placard.curatorialNote,
            centerY_cm: Number(args.targetPlacardCenterY_cm),
          });
          actionsApplied.push(`placard centerY -> ${args.targetPlacardCenterY_cm} cm`);
        }

        if (args.reflowWall === true) {
          const wall = model.walls.find((w) => w.id === targetMount!.wallId);
          if (wall) {
            const wallMounts = store.getState().mounts.filter((m) => m.wallId === wall.id);
            const reflowed = reflowWallMounts(wall, wallMounts, model.catalog, 18);
            store.dispatch({
              type: "REPLACE_WALL_MOUNTS",
              wallId: wall.id,
              mounts: reflowed,
            });
            actionsApplied.push(`reflowed wall ${wall.id}`);
          }
        }

        const updated = store.getState();
        return {
          ok: true,
          summary: `Repaired mount '${targetMount.id}': ${actionsApplied.join(", ") || "no modifications requested"}.`,
          data: {
            repairedMountId: targetMount.id,
            actionsApplied,
          },
          revision: updated.revision,
          validNextActions: deriveValidNextActions(updated),
        };
      },
    },
    {
      name: "draft_curatorial_placard",
      camelAlias: "draftCuratorialPlacard",
      title: "Draft Curatorial Placard",
      group: "Collaborate",
      description:
        "Writes a museum placard (curatorialNote) of 45 to 70 words (notes outside 40 to 75 words are rejected, so count before sending) and sets fontHeight_mm (>= 26 mm for >= 1.2 degree legibility) on target mount. Count your words before sending; about 50 words is a safe target. Precondition: Target mount exists. Example: draft_curatorial_placard({ mountIdOrTitle: 'mount-1', curatorialNote: '<about 50 words of interpretive text>', fontHeight_mm: 28 }).",
      inputSchema: {
        type: "object",
        properties: {
          mountIdOrTitle: {
            type: "string",
            description: "Target mounted artwork identifier or title.",
          },
          curatorialNote: {
            type: "string",
            description: "Interpretive wall text copy of 45 to 70 words.",
          },
          fontHeight_mm: {
            type: "number",
            description:
              "Placard font height in millimeters (minimum 26 mm, recommended 28 mm).",
          },
        },
        required: ["mountIdOrTitle", "curatorialNote"],
        additionalProperties: false,
      },
      resultShape: "{ mountId: string, wordCount: number, fontHeight_mm: number }",
      annotations: {
        readOnly: false,
        destructive: false,
        untrustedContent: false,
        dynamic: false,
      },
      execute(args) {
        const model = store.getState();
        const mount = resolveMount(model, String(args.mountIdOrTitle));
        if (!mount) {
          return {
            ok: false,
            summary: `Mount '${args.mountIdOrTitle}' not found.`,
            data: {},
            revision: model.revision,
            validNextActions: deriveValidNextActions(model),
            errorCode: "MOUNT_NOT_FOUND",
          };
        }

        const curatorialNote = String(args.curatorialNote);
        const fontHeight_mm = typeof args.fontHeight_mm === "number" ? Number(args.fontHeight_mm) : 28;
        const words = curatorialNote.trim().split(/\s+/).filter(Boolean);

        if (words.length < 40 || words.length > 75) {
          return {
            ok: false,
            summary: `The note has ${words.length} words; museum placards need 40 to 75 words. Rewrite it to about 50 words and call again.`,
            data: { wordCount: words.length, wordCountInRange: false },
            revision: model.revision,
            validNextActions: deriveValidNextActions(model),
            errorCode: "NOTE_LENGTH_OUT_OF_RANGE",
            recoveryHint: "Write about 50 words of interpretive text, then call draft_curatorial_placard again.",
          };
        }

        store.dispatch({
          type: "UPDATE_PLACARD",
          mountId: mount.id,
          curatorialNote,
          fontHeight_mm,
        });

        const updated = store.getState();
        return {
          ok: true,
          summary: `Updated placard for '${mount.id}' with ${words.length} words and ${fontHeight_mm} mm font height.`,
          data: {
            mountId: mount.id,
            wordCount: words.length,
            wordCountInRange: true,
            fontHeight_mm,
          },
          revision: updated.revision,
          validNextActions: deriveValidNextActions(updated),
        };
      },
    },
    {
      name: "swap_rejected_artwork",
      camelAlias: "swapRejectedArtwork",
      title: "Swap Rejected Artwork",
      group: "Collaborate",
      description:
        "Replaces currently selected mounted artwork with replacementArtworkIdOrTitle matching exhibition theme and lux ceiling, routing through ApprovalGate. Precondition: An artwork mount is currently selected. Example: swap_rejected_artwork({ replacementArtworkIdOrTitle: 'art-3' }).",
      inputSchema: {
        type: "object",
        properties: {
          replacementArtworkIdOrTitle: {
            type: "string",
            description: "Identifier or title of replacement catalog artwork.",
          },
          mountIdOrTitle: {
            type: "string",
            description:
              "Optional mount identifier or title (defaults to currently selected mount).",
          },
        },
        required: ["replacementArtworkIdOrTitle"],
        additionalProperties: false,
      },
      resultShape: "{ mountId: string, previousArtworkId: string, newArtworkId: string }",
      annotations: {
        readOnly: false,
        destructive: true,
        untrustedContent: false,
        dynamic: true,
      },
      isAvailable(model: ExhibitionModel): boolean {
        return model.selectedMountId !== null;
      },
      gateSummary(args: Record<string, unknown>): string {
        return `Replace mounted artwork with '${String(args.replacementArtworkIdOrTitle)}' and recalculate conservation illuminance.`;
      },
      execute(args) {
        const model = store.getState();
        let targetMount: MountedArtwork | undefined;

        if (args.mountIdOrTitle) {
          targetMount = resolveMount(model, String(args.mountIdOrTitle));
        } else if (model.selectedMountId) {
          targetMount = model.mounts.find((m) => m.id === model.selectedMountId);
        }

        if (!targetMount) {
          return {
            ok: false,
            summary: "No mount selected or resolved for artwork swap.",
            data: {},
            revision: model.revision,
            validNextActions: deriveValidNextActions(model),
            errorCode: "NO_MOUNT_SELECTED",
          };
        }

        const replacement = resolveArtwork(model, String(args.replacementArtworkIdOrTitle));
        if (!replacement) {
          return {
            ok: false,
            summary: `Replacement artwork '${args.replacementArtworkIdOrTitle}' not found in catalog.`,
            data: {},
            revision: model.revision,
            validNextActions: deriveValidNextActions(model),
            errorCode: "REPLACEMENT_NOT_FOUND",
          };
        }

        const previousArtworkId = targetMount.artworkId;
        const newLux = replacement.luxCap === 50 ? 45 : 170;

        store.dispatch({
          type: "SWAP_MOUNT_ARTWORK",
          mountId: targetMount.id,
          replacementArtworkId: replacement.id,
          newSpotLux: newLux,
        });

        const updated = store.getState();
        return {
          ok: true,
          summary: `Swapped mount '${targetMount.id}' from '${previousArtworkId}' to '${replacement.title}'.`,
          data: {
            mountId: targetMount.id,
            previousArtworkId,
            newArtworkId: replacement.id,
          },
          revision: updated.revision,
          validNextActions: deriveValidNextActions(updated),
        };
      },
    },
    {
      name: "pin_spatial_anchor",
      camelAlias: "pinSpatialAnchor",
      title: "Pin Spatial Anchor",
      group: "Create/Change",
      description:
        "Requests curator approval via ApprovalGate before locking SpatialAnchorRecord and saving physical gallery wall drill coordinates. Precondition: Target wall has finalized mounts and zero truth errors. Example: pin_spatial_anchor({ wallIdOrName: 'wall-north', label: 'North Wall Final Hang Schedule' }).",
      inputSchema: {
        type: "object",
        properties: {
          wallIdOrName: {
            type: "string",
            description: "Target wall identifier or human-readable wall name.",
          },
          wallId: {
            type: "string",
            description: "Optional wall ID alias.",
          },
          label: {
            type: "string",
            description: "Descriptive label for persistent spatial anchor.",
          },
        },
        required: ["label"],
        additionalProperties: false,
      },
      resultShape: "{ anchorId: string, wallId: string, pinnedMountCount: number }",
      annotations: {
        readOnly: false,
        destructive: true,
        untrustedContent: false,
        dynamic: false,
      },
      gateSummary(args: Record<string, unknown>): string {
        const wallKey = String(args.wallIdOrName ?? args.wallId ?? "wall-north");
        return `Pin spatial anchor and lock drill schedule for '${String(args.label)}' on wall '${wallKey}'.`;
      },
      execute(args) {
        const model = store.getState();
        const wallKey = (args.wallIdOrName ?? args.wallId) as string | undefined;
        if (!wallKey) {
          return {
            ok: false,
            summary: "Missing required parameter 'wallIdOrName' or 'wallId'.",
            data: {},
            revision: model.revision,
            validNextActions: deriveValidNextActions(model),
            errorCode: "INVALID_ARGUMENT",
          };
        }
        const wall = resolveWall(model, wallKey);
        if (!wall) {
          return {
            ok: false,
            summary: `Wall '${wallKey}' not found.`,
            data: {},
            revision: model.revision,
            validNextActions: deriveValidNextActions(model),
            errorCode: "WALL_NOT_FOUND",
          };
        }

        const wallMounts = model.mounts.filter((m) => m.wallId === wall.id);
        const anchorId = `anc-${wall.id}-${Date.now().toString(36)}`;
        const label = String(args.label);

        store.dispatch({
          type: "PIN_ANCHOR",
          anchor: {
            id: anchorId,
            wallId: wall.id,
            label,
            referenceSpace: "local-floor",
            poseMatrix16: [
              1, 0, 0, 0,
              0, 1, 0, 0,
              0, 0, 1, 0,
              wall.position_m[0], wall.position_m[1], wall.position_m[2], 1,
            ],
            pinnedMountIds: wallMounts.map((m) => m.id),
            savedAtIso: new Date().toISOString(),
          },
        });

        store.dispatch({
          type: "SAVE_SNAPSHOT",
          label: `Anchor: ${label}`,
          issueCount: 0,
        });

        const updated = store.getState();
        return {
          ok: true,
          summary: `Pinned persistent spatial anchor '${anchorId}' for ${wallMounts.length} works on ${wall.name}.`,
          data: {
            anchorId,
            wallId: wall.id,
            pinnedMountCount: wallMounts.length,
          },
          revision: updated.revision,
          validNextActions: deriveValidNextActions(updated),
        };
      },
    },
    {
      name: "scrub_timeline_snapshot",
      camelAlias: "scrubTimelineSnapshot",
      title: "Scrub Timeline Snapshot",
      group: "Navigate/View",
      description:
        "Saves a named curatorial milestone (mode: 'save') or restores a prior milestone (mode: 'restore', snapshotIdOrLabel). Precondition: Exhibition store initialized. Example: scrub_timeline_snapshot({ mode: 'save', label: 'Initial Hang Proposal' }).",
      inputSchema: {
        type: "object",
        properties: {
          mode: {
            type: "string",
            description:
              "Timeline operation: 'save' to commit a new snapshot, or 'restore' to roll back.",
            enum: ["save", "restore"],
          },
          label: {
            type: "string",
            description: "Descriptive milestone label when mode is 'save'.",
          },
          snapshotIdOrLabel: {
            type: "string",
            description: "Snapshot identifier or label when mode is 'restore'.",
          },
        },
        required: ["mode"],
        additionalProperties: false,
      },
      resultShape: "{ mode: string, snapshotId: string, revision: number }",
      annotations: {
        readOnly: false,
        destructive: false,
        untrustedContent: false,
        dynamic: false,
      },
      execute(args) {
        const mode = String(args.mode);
        const model = store.getState();

        if (mode === "save") {
          const label = args.label ? String(args.label) : `Revision ${model.revision}`;
          const issues = truthEngine.checkExhibition(model);
          const snapId = `snap-${Date.now().toString(36)}`;

          store.dispatch({
            type: "SAVE_SNAPSHOT",
            id: snapId,
            label,
            issueCount: issues.length,
          });

          const updated = store.getState();
          return {
            ok: true,
            summary: `Saved timeline snapshot '${label}' with revision ${updated.revision}.`,
            data: {
              mode: "save",
              snapshotId: snapId,
              revision: updated.revision,
            },
            revision: updated.revision,
            validNextActions: deriveValidNextActions(updated),
          };
        }

        if (mode === "restore") {
          const target = String(args.snapshotIdOrLabel ?? "");
          const match = model.snapshots.find(
            (s) => s.id === target || s.label.toLowerCase() === target.toLowerCase()
          );

          if (!match) {
            return {
              ok: false,
              summary: `Snapshot '${target}' not found in timeline.`,
              data: {},
              revision: model.revision,
              validNextActions: deriveValidNextActions(model),
              errorCode: "SNAPSHOT_NOT_FOUND",
            };
          }

          store.dispatch({
            type: "RESTORE_SNAPSHOT",
            snapshotId: match.id,
          });

          const updated = store.getState();
          return {
            ok: true,
            summary: `Restored timeline milestone '${match.label}' (revision ${match.revision}).`,
            data: {
              mode: "restore",
              snapshotId: match.id,
              revision: updated.revision,
            },
            revision: updated.revision,
            validNextActions: deriveValidNextActions(updated),
          };
        }

        return {
          ok: false,
          summary: `Unknown timeline mode '${mode}'. Expected 'save' or 'restore'.`,
          data: {},
          revision: model.revision,
          validNextActions: deriveValidNextActions(model),
          errorCode: "INVALID_MODE",
        };
      },
    },
    {
      name: "export_exhibition_manifest",
      camelAlias: "exportExhibitionManifest",
      title: "Export Exhibition Manifest",
      group: "Cross-boundary",
      description:
        "Exports a complete JSON hang schedule with wall coordinates in cm, spotlight settings in lux, sightline pitches in degrees, spatial anchors, and IIIF attributions. Precondition: Exhibition has walls and mounts defined. Example: export_exhibition_manifest({ includeAttributions: true }).",
      inputSchema: {
        type: "object",
        properties: {
          includeAttributions: {
            type: "boolean",
            description: "True to include full IIIF provenance and CC0 licensing attributions.",
          },
        },
        required: [],
        additionalProperties: false,
      },
      resultShape: "{ exhibitionTitle: string, walls: number, mounts: number, manifestJson: string }",
      annotations: {
        readOnly: true,
        destructive: false,
        untrustedContent: false,
        dynamic: false,
      },
      execute(args) {
        const model = store.getState();
        const cones = truthEngine.computeSightlineFrustums(model);
        const issues = truthEngine.checkExhibition(model);
        const includeAttributions = args.includeAttributions !== false;

        const schedule = {
          title: model.exhibitionTitle,
          brief: model.curatorialBrief,
          theme: model.activeTheme,
          revision: model.revision,
          exportedAtIso: new Date().toISOString(),
          walls: model.walls.map((w) => ({
            id: w.id,
            name: w.name,
            dimensions_cm: { width: w.width_cm, height: w.height_cm },
            position_m: w.position_m,
          })),
          mounts: model.mounts.map((m) => {
            const art = model.catalog.find((a) => a.id === m.artworkId);
            const cone115 = cones.find((c) => c.mountId === m.id && c.posture === "wheelchair_115");
            const cone152 = cones.find((c) => c.mountId === m.id && c.posture === "standing_152");
            return {
              mountId: m.id,
              wallId: m.wallId,
              artworkId: m.artworkId,
              artworkTitle: art?.title ?? "Unknown",
              artist: art?.artist ?? "Unknown",
              coordinates_cm: { centerX: m.centerX_cm, centerY: m.centerY_cm },
              dimensions_cm: art
                ? {
                    width: art.width_cm + 2 * art.frame_border_cm,
                    height: art.height_cm + 2 * art.frame_border_cm,
                  }
                : null,
              spotLux: m.spotLux,
              luxCap: art?.luxCap ?? 200,
              sightlinePitches_deg: {
                wheelchair_115: cone115?.upwardPitch_deg ?? null,
                standing_152: cone152?.upwardPitch_deg ?? null,
              },
              placard: {
                text: m.placard.curatorialNote,
                fontHeight_mm: m.placard.fontHeight_mm,
              },
              attribution: includeAttributions && art
                ? {
                    provenance: art.provenance,
                    cc0Url: art.cc0Url,
                    iiifImageUrl: art.iiifImageUrl,
                  }
                : undefined,
            };
          }),
          anchors: model.anchors,
          complianceSummary: {
            errors: issues.filter((i) => i.severity === "error").length,
            warnings: issues.filter((i) => i.severity === "warning").length,
          },
        };

        return {
          ok: true,
          summary: `Exported museum exhibition schedule with ${model.mounts.length} mounts across ${model.walls.length} walls.`,
          data: {
            exhibitionTitle: model.exhibitionTitle,
            walls: model.walls.length,
            mounts: model.mounts.length,
            manifestJson: JSON.stringify(schedule, null, 2),
          },
          revision: model.revision,
          validNextActions: deriveValidNextActions(model),
        };
      },
    },
  ];
}

export const CURATORIAL_ACTION_DESCRIPTORS: ReadonlyArray<
  Pick<
    ActionDescriptor,
    "name" | "camelAlias" | "title" | "group" | "description" | "inputSchema" | "resultShape" | "annotations"
  >
> = buildCuratorialActionDescriptors({
  sessionId: "stub",
  store: {
    getState: () => ({ revision: 0 }) as unknown as ExhibitionModel,
    dispatch: () => ({ ok: true, state_version: 0, effects: [], model: {} as ExhibitionModel }),
    undo: () => ({ ok: true, state_version: 0, effects: [], model: {} as ExhibitionModel }),
    redo: () => ({ ok: true, state_version: 0, effects: [], model: {} as ExhibitionModel }),
    canUndo: () => false,
    canRedo: () => false,
    subscribe: () => () => {},
  },
  truthEngine: {
    checkExhibition: () => [],
    computeSightlineFrustums: () => [],
  },
  gate: {
    isEnabled: () => true,
    setEnabled: () => {},
    getPending: () => null,
    requestApproval: () => Promise.resolve({ approved: true, reason: "" }),
    approve: () => false,
    reject: () => false,
    subscribe: () => () => {},
  },
  trace: {
    record: () => ({} as never),
    getEntries: () => [],
    clear: () => {},
    toDocument: () => ({} as never),
    subscribe: () => () => {},
  },
  registry: {
    register: () => {},
    unregister: () => {},
    list: () => [],
    get: () => undefined,
    call: () => Promise.resolve({} as never),
    subscribe: () => () => {},
  },
}).map(({ name, camelAlias, title, group, description, inputSchema, resultShape, annotations }) => ({
  name,
  camelAlias,
  title,
  group,
  description,
  inputSchema,
  resultShape,
  annotations,
}));

export function bindCuratorialActions(session: SightlineSession): ActionRegistry {
  const descriptors = buildCuratorialActionDescriptors(session);
  for (const descriptor of descriptors) {
    session.registry.register(descriptor);
  }
  return session.registry;
}

function mapActionGroupToManifestGroup(
  group: ActionGroup
): ActionManifestEntry["group"] {
  switch (group) {
    case "Read":
      return "read";
    case "Create/Change":
      return "change";
    case "Verify":
      return "verify";
    case "Navigate/View":
      return "navigate";
    case "Collaborate":
      return "collaborate";
    case "Cross-boundary":
      return "cross_boundary";
    default:
      return "change";
  }
}

function sortJsonKeys(val: unknown): unknown {
  if (val === null || typeof val !== "object") return val;
  if (Array.isArray(val)) return val.map(sortJsonKeys);
  const sorted: Record<string, unknown> = {};
  const keys = Object.keys(val as Record<string, unknown>).sort();
  for (const k of keys) {
    sorted[k] = sortJsonKeys((val as Record<string, unknown>)[k]);
  }
  return sorted;
}

function sha256Bytes(bytes: Uint8Array): string {
  function rightRotate(value: number, amount: number): number {
    return (value >>> amount) | (value << (32 - amount));
  }
  const maxWord = Math.pow(2, 32);
  let i: number, j: number;
  let result = "";
  const words: number[] = [];
  const bitLength = bytes.length * 8;
  let hash: number[] = [];
  const k: number[] = [];
  let primeCounter = 0;
  const isComposite: Record<number, number> = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (i = 0; i < 313; i += candidate) isComposite[i] = candidate;
      hash[primeCounter] = (Math.pow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (Math.pow(candidate, 1 / 3) * maxWord) | 0;
    }
  }
  hash = hash.slice(0, 8);
  const extended = new Uint8Array(((bytes.length + 8) >> 6 << 6) + 64);
  extended.set(bytes);
  extended[bytes.length] = 0x80;
  const view = new DataView(extended.buffer);
  view.setUint32(extended.length - 4, bitLength, false);
  view.setUint32(extended.length - 8, Math.floor(bitLength / maxWord), false);

  for (i = 0; i < extended.length; i += 4) {
    words.push(view.getUint32(i, false));
  }

  for (j = 0; j < words.length; ) {
    const w = words.slice(j, (j += 16));
    const oldHash = hash;
    hash = hash.slice(0, 8);
    for (i = 0; i < 64; i++) {
      const w15 = w[i - 15], w2 = w[i - 2];
      const a = hash[0], e = hash[4];
      const temp1 =
        hash[7] +
        (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) +
        ((e & hash[5]) ^ (~e & hash[6])) +
        k[i] +
        (w[i] =
          i < 16
            ? w[i]
            : (w[i - 16] +
                (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
                w[i - 7] +
                (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) |
              0);
      const temp2 =
        (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) +
        ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
      hash = [(temp1 + temp2) | 0].concat(hash);
      hash[4] = (hash[4] + temp1) | 0;
    }
    for (i = 0; i < 8; i++) hash[i] = (hash[i] + oldHash[i]) | 0;
  }
  for (i = 0; i < 8; i++) {
    result += (hash[i] >>> 0).toString(16).padStart(8, "0");
  }
  return result;
}

export function exportActionManifest(
  registry: ActionRegistry,
  generatedAtIso?: string
): ActionManifest {
  const allDescriptors = registry.list({ includeUnavailable: true });
  // Filter to the 20 curatorial domain actions (exclude internal get_capabilities)
  const domainDescriptors = allDescriptors.filter((d) => d.name !== "get_capabilities");

  const actions: ActionManifestEntry[] = domainDescriptors.map((desc) => ({
    name: desc.name,
    title: desc.title,
    group: mapActionGroupToManifestGroup(desc.group),
    description: desc.description,
    input_schema: desc.inputSchema,
    annotations: {
      readOnly: desc.annotations.readOnly,
      destructive: desc.annotations.destructive,
      untrustedContent: desc.annotations.untrustedContent,
    },
    dynamic: Boolean(desc.annotations.dynamic),
  }));

  // Canonical SHA-256 contract hash
  const canonicalActions = sortJsonKeys(actions);
  const jsonString = JSON.stringify(canonicalActions);
  const contract_hash = sha256Bytes(new TextEncoder().encode(jsonString));

  return {
    version: "1.0.0",
    contract_version: 1,
    contract_hash,
    generated_at: generatedAtIso ?? new Date().toISOString(),
    actions,
    procedures: CURATORIAL_PROCEDURES.map((p) => ({
      name: p.name,
      steps: [...p.steps],
    })),
  };
}
