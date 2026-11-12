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
  adjacencyBonus?: AdjacencyBonus;
  unlock: { start?: boolean };
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
  map: MapRules;
}

/** Columns, left to right: river | buildable land | forest. Rows grow from the plaza row (0). */
export interface MapRules {
  width: number;
  riverColumns: number;
  forestColumns: number;
  /** The map starts with rows -minRadius..minRadius. */
  minRadius: number;
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

export interface Content {
  buildings: BuildingDef[];
  rules: Rules;
  events: Events;
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
  if (raw.produces !== undefined && !raw.workers) {
    throw new Error(`${file}: a building that produces needs "workers"`);
  }
  if (!isObject(raw.unlock)) throw new Error(`${file}: "unlock" must be an object`);
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
  for (const key of ["width", "riverColumns", "forestColumns", "minRadius"]) {
    if (!Number.isInteger(map[key]) || (map[key] as number) < 0) {
      throw new Error(`rules: "map.${key}" must be a whole number >= 0`);
    }
  }
  if ((map.width as number) - (map.riverColumns as number) - (map.forestColumns as number) < 3) {
    throw new Error("rules: the map needs at least 3 land columns between the river and the forest");
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
export function buildContent(
  buildingFiles: Record<string, unknown>,
  rawRules: unknown,
  eventFiles: Record<string, unknown> = {},
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
  return { buildings, rules, events };
}

/** Loads every JSON file in content/ at build time (Vite bundles them). */
export function loadContent(): Content {
  const files = import.meta.glob("../../content/buildings/*.json", {
    eager: true,
    import: "default",
  });
  const rules = import.meta.glob("../../content/rules.json", { eager: true, import: "default" });
  const events = import.meta.glob("../../content/events/*.json", { eager: true, import: "default" });
  return buildContent(files, Object.values(rules)[0], events);
}
