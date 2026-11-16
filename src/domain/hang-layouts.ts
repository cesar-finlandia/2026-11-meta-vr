/**
 * Deterministic museological wall-layout topologies and collision-free
 * horizontal clearance reflow solver in centimeters.
 */
import type {
  ArtworkCatalogItem,
  HangTemplateId,
  MountedArtwork,
  PlacardLabel,
  WallPlane,
} from "./types";

export function outerWidth_cm(art: ArtworkCatalogItem): number {
  return art.width_cm + 2 * art.frame_border_cm;
}

export function outerHeight_cm(art: ArtworkCatalogItem): number {
  return art.height_cm + 2 * art.frame_border_cm;
}

export function createDefaultPlacard(
  mountId: string,
  wall: WallPlane,
  artwork: ArtworkCatalogItem,
  centerX_cm: number,
  centerY_cm: number,
  curatorialNote?: string,
  preferredSide?: "right" | "left"
): PlacardLabel {
  const placardWidth = 18;
  const placardHeight = 11;
  const fontHeight_mm = 28; // Headline block height mm -> 1.34° visual angle at 120 cm
  const outerW = outerWidth_cm(artwork);

  let side: "right" | "left" = preferredSide ?? "right";
  let placardCenterX: number;

  if (side === "right") {
    const rightPlacardCenter = centerX_cm + outerW / 2 + 10 + placardWidth / 2;
    const wallRightMargin = wall.width_cm - (rightPlacardCenter + placardWidth / 2);
    if (wallRightMargin < 20) {
      side = "left";
      placardCenterX = centerX_cm - outerW / 2 - 10 - placardWidth / 2;
    } else {
      placardCenterX = rightPlacardCenter;
    }
  } else {
    const leftPlacardCenter = centerX_cm - outerW / 2 - 10 - placardWidth / 2;
    const wallLeftMargin = leftPlacardCenter - placardWidth / 2;
    if (wallLeftMargin < 20) {
      side = "right";
      placardCenterX = centerX_cm + outerW / 2 + 10 + placardWidth / 2;
    } else {
      placardCenterX = leftPlacardCenter;
    }
  }

  // Inclusive placard eye height band 120-140 cm, centered at 130 cm
  const placardCenterY = 130;

  const note =
    curatorialNote ??
    `${artwork.medium}. Acquired from institutional archives. ${artwork.provenance}.`;
  const words = note.trim().split(/\s+/).filter(Boolean).length;

  return {
    id: `placard-${mountId}`,
    mountId,
    wallId: wall.id,
    titleText: artwork.title,
    artistLine: `${artwork.artist}, ${artwork.year}`,
    curatorialNote: note,
    wordCount: words,
    centerX_cm: Math.round(placardCenterX * 10) / 10,
    centerY_cm: placardCenterY,
    width_cm: placardWidth,
    height_cm: placardHeight,
    fontHeight_mm,
    side,
  };
}

export function computeHangLayout(
  template: HangTemplateId,
  wall: WallPlane,
  works: ArtworkCatalogItem[],
  options?: {
    targetCenterline_cm?: number;
    minGap_cm?: number;
  }
): MountedArtwork[] {
  if (works.length === 0) return [];

  const targetCenterline = options?.targetCenterline_cm ?? 145;
  const requestedGap = options?.minGap_cm ?? 24;

  if (template === "symmetrical_pair") {
    // Symmetrical layout around wall center
    const wallCenter = wall.width_cm / 2;
    const spacing = Math.max(requestedGap, 28);
    const sorted = [...works].sort((a, b) => a.year - b.year);
    const mounts: MountedArtwork[] = [];

    if (sorted.length === 2) {
      const leftWork = sorted[0];
      const rightWork = sorted[1];
      const leftW = outerWidth_cm(leftWork);
      const rightW = outerWidth_cm(rightWork);

      const distFromCenter = Math.round(((spacing + (leftW + rightW) / 2) / 2) * 10) / 10;
      const leftCenterX = Math.round((wallCenter - distFromCenter) * 10) / 10;
      const rightCenterX = Math.round((wallCenter + distFromCenter) * 10) / 10;

      const mountLeftId = `mount-${leftWork.id}`;
      const mountRightId = `mount-${rightWork.id}`;

      mounts.push({
        id: mountLeftId,
        artworkId: leftWork.id,
        wallId: wall.id,
        centerX_cm: leftCenterX,
        centerY_cm: targetCenterline,
        spotLux: leftWork.luxCap === 50 ? 45 : 165,
        pinnedAnchorId: null,
        placard: createDefaultPlacard(
          mountLeftId,
          wall,
          leftWork,
          leftCenterX,
          targetCenterline,
          undefined,
          "left"
        ),
      });

      mounts.push({
        id: mountRightId,
        artworkId: rightWork.id,
        wallId: wall.id,
        centerX_cm: rightCenterX,
        centerY_cm: targetCenterline,
        spotLux: rightWork.luxCap === 50 ? 45 : 165,
        pinnedAnchorId: null,
        placard: createDefaultPlacard(
          mountRightId,
          wall,
          rightWork,
          rightCenterX,
          targetCenterline,
          undefined,
          "right"
        ),
      });

      return mounts;
    }
  }

  let orderedWorks: ArtworkCatalogItem[] = [];

  if (template === "chronological_spine") {
    orderedWorks = [...works].sort((a, b) => a.year - b.year);
  } else if (template === "salon_cluster") {
    // Largest in center, descending size alternating left and right
    const bySize = [...works].sort(
      (a, b) => outerWidth_cm(b) * outerHeight_cm(b) - outerWidth_cm(a) * outerHeight_cm(a)
    );
    const leftSide: ArtworkCatalogItem[] = [];
    const rightSide: ArtworkCatalogItem[] = [];
    const centerWork = bySize[0];

    for (let i = 1; i < bySize.length; i++) {
      if (i % 2 === 1) {
        leftSide.unshift(bySize[i]);
      } else {
        rightSide.push(bySize[i]);
      }
    }
    orderedWorks = [...leftSide, centerWork, ...rightSide];
  } else {
    orderedWorks = [...works];
  }

  const n = orderedWorks.length;
  // Calculate envelope width for each item (frame + gap + placard)
  const envelopes = orderedWorks.map((work) => {
    const frameW = outerWidth_cm(work);
    return {
      work,
      frameW,
      envelopeW: frameW + 10 + 18, // frame + 10 cm gap + 18 cm placard
    };
  });

  const totalEnvelopeWidth = envelopes.reduce((acc, it) => acc + it.envelopeW, 0);
  const availableWallWidth = wall.width_cm - 40; // 20 cm margin left & right
  const maxGapBudget = availableWallWidth - totalEnvelopeWidth;

  let gap = requestedGap;
  if (n > 1) {
    const fittedGap = maxGapBudget / (n - 1);
    gap = Math.max(16, Math.min(requestedGap, fittedGap));
  }

  const totalRowWidth = totalEnvelopeWidth + (n - 1) * gap;
  let currentLeft = (wall.width_cm - totalRowWidth) / 2;

  // Ensure minimum wall left margin 20 cm
  if (currentLeft < 20) {
    currentLeft = 20;
  }

  const mounts: MountedArtwork[] = [];

  for (let i = 0; i < n; i++) {
    const { work, frameW, envelopeW } = envelopes[i];
    const mountId = `mount-${work.id}`;

    // Center of artwork frame inside its envelope
    const frameCenterX = currentLeft + frameW / 2;

    let frameCenterY = targetCenterline;
    if (template === "salon_cluster") {
      // Subtle vertical variation: center work at 146 cm, flanking at 141 and 149
      if (i === Math.floor(n / 2)) {
        frameCenterY = 146;
      } else if (i % 2 === 0) {
        frameCenterY = 141;
      } else {
        frameCenterY = 149;
      }
    }

    const placard = createDefaultPlacard(
      mountId,
      wall,
      work,
      frameCenterX,
      frameCenterY
    );

    const spotLux = work.luxCap === 50 ? 45 : 165;

    mounts.push({
      id: mountId,
      artworkId: work.id,
      wallId: wall.id,
      centerX_cm: Math.round(frameCenterX * 10) / 10,
      centerY_cm: Math.round(frameCenterY * 10) / 10,
      spotLux,
      pinnedAnchorId: null,
      placard,
    });

    currentLeft += envelopeW + gap;
  }

  return mounts;
}

export function reflowWallMounts(
  wall: WallPlane,
  mounts: MountedArtwork[],
  catalog: ArtworkCatalogItem[],
  minGap_cm: number = 18
): MountedArtwork[] {
  if (mounts.length === 0) return [];

  const catalogMap = new Map<string, ArtworkCatalogItem>();
  for (const item of catalog) {
    catalogMap.set(item.id, item);
  }

  // Sort mounts horizontally by current centerX_cm
  const sorted = [...mounts].sort((a, b) => a.centerX_cm - b.centerX_cm);

  const mountEnvelopes = sorted.map((mount) => {
    const art = catalogMap.get(mount.artworkId);
    const frameW = art ? outerWidth_cm(art) : 60;
    const placardW = mount.placard?.width_cm ?? 18;
    const envelopeW = frameW + 10 + placardW;
    return {
      mount,
      art,
      frameW,
      envelopeW,
    };
  });

  const n = mountEnvelopes.length;
  const totalEnvelopesW = mountEnvelopes.reduce((sum, e) => sum + e.envelopeW, 0);
  const availableW = wall.width_cm - 40; // 20 cm margin on each side

  let gap = Math.max(minGap_cm, 16);
  if (n > 1) {
    const maxPossibleGap = (availableW - totalEnvelopesW) / (n - 1);
    if (maxPossibleGap < gap) {
      gap = Math.max(15.5, maxPossibleGap);
    }
  }

  const totalSpan = totalEnvelopesW + (n - 1) * gap;
  let cursorX = Math.max(20, (wall.width_cm - totalSpan) / 2);

  const reflowed: MountedArtwork[] = [];

  for (let i = 0; i < n; i++) {
    const { mount, art, frameW, envelopeW } = mountEnvelopes[i];
    const newFrameCenterX = Math.round((cursorX + frameW / 2) * 10) / 10;
    const newFrameCenterY = mount.centerY_cm;

    let placard = mount.placard;
    if (art) {
      placard = createDefaultPlacard(
        mount.id,
        wall,
        art,
        newFrameCenterX,
        newFrameCenterY,
        mount.placard?.curatorialNote
      );
    } else if (placard) {
      placard = {
        ...placard,
        centerX_cm: Math.round((newFrameCenterX + frameW / 2 + 10 + placard.width_cm / 2) * 10) / 10,
        centerY_cm: 130,
      };
    }

    reflowed.push({
      ...mount,
      centerX_cm: newFrameCenterX,
      placard,
    });

    cursorX += envelopeW + gap;
  }

  return reflowed;
}
