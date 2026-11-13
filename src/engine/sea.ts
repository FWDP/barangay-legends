// Sea travel. Barangays on other islands can only be reached by Balangay, trained at a
// Balangay dock (unlocked at Bahay ng Datu level 3). A trade, marriage, sandugo or raid aimed
// at another island sets sail and happens when the boat arrives (longer for farther islands);
// the boat then comes home, with any warriors who survived. A trade boat arriving while the
// barangay is being raided waits offshore until the raid is over. Pure and deterministic.
import { travelSeconds, sameIsland } from "./archipelago";
import type { Content } from "./content";
import { asCost, canAfford, type Command, type GameState } from "./game";
import { homeWarriors, tradingPaused, type Voyage } from "./region";

/** Commands that need a boat when aimed at a barangay on another island, and the neighbor they name. */
export const SEA_COMMANDS = ["trade", "proposeTrade", "marry", "sandugo", "raid"] as const;

export function commandTarget(command: Command): string | null {
  return (SEA_COMMANDS as readonly string[]).includes(command.type) ? ((command as { neighbor?: string }).neighbor ?? null) : null;
}

/** Does this action have to go by sea (its neighbor is on another island)? */
export function needsBoat(state: GameState, command: Command): boolean {
  const target = commandTarget(command);
  const region = state.region;
  if (!target || !region?.places[target] || !region.places[state.barangay.id]) return false;
  return !sameIsland(region.places, state.barangay.id, target);
}

/** Boats the barangay may keep: each standing dock holds its `boats`. */
export function boatCap(state: GameState, content: Content): number {
  return state.buildings.reduce((n, b) => n + (b.damaged ? 0 : (content.buildings.find((d) => d.id === b.type)?.balangayDock?.boats ?? 0)), 0);
}

/** Boats in port, ready to sail. */
export const boatsFree = (state: GameState) => Math.max(0, state.balangays - (state.region?.voyages.length ?? 0));

/** What the next Balangay costs (from the dock's building file). */
export function boatCost(content: Content) {
  return asCost(content.buildings.find((d) => d.balangayDock)?.balangayDock?.boatCost ?? {});
}

/** Builds a Balangay at a dock, up to the docks' room. */
export function trainBalangay(state: GameState, content: Content): GameState {
  const cost = boatCost(content);
  if (state.balangays >= boatCap(state, content) || !canAfford(state, cost)) return state;
  const resources = { ...state.resources };
  for (const r of Object.keys(cost) as (keyof typeof cost)[]) resources[r] -= cost[r];
  return { ...state, resources, balangays: state.balangays + 1 };
}

/** Seconds a boat takes to reach a neighbor. */
export function voyageSeconds(state: GameState, content: Content, target: string): number {
  const region = state.region;
  if (!region) return 0;
  return travelSeconds(content, region.islands, region.places, state.barangay.id, target);
}

/** Why an action can't set sail, or null. */
export function sailBlocker(state: GameState, content: Content, command: Command): "no-boat" | "warriors" | "too-many" | null {
  if (boatsFree(state) < 1) return "no-boat";
  if (command.type === "raid") {
    const w = (command as { warriors: number }).warriors;
    if (!Number.isInteger(w) || w < 1 || w > homeWarriors(state)) return "warriors";
    if (w > content.rules.sea.raidWarriorsPerBoat) return "too-many";
  }
  return null;
}

/** Sends an action to another island by Balangay. Warriors on a raid leave with the boat. */
export function setSail(state: GameState, content: Content, command: Command): GameState {
  const target = commandTarget(command);
  const region = state.region;
  if (!target || !region || sailBlocker(state, content, command) !== null) return state;
  const seconds = voyageSeconds(state, content, target);
  const voyage: Voyage = {
    id: region.nextVoyageId,
    leg: "out",
    target,
    command: { ...command },
    departAt: state.time,
    arriveAt: state.time + seconds,
    warriors: command.type === "raid" ? (command as { warriors: number }).warriors : 0,
  };
  return { ...state, region: { ...region, voyages: [...region.voyages, voyage], nextVoyageId: region.nextVoyageId + 1 } };
}

/**
 * Boats arriving by `time`: an outbound boat does its action on arrival (`arrive` runs the
 * command as if on the same island) and turns for home with its surviving warriors; a boat
 * home is done. Trade boats wait offshore while trade is paused for a raid.
 */
export function updateVoyages(state: GameState, content: Content, time: number, arrive: (s: GameState, c: Command) => GameState): GameState {
  let s = state;
  for (const v of state.region?.voyages ?? []) {
    if (v.arriveAt > time) continue;
    const region = s.region!;
    if (v.leg === "home") {
      s = { ...s, region: { ...region, voyages: region.voyages.filter((x) => x.id !== v.id) } };
      continue;
    }
    if (v.command && (v.command.type === "trade" || v.command.type === "proposeTrade") && tradingPaused(s)) {
      // Waits offshore until the raid is over.
      s = { ...s, region: { ...region, voyages: region.voyages.map((x) => (x.id === v.id ? { ...x, arriveAt: time + 1, waiting: true } : x)) } };
      continue;
    }
    // Arrived: take the boat off the water (its warriors are free to fight), do the action, then sail home.
    const before: GameState = { ...s, region: { ...region, voyages: region.voyages.filter((x) => x.id !== v.id) } };
    const warriorsBefore = before.warriors;
    let after = v.command ? arrive(before, v.command as Command) : before;
    const lost = Math.max(0, warriorsBefore - after.warriors);
    const back = Math.max(0, v.warriors - lost);
    const seconds = voyageSeconds(after, content, v.target);
    const home: Voyage = { id: after.region!.nextVoyageId, leg: "home", target: v.target, command: null, departAt: time, arriveAt: time + seconds, warriors: back };
    after = {
      ...after,
      stats: { ...after.stats, voyages: after.stats.voyages + 1 },
      region: { ...after.region!, voyages: [...after.region!.voyages, home], nextVoyageId: after.region!.nextVoyageId + 1 },
    };
    s = after;
  }
  return s;
}

/** Warriors away at sea (on a raid, or coming home from one). */
export const warriorsAtSea = (state: GameState) => state.region?.voyages.reduce((n, v) => n + v.warriors, 0) ?? 0;
