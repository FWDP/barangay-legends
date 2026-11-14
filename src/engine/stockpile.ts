// The stockpile's soft cap for wood and gold: a few times what the barangay's next big
// purchase costs (rules.stockpile). Above it, work brings in much less of that resource, so
// stores don't pile up for ever; nothing already stored is lost, and spending brings work back
// to full. The HUD shows the cap. Pure: worked out from the state.
import { RESOURCES, type Content, type Resource } from "./content";
import { buildingCost, owned, type GameState } from "./game";
import { isUnlocked } from "./map";
import { nextDatuLevel } from "./datu";
import { nextUpgrade } from "./upgrades";
import { boatCost } from "./sea";

/** The resources with a soft cap (rice has its hard cap, the Kamalig). */
export const SOFT_CAPPED: readonly Resource[] = ["wood", "gold"];

const cache = new WeakMap<GameState["buildings"], Map<string, Record<Resource, number>>>();

/**
 * What the next big purchase costs, per resource: the dearest of the next copy of each
 * building the barangay can build, the next Bahay ng Datu level, the next Kamalig level, and a
 * Balangay once there is a dock.
 */
export function nextBigCost(state: GameState, content: Content): Record<Resource, number> {
  const key = `${state.datuLevel}:${state.villagers}`;
  let byKey = cache.get(state.buildings);
  const hit = byKey?.get(key);
  if (hit) return hit;
  const best = Object.fromEntries(RESOURCES.map((r) => [r, 0])) as Record<Resource, number>;
  const take = (cost: Partial<Record<Resource, number>>) => {
    for (const r of RESOURCES) best[r] = Math.max(best[r], cost[r] ?? 0);
  };
  for (const def of content.buildings) {
    if (def.datuHouse || !isUnlocked(state, def)) continue;
    take(buildingCost(content, def, owned(state, def.id)));
    if (def.balangayDock && owned(state, def.id) > 0) take(boatCost(content));
  }
  take(nextDatuLevel(state, content)?.cost ?? {});
  for (const b of state.buildings) take(nextUpgrade(content, b)?.cost ?? {});
  if (!byKey) cache.set(state.buildings, (byKey = new Map()));
  byKey.set(key, best);
  return best;
}

/** The soft cap for a resource (Infinity for rice, which has the Kamalig's hard cap). */
export function softCap(state: GameState, content: Content, r: Resource): number {
  const sp = content.rules.stockpile;
  if (!SOFT_CAPPED.includes(r)) return Infinity;
  return Math.max(sp.minimum[r] ?? 0, Math.ceil(sp.multiple * nextBigCost(state, content)[r]));
}

/** Is the stockpile of this resource over its soft cap (work brings in less)? */
export const overSoftCap = (state: GameState, content: Content, r: Resource) => state.resources[r] >= softCap(state, content, r);

/** Where work stops bringing in this resource at all: stopMultiple × the soft cap. */
export const stopCap = (state: GameState, content: Content, r: Resource) => softCap(state, content, r) * content.rules.stockpile.stopMultiple;

/** Is the stockpile of this resource so far over its soft cap that work brings in none? */
export const overStopCap = (state: GameState, content: Content, r: Resource) => state.resources[r] >= stopCap(state, content, r);

/** The share of production that still comes in: 1 below the soft cap, less above it, none above the stop line. */
export function softCapFactor(state: GameState, content: Content, r: Resource): number {
  if (!overSoftCap(state, content, r)) return 1;
  return overStopCap(state, content, r) ? 0 : 1 - content.rules.stockpile.slowPercent / 100;
}
