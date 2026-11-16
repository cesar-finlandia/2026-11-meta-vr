import { describe, expect, it } from "vitest";
import {
  BUNDLED_AIC_CATALOG,
  classifyMediumTier,
  loadBundledCollection,
  parseIiifManifest,
  renderArtworkPlateDataUrl,
} from "../../src/domain/collection-loader";

describe("collection-loader", () => {
  it("bundles exactly 24 Art Institute of Chicago open-access masterworks", () => {
    expect(BUNDLED_AIC_CATALOG).toHaveLength(24);

    for (const item of BUNDLED_AIC_CATALOG) {
      expect(item.id).toMatch(/^aic-\d+$/);
      expect(item.aicId).toBeGreaterThan(0);
      expect(item.title.length).toBeGreaterThan(0);
      expect(item.artist.length).toBeGreaterThan(0);
      expect(item.year).toBeGreaterThan(1600);
      expect(item.width_cm).toBeGreaterThan(10);
      expect(item.height_cm).toBeGreaterThan(10);
      expect(item.frame_border_cm).toBeGreaterThanOrEqual(3.0);
      expect(["walnut", "gilt", "ebony"]).toContain(item.frameFinish);
      expect(["paper_50_lux", "durable_200_lux"]).toContain(item.mediumTier);
      expect(item.luxCap === 50 || item.luxCap === 200).toBe(true);
      expect(item.paletteHex).toHaveLength(3);
      expect(item.provenance).toContain("Art Institute of Chicago");
      expect(item.cc0Url).toContain("artic.edu");
    }
  });

  it("loadBundledCollection returns 24 items with or without custom fetch", async () => {
    const defaultLoaded = await loadBundledCollection();
    expect(defaultLoaded).toHaveLength(24);

    const mockFetch = async () =>
      ({
        ok: true,
        json: async () => BUNDLED_AIC_CATALOG,
      }) as unknown as Response;

    const fetched = await loadBundledCollection(mockFetch as unknown as typeof fetch);
    expect(fetched).toHaveLength(24);
  });

  it("classifies medium tiers and lux caps accurately", () => {
    expect(classifyMediumTier("Polychrome woodblock print; ink and color on paper")).toEqual({
      mediumTier: "paper_50_lux",
      luxCap: 50,
    });
    expect(classifyMediumTier("Etching and drypoint on heavy paper")).toEqual({
      mediumTier: "paper_50_lux",
      luxCap: 50,
    });
    expect(classifyMediumTier("Watercolor on cream wove paper")).toEqual({
      mediumTier: "paper_50_lux",
      luxCap: 50,
    });
    expect(classifyMediumTier("Oil on canvas")).toEqual({
      mediumTier: "durable_200_lux",
      luxCap: 200,
    });
    expect(classifyMediumTier("Bronze with brown patina")).toEqual({
      mediumTier: "durable_200_lux",
      luxCap: 200,
    });
  });

  it("parses IIIF Presentation v3 manifest with dimension extraction", () => {
    const v3Manifest = {
      "@context": "http://iiif.io/api/presentation/3/context.json",
      id: "https://example.org/manifest/1",
      type: "Manifest",
      label: { en: ["Curatorial Selection"] },
      metadata: [
        { label: { en: ["Artist"] }, value: { en: ["Claude Monet"] } },
        { label: { en: ["Medium"] }, value: { en: ["Oil on canvas"] } },
        { label: { en: ["Dimensions"] }, value: { en: ["90 × 94 cm"] } },
      ],
      items: [
        {
          id: "https://example.org/canvas/1",
          type: "Canvas",
          label: { en: ["Water Lilies at Giverny"] },
          width: 3000,
          height: 2800,
          items: [
            {
              id: "https://example.org/annotationpage/1",
              type: "AnnotationPage",
              items: [
                {
                  id: "https://example.org/annotation/1",
                  type: "Annotation",
                  body: {
                    id: "https://example.org/image/water-lilies.jpg",
                    type: "Image",
                    format: "image/jpeg",
                  },
                },
              ],
            },
          ],
        },
      ],
    };

    const parsed = parseIiifManifest(v3Manifest);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].title).toBe("Water Lilies at Giverny");
    expect(parsed[0].artist).toBe("Claude Monet");
    expect(parsed[0].mediumTier).toBe("durable_200_lux");
    expect(parsed[0].luxCap).toBe(200);
    expect(parsed[0].width_cm).toBe(90);
    expect(parsed[0].height_cm).toBe(94);
    expect(parsed[0].iiifImageUrl).toBe("https://example.org/image/water-lilies.jpg");
  });

  it("parses IIIF Presentation v2 manifest format", () => {
    const v2Manifest = {
      "@context": "http://iiif.io/api/presentation/2/context.json",
      "@id": "https://example.org/iiif/manifest2",
      label: "Botanical Engravings",
      sequences: [
        {
          canvases: [
            {
              "@id": "https://example.org/iiif/canvas/c1",
              label: "Plate 1 - Magnolia",
              width: 1200,
              height: 1600,
              metadata: [
                { label: "Medium", value: "Stipple engraving on paper" },
                { label: "Artist", value: "P.J. Redoute" },
                { label: "Dimensions", value: "36 x 48 cm" },
              ],
              images: [
                {
                  resource: {
                    "@id": "https://example.org/images/plate1.jpg",
                  },
                },
              ],
            },
          ],
        },
      ],
    };

    const parsed = parseIiifManifest(v2Manifest);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].title).toBe("Plate 1 - Magnolia");
    expect(parsed[0].mediumTier).toBe("paper_50_lux");
    expect(parsed[0].luxCap).toBe(50);
    expect(parsed[0].width_cm).toBe(36);
    expect(parsed[0].height_cm).toBe(48);
  });

  it("throws clear error on empty or malformed manifest", () => {
    expect(() => parseIiifManifest(null)).toThrow("IIIF manifest contained 0 valid artwork canvases");
    expect(() => parseIiifManifest({})).toThrow("IIIF manifest contained 0 valid artwork canvases");
    expect(() => parseIiifManifest({ items: [] })).toThrow("IIIF manifest contained 0 valid artwork canvases");
  });

  it("renderArtworkPlateDataUrl produces valid SVG data URL with zero text elements", () => {
    const sample = BUNDLED_AIC_CATALOG[0];
    const dataUrl = renderArtworkPlateDataUrl(sample);

    expect(dataUrl).toMatch(/^data:image\/svg\+xml;utf8,/);
    const decoded = decodeURIComponent(dataUrl.replace("data:image/svg+xml;utf8,", ""));
    expect(decoded).toContain("<svg");
    expect(decoded).toContain("</svg>");
    expect(decoded).not.toContain("<text");
    expect(decoded).toContain(sample.paletteHex[0]);
  });
});
