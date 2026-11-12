// Game state and rules. Pure functions only: no React, no browser APIs, and no unseeded
// randomness or wall-clock time. Time is passed in; randomness comes from the RNG in the state.
import { RESOURCES, type BuildingDef, type Content, type Resource, type ResourceAmounts } from "./content";
import { isHungry, seasonMultiplier, updateEvents } from "./events";
import {
  autoPlaceTile,
  bridgeSpan,
  buildingAt,
  buildingBonuses,
  buildingGroveBonuses,
  canPlace,
  clearBlocker,
  clearSeconds,
  generateMap,
  isUnlocked,
  setTiles,
  type MapState,
} from "./map";
import { DEFAULT_SEED } from "./rng";

export const STATE_VERSION = 4;

export interface PlacedBuilding {
  /** Building id from content/buildings. */
  type: string;
  x: number;
  y: number;
  /** Damaged by fire or typhoon: no output or housing until repaired. */
  damaged?: boolean;
  /** Game time the fire started, while it burns. */
  burningSince?: number;
}

export interface Barangay {
  id: string;
  /** Position on the regional map. Only one barangay exists for now. */
  region: { x: number; y: number };
}

export const DEFAULT_BARANGAY: Barangay = { id: "barangay-1", region: { x: 0, y: 0 } };

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
  /** Land being cleared right now (one job at a time), or null. */
  clearing: ClearingJob | null;
  /** Tiles the player has cleared. Makes each new clearing take longer. */
  tilesCleared: number;
}

export interface ClearingJob {
  x: number;
  y: number;
  /** Seconds worked so far, and seconds needed (fixed when the job starts). */
  progress: number;
  seconds: number;
}

/** A new barangay. Pass a seed (e.g. from the clock in the UI) so each game's map and events differ. */
export function newGame(content: Content, seed: number = DEFAULT_SEED): GameState {
  const { start } = content.rules;
  const resources = Object.fromEntries(RESOURCES.map((r) => [r, start.resources[r] ?? 0])) as Record<
    Resource,
    number
  >;
  let state: GameState = {
    version: STATE_VERSION,
    barangay: { id: DEFAULT_BARANGAY.id, region: { ...DEFAULT_BARANGAY.region } },
    resources,
    villagers: start.villagers,
    buildings: [],
    migration: 0,
    time: 0,
    rng: seed >>> 0,
    hunger: 0,
    sick: [],
    typhoon: null,
    nextEventAt: {},
    map: generateMap(content, seed),
    clearing: null,
    tilesCleared: 0,
  };
  for (const def of content.buildings) {
    for (let i = 0; i < (start.buildings[def.id] ?? 0); i++) state = placeAuto(state, content, def.id);
  }
  return state;
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

/** Cost of the next copy: base cost × growth^owned, rounded up to a whole number. */
export function buildingCost(content: Content, def: BuildingDef, count: number): Record<Resource, number> {
  const factor = content.rules.costGrowth ** count;
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

/** Villagers able to work: none while hungry (gutom), never the sick (sakit). */
export function healthyWorkers(state: GameState): number {
  if (isHungry(state)) return 0;
  return Math.max(0, state.villagers - state.sick.length);
}

/** Villagers free for buildings: healthy ones, minus any busy clearing land. */
export function availableWorkers(state: GameState, content?: Content): number {
  const clearing = state.clearing && content ? content.rules.clearing.workers : 0;
  return Math.max(0, healthyWorkers(state) - clearing);
}

/** Spreads available workers across worker slots one at a time, round-robin in content order. */
export function assignWorkers(state: GameState, content: Content): Record<string, number> {
  const producers = content.buildings.filter((b) => (b.workers ?? 0) > 0);
  const slots = Object.fromEntries(
    producers.map((def) => [
      def.id,
      state.buildings.filter((b) => b.type === def.id && !b.damaged).length * (def.workers ?? 0),
    ]),
  );
  const assigned: Record<string, number> = Object.fromEntries(producers.map((b) => [b.id, 0]));
  let free = availableWorkers(state, content);
  let progress = true;
  while (free > 0 && progress) {
    progress = false;
    for (const b of producers) {
      if (free > 0 && assigned[b.id] < slots[b.id]) {
        assigned[b.id]++;
        free--;
        progress = true;
      }
    }
  }
  return assigned;
}

/**
 * Workers in each placed building (same order as state.buildings). Each type's workers fill
 * buildings with an adjacency bonus first, then older buildings first, one building at a time.
 * Damaged buildings get nobody.
 */
export function buildingWorkers(state: GameState, content: Content): number[] {
  const perType = assignWorkers(state, content);
  const groves = buildingGroveBonuses(state, content);
  const bonuses = buildingBonuses(state, content).map(
    (b, i) => b + Object.values(groves[i]).reduce((sum, g) => sum + (g ?? 0), 0),
  );
  const defs = new Map(content.buildings.map((d) => [d.id, d]));
  const order = state.buildings.map((_, i) => i).sort((a, b) => bonuses[b] - bonuses[a] || a - b);
  const left = { ...perType };
  const workers = state.buildings.map(() => 0);
  for (const i of order) {
    const b = state.buildings[i];
    if (b.damaged) continue;
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

export function rates(state: GameState, content: Content): Rates {
  const workers = buildingWorkers(state, content);
  const bonuses = buildingBonuses(state, content);
  const groves = buildingGroveBonuses(state, content);
  const defs = new Map(content.buildings.map((d) => [d.id, d]));
  const produced = Object.fromEntries(RESOURCES.map((r) => [r, 0])) as Record<Resource, number>;
  state.buildings.forEach((b, i) => {
    const def = defs.get(b.type);
    for (const r of RESOURCES) {
      // Adjacency and grove bonuses add up: a camp by the forest in a kapre's grove gets +10% +25%.
      produced[r] += workers[i] * (def?.produces?.[r] ?? 0) * (1 + bonuses[i] + (groves[i][r] ?? 0));
    }
  });
  for (const r of RESOURCES) produced[r] *= seasonMultiplier(content, state.time, r);
  const eaten = Object.fromEntries(RESOURCES.map((r) => [r, 0])) as Record<Resource, number>;
  eaten.rice = state.villagers * content.rules.riceEatenPerVillagerPerSecond;
  const net = Object.fromEntries(RESOURCES.map((r) => [r, produced[r] - eaten[r]])) as Record<
    Resource,
    number
  >;
  return { produced, eaten, net };
}

export function gather(state: GameState, content: Content, resource: Resource): GameState {
  return {
    ...state,
    resources: { ...state.resources, [resource]: state.resources[resource] + content.rules.gatherPerClick },
  };
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
  return {
    ...state,
    resources: pay(state, cost),
    buildings: [...state.buildings, { type: id, x, y }],
    map: setTiles(state.map, span.map((t) => ({ ...t, tile: "bridge" as const }))),
  };
}

/**
 * Starts clearing a forest tile next to cleared land. Villagers work on it for a while
 * (see clearSeconds), then it becomes cleared land and gives wood. One job at a time.
 * Felling a balete needs confirmBalete: it can never grow back.
 */
export function clearLand(state: GameState, content: Content, x: number, y: number, confirmBalete = false): GameState {
  if (clearBlocker(state, content, x, y, confirmBalete, healthyWorkers(state)) !== null) return state;
  return { ...state, clearing: { x, y, progress: 0, seconds: clearSeconds(state, content) } };
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
    buildings: state.buildings.map((b) => (b === target ? { type: b.type, x: b.x, y: b.y } : b)),
  };
}

/**
 * Every player action as plain data, so actions can be logged, replayed or sent to a
 * server later. The UI only changes the game through apply().
 */
export type Command =
  | { type: "gather"; resource: Resource }
  | { type: "build"; building: string; x: number; y: number }
  | { type: "extinguish"; x: number; y: number }
  | { type: "repair"; x: number; y: number }
  | { type: "clear"; x: number; y: number; confirmBalete?: boolean };

export function apply(state: GameState, content: Content, command: Command): GameState {
  switch (command.type) {
    case "gather":
      return gather(state, content, command.resource);
    case "build":
      return build(state, content, command.building, command.x, command.y);
    case "extinguish":
      return extinguish(state, command.x, command.y);
    case "repair":
      return repair(state, content, command.x, command.y);
    case "clear":
      return clearLand(state, content, command.x, command.y, command.confirmBalete === true);
  }
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

  // Gutom: out of rice. Workers stop (see availableWorkers); after the grace period, families leave.
  const hungry = resources.rice <= 0 && state.villagers > 0;
  const hunger = hungry ? state.hunger + dt : 0;
  const gutom = content.events.hunger;

  let villagers = state.villagers;
  let migration = state.migration;
  const cap = housing(state, content);

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

  let next: GameState = { ...state, resources, villagers, migration, hunger };
  next = advanceClearing(next, content, dt, hungry);
  return updateEvents(next, content, dt);
}

/** Clearing progresses while the barangay is fed and enough healthy villagers can work on it. */
function advanceClearing(state: GameState, content: Content, dt: number, hungry: boolean): GameState {
  const job = state.clearing;
  if (!job || hungry || healthyWorkers(state) < content.rules.clearing.workers) return state;
  const progress = job.progress + dt;
  if (progress < job.seconds - EPSILON) return { ...state, clearing: { ...job, progress } };
  return {
    ...state,
    clearing: null,
    tilesCleared: state.tilesCleared + 1,
    resources: { ...state.resources, wood: state.resources.wood + content.rules.clearing.wood },
    map: setTiles(state.map, [{ x: job.x, y: job.y, tile: "cleared" }]),
  };
}
