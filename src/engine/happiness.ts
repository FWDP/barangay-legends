// Happiness (0–100): houses near the plaza raise it a little; hunger and sickness lower it.
// It moves slowly toward its target and changes production by up to ±maxEffectPercent.
// rules.happiness.start is both the starting level and the level that changes nothing.
import type { Content } from "./content";
import { isHungry } from "./events";
import type { GameState } from "./game";
import { barangayCenter } from "./map";

/** Standing houses within plazaRadius tiles of the plaza (straight-line distance). */
export function housesNearPlaza(state: GameState, content: Content): number {
  const h = content.rules.happiness;
  const c = barangayCenter(state.map);
  const houses = new Set(content.buildings.filter((d) => (d.housing ?? 0) > 0).map((d) => d.id));
  return state.buildings.filter((b) => houses.has(b.type) && !b.damaged && Math.hypot(b.x - c.x, b.y - c.y) <= h.plazaRadius).length;
}

export interface HappinessParts {
  base: number;
  houses: number;
  hunger: number;
  sickness: number;
  target: number;
}

/** Where happiness is heading, and why. */
export function happinessTarget(state: GameState, content: Content): HappinessParts {
  const h = content.rules.happiness;
  const houses = Math.min(h.maxFromHouses, housesNearPlaza(state, content) * h.perHouseNearPlaza);
  const hunger = isHungry(state) ? h.hungry : 0;
  const sickness = Math.max(h.maxFromSick, state.sick.length * h.perSick);
  const target = Math.min(100, Math.max(0, h.start + houses + hunger + sickness));
  return { base: h.start, houses, hunger, sickness, target };
}

/** Happiness after dt seconds: pointsPerSecond closer to its target. */
export function nextHappiness(state: GameState, content: Content, dt: number): number {
  const { target } = happinessTarget(state, content);
  const step = content.rules.happiness.pointsPerSecond * dt;
  const now = state.happiness;
  if (Math.abs(target - now) <= step) return target;
  return now + Math.sign(target - now) * step;
}

/** Production multiplier: 1 at the start level, up to 1 ± maxEffectPercent at 100 or 0. */
export function happinessMultiplier(state: GameState, content: Content): number {
  const h = content.rules.happiness;
  const v = Math.min(100, Math.max(0, state.happiness));
  const max = h.maxEffectPercent / 100;
  if (v >= h.start) return h.start >= 100 ? 1 : 1 + (max * (v - h.start)) / (100 - h.start);
  return 1 - (max * (h.start - v)) / h.start;
}
