// Game state and rules. Pure functions only: no React, no browser APIs, and no unseeded
// randomness or wall-clock time. Time is passed in; randomness comes from the RNG in the state.
import { syncResidents, type Resident } from "./residents";
import { makeHousehold, type Household } from "./household";
import { RESOURCES, SOCIAL_CLASSES, type BuildingDef, type Content, type Resource, type ResourceAmounts, type SocialClass } from "./content";
import { isHungry, seasonMultiplier, updateEvents } from "./events";
import {
  autoPlaceTile,
  bridgeSpan,
  buildingAt,
  buildingBonuses,
  buildingGroveBonuses,
  canPlace,
  clearBlocker,
  generateMap,
  canPlaceRoad,
  isConnected,
  isUnlocked,
  reachableLand,
  setTiles,
  standingBridgeTiles,
  tileAt,
  type MapState,
  type Point,
} from "./map";
import {
  acceptOffer,
  createRegion,
  declineOffer,
  blocAction,
  guard,
  marry,
  raid,
  sandugo,
  trade,
  train,
  updateRegion,
  type RegionState,
} from "./region";
import { DEFAULT_SEED } from "./rng";
import { homeWarriors } from "./region";
import { choose, updateChoices, type PendingChoice } from "./choices";
import { acceptCounter, declineCounter, handog, proposeTrade, type Goods } from "./trading";
import { advanceClearing, cancelClearing, clearArea, dropUnreachableJobs, workforce, type ClearingJob } from "./clearing";
import { checkTasks } from "./gawain";
import { happinessMultiplier, nextHappiness } from "./happiness";
import { reconcilePeople, type HistoryEntry, type NamedVillager, type Stats } from "./people";
import { capGrowth, riceCap, storageCap } from "./storage";
import { checkAklat } from "./aklat";
import { ageResidents, growPopulation, notWorking, riceEaters } from "./population";
import { needsBoat, setSail, trainBalangay, updateVoyages } from "./sea";
import { datuProductionBonus, upgradeDatu } from "./datu";
import { upgradeBuilding } from "./upgrades";
import { curveFactor } from "./curve";
import { softCapFactor } from "./stockpile";
import { applyRenown } from "./kabantugan";
import { nightFactor } from "./daynight";
import { hasEntrance, updateDoors } from "./doors";
import { devCommand, type DevAction } from "./dev";
import { trackRanking, type AchievedAt } from "./ranking";
import { markFallen, noteExpedition, type Expedition } from "./expeditions";
import { updateDeaths, type Remembered } from "./death";
import { teach } from "./talambuhay";
import { advanceReplanting, afterClearing, cancelReplant, isPranked, newForest, replant, updateForest, updatePranks, type ForestState, type Prank, type ReplantJob } from "./forest";
import {
  answerRiddle,
  askPermission,
  catchSarimanok,
  addFlag,
  chooseTradition,
  gong,
  lostToTikbalang,
  offer,
  perform,
  ritualProductionBonus,
  updateVisitors,
  type BlessingTimer,
  type Eclipse,
  type SarimanokVisit,
  type TikbalangTrick,
} from "./worship";

export const STATE_VERSION = 32;

export interface PlacedBuilding {
  /** Building id from content/buildings. */
  type: string;
  x: number;
  y: number;
  /** Damaged by fire or typhoon: no output or housing until repaired. */
  damaged?: boolean;
  /** Game time the fire started, while it burns. */
  burningSince?: number;
  /** Bridges only: the river tiles it spans (turned back into river if it is demolished). */
  span?: Point[];
  /** Paused by the player: no workers, no output, until resumed. */
  paused?: boolean;
  /** Its entrance (doors.ts): a walkable tile beside it. Missing if every side is cut off. */
  door?: Point;
  /** Boxed in when an old save was loaded: still counts as reachable until something next to it changes. */
  legacyDoor?: true;
  /** Raised to this level (upgrades.ts); missing means level 1. */
  level?: number;
}

/** The most recent build, so it can be undone for a few seconds (rules.placement.undoSeconds). */
export interface LastBuild {
  type: string;
  x: number;
  y: number;
  /** What was paid; undo returns all of it. */
  cost: Record<Resource, number>;
  /** Game time it was built. */
  at: number;
}

export interface Barangay {
  id: string;
  /** Position on the regional map. Only one barangay exists for now. */
  region: { x: number; y: number };
  /** Names the player chose. Display only; "" when the player didn't name it. */
  name: string;
  datu: string;
}

export const DEFAULT_BARANGAY: Barangay = { id: "barangay-1", region: { x: 0, y: 0 }, name: "", datu: "" };

/** Longest name kept for a barangay or datu. */
export const MAX_NAME_LENGTH = 30;

/** A name as stored: single spaces, no control characters, at most MAX_NAME_LENGTH characters. */
export function cleanName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return [...raw.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim()].slice(0, MAX_NAME_LENGTH).join("").trim();
}

export interface GameState {
  version: number;
  barangay: Barangay;
  resources: Record<Resource, number>;
  villagers: number;
  /** In the order they were built. */
  buildings: PlacedBuilding[];
  /**
   * Progress toward the next villager arriving (0..1) or, while starving,
   * leaving (0..-1). Kept in state so progress survives between ticks.
   */
  migration: number;
  /** Progress toward the next birth (0..1), kept between ticks (population.ts). */
  births: number;
  /** Game seconds since this barangay was founded. Drives seasons and when disasters may start. */
  time: number;
  /** Seed of the deterministic RNG; advances every time the engine rolls. */
  rng: number;
  /** Seconds the barangay has been out of rice (0 when fed). */
  hunger: number;
  /** One entry per sick villager: seconds until they recover. */
  sick: number[];
  /** A typhoon on its way (warning shown), or null. */
  typhoon: { strikeAt: number } | null;
  /** Earliest game second each disaster may start again (cooldowns). */
  nextEventAt: Record<string, number>;
  /** The generated map, including every tile the player has cleared or bridged. */
  map: MapState;
  /** Forest tiles queued for clearing, in the order they'll be worked (see clearing.ts). */
  clearing: ClearingJob[];
  /** Tiles the player has cleared. Makes each new clearing take longer. */
  tilesCleared: number;
  /** Mandirigma: villagers trained as warriors. They eat and need housing but don't farm. */
  warriors: number;
  /** The region around the player's barangay (neighbors, war, diplomacy). Null for AI neighbors. */
  region: RegionState | null;
  /** The last building placed, while it can still be undone (see undoSecondsLeft). */
  lastBuild: LastBuild | null;
  /** A choice event waiting for the datu's answer (content/events/choices), or null. */
  choice: PendingChoice | null;
  /** Choice events seen most recently, kept out of the next draws. */
  recentChoices: string[];
  /**
   * Saves from before footpaths keep their old rule (every workplace can be staffed, path or
   * not) until the player next changes the map. Always false for new games.
   */
  legacyReach: boolean;
  /** One-time messages for the player (e.g. what a save update changed), shown until dismissed. */
  notices: string[];
  /** 0–100: changes production by up to ±rules.happiness.maxEffectPercent (see happiness.ts). */
  happiness: number;
  /** Mga Gawain finished, in the order they were done (see gawain.ts). */
  gawainDone: string[];
  /** Villagers with a name and a story (see people.ts). */
  named: NamedVillager[];
  /**
   * Every villager as a person (residents.ts): gender and age group, one per villager, kept in
   * step with the count. Only the player's barangay stores them (AI barangays work theirs out
   * from their seed).
   */
  residents: Resident[];
  /** The next resident's id. */
  residentsNext: number;
  /** The datu's household (household.ts): stored for the player's barangay, null for AI ones. */
  household: Household | null;
  /** The barangay's history: named villagers coming and going, tasks done. Newest last. */
  history: HistoryEntry[];
  stats: Stats;
  /** Favor with the anito, built by offerings at the Dambana (worship.ts). */
  favor: number;
  /** The tradition the barangay follows (content/traditions), chosen at the first Dambana. */
  tradition: string | null;
  /** The last offering or ritual: a Dambana left alone too long slowly lowers happiness. */
  lastRitualAt: number | null;
  /** Rituals in effect and their cooldowns, by ritual id. */
  blessings: Record<string, BlessingTimer>;
  /** The Sarimanok crossing the sky, the Bakunawa eclipse and a tikbalang's trick, if happening. */
  sarimanok: SarimanokVisit | null;
  eclipse: Eclipse | null;
  tikbalang: TikbalangTrick | null;
  /** Woodcutter Camps whose tools the anito of the balete hid. */
  pranks: Prank[];
  forest: ForestState;
  /** Cleared tiles growing back into forest. */
  replanting: ReplantJob[];
  /** Aklat ng Alamat entries found. */
  aklat: string[];
  /** Beings and events the barangay has met (for the Aklat). */
  flags: string[];
  /** The Bahay ng Datu's level (1 from the start). */
  datuLevel: number;
  /** Seconds of mourning left (0 when none): happiness is lower meanwhile. */
  mourning: number;
  /** Seconds the barangay has had sickness without a break (a long sickness can take a life). */
  sickFor: number;
  /** The named villagers who died, remembered at the Libingan. */
  remembered: Remembered[];
  /** Balangay boats the barangay owns (at the dock or at sea). */
  balangays: number;
  /** Kabantugan: renown, earned and never lost. The barangay level comes from it (kabantugan.ts). */
  kabantugan: number;
  /** The highest barangay level whose reward has been given. */
  levelRewarded: number;
  /** Game time the barangay was founded: day 1 (Araw 1) starts here. */
  foundedAt: number;
  /** A dev command (?dev=1) was used on this save: kept apart from real play (e.g. for rankings). */
  devSave: boolean;
  /** When renown, raids defended and Aklat entries last grew (ties in the Ranggo go to the earlier). */
  achievedAt: AchievedAt;
  /** The player's place by renown in the archipelago (0 until first worked out). */
  renownRank: number;
  /** The most recent trades and raids, kept to be replayed (expeditions.ts), oldest first. */
  expeditions: Expedition[];
  nextExpeditionId: number;
}

export type { ClearingJob } from "./clearing";

/**
 * A new barangay. Pass a seed (e.g. from the clock in the UI) so each game's map and events
 * differ. `withRegion` is false for the AI neighbors themselves.
 */
export function newGame(
  content: Content,
  seed: number = DEFAULT_SEED,
  withRegion = true,
  names: { name?: string; datu?: string } = {},
): GameState {
  const { start } = content.rules;
  const resources = Object.fromEntries(RESOURCES.map((r) => [r, start.resources[r] ?? 0])) as Record<
    Resource,
    number
  >;
  let state: GameState = {
    version: STATE_VERSION,
    barangay: { id: DEFAULT_BARANGAY.id, region: { ...DEFAULT_BARANGAY.region }, name: cleanName(names.name), datu: cleanName(names.datu) },
    resources,
    villagers: start.villagers,
    buildings: [],
    migration: 0,
    births: 0,
    time: 0,
    rng: seed >>> 0,
    hunger: 0,
    sick: [],
    typhoon: null,
    nextEventAt: {},
    map: generateMap(content, seed),
    clearing: [],
    tilesCleared: 0,
    warriors: 0,
    region: null,
    lastBuild: null,
    choice: null,
    recentChoices: [],
    legacyReach: false,
    notices: [],
    happiness: content.rules.happiness.start,
    gawainDone: [],
    named: [],
    residents: [],
    residentsNext: 1,
    household: null,
    history: [],
    stats: { raidsDefended: 0, rolls: 0, named: 0, replanted: 0, permittedClears: 0, deaths: 0, voyages: 0, trades: 0, bestTens: 0 },
    favor: 0,
    tradition: null,
    lastRitualAt: null,
    blessings: {},
    sarimanok: null,
    eclipse: null,
    tikbalang: null,
    pranks: [],
    forest: newForest(content),
    replanting: [],
    aklat: [],
    flags: [],
    datuLevel: 1,
    mourning: 0,
    sickFor: 0,
    remembered: [],
    balangays: 0,
    kabantugan: 0,
    levelRewarded: 1,
    foundedAt: 0,
    devSave: false,
    achievedAt: { renown: 0, defended: 0, aklat: 0 },
    renownRank: 0,
    expeditions: [],
    nextExpeditionId: 1,
  };
  if (!content.ai) state = { ...syncResidents(state, content), household: makeHousehold(content, seed, state.barangay.datu) };
  if (withRegion && content.neighbors.length > 0) state.region = createRegion(content, 0, seed, state.barangay.id);
  for (const def of content.buildings) {
    for (let i = 0; i < (start.buildings[def.id] ?? 0); i++) state = placeAuto(state, content, def.id);
  }
  return updateDoors(null, state, content);
}

/** Adds a building for free on the best free tile. Used for starting buildings and old saves. */
export function placeAuto(state: GameState, content: Content, id: string): GameState {
  const def = content.buildings.find((b) => b.id === id);
  const tile = def && autoPlaceTile(state, content, def);
  if (!tile) return state;
  return { ...state, buildings: [...state.buildings, { type: id, x: tile.x, y: tile.y }] };
}

/** Copies built, including damaged ones (they still count for cost scaling). */
export function owned(state: GameState, id: string): number {
  return state.buildings.reduce((n, b) => n + (b.type === id ? 1 : 0), 0);
}

/** Cost of the next copy: base cost × the cost curve after `count` copies (curve.ts), rounded up. */
export function buildingCost(content: Content, def: BuildingDef, count: number): Record<Resource, number> {
  const factor = curveFactor(content.rules.costCurve, count);
  return Object.fromEntries(
    RESOURCES.map((r) => [r, Math.ceil((def.cost[r] ?? 0) * factor)]),
  ) as Record<Resource, number>;
}

export function asCost(amounts: ResourceAmounts): Record<Resource, number> {
  return Object.fromEntries(RESOURCES.map((r) => [r, amounts[r] ?? 0])) as Record<Resource, number>;
}

export function canAfford(state: GameState, cost: Record<Resource, number>): boolean {
  return RESOURCES.every((r) => state.resources[r] >= cost[r]);
}

function pay(state: GameState, cost: Record<Resource, number>): Record<Resource, number> {
  const resources = { ...state.resources };
  for (const r of RESOURCES) resources[r] -= cost[r];
  return resources;
}

/** Villager capacity. Damaged houses shelter nobody until repaired. */
export function housing(state: GameState, content: Content): number {
  const defs = new Map(content.buildings.map((d) => [d.id, d]));
  return state.buildings.reduce(
    (sum, b) => sum + (b.damaged ? 0 : (defs.get(b.type)?.housing ?? 0)),
    content.rules.baseHousing,
  );
}

/**
 * Villagers the houses can shelter, counting damaged houses as standing: a family stays in a
 * house that is waiting for repair, but leaves if its house is demolished.
 */
export function shelter(state: GameState, content: Content): number {
  const defs = new Map(content.buildings.map((d) => [d.id, d]));
  return state.buildings.reduce((sum, b) => sum + (defs.get(b.type)?.housing ?? 0), content.rules.baseHousing);
}

/** Villagers with no house to live in. They leave one at a time (rules.secondsPerVillagerLeavingOvercrowded). */
export function overcrowded(state: GameState, content: Content): number {
  return Math.max(0, state.villagers - shelter(state, content));
}

/**
 * Can workers get to this building? Not if it's damaged, and not if no path leads there on foot
 * from the barangay's center (a far bank cut off by a lost bridge), except in old saves (legacyReach).
 */
export function canStaff(state: GameState, content: Content, b: PlacedBuilding): boolean {
  if (b.damaged || b.paused || isPranked(state, b.x, b.y)) return false;
  return state.legacyReach || hasEntrance(state, content, b);
}

/** Workplaces nobody can walk to (shown as "No path"). Empty while an old save keeps its old rule. */
export function unreachableWorkplaces(state: GameState, content: Content): PlacedBuilding[] {
  if (state.legacyReach) return [];
  const defs = new Map(content.buildings.map((d) => [d.id, d]));
  return state.buildings.filter((b) => (defs.get(b.type)?.workers ?? 0) > 0 && !b.damaged && !hasEntrance(state, content, b));
}

/** The Connected bonus (a fraction, e.g. 0.05) for each building, in state.buildings order. */
export function roadBonuses(state: GameState, content: Content): number[] {
  const pct = content.rules.roads.connectedBonusPercent / 100;
  return state.buildings.map((b) => (isConnected(state.map, b.x, b.y) ? pct : 0));
}

/** Villagers able to work: none while hungry (gutom), never the sick (sakit). */
export function healthyWorkers(state: GameState): number {
  return Math.max(0, healthyWorkersBase(state) - lostToTikbalang(state));
}

/** Healthy workers before any are led astray by a tikbalang. */
export function healthyWorkersBase(state: GameState): number {
  if (isHungry(state)) return 0;
  return Math.max(0, state.villagers - state.sick.length - warriorsOffWork(state));
}

/**
 * Mandirigma are part-time: between raids they work like anyone else. They leave work while
 * a raid is coming (called to arms, to meet it at the landing) and while away guarding a
 * tributary. Nothing is stored for this: when the raid is over they are simply back at work.
 */
export function warriorsOffWork(state: GameState): number {
  const home = homeWarriors(state);
  const away = state.warriors - home;
  return away + (state.region?.incomingRaid ? home : 0);
}

/** How many Mandirigma the barangay may train: warriorsPerKuta for each Kuta (standing or damaged). */
export function warriorCap(state: GameState, content: Content): number {
  const forts = new Set(content.buildings.filter((b) => b.defense).map((b) => b.id));
  return state.buildings.filter((b) => forts.has(b.type)).length * content.rules.military.warriorsPerKuta;
}

/** Rice is short: it would last less than staffing.foodFirstBelowRiceSeconds at the current eating rate. */
export function riceIsLow(state: GameState, content: Content): boolean {
  const eaten = riceEaters(state, content) * content.rules.riceEatenPerVillagerPerSecond;
  return state.resources.rice < content.rules.staffing.foodFirstBelowRiceSeconds * eaten;
}

/**
 * Villagers free for buildings: every healthy one. Buildings come first; clearing forest uses
 * the villagers left over (see clearing.ts), so a long clearing queue never empties the fields.
 */
export function availableWorkers(state: GameState, content?: Content): number {
  // Children don't work and elders work part of a share (population.ts).
  return Math.max(0, healthyWorkers(state) - (content ? notWorking(state, content) : 0));
}

/** Spreads available workers across worker slots one at a time, round-robin in content order. */
export function assignWorkers(state: GameState, content: Content): Record<string, number> {
  const producers = content.buildings.filter((b) => (b.workers ?? 0) > 0);
  const slots = Object.fromEntries(
    producers.map((def) => [
      def.id,
      state.buildings.filter((b) => b.type === def.id && canStaff(state, content, b)).length * (def.workers ?? 0),
    ]),
  );
  const assigned: Record<string, number> = Object.fromEntries(producers.map((b) => [b.id, 0]));
  let free = availableWorkers(state, content);
  // Round-robin over a group of workplaces, one worker at a time.
  const fill = (group: BuildingDef[]) => {
    let progress = true;
    while (free > 0 && progress) {
      progress = false;
      for (const b of group) {
        if (free > 0 && assigned[b.id] < slots[b.id]) {
          assigned[b.id]++;
          free--;
          progress = true;
        }
      }
    }
  };
  // Short of rice: food workplaces are filled first.
  if (riceIsLow(state, content)) fill(producers.filter((b) => (b.produces?.rice ?? 0) > 0));
  fill(producers);
  return assigned;
}

/**
 * Workers in each placed building (same order as state.buildings), after any villagers lent to
 * clearing forest (see workforce in clearing.ts).
 */
export function buildingWorkers(state: GameState, content: Content): number[] {
  return workforce(state, content).workers;
}

/**
 * Workers in each placed building before any are lent to clearing. Each type's workers fill
 * buildings with an adjacency bonus first, then older buildings first, one building at a time.
 * Damaged, paused and unreachable buildings get nobody.
 */
export function baseBuildingWorkers(state: GameState, content: Content): number[] {
  const perType = assignWorkers(state, content);
  const groves = buildingGroveBonuses(state, content);
  const roads = roadBonuses(state, content);
  const bonuses = buildingBonuses(state, content).map(
    (b, i) => b + roads[i] + Object.values(groves[i]).reduce((sum, g) => sum + (g ?? 0), 0),
  );
  const defs = new Map(content.buildings.map((d) => [d.id, d]));
  const order = state.buildings.map((_, i) => i).sort((a, b) => bonuses[b] - bonuses[a] || a - b);
  const left = { ...perType };
  const workers = state.buildings.map(() => 0);
  for (const i of order) {
    const b = state.buildings[i];
    if (!canStaff(state, content, b)) continue;
    const n = Math.min(left[b.type] ?? 0, defs.get(b.type)?.workers ?? 0);
    workers[i] = n;
    if (n) left[b.type] -= n;
  }
  return workers;
}

/** How many copies of each worker building have at least one worker. */
export function staffedBuildings(state: GameState, content: Content): Record<string, number> {
  const workers = buildingWorkers(state, content);
  const staffed: Record<string, number> = Object.fromEntries(
    content.buildings.filter((b) => (b.workers ?? 0) > 0).map((b) => [b.id, 0]),
  );
  state.buildings.forEach((b, i) => {
    if (workers[i] > 0 && b.type in staffed) staffed[b.type]++;
  });
  return staffed;
}

export interface Rates {
  /** Gross production per second. */
  produced: Record<Resource, number>;
  /** Consumption per second. */
  eaten: Record<Resource, number>;
  net: Record<Resource, number>;
}

/**
 * Production and eating per second. `offline` leaves out the forest spirits' reactions (the
 * diwata withholding rice), which never happen during offline catch-up.
 */
export function rates(state: GameState, content: Content, opts: { offline?: boolean; span?: number } = {}): Rates {
  // Work slows at night (over a long offline step, by the share of it that is night).
  const night = nightFactor(content, state.time, opts.span ?? 0);
  const workers = buildingWorkers(state, content);
  const bonuses = buildingBonuses(state, content);
  const groves = buildingGroveBonuses(state, content);
  const roads = roadBonuses(state, content);
  const defs = new Map(content.buildings.map((d) => [d.id, d]));
  const produced = Object.fromEntries(RESOURCES.map((r) => [r, 0])) as Record<Resource, number>;
  state.buildings.forEach((b, i) => {
    const def = defs.get(b.type);
    for (const r of RESOURCES) {
      // Adjacency and grove bonuses add up: a camp by the forest in the Anito ng Balete's grove gets +10% +25%.
      // Connected by Daan adds on top: +10% by the river and +5% connected is +15%.
      produced[r] += workers[i] * (def?.produces?.[r] ?? 0) * (1 + bonuses[i] + roads[i] + (groves[i][r] ?? 0)) * (def?.nightWork ? 1 : night);
    }
  });
  const mood = happinessMultiplier(state, content) * (1 + ritualProductionBonus(state, content) + datuProductionBonus(state, content));
  // Above the stockpile's soft cap, work brings in much less wood or gold (stockpile.ts).
  for (const r of RESOURCES) produced[r] *= seasonMultiplier(content, state.time, r) * mood * softCapFactor(state, content, r);
  // The diwata withhold part of the harvest while the forest spirits are angry.
  if (!opts.offline && !content.ai && state.forest.stage >= 2) produced.rice *= 1 - content.rules.forest.riceWithheldPercent / 100;
  const eaten = Object.fromEntries(RESOURCES.map((r) => [r, 0])) as Record<Resource, number>;
  // Children eat less (population.ts).
  eaten.rice = riceEaters(state, content) * content.rules.riceEatenPerVillagerPerSecond;
  const net = Object.fromEntries(RESOURCES.map((r) => [r, produced[r] - eaten[r]])) as Record<
    Resource,
    number
  >;
  return { produced, eaten, net };
}

/** A tap on Gather: gatherPerClick of a gatherable resource, up to the storage cap. */
export function gather(state: GameState, content: Content, resource: Resource): GameState {
  if (!content.rules.gatherable.includes(resource)) return state;
  const now = state.resources[resource];
  const after = capGrowth(now, now + content.rules.gatherPerClick, storageCap(state, content, resource));
  if (after === now) return state;
  return { ...state, resources: { ...state.resources, [resource]: after } };
}

/**
 * Builds one copy at (x, y) if it is unlocked, affordable and the tile fits (cleared land, or
 * a river crossing for a bridge). A bridge also turns the river tiles it spans into bridge.
 * Returns the same state object if the build is refused.
 */
export function build(state: GameState, content: Content, id: string, x: number, y: number): GameState {
  const def = content.buildings.find((b) => b.id === id);
  if (!def || !isUnlocked(state, def) || !canPlace(state, content, def, x, y)) return state;
  const cost = buildingCost(content, def, owned(state, id));
  if (!canAfford(state, cost)) return state;
  const span = def.bridge ? (bridgeSpan(state.map, def, x, y) ?? []) : [];
  const placed: PlacedBuilding = span.length > 0 ? { type: id, x, y, span } : { type: id, x, y };
  return {
    ...state,
    resources: pay(state, cost),
    buildings: [...state.buildings, placed],
    map: setTiles(state.map, span.map((t) => ({ ...t, tile: "bridge" as const }))),
    lastBuild: { type: id, x, y, cost, at: state.time },
  };
}

// ---------- Undo, move and demolish ----------

const defById = (content: Content, id: string) => content.buildings.find((b) => b.id === id);

/** The river tiles a placed bridge covers (none for other buildings). */
export function bridgeTiles(state: GameState, content: Content, b: PlacedBuilding): Point[] {
  const def = defById(content, b.type);
  if (!def?.bridge) return [];
  return b.span ?? standingBridgeTiles(state.map, def, b.x, b.y);
}

/**
 * The state with one building picked up: gone from the list, and a bridge's tiles back to
 * river. Cleared land stays cleared and felled balete trees stay felled. A clearing job on land
 * that is now cut off stops. Nothing is paid or refunded here.
 */
export function withoutBuilding(state: GameState, content: Content, target: PlacedBuilding): GameState {
  const span = bridgeTiles(state, content, target);
  const map = setTiles(state.map, span.map((t) => ({ ...t, tile: "river" as const })));
  return dropUnreachableJobs({ ...state, buildings: state.buildings.filter((b) => b !== target), map });
}

function addResources(state: GameState, amounts: Record<Resource, number>): Record<Resource, number> {
  const resources = { ...state.resources };
  for (const r of RESOURCES) resources[r] += amounts[r];
  return resources;
}

/** Seconds left to undo the last build, or 0 if there is nothing to undo. */
export function undoSecondsLeft(state: GameState, content: Content): number {
  const last = state.lastBuild;
  if (!last) return 0;
  const b = buildingAt(state, last.x, last.y);
  if (b?.type !== last.type) return 0;
  return Math.max(0, last.at + content.rules.placement.undoSeconds - state.time);
}

/** Takes back the last build within the undo window and returns its full cost. */
export function undo(state: GameState, content: Content): GameState {
  const last = state.lastBuild;
  if (!last || undoSecondsLeft(state, content) <= 0) return state;
  const s = withoutBuilding(state, content, buildingAt(state, last.x, last.y)!);
  return { ...s, resources: addResources(s, last.cost), lastBuild: null };
}

/** Moving costs a share (rules.placement.moveCostPercent) of what the next copy would cost, rounded up. */
export function moveCost(state: GameState, content: Content, type: string): Record<Resource, number> {
  const def = defById(content, type);
  const price = def ? buildingCost(content, def, owned(state, type)) : asCost({});
  const pct = content.rules.placement.moveCostPercent / 100;
  return Object.fromEntries(RESOURCES.map((r) => [r, Math.ceil(price[r] * pct)])) as Record<Resource, number>;
}

/**
 * Can the building at (x, y) move to (toX, toY)? Checked as if it were already picked up, so
 * a bridge can move to another crossing. A burning building can't be moved.
 */
export function canMove(state: GameState, content: Content, x: number, y: number, toX: number, toY: number): boolean {
  const target = buildingAt(state, x, y);
  const def = target && defById(content, target.type);
  if (!target || !def || target.burningSince !== undefined || (x === toX && y === toY)) return false;
  return canPlace(withoutBuilding(state, content, target), content, def, toX, toY);
}

/**
 * Moves a building to another valid tile for moveCost. It keeps its place in the build order,
 * so its workers stay assigned, and keeps any damage.
 */
export function move(state: GameState, content: Content, x: number, y: number, toX: number, toY: number): GameState {
  if (!canMove(state, content, x, y, toX, toY)) return state;
  const target = buildingAt(state, x, y)!;
  const def = defById(content, target.type)!;
  const cost = moveCost(state, content, target.type);
  if (!canAfford(state, cost)) return state;
  const lifted = withoutBuilding(state, content, target);
  const span = def.bridge ? (bridgeSpan(lifted.map, def, toX, toY) ?? []) : [];
  const moved: PlacedBuilding = { ...target, x: toX, y: toY };
  delete moved.span;
  // A moved building gets a new entrance (and loses any grandfathering).
  delete moved.door;
  delete moved.legacyDoor;
  if (span.length > 0) moved.span = span;
  const map = setTiles(lifted.map, span.map((t) => ({ ...t, tile: "bridge" as const })));
  return dropUnreachableJobs({
    ...state,
    resources: pay(state, cost),
    buildings: state.buildings.map((b) => (b === target ? moved : b)),
    map,
    lastBuild: null,
  });
}

/** Demolishing returns a share (rules.placement.demolishRefundPercent) of what the last copy cost, rounded down. */
export function demolishRefund(state: GameState, content: Content, type: string): Record<Resource, number> {
  const def = defById(content, type);
  const n = owned(state, type);
  if (!def || n === 0) return asCost({});
  const paid = buildingCost(content, def, n - 1);
  const pct = content.rules.placement.demolishRefundPercent / 100;
  return Object.fromEntries(RESOURCES.map((r) => [r, Math.floor(paid[r] * pct)])) as Record<Resource, number>;
}

export interface DemolishPreview {
  refund: Record<Resource, number>;
  /** Villagers left without a house; they leave one at a time. */
  villagersLeaving: number;
  /** A bridge whose loss cuts off land (the far bank can't grow until a new bridge is built). */
  cutsOffLand: boolean;
  /** Workplaces that would have no path left (on a far bank cut off), so nobody could work there. */
  stranded: number;
}

/** What demolishing the building at (x, y) would do, for the confirmation. Null if there's none. */
export function demolishPreview(state: GameState, content: Content, x: number, y: number): DemolishPreview | null {
  const target = buildingAt(state, x, y);
  if (!target) return null;
  const after = withoutBuilding(state, content, target);
  return {
    refund: demolishRefund(state, content, target.type),
    villagersLeaving: overcrowded(after, content) - overcrowded(state, content),
    cutsOffLand: after.map !== state.map && reachableLand(after.map) < reachableLand(state.map),
    stranded: unreachableWorkplaces({ ...after, legacyReach: false }, content).length - unreachableWorkplaces({ ...state, legacyReach: false }, content).length,
  };
}

/**
 * Tears a building down for demolishRefund. Its workers go back to the free pool. Villagers a
 * demolished house no longer shelters leave one at a time (see step). A demolished bridge turns
 * back into river; buildings on the far bank keep working.
 */
export function demolish(state: GameState, content: Content, x: number, y: number): GameState {
  const target = buildingAt(state, x, y);
  if (!target) return state;
  const refund = demolishRefund(state, content, target.type);
  const s = withoutBuilding(state, content, target);
  return { ...s, resources: addResources(s, refund), lastBuild: null };
}

/**
 * Starts clearing a forest tile next to cleared land. Villagers work on it for a while
 * (see clearSeconds), then it becomes cleared land and gives wood. One job at a time.
 * Felling a balete needs confirmBalete: it can never grow back.
 */
export function clearLand(state: GameState, content: Content, x: number, y: number, confirmBalete = false): GameState {
  if (clearBlocker(state, content, x, y, confirmBalete) !== null) return state;
  return clearArea(state, content, [{ x, y }], confirmBalete);
}

/** Puts out a burning building (free: the player taps it). */
export function extinguish(state: GameState, x: number, y: number): GameState {
  const target = buildingAt(state, x, y);
  if (!target || target.burningSince === undefined) return state;
  return {
    ...state,
    buildings: state.buildings.map((b) => {
      if (b !== target) return b;
      const out = { ...b };
      delete out.burningSince;
      return out;
    }),
  };
}

export function repairCost(content: Content, type: string): Record<Resource, number> {
  return asCost(content.buildings.find((d) => d.id === type)?.repairCost ?? {});
}

/** Repairs a damaged building if the player can pay its repairCost. */
export function repair(state: GameState, content: Content, x: number, y: number): GameState {
  const target = buildingAt(state, x, y);
  if (!target?.damaged) return state;
  const cost = repairCost(content, target.type);
  if (!canAfford(state, cost)) return state;
  return {
    ...state,
    resources: pay(state, cost),
    buildings: state.buildings.map((b) => {
      if (b !== target) return b;
      // Keeps everything else (a pause, a bridge's span); only the damage goes.
      const fixed = { ...b };
      delete fixed.damaged;
      delete fixed.burningSince;
      return fixed;
    }),
  };
}

/** Pauses a workplace (its workers go to the free pool) or sets it working again. */
export function setPaused(state: GameState, content: Content, x: number, y: number, paused: boolean): GameState {
  const target = buildingAt(state, x, y);
  const def = target && content.buildings.find((d) => d.id === target.type);
  if (!target || !def?.workers || (target.paused === true) === paused) return state;
  return {
    ...state,
    buildings: state.buildings.map((b) => {
      if (b !== target) return b;
      const next = { ...b };
      if (paused) next.paused = true;
      else delete next.paused;
      return next;
    }),
  };
}

/**
 * Every player action as plain data, so actions can be logged, replayed or sent to a
 * server later. The UI only changes the game through apply().
 */
export type Command =
  | { type: "gather"; resource: Resource }
  /** The player looked at a villager (tapped them): who they met, for the Aklat entries on dress and classes. */
  | { type: "meet"; cls: SocialClass; datu?: boolean }
  /** The player opened the Bahay ng Datu (for the Aklat entry on how settlements were laid out). */
  | { type: "visitHouse" }
  | { type: "build"; building: string; x: number; y: number }
  | { type: "undo" }
  | { type: "move"; x: number; y: number; toX: number; toY: number }
  | { type: "demolish"; x: number; y: number }
  | { type: "extinguish"; x: number; y: number }
  | { type: "repair"; x: number; y: number }
  | { type: "clear"; x: number; y: number; confirmBalete?: boolean }
  | { type: "clearArea"; tiles: Point[]; confirmBalete?: boolean }
  | { type: "cancelClearing"; x: number; y: number }
  | { type: "pause"; x: number; y: number; paused: boolean }
  | { type: "dismissNotice" }
  | { type: "proposeTrade"; neighbor: string; give: Goods; want: Goods }
  | { type: "acceptCounter" }
  | { type: "declineCounter" }
  | { type: "handog"; neighbor: string; gift: Partial<Record<Resource, number>> }
  | { type: "train" }
  | { type: "trade"; neighbor: string; give: Resource }
  | { type: "marry"; neighbor: string }
  | { type: "sandugo"; neighbor: string }
  | { type: "raid"; neighbor: string; warriors: number }
  | { type: "guard"; neighbor: string; warriors: number }
  | { type: "acceptOffer" }
  | { type: "declineOffer" }
  | { type: "choose"; option: string }
  | { type: "road"; tiles: Point[] }
  | { type: "removeRoad"; x: number; y: number }
  | { type: "chooseTradition"; tradition: string }
  | { type: "offer"; gift: ResourceAmounts }
  | { type: "ritual"; ritual: string }
  | { type: "askPermission" }
  | { type: "catchSarimanok" }
  /** A gong strike: when (game time, for the beat) and whether it's the "hold to beat" option. */
  | { type: "gong"; at?: number; held?: boolean }
  | { type: "answerRiddle"; option: number }
  | { type: "replant"; x: number; y: number }
  | { type: "cancelReplant"; x: number; y: number }
  | { type: "upgradeDatu" }
  /** Raise a placed building (a Kamalig) one level. */
  | { type: "upgradeBuilding"; x: number; y: number }
  | { type: "trainBalangay" }
  | { type: "bloc"; action: "form" | "invite" | "join" | "leave" | "expel"; target?: string }
  /** Dev tools (?dev=1 only): marks the save as a dev save. */
  | ({ type: "dev" } & DevAction);

export function apply(state: GameState, content: Content, command: Command): GameState {
  // An action aimed at another island sets sail instead; it happens when the boat arrives.
  const sailing = needsBoat(state, command);
  const done = sailing ? setSail(state, content, command) : applyCommand(state, content, command);
  // A refused command leaves the state exactly as it was.
  if (done === state) return state;
  // A trade or raid done here is written down for its replay (one sent by sea, when it arrives).
  const noted = sailing ? done : noteExpedition(state, done, content, command);
  const next = markFallen(state, trackRanking(state, applyRenown(state, reconcilePeople(state, updateDoors(state, noted, content), content), content), content));
  // An old save keeps its old staffing rule until the player changes the map.
  return next.legacyReach && mapChanged(state, next) ? { ...next, legacyReach: false } : next;
}

function applyCommand(state: GameState, content: Content, command: Command): GameState {
  switch (command.type) {
    case "gather":
      return gather(state, content, command.resource);
    case "meet":
      return meet(state, command.cls, command.datu === true);
    case "visitHouse":
      return addFlag(state, "visited-house");
    case "dev":
      return devCommand(state, content, command, (s, seconds) => tick(s, content, seconds));
    case "build":
      return build(state, content, command.building, command.x, command.y);
    case "undo":
      return undo(state, content);
    case "move":
      return move(state, content, command.x, command.y, command.toX, command.toY);
    case "demolish":
      return demolish(state, content, command.x, command.y);
    case "extinguish":
      return extinguish(state, command.x, command.y);
    case "repair":
      return repair(state, content, command.x, command.y);
    case "clear":
      return clearLand(state, content, command.x, command.y, command.confirmBalete === true);
    case "clearArea":
      return clearArea(state, content, command.tiles, command.confirmBalete === true);
    case "cancelClearing":
      return cancelClearing(state, command.x, command.y);
    case "pause":
      return setPaused(state, content, command.x, command.y, command.paused === true);
    case "proposeTrade":
      return proposeTrade(state, content, command.neighbor, { give: command.give, want: command.want });
    case "acceptCounter":
      return acceptCounter(state, content);
    case "declineCounter":
      return declineCounter(state);
    case "handog":
      return handog(state, content, command.neighbor, command.gift);
    case "dismissNotice":
      return state.notices.length ? { ...state, notices: state.notices.slice(1) } : state;
    case "train":
      return train(state, content);
    case "trade":
      return trade(state, content, command.neighbor, command.give);
    case "marry":
      return marry(state, content, command.neighbor);
    case "sandugo":
      return sandugo(state, content, command.neighbor);
    case "raid":
      return raid(state, content, command.neighbor, command.warriors);
    case "guard":
      return guard(state, content, command.neighbor, command.warriors);
    case "acceptOffer":
      return acceptOffer(state, content);
    case "declineOffer":
      return declineOffer(state);
    case "choose":
      return choose(state, content, command.option);
    case "road":
      return buildRoad(state, content, command.tiles);
    case "removeRoad":
      return removeRoad(state, command.x, command.y);
    case "chooseTradition":
      return chooseTradition(state, content, command.tradition);
    case "offer":
      return offer(state, content, command.gift);
    case "ritual":
      return perform(state, content, command.ritual);
    case "askPermission":
      return askPermission(state, content);
    case "catchSarimanok":
      return catchSarimanok(state, content);
    case "gong":
      return gong(state, content, command.at, command.held === true);
    case "answerRiddle":
      return answerRiddle(state, content, command.option);
    case "replant":
      return replant(state, content, command.x, command.y);
    case "cancelReplant":
      return cancelReplant(state, content, command.x, command.y);
    case "upgradeDatu":
      return upgradeDatu(state, content);
    case "upgradeBuilding":
      return upgradeBuilding(state, content, command.x, command.y);
    case "trainBalangay":
      return trainBalangay(state, content);
    case "bloc":
      return blocAction(state, content, command.action, command.target);
  }
}

/** One Daan tile's cost. */
export const roadCost = (content: Content) => asCost(content.rules.roads.cost);

/**
 * Lays Daan on each tile in order, paying for each, skipping tiles where a path can't go and
 * stopping when the barangay can't pay for the next one.
 */
export function buildRoad(state: GameState, content: Content, tiles: Point[]): GameState {
  const cost = roadCost(content);
  let s = state;
  const laid: { x: number; y: number; tile: "daan" }[] = [];
  const seen = new Set<string>();
  for (const t of Array.isArray(tiles) ? tiles.slice(0, 200) : []) {
    const key = `${t?.x},${t?.y}`;
    if (seen.has(key) || !Number.isInteger(t?.x) || !Number.isInteger(t?.y) || !canPlaceRoad(s, content, t.x, t.y)) continue;
    if (!canAfford(s, cost)) break;
    seen.add(key);
    laid.push({ x: t.x, y: t.y, tile: "daan" });
    s = { ...s, resources: pay(s, cost) };
  }
  if (laid.length === 0) return state;
  return { ...s, map: setTiles(s.map, laid) };
}

/** Takes up a Daan tile (free): it becomes plain cleared land again. */
export function removeRoad(state: GameState, x: number, y: number): GameState {
  if (tileAt(state.map, x, y) !== "daan") return state;
  return { ...state, map: setTiles(state.map, [{ x, y, tile: "cleared" }]) };
}

/** Did a command change the map (land, paths, bridges, or where buildings stand)? */
function mapChanged(before: GameState, after: GameState): boolean {
  if (before.map !== after.map || before.buildings.length !== after.buildings.length) return true;
  return before.buildings.some((b, i) => b.x !== after.buildings[i].x || b.y !== after.buildings[i].y || b.type !== after.buildings[i].type);
}

const MAX_STEP = 1;
/** Absorbs floating-point drift, e.g. ten steps of 0.1 adding up to 0.9999999. */
const EPSILON = 1e-9;

/** Advances the game by `seconds`. Long spans are split into steps of at most 1 second. */
export function tick(state: GameState, content: Content, seconds: number): GameState {
  let s = state;
  let left = Math.max(0, seconds);
  while (left > EPSILON) {
    const dt = Math.min(MAX_STEP, left);
    s = step(s, content, dt);
    left -= dt;
  }
  return s;
}

function step(state: GameState, content: Content, dt: number): GameState {
  const { rules } = content;
  const { net } = rates(state, content);
  const resources = { ...state.resources };
  for (const r of RESOURCES) resources[r] += net[r] * dt;
  if (resources.rice < 0) resources.rice = 0;
  // Full stores: production stops at the cap (rice already above it isn't lost).
  resources.rice = capGrowth(state.resources.rice, resources.rice, riceCap(state, content));

  // Gutom: out of rice. Workers stop (see availableWorkers); after the grace period, families leave.
  const hungry = resources.rice <= 0 && state.villagers > 0;
  const hunger = hungry ? state.hunger + dt : 0;
  const gutom = content.events.hunger;

  let villagers = state.villagers;
  let migration = state.migration;
  const cap = housing(state, content);
  const homes = shelter(state, content);
  const crowded = !hungry && villagers > homes;

  if (hungry) {
    const leaving = gutom ? Math.min(dt, Math.max(0, hunger - gutom.graceSeconds)) : 0;
    migration = Math.min(migration, 0);
    if (gutom && leaving > 0) {
      migration -= leaving / gutom.secondsPerVillagerLeaving;
      while (migration <= -1 + EPSILON && villagers > 0) {
        villagers--;
        migration += 1;
      }
    }
    if (villagers === 0 || Math.abs(migration) < EPSILON) migration = 0;
  } else if (villagers > homes) {
    // A house was demolished: the families without one leave, one at a time.
    migration = Math.min(migration, 0) - dt / rules.secondsPerVillagerLeavingOvercrowded;
    while (migration <= -1 + EPSILON && villagers > homes) {
      villagers--;
      migration += 1;
    }
    if (villagers <= homes || Math.abs(migration) < EPSILON) migration = 0;
  } else if (!content.ai) {
    // The player's barangay grows by births and newcomers (population.ts, below).
  } else if (villagers < cap && resources.rice > 0) {
    migration = Math.max(migration, 0) + dt / rules.secondsPerNewVillager;
    while (migration >= 1 - EPSILON && villagers < cap) {
      villagers++;
      migration -= 1;
    }
    if (villagers >= cap || Math.abs(migration) < EPSILON) migration = 0;
  } else {
    migration = 0;
  }

  // Warriors are villagers: if families leave, warriors go with them.
  const warriors = Math.min(state.warriors, villagers);
  const happiness = nextHappiness(state, content, dt);
  let next: GameState = { ...state, resources, villagers, migration, hunger, warriors, happiness };
  // Births and newcomers, and children growing up (the player's barangay; AI ones grow above).
  if (!content.ai) next = ageResidents(growPopulation(next, content, dt), content);
  const beforeClearing = next;
  next = advanceClearing(next, content, dt, hungry).state;
  if (!content.ai) next = advanceReplanting(afterClearing(beforeClearing, next, content), content, dt);
  next = updateEvents(next, content, dt);
  if (next.region) next = updateRegion(next, content, state.time, dt);
  next = updateChoices(next, content, state.time, dt);
  // Balangay at sea arrive (an action on arrival runs as if on the same island).
  if (next.region?.voyages.length) {
    next = updateVoyages(next, content, next.time, (s, c, v) => noteExpedition(s, applyCommand(s, content, c), content, c, { departAt: v.departAt, arriveAt: v.arriveAt }));
  }
  if (!content.ai) {
    // The spirits and visitors: only the player's barangay, only while playing.
    next = updateVisitors(next, content, state.time, next.time);
    next = updatePranks(next, content, state.time, next.time);
    next = updateForest(next, content, dt, true);
    // Deaths come only with warning, and only while playing.
    next = updateDeaths(state, next, content, dt);
    // Elders teach the children by the evening fire (talambuhay.ts).
    next = teach(state, next, content);
  }
  next = reconcilePeople(state, next, content, crowded ? "crowded" : "other");
  next = markFallen(state, next);
  next = checkTasks(next, content);
  const doors = updateDoors(state, next, content);
  return content.ai ? doors : trackRanking(state, applyRenown(state, checkAklat(doors, content), content), content);
}

/**
 * Meeting a villager (tapping them on the map): remembered as flags (met-villager, met-<class>,
 * met-datu), which unlock the Aklat entries on dress and social classes.
 */
function meet(state: GameState, cls: SocialClass, datu: boolean): GameState {
  if (!(SOCIAL_CLASSES as readonly string[]).includes(cls)) return state;
  let s = addFlag(addFlag(state, "met-villager"), `met-${cls}`);
  if (datu) s = addFlag(s, "met-datu");
  return s;
}
