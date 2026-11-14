// Where the sick stay: in a standing healer's hut (a Babaylan's hut, or whatever building
// 'heals'), at most rules.healing.hutCapacity to a hut, named villagers first; the rest wait at
// home. Display and lists only (the map's sprites, the hut's badge and menu): how fast the sick
// get better is still events.ts with the hut's 'heals'. Pure: worked out from the state.
import type { Content } from "./content";
import type { GameState, PlacedBuilding } from "./game";
import type { NamedVillager } from "./people";
import { hasEntrance } from "./doors";

export interface HutStay {
  /** The hut (its index in state.buildings). */
  index: number;
  hut: PlacedBuilding;
  /** How many sick villagers are inside. */
  count: number;
  /** The named ones among them (listed first). */
  named: NamedVillager[];
}

/** The standing healers' huts people can get into, in building order. */
export function healerHuts(state: GameState, content: Content): { index: number; hut: PlacedBuilding }[] {
  const heals = new Set(content.buildings.filter((d) => d.heals).map((d) => d.id));
  return state.buildings.flatMap((b, index) => (heals.has(b.type) && !b.damaged && hasEntrance(state, content, b) ? [{ index, hut: b }] : []));
}

/**
 * How the sick are spread over the huts: each hut takes up to hutCapacity, filled in building
 * order, named sick villagers placed first (so the hut's list shows them). The sum is the number
 * of sick villagers inside a hut; the rest (sick beyond every hut's room) wait at home.
 */
export function healerStays(state: GameState, content: Content): HutStay[] {
  const cap = content.rules.healing.hutCapacity;
  const named = state.named.filter((v) => v.sick);
  let left = state.sick.length;
  let n = 0;
  return healerHuts(state, content).map(({ index, hut }) => {
    const count = Math.min(cap, left);
    left -= count;
    const here = named.slice(n, n + Math.min(count, named.length - n));
    n += here.length;
    return { index, hut, count, named: here };
  });
}

/** How many sick villagers are inside a hut altogether, and how many wait at home. */
export function sickPlaces(state: GameState, content: Content): { inside: number; home: number } {
  const inside = healerStays(state, content).reduce((s, h) => s + h.count, 0);
  return { inside, home: state.sick.length - inside };
}
