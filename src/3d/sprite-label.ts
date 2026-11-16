/**
 * Canvas-texture sprite plaques. All 3D text lives here; nothing is drawn into artwork textures
 * and no DOM overlay ever sits inside the WebGL canvas.
 */
import * as THREE from "three";

export interface PlacardSpriteOptions {
  title: string;
  subtitle: string;
  bgHex: string;
  textHex: string;
  borderHex: string;
  widthMeters: number;
  heightMeters: number;
}

const FONT_STACK = '"Plus Jakarta Sans Variable", "Plus Jakarta Sans", system-ui, sans-serif';

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

export function createPlacardSprite(options: PlacardSpriteOptions): THREE.Sprite {
  const { title, subtitle, bgHex, textHex, borderHex, widthMeters, heightMeters } = options;
  const pxW = 1024;
  const pxH = Math.max(96, Math.round((pxW * heightMeters) / widthMeters));
  const canvas = document.createElement("canvas");
  canvas.width = pxW;
  canvas.height = pxH;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = bgHex;
    ctx.fillRect(0, 0, pxW, pxH);
    ctx.strokeStyle = borderHex;
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, pxW - 10, pxH - 10);
    const pad = 44;
    ctx.fillStyle = textHex;
    ctx.textBaseline = "top";
    const titleSize = Math.round(pxH * 0.32);
    ctx.font = `700 ${titleSize}px ${FONT_STACK}`;
    ctx.fillText(fitText(ctx, title, pxW - pad * 2), pad, pad);
    const subSize = Math.round(pxH * 0.2);
    ctx.font = `500 ${subSize}px ${FONT_STACK}`;
    ctx.globalAlpha = 0.82;
    ctx.fillText(fitText(ctx, subtitle, pxW - pad * 2), pad, pad + titleSize * 1.35);
    ctx.globalAlpha = 1;
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.generateMipmaps = true;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: false, depthWrite: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(widthMeters, heightMeters, 1);
  sprite.name = `placard:${title}`;
  return sprite;
}

export function disposePlacardSprite(sprite: THREE.Sprite): void {
  sprite.material.map?.dispose();
  sprite.material.dispose();
}
