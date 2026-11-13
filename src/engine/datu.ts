// The Bahay ng Datu: the datu's house at the plaza, from the start at level 1. Raising it
// (content/buildings/bahay-ng-datu.json) costs rice, wood and gold; each level above 1 adds
// production and influence with neighbors, and some levels unlock more (envoys, the
// Balangay dock, alliances). It stands where the plaza is, so the barangay's center (paths,
// reachability, the Daan bonus) is the same tile.
import { asCost, canAfford, type GameState } from "./game";
import type { Content, DatuUnlock, ResourceAmounts } from "./content";
import { addHistory } from "./people";

export const datuDef = (content: Content) => content.datuHouse?.datuHouse ?? null;

/** The highest level the house can reach. */
export const maxDatuLevel = (content: Content) => datuDef(content)?.levels.length ?? 1;

/** The next level and what it costs, or null at the top. */
export function nextDatuLevel(state: GameState, content: Content): { level: number; cost: ResourceAmounts; unlocks?: DatuUnlock } | null {
  const next = datuDef(content)?.levels.find((l) => l.level === state.datuLevel + 1);
  return next ? { level: next.level, cost: next.cost ?? {}, unlocks: next.unlocks } : null;
}

/** Raises the Bahay ng Datu one level, if the barangay can pay. Noted in the history (the adviser tells of unlocks). */
export function upgradeDatu(state: GameState, content: Content): GameState {
  const next = nextDatuLevel(state, content);
  if (!next) return state;
  const cost = asCost(next.cost);
  if (!canAfford(state, cost)) return state;
  const resources = { ...state.resources };
  for (const r of Object.keys(cost) as (keyof typeof cost)[]) resources[r] -= cost[r];
  return addHistory({ ...state, resources, datuLevel: next.level }, { at: state.time, kind: "datu", level: next.level });
}

/** Extra production from the house (0.1 = +10%): nothing at level 1. */
export function datuProductionBonus(state: GameState, content: Content): number {
  const d = datuDef(content);
  return d ? (Math.max(1, state.datuLevel) - 1) * (d.productionPercentPerLevel / 100) : 0;
}

/** Influence gained with neighbors is multiplied by this. */
export function datuInfluenceMultiplier(state: GameState, content: Content): number {
  const d = datuDef(content);
  return 1 + (d ? (Math.max(1, state.datuLevel) - 1) * (d.influencePercentPerLevel / 100) : 0);
}

/** Has the house reached the level that unlocks this? */
export function hasDatuUnlock(state: GameState, content: Content, u: DatuUnlock): boolean {
  const at = datuDef(content)?.levels.find((l) => l.unlocks === u)?.level;
  return at !== undefined && state.datuLevel >= at;
}
