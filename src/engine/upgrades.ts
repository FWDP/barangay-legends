// Building upgrades: a placed copy of a building with "upgrades" (the Kamalig) can be raised
// level by level (2, 3…) for wood and gold; each level holds more. The level is kept on the
// placed building (missing means level 1), so old saves keep working unchanged.
import type { BuildingDef, BuildingUpgrade, Content, ResourceAmounts } from "./content";
import { asCost, canAfford, type GameState, type PlacedBuilding } from "./game";
import { buildingAt } from "./map";

/** A placed building's level (1 unless raised). */
export const levelOf = (b: Pick<PlacedBuilding, "level">) => b.level ?? 1;

const defOf = (content: Content, type: string) => content.buildings.find((d) => d.id === type);

/** The highest level a building type can reach (1 if it has no upgrades). */
export const maxLevelOf = (def: BuildingDef | undefined) => 1 + (def?.upgrades?.length ?? 0);

/** The next level a placed building can be raised to, or null (top level, or no upgrades). */
export function nextUpgrade(content: Content, b: PlacedBuilding): BuildingUpgrade | null {
  return defOf(content, b.type)?.upgrades?.find((u) => u.level === levelOf(b) + 1) ?? null;
}

/** What raising this building one level costs (nothing if it can't be raised). */
export const upgradeCost = (content: Content, b: PlacedBuilding) => asCost(nextUpgrade(content, b)?.cost ?? {});

/** The storage one copy of a building holds at a level. */
export function storageAt(def: BuildingDef | undefined, level: number): ResourceAmounts {
  if (!def) return {};
  if (level <= 1) return def.storage ?? {};
  return def.upgrades?.find((u) => u.level === level)?.storage ?? def.storage ?? {};
}

/** Why the building at (x, y) can't be raised now, or null if it can. */
export function upgradeBlocker(state: GameState, content: Content, x: number, y: number): "none" | "top" | "damaged" | "cost" | null {
  const b = buildingAt(state, x, y);
  if (!b || !defOf(content, b.type)?.upgrades) return "none";
  if (!nextUpgrade(content, b)) return "top";
  if (b.damaged || b.burningSince !== undefined) return "damaged";
  if (!canAfford(state, upgradeCost(content, b))) return "cost";
  return null;
}

/** Raises the building at (x, y) one level, paying its cost. The same state if it can't. */
export function upgradeBuilding(state: GameState, content: Content, x: number, y: number): GameState {
  if (upgradeBlocker(state, content, x, y) !== null) return state;
  const target = buildingAt(state, x, y)!;
  const next = nextUpgrade(content, target)!;
  const cost = upgradeCost(content, target);
  const resources = { ...state.resources };
  for (const r of Object.keys(cost) as (keyof typeof cost)[]) resources[r] -= cost[r];
  return { ...state, resources, buildings: state.buildings.map((b) => (b === target ? { ...b, level: next.level } : b)) };
}
