// How dark it is, from the game's own clock (rules.dayNight), and the lights of the barangay at
// night. Pure functions, used by the map's tint and its lights layer. The night never gets
// darker than MAX_DARK, so the game stays readable.
import type { Content } from "../engine/content";
import { dayPhaseAt } from "../engine/daynight";
import type { GameState } from "../engine/game";
import type { Point } from "../engine/map";

/** The strongest the night tint gets (0..1 of full dark): the map always stays readable. */
export const MAX_DARK = 0.5;
/** Dusk and dawn last this share of the day each. */
const FADE = 0.06;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** 0 by day, rising through dusk to 1 at night, falling through dawn. */
export function darknessAt(content: Content, time: number): number {
  const { nightFrom, nightTo } = content.rules.dayNight;
  const p = dayPhaseAt(content, time);
  return Math.min(smooth(nightFrom - FADE / 2, nightFrom + FADE / 2, p), 1 - smooth(nightTo - FADE / 2, nightTo + FADE / 2, p));
}

/** How far into dusk or dawn (0..1): the warm light of evening and morning. */
export function duskAt(content: Content, time: number): number {
  const d = darknessAt(content, time);
  return d > 0 && d < 1 ? 1 - Math.abs(d - 0.5) * 2 : 0;
}

/** The map tint: an evening orange at dusk, a deep blue at night, at most MAX_DARK strong. */
export function tintAt(content: Content, time: number): string {
  const d = darknessAt(content, time);
  const dusk = duskAt(content, time);
  const r = Math.round(30 + 220 * dusk * (1 - d));
  const g = Math.round(27 + 120 * dusk * (1 - d));
  const b = Math.round(90 - 50 * dusk * (1 - d));
  return `rgb(${r} ${g} ${b} / ${(Math.max(d * MAX_DARK, dusk * 0.18)).toFixed(3)})`;
}

export type LightKind = "fire" | "house" | "datu" | "torch" | "shrine" | "lantern";

export interface Light {
  /** Tile coordinates of the glow's centre. */
  p: Point;
  kind: LightKind;
  /** Lit once the darkness passes this (so lights come on one by one at dusk). */
  on: number;
  seed: number;
}

/** Each light's own moment to come on: between a quarter and three quarters of the way to night. */
const onAt = (x: number, y: number) => {
  const h = (Math.imul(x * 73856093 ^ y * 19349663, 2654435761) >>> 0) / 4294967296;
  return 0.2 + h * 0.55;
};

/**
 * The barangay's lights: the plaza fire and the Bahay ng Datu, houses with people living in them,
 * torches at each Kuta, the Dambana, and lanterns at the docks. Damaged buildings stay dark.
 */
export function barangayLights(state: GameState, content: Content): Light[] {
  const defs = new Map(content.buildings.map((d) => [d.id, d]));
  const { plaza } = state.map;
  const lights: Light[] = [
    { p: { x: plaza.x + 0.5, y: plaza.y + 0.7 }, kind: "fire", on: 0.1, seed: 1 },
    { p: { x: plaza.x + 0.5, y: plaza.y + 0.1 }, kind: "datu", on: 0.15, seed: 2 },
  ];
  // Houses are filled in build order: only those with people in them are lit.
  let people = state.villagers - content.rules.baseHousing;
  for (const b of state.buildings) {
    const def = defs.get(b.type);
    if (!def || b.damaged) continue;
    const c = { x: b.x + 0.5, y: b.y + 0.5 };
    const seed = b.x * 31 + b.y * 17;
    if ((def.housing ?? 0) > 0) {
      if (people > 0) lights.push({ p: c, kind: "house", on: onAt(b.x, b.y), seed });
      people -= def.housing ?? 0;
    } else if (def.defense) {
      lights.push({ p: { x: b.x + 0.15, y: b.y + 0.3 }, kind: "torch", on: onAt(b.x, b.y), seed }, { p: { x: b.x + 0.85, y: b.y + 0.3 }, kind: "torch", on: onAt(b.x + 1, b.y), seed: seed + 1 });
    } else if (def.shrine) {
      lights.push({ p: c, kind: "shrine", on: onAt(b.x, b.y), seed });
    } else if (def.placeNextTo) {
      lights.push({ p: c, kind: "lantern", on: onAt(b.x, b.y), seed });
    }
  }
  return lights;
}

/** A light's radius (in tiles) and how strong it is. */
export const LIGHT_LOOK: Record<LightKind, { r: number; a: number }> = {
  fire: { r: 2, a: 0.42 },
  datu: { r: 1.6, a: 0.3 },
  house: { r: 1.25, a: 0.5 },
  torch: { r: 1.1, a: 0.6 },
  shrine: { r: 1.4, a: 0.5 },
  lantern: { r: 1.2, a: 0.5 },
};

/** How lit a light is now (0..1): it fades in once the darkness passes its own moment. */
export function lightLevel(light: Light, darkness: number): number {
  return Math.min(1, Math.max(0, (darkness - light.on) / 0.12));
}
