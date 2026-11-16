/**
 * Bundled Art Institute of Chicago CC0 open-access collection loader,
 * IIIF Presentation v3 manifest importer, and deterministic artwork plate renderer.
 */
import catalogData from "../../public/collections/aic-open-access.json";
import type {
  ArtworkCatalogItem,
  ConservationMediumTier,
  FrameFinish,
} from "./types";

export const BUNDLED_AIC_CATALOG: readonly ArtworkCatalogItem[] = Object.freeze(
  (catalogData as ArtworkCatalogItem[]).map((item) => Object.freeze({ ...item }))
);

export async function loadBundledCollection(
  fetchImpl?: typeof fetch
): Promise<ArtworkCatalogItem[]> {
  const customFetch =
    fetchImpl ?? (typeof fetch !== "undefined" ? fetch : undefined);
  if (customFetch) {
    try {
      const res = await customFetch("/collections/aic-open-access.json");
      if (res.ok) {
        const data = (await res.json()) as ArtworkCatalogItem[];
        if (Array.isArray(data) && data.length > 0) {
          return structuredClone(data);
        }
      }
    } catch {
      // Fallback to bundled catalog
    }
  }
  return structuredClone(BUNDLED_AIC_CATALOG as ArtworkCatalogItem[]);
}

function extractLabelString(label: unknown): string {
  if (typeof label === "string") return label.trim();
  if (label && typeof label === "object") {
    const obj = label as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      if (Array.isArray(val) && val.length > 0 && typeof val[0] === "string") {
        return val[0].trim();
      }
      if (typeof val === "string") return val.trim();
    }
  }
  return "";
}

function extractMetadataValue(
  metadata: unknown,
  targetKeys: string[]
): string | null {
  if (!Array.isArray(metadata)) return null;
  const lowerTargets = targetKeys.map((k) => k.toLowerCase());
  for (const entry of metadata) {
    if (!entry || typeof entry !== "object") continue;
    const label = extractLabelString((entry as { label?: unknown }).label).toLowerCase();
    if (lowerTargets.some((k) => label.includes(k))) {
      const val = extractLabelString((entry as { value?: unknown }).value);
      if (val) return val;
    }
  }
  return null;
}

const PAPER_MEDIUM_REGEX =
  /paper|print|woodblock|etching|engraving|lithograph|watercolor|pastel|gouache|charcoal|ink|silk|textile|scroll/i;

export function classifyMediumTier(mediumString: string): {
  mediumTier: ConservationMediumTier;
  luxCap: 50 | 200;
} {
  if (PAPER_MEDIUM_REGEX.test(mediumString)) {
    return { mediumTier: "paper_50_lux", luxCap: 50 };
  }
  return { mediumTier: "durable_200_lux", luxCap: 200 };
}

export function parseIiifManifest(raw: unknown): ArtworkCatalogItem[] {
  if (!raw || typeof raw !== "object") {
    throw new Error(
      "IIIF manifest contained 0 valid artwork canvases. Supply a IIIF Presentation v2/v3 manifest or catalog array."
    );
  }

  // Direct array of ArtworkCatalogItem
  if (Array.isArray(raw)) {
    const valid = raw.filter(
      (it) =>
        it &&
        typeof it === "object" &&
        typeof it.id === "string" &&
        typeof it.title === "string" &&
        typeof it.width_cm === "number" &&
        typeof it.height_cm === "number"
    ) as ArtworkCatalogItem[];
    if (valid.length === 0) {
      throw new Error(
        "IIIF manifest contained 0 valid artwork canvases. Supply a IIIF Presentation v2/v3 manifest or catalog array."
      );
    }
    return structuredClone(valid);
  }

  const manifest = raw as Record<string, unknown>;

  // Check if this is a custom catalog wrapper { items: [...] } with ArtworkCatalogItem
  if (
    Array.isArray(manifest.items) &&
    manifest.items.length > 0 &&
    typeof (manifest.items[0] as Record<string, unknown>)?.width_cm === "number"
  ) {
    return structuredClone(manifest.items as ArtworkCatalogItem[]);
  }

  const results: ArtworkCatalogItem[] = [];

  // IIIF v3: manifest.items is an array of Canvas objects
  // IIIF v2: manifest.sequences[0].canvases
  let canvases: unknown[] = [];
  if (Array.isArray(manifest.items)) {
    canvases = manifest.items;
  } else if (
    Array.isArray(manifest.sequences) &&
    manifest.sequences.length > 0 &&
    Array.isArray((manifest.sequences[0] as Record<string, unknown>).canvases)
  ) {
    canvases = (manifest.sequences[0] as Record<string, unknown>).canvases as unknown[];
  }

  const manifestTitle = extractLabelString(manifest.label) || "Museum Collection";
  const manifestMetadata = manifest.metadata;

  for (let idx = 0; idx < canvases.length; idx++) {
    const canvas = canvases[idx];
    if (!canvas || typeof canvas !== "object") continue;
    const c = canvas as Record<string, unknown>;

    const canvasTitle = extractLabelString(c.label);
    const title =
      canvasTitle || (canvases.length === 1 ? manifestTitle : `${manifestTitle} — Canvas ${idx + 1}`);

    const metadata = c.metadata ?? manifestMetadata;
    const artist =
      extractMetadataValue(metadata, ["artist", "creator", "maker"]) ?? "Unknown Artist";
    const medium =
      extractMetadataValue(metadata, ["medium", "technique", "materials"]) ?? "Mixed media";
    const dateStr =
      extractMetadataValue(metadata, ["date", "created", "year"]) ?? "1900";
    const parsedYear = parseInt(dateStr.replace(/\D+/g, ""), 10);
    const year = Number.isFinite(parsedYear) && parsedYear > 0 ? parsedYear : 1900;

    const dimStr = extractMetadataValue(metadata, ["dimensions", "size"]);
    let width_cm = 60;
    let height_cm = 45;

    if (dimStr) {
      // Look for e.g. "84 × 124 cm" or "124 x 84 cm" or "h × w"
      const match = /(\d+(?:\.\d+)?)\s*[×x]\s*(\d+(?:\.\d+)?)\s*cm/i.exec(dimStr);
      if (match && match[1] && match[2]) {
        const v1 = parseFloat(match[1]);
        const v2 = parseFloat(match[2]);
        if (dimStr.toLowerCase().includes("h × w") || dimStr.toLowerCase().includes("height x width")) {
          height_cm = v1;
          width_cm = v2;
        } else {
          width_cm = v1;
          height_cm = v2;
        }
      }
    } else if (typeof c.width === "number" && typeof c.height === "number" && c.width > 0 && c.height > 0) {
      const aspect = c.width / c.height;
      if (aspect >= 1) {
        width_cm = 70;
        height_cm = Math.round((70 / aspect) * 10) / 10;
      } else {
        height_cm = 70;
        width_cm = Math.round(70 * aspect * 10) / 10;
      }
    }

    const { mediumTier, luxCap } = classifyMediumTier(medium);

    // Extract image URL
    let iiifImageUrl = "";
    if (Array.isArray(c.items) && c.items.length > 0) {
      const page = c.items[0] as Record<string, unknown>;
      if (Array.isArray(page?.items) && page.items.length > 0) {
        const annot = page.items[0] as Record<string, unknown>;
        const body = annot?.body as Record<string, unknown>;
        if (typeof body?.id === "string") {
          iiifImageUrl = body.id;
        }
      }
    } else if (Array.isArray(c.images) && c.images.length > 0) {
      const img = c.images[0] as Record<string, unknown>;
      const res = img?.resource as Record<string, unknown>;
      if (typeof res?.["@id"] === "string") {
        iiifImageUrl = res["@id"];
      }
    }

    if (!iiifImageUrl) {
      iiifImageUrl = `https://iiif.example.org/image/canvas-${idx + 1}/full/800,/0/default.jpg`;
    }

    const item: ArtworkCatalogItem = {
      id: `iiif-${idx + 1}-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 24)}`,
      aicId: 900000 + idx,
      title,
      artist,
      year,
      medium,
      mediumTier,
      luxCap,
      width_cm,
      height_cm,
      frame_border_cm: 4.5,
      frameFinish: (mediumTier === "paper_50_lux" ? "ebony" : "gilt") as FrameFinish,
      themes: ["iiif-import"],
      paletteHex: ["#3A506B", "#5BC0BE", "#F0EAD8"],
      iiifImageUrl,
      provenance: "IIIF Presentation Manifest Import",
      cc0Url: typeof c["@id"] === "string" ? c["@id"] : (typeof c.id === "string" ? c.id : ""),
    };

    results.push(item);
  }

  if (results.length === 0) {
    throw new Error(
      "IIIF manifest contained 0 valid artwork canvases. Supply a IIIF Presentation v2/v3 manifest or catalog array."
    );
  }

  return results;
}

export function renderArtworkPlateDataUrl(item: ArtworkCatalogItem): string {
  const [c1, c2, c3] = item.paletteHex;
  const w = 400;
  const h = Math.max(200, Math.min(800, Math.round((400 * item.height_cm) / item.width_cm)));

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`,
    `<defs>`,
    `<linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">`,
    `<stop offset="0%" stop-color="${c1}" />`,
    `<stop offset="50%" stop-color="${c2}" />`,
    `<stop offset="100%" stop-color="${c3}" />`,
    `</linearGradient>`,
    `<linearGradient id="accentGrad" x1="1" y1="0" x2="0" y2="1">`,
    `<stop offset="0%" stop-color="${c3}" stop-opacity="0.85" />`,
    `<stop offset="100%" stop-color="${c1}" stop-opacity="0.3" />`,
    `</linearGradient>`,
    `</defs>`,
    `<rect width="${w}" height="${h}" fill="url(#bgGrad)" />`,
    `<rect x="${w * 0.08}" y="${h * 0.08}" width="${w * 0.84}" height="${h * 0.84}" rx="6" fill="#000000" fill-opacity="0.12" />`,
    `<circle cx="${w * 0.35}" cy="${h * 0.42}" r="${Math.min(w, h) * 0.28}" fill="url(#accentGrad)" />`,
    `<path d="M ${w * 0.15} ${h * 0.82} Q ${w * 0.5} ${h * 0.25} ${w * 0.85} ${h * 0.78} Z" fill="${c2}" fill-opacity="0.55" />`,
    `<rect x="${w * 0.2}" y="${h * 0.6}" width="${w * 0.6}" height="${h * 0.22}" rx="4" fill="${c1}" fill-opacity="0.4" />`,
    `</svg>`,
  ].join("");

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
