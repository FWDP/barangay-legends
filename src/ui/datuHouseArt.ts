// The Bahay ng Datu, drawn as a flat SVG in the map's style: a big raised house on thick posts
// with a ladder, a tall steep thatched roof and wood or bamboo walls. Five levels, each larger
// and more ornate. The look follows the barangay's tradition (content/traditions "houseStyle"):
// "lowland" (Tagalog, Visayan: a large raised wooden house with a thatched roof) or "torogan"
// (Maranao-inspired: flared, upswept roof ends and okir-style scrolls on the carved beam ends).
// One source, used everywhere the house appears (map, build toolbar, share card).
import type { Content } from "../engine/content";
import type { GameState } from "../engine/game";
import { isBigHouse } from "../engine/plaza";

export type HouseStyle = "lowland" | "torogan";

/** The barangay's house style: from its tradition, lowland until one is chosen. */
export function houseStyleFor(state: GameState, content: Content): HouseStyle {
  return content.traditions.find((t) => t.id === state.tradition)?.houseStyle ?? "lowland";
}

const C = {
  post: "#5b3a1e",
  postLight: "#7a4f2a",
  floor: "#6b4423",
  wall: "#c8a26b",
  wallLine: "#a07a45",
  thatch: "#d4a94e",
  thatchDark: "#a87c2c",
  ridge: "#7a5520",
  door: "#3b2414",
  carving: "#8b2e16",
  okirRed: "#b91c1c",
  okirGreen: "#15803d",
  okirGold: "#f2c14e",
  ladder: "#8a5a2b",
  shadow: "rgba(0,0,0,0.25)",
};

const clampLevel = (level: number) => Math.min(5, Math.max(1, Math.round(level)));

/**
 * The SVG markup, in a 120 × 120 box with the ground at y = 112. Higher levels are wider, the
 * roof taller, with more posts; carved wall panels from level 3, decorated roof ends from 4,
 * and at 5 a second, higher roof tier.
 */
export function datuHouseSvg(levelIn: number, style: HouseStyle): string {
  const level = clampLevel(levelIn);
  const w = 54 + level * 7; // house width
  const cx = 60;
  const x0 = cx - w / 2;
  const x1 = cx + w / 2;
  const ground = 112;
  const floorY = 84 - level; // raised higher as it grows
  const wallTop = floorY - (15 + level);
  // A tall, steep thatched roof: higher than the walls and posts together on the grand houses.
  const roofTop = wallTop - (32 + level * 3.5);
  const eave = 6 + level; // overhang
  const posts = 3 + level;
  const parts: string[] = [];

  // Shadow on the ground.
  parts.push(`<ellipse cx="${cx}" cy="${ground}" rx="${w / 2 + 6}" ry="4" fill="${C.shadow}"/>`);
  // Thick posts under the floor (round torogan posts are fatter).
  const pw = style === "torogan" ? 6 : 4.5;
  for (let i = 0; i < posts; i++) {
    const x = x0 + 3 + (i * (w - 6 - pw)) / (posts - 1);
    parts.push(`<rect x="${x.toFixed(1)}" y="${floorY}" width="${pw}" height="${ground - floorY}" rx="${style === "torogan" ? 2.5 : 1}" fill="${i % 2 ? C.post : C.postLight}"/>`);
    if (style === "torogan") parts.push(`<ellipse cx="${(x + pw / 2).toFixed(1)}" cy="${ground}" rx="${pw * 0.8}" ry="2.2" fill="#8d8579"/>`);
  }
  // Floor beam.
  parts.push(`<rect x="${x0 - 3}" y="${floorY - 2}" width="${w + 6}" height="5" fill="${C.floor}"/>`);
  // Walls: bamboo or wood slats.
  parts.push(`<rect x="${x0}" y="${wallTop}" width="${w}" height="${floorY - wallTop}" fill="${C.wall}"/>`);
  for (let x = x0 + 4; x < x1 - 1; x += 4) parts.push(`<line x1="${x}" y1="${wallTop}" x2="${x}" y2="${floorY - 2}" stroke="${C.wallLine}" stroke-width="0.8"/>`);
  // Carved panels (level 3+): a band of diamonds under the eaves.
  if (level >= 3) {
    const by = wallTop + 2;
    parts.push(`<rect x="${x0}" y="${by}" width="${w}" height="6" fill="${style === "torogan" ? C.okirGold : "#9c6b33"}"/>`);
    for (let x = x0 + 4; x < x1 - 3; x += 7) {
      parts.push(
        style === "torogan"
          ? `<path d="M${x},${by + 5} q2,-5 4,-2 q-2,2 -1,3" stroke="${C.okirRed}" stroke-width="0.9" fill="none"/>`
          : `<path d="M${x},${by + 3} l3,-2.5 l3,2.5 l-3,2.5 z" fill="${C.carving}"/>`,
      );
    }
  }
  // Doorway with an open window either side.
  const doorW = 9 + level;
  parts.push(`<rect x="${cx - doorW / 2}" y="${floorY - 15}" width="${doorW}" height="13" fill="${C.door}"/>`);
  const winY = floorY - 13;
  parts.push(`<rect x="${x0 + 5}" y="${winY}" width="8" height="6" fill="${C.door}"/>`);
  parts.push(`<rect x="${x1 - 13}" y="${winY}" width="8" height="6" fill="${C.door}"/>`);
  // Ladder up to the door.
  const lx = cx - 5;
  parts.push(`<line x1="${lx}" y1="${floorY}" x2="${lx - 3}" y2="${ground}" stroke="${C.ladder}" stroke-width="1.6"/>`);
  parts.push(`<line x1="${lx + 10}" y1="${floorY}" x2="${lx + 13}" y2="${ground}" stroke="${C.ladder}" stroke-width="1.6"/>`);
  for (let k = 1; k < 5; k++) {
    const y = floorY + ((ground - floorY) * k) / 5;
    const off = (3 * k) / 5;
    parts.push(`<line x1="${lx - off}" y1="${y}" x2="${lx + 10 + off}" y2="${y}" stroke="${C.ladder}" stroke-width="1.3"/>`);
  }

  // The roof.
  const rl = x0 - eave;
  const rr = x1 + eave;
  if (style === "torogan") {
    // Upswept, flared ends and a high peak.
    parts.push(`<path d="M${rl - 6},${wallTop - 6} Q${rl + 4},${wallTop + 3} ${rl + 10},${wallTop} L${cx},${roofTop} L${rr - 10},${wallTop} Q${rr - 4},${wallTop + 3} ${rr + 6},${wallTop - 6} L${rr - 2},${wallTop + 2} L${rl + 2},${wallTop + 2} Z" fill="${C.thatch}" stroke="${C.thatchDark}" stroke-width="1"/>`);
    // Okir scrolls on the flared beam ends (panolong-like), under the floor.
    for (const side of [-1, 1]) {
      const bx = side < 0 ? x0 - 3 : x1 + 3;
      parts.push(`<path d="M${bx},${floorY - 1} q${side * 9},2 ${side * 12},-6 q${-side * 2},6 ${-side * 10},8 z" fill="${C.okirGreen}" stroke="${C.okirGold}" stroke-width="0.8"/>`);
      parts.push(`<path d="M${bx + side * 4},${floorY} q${side * 3},-3 ${side * 5},-1" stroke="${C.okirGold}" stroke-width="0.9" fill="none"/>`);
    }
  } else {
    // Tall steep thatch, straight eaves.
    parts.push(`<path d="M${rl},${wallTop + 3} L${cx},${roofTop} L${rr},${wallTop + 3} Z" fill="${C.thatch}" stroke="${C.thatchDark}" stroke-width="1"/>`);
  }
  // Thatch texture: rows of strokes.
  for (let row = 1; row < 6; row++) {
    const y = roofTop + ((wallTop - roofTop) * row) / 6;
    const span = ((rr - rl) / 2) * (row / 6);
    parts.push(`<line x1="${cx - span}" y1="${y}" x2="${cx + span}" y2="${y}" stroke="${C.thatchDark}" stroke-width="0.7" opacity="0.7"/>`);
  }
  // Ridge cap.
  parts.push(`<path d="M${cx - 3},${roofTop + 3} L${cx},${roofTop - 1} L${cx + 3},${roofTop + 3}" stroke="${C.ridge}" stroke-width="1.8" fill="none"/>`);
  // Decorated roof ends (level 4+): crossed ridge horns.
  if (level >= 4) {
    const color = style === "torogan" ? C.okirRed : C.ridge;
    parts.push(`<path d="M${cx - 6},${roofTop + 4} L${cx + 3},${roofTop - 7} M${cx + 6},${roofTop + 4} L${cx - 3},${roofTop - 7}" stroke="${color}" stroke-width="2" stroke-linecap="round"/>`);
  }
  // Level 5: a second, higher roof tier over the first.
  if (level >= 5) {
    const tw = (rr - rl) * 0.45;
    const ty = roofTop + (wallTop - roofTop) * 0.45;
    parts.push(`<path d="M${cx - tw / 2},${ty} L${cx},${roofTop - 6} L${cx + tw / 2},${ty} Z" fill="${C.thatch}" stroke="${C.thatchDark}" stroke-width="1"/>`);
    parts.push(`<path d="M${cx - 5},${roofTop - 1} L${cx + 2},${roofTop - 10} M${cx + 5},${roofTop - 1} L${cx - 2},${roofTop - 10}" stroke="${style === "torogan" ? C.okirRed : C.ridge}" stroke-width="2" stroke-linecap="round"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">${parts.join("")}</svg>`;
}

const urls = new Map<string, string>();
/** The SVG as a data URL (cached), for an <img> or a canvas. */
export function datuHouseUrl(level: number, style: HouseStyle): string {
  const key = `${clampLevel(level)}:${style}`;
  let url = urls.get(key);
  if (!url) {
    url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(datuHouseSvg(level, style))}`;
    urls.set(key, url);
  }
  return url;
}

/**
 * Where the house is drawn on the map, in tile units: centred on its footprint (engine/plaza.ts),
 * standing on the footprint's front edge (`ground`, used for depth sorting), the image's bottom
 * a little below it (its shadow), and `size` tiles square. On the big footprint the roof spans
 * the footprint's width; a high level kept on one tile (an old save) is drawn at the one-tile
 * size, within its tile.
 */
export function datuHouseBox(state: GameState, content: Content): { cx: number; ground: number; bottom: number; size: number; level: number } {
  const level = clampLevel(state.datuLevel ?? 1);
  const { plaza } = state.map;
  const ground = plaza.y + 1;
  if (isBigHouse(state, content)) {
    const w = content.rules.plaza.bigWidth;
    // The art's roof is 66 + 9 × level of the box's 120 units wide: make it the footprint's width.
    return { cx: plaza.x + w / 2, ground, bottom: ground + 0.04, size: (0.95 * w * 120) / (66 + 9 * level), level };
  }
  const shown = Math.min(level, content.rules.plaza.bigFromLevel - 1);
  return { cx: plaza.x + 0.5, ground, bottom: ground + 0.04, size: (105 + shown * 11) / 100, level };
}

const images = new Map<string, HTMLImageElement>();
/** The house as a loaded image for a canvas (null until it has loaded). */
export function datuHouseImage(level: number, style: HouseStyle): HTMLImageElement | null {
  if (typeof Image === "undefined") return null;
  const key = `${clampLevel(level)}:${style}`;
  let img = images.get(key);
  if (!img) {
    img = new Image();
    img.src = datuHouseUrl(level, style);
    images.set(key, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

/**
 * Cuts an image's shape out of what a canvas holds so far (`cx`, `bottom` and `size` in canvas
 * pixels): whatever was drawn behind the house disappears where the house is, and the house on
 * the map underneath shows through.
 */
export function eraseImage(g: CanvasRenderingContext2D, img: CanvasImageSource, cx: number, bottom: number, size: number): void {
  g.save();
  g.globalCompositeOperation = "destination-out";
  g.drawImage(img, cx - size / 2, bottom - size, size, size);
  g.restore();
}
