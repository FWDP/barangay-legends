// How dark it is, from the game's own clock (rules.dayNight), and the lights of the barangay at
// night. Pure functions, used by the map's tint and its lights layer. The night never gets
// darker than NIGHT_BLUE, so the game stays readable.
import type { Content } from "../engine/content";
import { dayPhaseAt } from "../engine/daynight";
import type { GameState } from "../engine/game";
import type { Point } from "../engine/map";

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

/** The night's cool blue at full dark, multiplied over the map: dim enough to read as night,
 * light enough that buildings, fields and villagers stay clear (green keeps about half its value). */
export const NIGHT_BLUE = { r: 96, g: 120, b: 196 };

/**
 * The night as one multiply colour for the whole map: white by day (no change), easing to
 * NIGHT_BLUE at night. No orange dusk.
 */
export function nightColor(darkness: number): { r: number; g: number; b: number } {
  const k = Math.min(1, Math.max(0, darkness));
  // From white (the day, unchanged) toward the night's blue.
  const mix = (night: number) => Math.round(255 + (night - 255) * k);
  return { r: mix(NIGHT_BLUE.r), g: mix(NIGHT_BLUE.g), b: mix(NIGHT_BLUE.b) };
}

/** The night tint as CSS (kept for anything that wants a flat colour): the same cool blue. */
export function tintAt(content: Content, time: number): string {
  const c = nightColor(darknessAt(content, time));
  return `rgb(${c.r} ${c.g} ${c.b})`;
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
 * torches at each Kuta, the Dambana, and a resin torch (sulô) at each dock: fire only, no glass lamps. Damaged buildings stay dark.
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
      // Torches on the palisade by the gate, and one on the lookout platform.
      lights.push(
        { p: { x: b.x + 0.15, y: b.y + 0.45 }, kind: "torch", on: onAt(b.x, b.y), seed },
        { p: { x: b.x + 0.42, y: b.y + 0.55 }, kind: "torch", on: onAt(b.x + 1, b.y), seed: seed + 1 },
        { p: { x: b.x + 0.75, y: b.y + 0.2 }, kind: "torch", on: onAt(b.x, b.y + 1), seed: seed + 2 },
      );
    } else if (def.shrine) {
      lights.push({ p: c, kind: "shrine", on: onAt(b.x, b.y), seed });
    } else if (def.placeNextTo) {
      lights.push({ p: c, kind: "lantern", on: onAt(b.x, b.y), seed });
    }
  }
  return lights;
}

/**
 * A light's radius (in tiles) and how strongly it lifts the night (0..1: 1 would bring back the
 * full day colour at its centre). The plaza fire is the biggest at 2.5 tiles; houses and torches
 * 1 to 1.5. Lights only ever restore the day's colour, so overlapping pools never pass it.
 */
export const LIGHT_LOOK: Record<LightKind, { r: number; a: number }> = {
  fire: { r: 2.5, a: 0.85 },
  datu: { r: 1.5, a: 0.55 },
  house: { r: 1.25, a: 0.7 },
  torch: { r: 1, a: 0.8 },
  shrine: { r: 1.3, a: 0.7 },
  lantern: { r: 1.1, a: 0.7 },
};

/** How lit a light is now (0..1): it fades in once the darkness passes its own moment. */
export function lightLevel(light: Light, darkness: number): number {
  return Math.min(1, Math.max(0, (darkness - light.on) / 0.12));
}
