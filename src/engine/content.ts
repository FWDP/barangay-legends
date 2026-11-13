// Content schema and validation. Buildings, events and balance rules live in content/ as JSON.

export const RESOURCES = ["rice", "wood"] as const;
export type Resource = (typeof RESOURCES)[number];
export type ResourceAmounts = Partial<Record<Resource, number>>;

/** Map features a building can be next to (besides other buildings). */
export const TERRAINS = ["river", "forest"] as const;
export type TerrainFeature = (typeof TERRAINS)[number];

export interface AdjacencyBonus {
  /** Terrain features or building ids that trigger the bonus when orthogonally adjacent. */
  nextTo: string[];
  /** Extra production, in percent, while the condition holds. Applies once, not per neighbour. */
  percent: number;
}

export interface BuildingDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  /** Position in the build menu (lower first). Files without one go last, by file name. */
  order?: number;
  cost: ResourceAmounts;
  /** What it costs to fix after a fire or typhoon damages it. */
  repairCost: ResourceAmounts;
  /** Sick villagers recover this much faster per building (100 = twice as fast). */
  heals?: { percentFaster: number };
  /** Output per second for each assigned worker. */
  produces?: ResourceAmounts;
  /** Worker slots per copy of the building. */
  workers?: number;
  /** Villager capacity added per copy. */
  housing?: number;
  /** Defense added against raids (e.g. a Kuta). */
  defense?: number;
  adjacencyBonus?: AdjacencyBonus;
  /** Where it can be built. Default "cleared" land; a bridge goes on the river. */
  placeOn?: "cleared" | "river";
  /** A bridge turns up to maxSpan river tiles into a crossing, opening the far bank. */
  bridge?: { maxSpan: number };
  /** Available from the start, or once the barangay has this many villagers. */
  unlock: { start?: boolean; villagers?: number };
  sources: string[];
}

export interface Rules {
  start: {
    resources: ResourceAmounts;
    villagers: number;
    buildings: Record<string, number>;
  };
  baseHousing: number;
  riceEatenPerVillagerPerSecond: number;
  costGrowth: number;
  gatherPerClick: number;
  secondsPerNewVillager: number;
  /** When there are more villagers than houses shelter (a house was demolished), one leaves this often. */
  secondsPerVillagerLeavingOvercrowded: number;
  placement: PlacementRules;
  map: MapRules;
  clearing: ClearingRules;
  military: MilitaryRules;
  diplomacy: DiplomacyRules;
  choices: ChoiceRules;
  offline: OfflineRules;
  roads: RoadRules;
}

/** Daan: footpaths laid tile by tile on cleared land. */
export interface RoadRules {
  /** Cost of one tile. Removing a path is free. */
  cost: ResourceAmounts;
  /** Extra output for a building joined to the barangay's center by an unbroken Daan. */
  connectedBonusPercent: number;
  /** How fast villagers walk on Daan (visual only), in percent of normal. */
  walkSpeedPercent: number;
}

/** Progress while the game is closed (see engine/offline.ts). */
export interface OfflineRules {
  /** At most this much time away is credited (8 hours). */
  maxSeconds: number;
  /** Shorter absences are not credited. */
  minSeconds: number;
  /** Simulated in steps of about this size... */
  stepSeconds: number;
  /** ...but never more than this many steps, so a long absence stays quick to compute. */
  maxSteps: number;
  /** Each neighbor makes one AI decision this often offline (less often than online, to stay fast). */
  aiDecisionSeconds: number;
}

/** How often choice events come up. */
export interface ChoiceRules {
  /** None before this game time. */
  startsAfterSeconds: number;
  /** At least this long between two choice events (counted from when one appears). */
  minGapSeconds: number;
  /** Chance one starts, rolled once per game second when allowed. */
  chancePerSecond: number;
}

/** What a choice does. Every field is optional; numbers may be negative. */
export interface ChoiceEffects {
  resources?: ResourceAmountsSigned;
  /** Newcomers (only as many as there is room for) or villagers who leave. */
  villagers?: number;
  /** Villagers who fall sick (positive) or are cured (negative). */
  sick?: number;
  /** With the event's neighbor. */
  trust?: number;
  influence?: number;
}

export type ResourceAmountsSigned = Partial<Record<Resource, number>>;

export interface ChoiceOption {
  id: string;
  label: string;
  /** What happens, shown after choosing. */
  result: string;
  effects: ChoiceEffects;
}

/** When a choice event may come up. All listed conditions must hold. */
export interface ChoiceConditions {
  /** Season id(s) from content/events/seasons.json. */
  season?: string[];
  /** A standing building of this type. */
  hasBuilding?: string;
  /** No building of this type. */
  lacksBuilding?: string;
  /** At least one sandugo ally (the event's neighbor is then an ally). */
  allied?: boolean;
  minVillagers?: number;
}

/** A short story with 2–3 choices (content/events/choices). */
export interface ChoiceEventDef {
  id: string;
  title: string;
  icon: string;
  /** May use {neighbor} and {datu}. */
  story: string;
  /** The event involves a neighbor: any, an ally, or an independent one. */
  neighbor?: "any" | "ally" | "independent";
  conditions: ChoiceConditions;
  /** Relative chance against other eligible events (default 1). */
  weight: number;
  choices: ChoiceOption[];
  sources: string[];
}

/** Changing your mind about a building: undo, move or demolish it. */
export interface PlacementRules {
  /** How long after building the "Undo" button stays; undo returns the full cost. */
  undoSeconds: number;
  /** Moving costs this percent of the building's current price (rounded up). */
  moveCostPercent: number;
  /** Demolishing returns this percent of what the last copy cost (rounded down). */
  demolishRefundPercent: number;
}

export interface MilitaryRules {
  /** A Mandirigma: trained from a villager, who then guards and fights instead of working. */
  warrior: { cost: ResourceAmounts; attack: number; defense: number };
  /** Defense every barangay has before warriors and walls. */
  baseDefense: number;
  /** Share of the warriors sent (or defending) lost by each side. */
  winnerLossPercent: number;
  loserLossPercent: number;
  /** Share of the loser's rice and wood a winning raid carries off as tribute. */
  lootPercent: number;
}

export interface TraitDef {
  label: string;
  trustGainPercent: number;
  influenceGainPercent: number;
  /** Extra goods received when trading with them. */
  tradeBonusPercent: number;
  offerChanceMultiplier: number;
  /** Raids the player after the truce. */
  raids: boolean;
  /** Share of their villagers they keep as warriors. */
  warriorPercent: number;
}

export interface DiplomacyRules {
  truceSeconds: number;
  startInfluence: number;
  trade: { give: number; receivePercent: number; influence: number; trust: number; loyalty: number };
  marriage: { trustNeeded: number; cost: ResourceAmounts; influence: number; trust: number };
  sandugo: { cost: ResourceAmounts; trust: number; allyDefensePercent: number };
  raid: { influence: number; renown: number; trustLossAll: number; trustLossTarget: number; cooldownSeconds: number };
  tribute: { percent: number; everySeconds: number };
  loyalty: {
    start: number;
    decayPerMinute: number;
    rebelBelow: number;
    rebelInfluence: number;
    guardSeconds: number;
    guardPerMinute: number;
  };
  aiRaid: { chancePerSecond: number; cooldownSeconds: number; warningSeconds: number; lootPercent: number; defendRenown: number };
  offers: { chancePerSecond: number; expireSeconds: number; give: number; receivePercent: number };
  aiDecisionSeconds: number;
  traits: Record<string, TraitDef>;
}

/** An AI neighbor barangay along the regional river. */
export interface NeighborDef {
  id: string;
  name: string;
  datu: string;
  trait: string;
  description: string;
  /** Where it sits on the regional river: 0 = upstream, 1 = downstream, and which bank. */
  river: { position: number; bank: "left" | "right" };
  start: { villagers: number; warriors: number; resources: ResourceAmounts; buildings: Record<string, number> };
  /** Starting trust towards the player, 0..100. */
  trust: number;
  fictional?: boolean;
  note?: string;
}

/** A lore note: short text with at least one source. */
export interface LoreNote {
  id: string;
  name: string;
  description: string;
  tradition?: string;
  sources: string[];
  [extra: string]: unknown;
}

/** The generated map: forest with a winding river, a few balete trees and a cleared start. */
export interface MapRules {
  width: number;
  height: number;
  /** The start area is a square of (2r + 1) tiles around the plaza. */
  startClearRadius: number;
  riverWidth: number;
  baleteTrees: number;
  /** Balete trees grow at least this many tiles from the plaza. */
  baleteMinDistance: number;
}

/** Clearing a forest tile: villagers work for a while and bring back some wood. */
export interface ClearingRules {
  baseSeconds: number;
  /** Each tile cleared so far multiplies the time by this. */
  secondsGrowth: number;
  /** Villagers taken off other work while clearing. */
  workers: number;
  wood: number;
}

/** Gutom: at 0 rice villagers stop working; after a grace period, families leave. */
export interface HungerEvent {
  id: string;
  type: "hunger";
  name: string;
  icon: string;
  description: string;
  graceSeconds: number;
  secondsPerVillagerLeaving: number;
}

export interface Season {
  id: string;
  name: string;
  icon: string;
  description: string;
  durationSeconds: number;
  /** Output of each resource, in percent of normal (missing = 100). */
  productionPercent: ResourceAmounts;
}

/** The year cycles through these seasons in order. */
export interface SeasonsEvent {
  id: string;
  type: "seasons";
  name: string;
  description: string;
  seasons: Season[];
}

/** A random disaster. It can't start before startsAfterSeconds or within cooldownSeconds of the last one. */
interface DisasterBase {
  id: string;
  name: string;
  icon: string;
  description: string;
  startsAfterSeconds: number;
  /** Chance it starts, rolled once per game second. */
  chancePerSecond: number;
  cooldownSeconds: number;
}

/** Sakit: villagers fall sick and can't work for a while. Spreads faster in crowded housing. */
export interface SicknessEvent extends DisasterBase {
  type: "sickness";
  sickSeconds: number;
  firstCases: number;
  /** Chance per second, per sick villager, that one more falls sick. */
  spreadChancePerSecond: number;
  /** Each pair of these buildings sharing an edge raises the spread chance by this percent. */
  crowding: { building: string; percentPerAdjacentPair: number };
}

/** Sunog: a building catches fire, spreads to neighbours of the same type, and burns down (damaged). */
export interface FireEvent extends DisasterBase {
  type: "fire";
  target: string;
  spreadAfterSeconds: number;
  burnDownSeconds: number;
}

/** Bagyo: a warning, then a few buildings are damaged. */
export interface TyphoonEvent extends DisasterBase {
  type: "typhoon";
  warningSeconds: number;
  damagedBuildings: { min: number; max: number };
}

export type EventDef = HungerEvent | SeasonsEvent | SicknessEvent | FireEvent | TyphoonEvent;

/** At most one event of each type. A missing file simply switches that event off. */
export interface Events {
  hunger?: HungerEvent;
  seasons?: SeasonsEvent;
  sickness?: SicknessEvent;
  fire?: FireEvent;
  typhoon?: TyphoonEvent;
}

/**
 * A grove: while a tile of this kind stands (a balete), buildings of one type within `radius`
 * tiles (straight-line distance between tile centres) produce `percent` more of a resource.
 * Several groves never stack on the same building: it gets the bonus once.
 */
export interface GroveBlessing {
  id: string;
  type: "grove";
  name: string;
  description: string;
  tile: "balete";
  radius: number;
  affects: string;
  resource: Resource;
  percent: number;
  /** How often the spirit shows itself: chance per balete in each time window (UI only). */
  sighting?: { chancePercent: number; windowSeconds: number };
  tradition: string;
  /** Lore note id (content/lore) shown when the player taps the spirit. */
  lore?: string;
  sources: string[];
}

export interface Content {
  buildings: BuildingDef[];
  rules: Rules;
  events: Events;
  lore: Record<string, LoreNote>;
  groves: GroveBlessing[];
  neighbors: NeighborDef[];
  choices: ChoiceEventDef[];
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isNonNegNumber = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0;

function checkAmounts(v: unknown, where: string): ResourceAmounts {
  if (!isObject(v)) throw new Error(`${where} must be an object`);
  for (const [key, amount] of Object.entries(v)) {
    if (!(RESOURCES as readonly string[]).includes(key)) {
      throw new Error(`${where} has unknown resource "${key}"`);
    }
    if (!isNonNegNumber(amount)) throw new Error(`${where}.${key} must be a number >= 0`);
  }
  return v as ResourceAmounts;
}

/** Checks one building file against the schema. Throws a readable error if it's wrong. */
export function validateBuilding(raw: unknown, file = "building"): BuildingDef {
  if (!isObject(raw)) throw new Error(`${file}: must be a JSON object`);
  for (const key of ["id", "name", "description", "icon"]) {
    if (typeof raw[key] !== "string" || raw[key] === "") {
      throw new Error(`${file}: "${key}" must be a non-empty string`);
    }
  }
  if (!/^[a-z0-9-]+$/.test(raw.id as string)) {
    throw new Error(`${file}: "id" may only use a-z, 0-9 and "-"`);
  }
  if (raw.order !== undefined && !Number.isFinite(raw.order)) throw new Error(`${file}: "order" must be a number`);
  checkAmounts(raw.cost, `${file}: cost`);
  checkAmounts(raw.repairCost, `${file}: repairCost`);
  if (raw.heals !== undefined && (!isObject(raw.heals) || !isNonNegNumber(raw.heals.percentFaster))) {
    throw new Error(`${file}: "heals.percentFaster" must be a number >= 0`);
  }
  if (raw.produces !== undefined) checkAmounts(raw.produces, `${file}: produces`);
  for (const key of ["workers", "housing"]) {
    if (raw[key] !== undefined && (!Number.isInteger(raw[key]) || (raw[key] as number) < 0)) {
      throw new Error(`${file}: "${key}" must be a whole number >= 0`);
    }
  }
  if (raw.adjacencyBonus !== undefined) {
    const bonus = raw.adjacencyBonus;
    if (
      !isObject(bonus) ||
      !Array.isArray(bonus.nextTo) ||
      bonus.nextTo.length === 0 ||
      !bonus.nextTo.every((t) => typeof t === "string" && t !== "")
    ) {
      throw new Error(`${file}: "adjacencyBonus.nextTo" must list at least one terrain or building id`);
    }
    if (!isNonNegNumber(bonus.percent)) throw new Error(`${file}: "adjacencyBonus.percent" must be a number >= 0`);
  }
  if (raw.defense !== undefined && !isNonNegNumber(raw.defense)) throw new Error(`${file}: "defense" must be a number >= 0`);
  if (raw.produces !== undefined && !raw.workers) {
    throw new Error(`${file}: a building that produces needs "workers"`);
  }
  if (raw.placeOn !== undefined && raw.placeOn !== "cleared" && raw.placeOn !== "river") {
    throw new Error(`${file}: "placeOn" must be "cleared" or "river"`);
  }
  if (raw.bridge !== undefined && (!isObject(raw.bridge) || !Number.isInteger(raw.bridge.maxSpan) || (raw.bridge.maxSpan as number) < 1)) {
    throw new Error(`${file}: "bridge.maxSpan" must be a whole number >= 1`);
  }
  if (raw.placeOn === "river" && raw.bridge === undefined) throw new Error(`${file}: a building on the river must be a "bridge"`);
  if (!isObject(raw.unlock)) throw new Error(`${file}: "unlock" must be an object`);
  if (raw.unlock.villagers !== undefined && !isNonNegNumber(raw.unlock.villagers)) {
    throw new Error(`${file}: "unlock.villagers" must be a number >= 0`);
  }
  if (
    !Array.isArray(raw.sources) ||
    raw.sources.length === 0 ||
    !raw.sources.every((s) => typeof s === "string" && s !== "")
  ) {
    throw new Error(`${file}: "sources" needs at least one reference`);
  }
  return raw as unknown as BuildingDef;
}

export function validateRules(raw: unknown): Rules {
  if (!isObject(raw) || !isObject(raw.start)) throw new Error("rules: missing \"start\"");
  checkAmounts(raw.start.resources, "rules: start.resources");
  if (!isNonNegNumber(raw.start.villagers)) throw new Error("rules: start.villagers must be a number");
  if (!isObject(raw.start.buildings)) throw new Error("rules: start.buildings must be an object");
  for (const key of [
    "baseHousing",
    "riceEatenPerVillagerPerSecond",
    "costGrowth",
    "gatherPerClick",
    "secondsPerNewVillager",
  ]) {
    if (!isNonNegNumber(raw[key])) throw new Error(`rules: "${key}" must be a number >= 0`);
  }
  const map = raw.map;
  if (!isObject(map)) throw new Error('rules: missing "map"');
  for (const key of ["width", "height", "startClearRadius", "riverWidth", "baleteTrees", "baleteMinDistance"]) {
    if (!Number.isInteger(map[key]) || (map[key] as number) < 0) {
      throw new Error(`rules: "map.${key}" must be a whole number >= 0`);
    }
  }
  const r = map.startClearRadius as number;
  if ((map.width as number) < 4 * r + 12 || (map.height as number) < 2 * r + 5) {
    throw new Error("rules: the map is too small for the start area, the river and forest on both banks");
  }
  if (!isNonNegNumber(raw.secondsPerVillagerLeavingOvercrowded) || raw.secondsPerVillagerLeavingOvercrowded <= 0) {
    throw new Error('rules: "secondsPerVillagerLeavingOvercrowded" must be a number > 0');
  }
  const placement = raw.placement;
  if (!isObject(placement)) throw new Error('rules: missing "placement"');
  checkNumbers(placement, ["undoSeconds", "moveCostPercent", "demolishRefundPercent"], "rules: placement");
  if ((placement.demolishRefundPercent as number) > 100) throw new Error("rules: placement.demolishRefundPercent can't be over 100");
  const clearing = raw.clearing;
  if (!isObject(clearing)) throw new Error('rules: missing "clearing"');
  checkNumbers(clearing, ["baseSeconds", "secondsGrowth", "wood"], "rules: clearing", false);
  checkNumbers(clearing, ["workers"], "rules: clearing", true);
  const military = raw.military;
  if (!isObject(military) || !isObject(military.warrior)) throw new Error('rules: missing "military.warrior"');
  checkAmounts(military.warrior.cost, "rules: military.warrior.cost");
  checkNumbers(military.warrior, ["attack", "defense"], "rules: military.warrior");
  checkNumbers(military, ["baseDefense", "winnerLossPercent", "loserLossPercent", "lootPercent"], "rules: military");
  const d = raw.diplomacy;
  if (!isObject(d)) throw new Error('rules: missing "diplomacy"');
  checkNumbers(d, ["truceSeconds", "startInfluence"], "rules: diplomacy");
  checkNumbers(d, ["aiDecisionSeconds"], "rules: diplomacy", true);
  const sections: Record<string, string[]> = {
    trade: ["give", "receivePercent", "influence", "trust", "loyalty"],
    marriage: ["trustNeeded", "influence", "trust"],
    sandugo: ["trust", "allyDefensePercent"],
    raid: ["influence", "renown", "trustLossAll", "trustLossTarget", "cooldownSeconds"],
    tribute: ["percent", "everySeconds"],
    loyalty: ["start", "decayPerMinute", "rebelBelow", "rebelInfluence", "guardSeconds", "guardPerMinute"],
    aiRaid: ["chancePerSecond", "cooldownSeconds", "warningSeconds", "lootPercent", "defendRenown"],
    offers: ["chancePerSecond", "expireSeconds", "give", "receivePercent"],
  };
  for (const [section, keys] of Object.entries(sections)) {
    if (!isObject(d[section])) throw new Error(`rules: missing "diplomacy.${section}"`);
    checkNumbers(d[section] as Record<string, unknown>, keys, `rules: diplomacy.${section}`);
  }
  const ch = raw.choices;
  if (!isObject(ch)) throw new Error('rules: missing "choices"');
  checkNumbers(ch, ["startsAfterSeconds", "minGapSeconds", "chancePerSecond"], "rules: choices");
  if ((ch.chancePerSecond as number) > 1) throw new Error("rules: choices.chancePerSecond can't be over 1");
  const roads = raw.roads;
  if (!isObject(roads)) throw new Error('rules: missing "roads"');
  checkAmounts(roads.cost, "rules: roads.cost");
  checkNumbers(roads, ["connectedBonusPercent"], "rules: roads");
  checkNumbers(roads, ["walkSpeedPercent"], "rules: roads", true);
  const off = raw.offline;
  if (!isObject(off)) throw new Error('rules: missing "offline"');
  checkNumbers(off, ["maxSeconds", "minSeconds"], "rules: offline");
  checkNumbers(off, ["stepSeconds", "maxSteps", "aiDecisionSeconds"], "rules: offline", true);
  checkAmounts((d.marriage as Record<string, unknown>).cost, "rules: diplomacy.marriage.cost");
  checkAmounts((d.sandugo as Record<string, unknown>).cost, "rules: diplomacy.sandugo.cost");
  if ((d.tribute as Record<string, number>).everySeconds <= 0) throw new Error("rules: diplomacy.tribute.everySeconds must be > 0");
  if (!isObject(d.traits) || Object.keys(d.traits).length === 0) throw new Error('rules: missing "diplomacy.traits"');
  for (const [name, trait] of Object.entries(d.traits)) {
    if (!isObject(trait) || typeof trait.raids !== "boolean") throw new Error(`rules: trait "${name}" needs "raids" true or false`);
    checkStrings(trait, ["label"], `rules: trait ${name}`);
    checkNumbers(
      trait,
      ["trustGainPercent", "influenceGainPercent", "tradeBonusPercent", "offerChanceMultiplier", "warriorPercent"],
      `rules: trait ${name}`,
    );
  }
  return raw as unknown as Rules;
}

function checkStrings(raw: Record<string, unknown>, keys: string[], file: string) {
  for (const key of keys) {
    if (typeof raw[key] !== "string" || raw[key] === "") throw new Error(`${file}: "${key}" must be a non-empty string`);
  }
}

function checkNumbers(raw: Record<string, unknown>, keys: string[], file: string, positive = false) {
  for (const key of keys) {
    const v = raw[key];
    if (!isNonNegNumber(v) || (positive && v === 0)) {
      throw new Error(`${file}: "${key}" must be a number ${positive ? "> 0" : ">= 0"}`);
    }
  }
}

const DISASTER_NUMBERS = ["startsAfterSeconds", "chancePerSecond", "cooldownSeconds"];

/** Checks one event file against the schema for its type. */
export function validateEvent(raw: unknown, file = "event"): EventDef {
  if (!isObject(raw)) throw new Error(`${file}: must be a JSON object`);
  checkStrings(raw, ["id", "type", "name", "description"], file);
  if (raw.sources !== undefined && (!Array.isArray(raw.sources) || !raw.sources.every((x) => typeof x === "string"))) {
    throw new Error(`${file}: "sources" must be a list of references`);
  }
  switch (raw.type) {
    case "hunger":
      checkStrings(raw, ["icon"], file);
      checkNumbers(raw, ["graceSeconds"], file);
      checkNumbers(raw, ["secondsPerVillagerLeaving"], file, true);
      break;
    case "seasons":
      if (!Array.isArray(raw.seasons) || raw.seasons.length === 0) throw new Error(`${file}: "seasons" needs at least one season`);
      raw.seasons.forEach((season, i) => {
        const where = `${file}: seasons[${i}]`;
        if (!isObject(season)) throw new Error(`${where} must be an object`);
        checkStrings(season, ["id", "name", "icon", "description"], where);
        checkNumbers(season, ["durationSeconds"], where, true);
        checkAmounts(season.productionPercent, `${where}.productionPercent`);
      });
      break;
    case "sickness":
      checkStrings(raw, ["icon"], file);
      checkNumbers(raw, [...DISASTER_NUMBERS, "spreadChancePerSecond"], file);
      checkNumbers(raw, ["sickSeconds", "firstCases"], file, true);
      if (!isObject(raw.crowding) || typeof raw.crowding.building !== "string" || !isNonNegNumber(raw.crowding.percentPerAdjacentPair)) {
        throw new Error(`${file}: "crowding" needs a "building" id and "percentPerAdjacentPair"`);
      }
      break;
    case "fire":
      checkStrings(raw, ["icon", "target"], file);
      checkNumbers(raw, DISASTER_NUMBERS, file);
      checkNumbers(raw, ["spreadAfterSeconds", "burnDownSeconds"], file, true);
      break;
    case "typhoon": {
      checkStrings(raw, ["icon"], file);
      checkNumbers(raw, [...DISASTER_NUMBERS, "warningSeconds"], file);
      const d = raw.damagedBuildings;
      if (!isObject(d) || !Number.isInteger(d.min) || !Number.isInteger(d.max) || (d.min as number) < 0 || (d.max as number) < (d.min as number)) {
        throw new Error(`${file}: "damagedBuildings" needs whole numbers with 0 <= min <= max`);
      }
      break;
    }
    default:
      throw new Error(`${file}: unknown event type "${String(raw.type)}"`);
  }
  return raw as unknown as EventDef;
}

/** Validates building, rules and event files and checks they fit together. */
export function validateLore(raw: unknown, file = "lore"): LoreNote {
  if (!isObject(raw)) throw new Error(`${file}: must be a JSON object`);
  checkStrings(raw, ["id", "name", "description"], file);
  if (!Array.isArray(raw.sources) || raw.sources.length === 0 || !raw.sources.every((x) => typeof x === "string" && x !== "")) {
    throw new Error(`${file}: lore needs at least one source`);
  }
  return raw as LoreNote;
}

export function validateGrove(raw: unknown, file = "blessing"): GroveBlessing {
  if (!isObject(raw)) throw new Error(`${file}: must be a JSON object`);
  checkStrings(raw, ["id", "name", "description", "affects", "tradition"], file);
  if (raw.type !== "grove") throw new Error(`${file}: unknown blessing type "${String(raw.type)}"`);
  if (raw.tile !== "balete") throw new Error(`${file}: "tile" must be "balete"`);
  if (!(RESOURCES as readonly string[]).includes(raw.resource as string)) throw new Error(`${file}: unknown resource "${String(raw.resource)}"`);
  checkNumbers(raw, ["radius", "percent"], file, true);
  if (raw.sighting !== undefined) {
    const s = raw.sighting;
    if (!isObject(s) || !isNonNegNumber(s.chancePercent) || !isNonNegNumber(s.windowSeconds) || s.windowSeconds === 0) {
      throw new Error(`${file}: "sighting" needs "chancePercent" and "windowSeconds" > 0`);
    }
  }
  if (!Array.isArray(raw.sources) || raw.sources.length === 0) throw new Error(`${file}: a blessing from folklore needs a source`);
  return raw as unknown as GroveBlessing;
}

/** Checks one neighbor file. Trait and building ids are checked in buildContent. */
export function validateNeighbor(raw: unknown, file = "neighbor"): NeighborDef {
  if (!isObject(raw)) throw new Error(`${file}: must be a JSON object`);
  checkStrings(raw, ["id", "name", "datu", "trait", "description"], file);
  if (!/^[a-z0-9-]+$/.test(raw.id as string)) throw new Error(`${file}: "id" may only use a-z, 0-9 and "-"`);
  const river = raw.river;
  if (!isObject(river) || !isNonNegNumber(river.position) || (river.position as number) > 1 || (river.bank !== "left" && river.bank !== "right")) {
    throw new Error(`${file}: "river" needs a "position" from 0 to 1 and a "bank" of "left" or "right"`);
  }
  const start = raw.start;
  if (!isObject(start)) throw new Error(`${file}: missing "start"`);
  checkNumbers(start, ["villagers", "warriors"], `${file}: start`);
  if ((start.warriors as number) > (start.villagers as number)) throw new Error(`${file}: warriors are villagers, so there can't be more warriors than villagers`);
  checkAmounts(start.resources, `${file}: start.resources`);
  if (!isObject(start.buildings)) throw new Error(`${file}: "start.buildings" must be an object`);
  if (!isNonNegNumber(raw.trust) || (raw.trust as number) > 100) throw new Error(`${file}: "trust" must be 0..100`);
  return raw as unknown as NeighborDef;
}

const CHOICE_EFFECTS = ["resources", "villagers", "sick", "trust", "influence"];
const MAX_CHOICE_EFFECT = 1000;

/** Checks one choice event file. Building and season ids are checked in buildContent. */
export function validateChoice(raw: unknown, file = "choice"): ChoiceEventDef {
  if (!isObject(raw)) throw new Error(`${file}: must be a JSON object`);
  checkStrings(raw, ["id", "title", "icon", "story"], file);
  if (!/^[a-z0-9-]+$/.test(raw.id as string)) throw new Error(`${file}: "id" may only use a-z, 0-9 and "-"`);
  if (raw.neighbor !== undefined && !["any", "ally", "independent"].includes(raw.neighbor as string)) {
    throw new Error(`${file}: "neighbor" must be "any", "ally" or "independent"`);
  }
  if (raw.weight === undefined) raw.weight = 1;
  if (!isNonNegNumber(raw.weight) || raw.weight === 0) throw new Error(`${file}: "weight" must be a number > 0`);
  const c = raw.conditions ?? {};
  if (!isObject(c)) throw new Error(`${file}: "conditions" must be an object`);
  if (typeof c.season === "string") c.season = [c.season];
  if (c.season !== undefined && (!Array.isArray(c.season) || c.season.length === 0 || !c.season.every((x) => typeof x === "string"))) {
    throw new Error(`${file}: "conditions.season" must be a season id or a list of them`);
  }
  for (const k of ["hasBuilding", "lacksBuilding"]) {
    if (c[k] !== undefined && (typeof c[k] !== "string" || c[k] === "")) throw new Error(`${file}: "conditions.${k}" must be a building id`);
  }
  if (c.allied !== undefined && c.allied !== true) throw new Error(`${file}: "conditions.allied" can only be true`);
  if (c.minVillagers !== undefined && (!Number.isInteger(c.minVillagers) || (c.minVillagers as number) < 0)) {
    throw new Error(`${file}: "conditions.minVillagers" must be a whole number >= 0`);
  }
  for (const k of Object.keys(c)) {
    if (!["season", "hasBuilding", "lacksBuilding", "allied", "minVillagers"].includes(k)) throw new Error(`${file}: unknown condition "${k}"`);
  }
  raw.conditions = c;
  if (!Array.isArray(raw.choices) || raw.choices.length < 2 || raw.choices.length > 3) throw new Error(`${file}: needs 2 or 3 "choices"`);
  const ids = new Set<string>();
  const usesNeighbor = raw.neighbor !== undefined || c.allied === true;
  raw.choices.forEach((o, i) => {
    const where = `${file}: choices[${i}]`;
    if (!isObject(o)) throw new Error(`${where} must be an object`);
    checkStrings(o, ["id", "label", "result"], where);
    if (ids.has(o.id as string)) throw new Error(`${where}: id "${String(o.id)}" is used twice`);
    ids.add(o.id as string);
    const e = o.effects;
    if (!isObject(e)) throw new Error(`${where}: needs "effects" (use {} for none)`);
    for (const [k, v] of Object.entries(e)) {
      if (!CHOICE_EFFECTS.includes(k)) throw new Error(`${where}: unknown effect "${k}"`);
      if (k === "resources") {
        if (!isObject(v)) throw new Error(`${where}: effects.resources must be an object`);
        for (const [r, n] of Object.entries(v)) {
          if (!(RESOURCES as readonly string[]).includes(r)) throw new Error(`${where}: unknown resource "${r}"`);
          if (!Number.isInteger(n) || Math.abs(n as number) > MAX_CHOICE_EFFECT) throw new Error(`${where}: effects.resources.${r} must be a whole number`);
        }
      } else if (!Number.isInteger(v) || Math.abs(v as number) > MAX_CHOICE_EFFECT) {
        throw new Error(`${where}: effects.${k} must be a whole number`);
      }
      if ((k === "trust" || k === "influence") && !usesNeighbor) throw new Error(`${where}: "${k}" needs the event to name a "neighbor" (or be "allied")`);
    }
  });
  const texts = [raw.story as string, ...(raw.choices as Record<string, string>[]).flatMap((o) => [o.label, o.result])];
  for (const p of texts.flatMap((t) => [...t.matchAll(/\{(\w+)\}/g)])) {
    if (p[1] !== "neighbor" && p[1] !== "datu") throw new Error(`${file}: unknown placeholder {${p[1]}}`);
    if (!usesNeighbor) throw new Error(`${file}: {${p[1]}} needs the event to name a "neighbor"`);
  }
  if (!Array.isArray(raw.sources) || raw.sources.length === 0 || !raw.sources.every((x) => typeof x === "string" && x !== "")) {
    throw new Error(`${file}: a choice event needs at least one source for its history`);
  }
  return raw as unknown as ChoiceEventDef;
}

export function buildContent(
  buildingFiles: Record<string, unknown>,
  rawRules: unknown,
  eventFiles: Record<string, unknown> = {},
  loreFiles: Record<string, unknown> = {},
  blessingFiles: Record<string, unknown> = {},
  neighborFiles: Record<string, unknown> = {},
  choiceFiles: Record<string, unknown> = {},
): Content {
  const buildings = Object.entries(buildingFiles)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([file, raw]) => validateBuilding(raw, file))
    .sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));
  const ids = new Set<string>();
  for (const b of buildings) {
    if (ids.has(b.id)) throw new Error(`Duplicate building id "${b.id}"`);
    ids.add(b.id);
  }
  for (const b of buildings) {
    for (const target of b.adjacencyBonus?.nextTo ?? []) {
      if (!(TERRAINS as readonly string[]).includes(target) && !ids.has(target)) {
        throw new Error(`${b.id}: adjacencyBonus.nextTo has unknown terrain or building "${target}"`);
      }
    }
  }
  const rules = validateRules(rawRules);
  for (const id of Object.keys(rules.start.buildings)) {
    if (!ids.has(id)) throw new Error(`rules: start.buildings mentions unknown building "${id}"`);
  }

  const events: Events = {};
  for (const [file, raw] of Object.entries(eventFiles).sort(([a], [b]) => a.localeCompare(b))) {
    const event = validateEvent(raw, file);
    if (events[event.type]) throw new Error(`${file}: there is already a "${event.type}" event`);
    if (event.type === "sickness" && !ids.has(event.crowding.building)) {
      throw new Error(`${file}: crowding.building "${event.crowding.building}" is not a building`);
    }
    if (event.type === "fire" && !ids.has(event.target)) {
      throw new Error(`${file}: target "${event.target}" is not a building`);
    }
    (events as Record<string, EventDef>)[event.type] = event;
  }
  const lore: Record<string, LoreNote> = {};
  for (const [file, raw] of Object.entries(loreFiles)) {
    const note = validateLore(raw, file);
    lore[note.id] = note;
  }
  const groves = Object.entries(blessingFiles)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([file, raw]) => {
      const grove = validateGrove(raw, file);
      if (!ids.has(grove.affects)) throw new Error(`${file}: "affects" names unknown building "${grove.affects}"`);
      if (grove.lore && !lore[grove.lore]) throw new Error(`${file}: "lore" names unknown lore note "${grove.lore}"`);
      return grove;
    });
  const neighbors = Object.entries(neighborFiles)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([file, raw]) => {
      const n = validateNeighbor(raw, file);
      if (!rules.diplomacy.traits[n.trait]) throw new Error(`${file}: unknown trait "${n.trait}"`);
      for (const id of Object.keys(n.start.buildings)) {
        if (!ids.has(id)) throw new Error(`${file}: start.buildings mentions unknown building "${id}"`);
      }
      return n;
    })
    .sort((a, b) => a.river.position - b.river.position);
  if (new Set(neighbors.map((n) => n.id)).size !== neighbors.length) throw new Error("Two neighbors share an id");
  const seasonIds = events.seasons?.seasons.map((s) => s.id) ?? [];
  const choices = Object.entries(choiceFiles)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([file, raw]) => {
      const c = validateChoice(raw, file);
      for (const k of ["hasBuilding", "lacksBuilding"] as const) {
        const id = c.conditions[k];
        if (id && !ids.has(id)) throw new Error(`${file}: conditions.${k} names unknown building "${id}"`);
      }
      for (const id of c.conditions.season ?? []) if (!seasonIds.includes(id)) throw new Error(`${file}: unknown season "${id}"`);
      return c;
    });
  if (new Set(choices.map((c) => c.id)).size !== choices.length) throw new Error("Two choice events share an id");
  return { buildings, rules, events, lore, groves, neighbors, choices };
}

/** Loads every JSON file in content/ at build time (Vite bundles them). */
export function loadContent(): Content {
  const files = import.meta.glob("../../content/buildings/*.json", {
    eager: true,
    import: "default",
  });
  const rules = import.meta.glob("../../content/rules.json", { eager: true, import: "default" });
  const events = import.meta.glob("../../content/events/*.json", { eager: true, import: "default" });
  const lore = import.meta.glob("../../content/lore/*.json", { eager: true, import: "default" });
  const blessings = import.meta.glob("../../content/blessings/*.json", { eager: true, import: "default" });
  const neighbors = import.meta.glob("../../content/neighbors/*.json", { eager: true, import: "default" });
  const choices = import.meta.glob("../../content/events/choices/*.json", { eager: true, import: "default" });
  return buildContent(files, Object.values(rules)[0], events, lore, blessings, neighbors, choices);
}
