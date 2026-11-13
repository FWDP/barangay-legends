// Which tab of the build toolbar each building is under, what the adviser or the current task
// recommends, and which tabs have something newly unlocked. Pure, so it is tested.
import { RESOURCES, type BuildingDef, type Content, type Resource } from "../engine/content";
import { buildingCost, type GameState } from "../engine/game";
import { currentTask } from "../engine/gawain";
import { isUnlocked } from "../engine/map";

/** The tabs, in order. Buildings whose category isn't one of them go under OTHER_TAB. */
export const BUILD_TABS = ["tirahan", "pagkain", "depensa", "pananampalataya", "daan"] as const;
export const OTHER_TAB = "iba";
export type BuildTab = (typeof BUILD_TABS)[number] | typeof OTHER_TAB;
/** The Daan footpath tool is not a building, but it sits in the paths tab. */
export const DAAN = "daan-tool";
export const DAAN_TAB: BuildTab = "daan";

export function tabOf(def: BuildingDef): BuildTab {
  return (BUILD_TABS as readonly string[]).includes(def.category ?? "") ? (def.category as BuildTab) : OTHER_TAB;
}

/** The tabs to show: the five, plus "Iba pa" only when some building has no known category. */
export function visibleTabs(content: Content): BuildTab[] {
  return content.buildings.some((b) => tabOf(b) === OTHER_TAB) ? [...BUILD_TABS, OTHER_TAB] : [...BUILD_TABS];
}

/** Card ids in a tab, in menu order (the Daan tool last in its tab). */
export function itemsIn(content: Content, tab: BuildTab): string[] {
  const ids = content.buildings.filter((b) => tabOf(b) === tab).map((b) => b.id);
  return tab === DAAN_TAB ? [...ids, DAAN] : ids;
}

export const tabOfItem = (content: Content, id: string): BuildTab => {
  if (id === DAAN) return DAAN_TAB;
  const def = content.buildings.find((b) => b.id === id);
  return def ? tabOf(def) : OTHER_TAB;
};

/**
 * Buildings to glow: what the current Mga Gawain task asks for, and what the adviser's tip
 * is about (a Dambana, rice fields when rice is short, a Daan for roads).
 */
export function recommended(state: GameState, content: Content, adviserTrigger: string | null): Set<string> {
  const out = new Set<string>();
  const task = currentTask(state, content);
  if (task?.condition.type === "built") out.add(task.condition.building);
  if (task?.condition.type === "connected") out.add(DAAN);
  const rice = content.buildings.filter((b) => (b.produces?.rice ?? 0) > 0).map((b) => b.id);
  switch (adviserTrigger) {
    case "dambana":
      for (const b of content.buildings) if (b.shrine) out.add(b.id);
      break;
    case "rice-low":
    case "food-workers":
      rice.forEach((id) => out.add(id));
      break;
    case "roads":
      out.add(DAAN);
      break;
  }
  // Only what can be built now is worth pointing at.
  for (const id of [...out]) {
    const def = content.buildings.find((b) => b.id === id);
    if (def && !isUnlocked(state, def)) out.delete(id);
  }
  return out;
}

/** Resources short for the next copy, e.g. { wood: 5 }. Empty when it's affordable. */
export function missingFor(state: GameState, content: Content, def: BuildingDef, count: number): Partial<Record<Resource, number>> {
  const cost = buildingCost(content, def, count);
  const out: Partial<Record<Resource, number>> = {};
  for (const r of RESOURCES) if (state.resources[r] < cost[r]) out[r] = Math.ceil(cost[r] - state.resources[r]);
  return out;
}

export const unlockedIds = (state: GameState, content: Content) => content.buildings.filter((b) => isUnlocked(state, b)).map((b) => b.id);

/** Tabs with a building unlocked that the player hasn't seen in its tab yet. */
export function tabsWithNew(state: GameState, content: Content, seen: readonly string[]): Set<BuildTab> {
  const tabs = new Set<BuildTab>();
  for (const id of unlockedIds(state, content)) if (!seen.includes(id)) tabs.add(tabOfItem(content, id));
  return tabs;
}
