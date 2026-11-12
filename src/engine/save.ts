// Saving to the browser. The only engine module allowed to touch browser APIs,
// and even here the storage is passed in so tests can use a fake.
import { RESOURCES, type Content } from "./content";
import { newGame, placeAuto, STATE_VERSION, type GameState, type PlacedBuilding } from "./game";
import { canPlace } from "./map";

export const SAVE_KEY = "barangay-legends/save";

type KeyValueStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type RawSave = Record<string, unknown>;

const finiteNonNeg = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
const isObject = (v: unknown): v is RawSave => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * One migration per save format change: MIGRATIONS[n] turns a version-n save into version n+1.
 * Never edit an old migration; add a new one and bump STATE_VERSION.
 */
const MIGRATIONS: Record<number, (raw: RawSave, content: Content) => RawSave> = {
  // v1 → v2: buildings were counts ({ palayan: 2 }); now each one has a tile. Existing buildings
  // are auto-placed (best bonus, then nearest the plaza), houses first, in content order.
  1: (raw, content) => {
    let state: GameState = { ...newGame(content), buildings: [] };
    const counts = isObject(raw.buildings) ? raw.buildings : {};
    for (const def of content.buildings) {
      const n = counts[def.id];
      if (!finiteNonNeg(n)) continue;
      for (let i = 0; i < Math.floor(n); i++) state = placeAuto(state, content, def.id);
    }
    return { ...raw, version: 2, buildings: state.buildings };
  },
  // v2 → v3: events. Adds the game clock, RNG seed, hunger, sickness, typhoon and cooldowns.
  // Old barangays restart the clock at 0, so they also get the disaster-free first minutes.
  // The seed comes from the save's own buildings, so each old save gets its own events.
  2: (raw) => {
    const buildings = Array.isArray(raw.buildings) ? raw.buildings : [];
    const seed = hashString(JSON.stringify(buildings));
    return { ...raw, version: 3, time: 0, rng: seed, hunger: 0, sick: [], typhoon: null, nextEventAt: {} };
  },
};

/** FNV-1a: a small, stable string hash. */
function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** Brings an older save up to the current version. Returns null for unknown or future versions. */
export function migrate(raw: RawSave, content: Content): RawSave | null {
  let data = raw;
  while (typeof data.version === "number" && data.version < STATE_VERSION) {
    const step = MIGRATIONS[data.version];
    if (!step) return null;
    data = step(data, content);
  }
  return data.version === STATE_VERSION ? data : null;
}

/** Turns saved JSON back into a state. Unknown or broken fields fall back to new-game values. */
export function parseSave(json: string, content: Content): GameState | null {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (!isObject(raw)) return null;
  const data = migrate(raw, content);
  if (!data) return null;

  const state = newGame(content);
  const resources = isObject(data.resources) ? data.resources : {};
  for (const r of RESOURCES) {
    const v = resources[r];
    if (finiteNonNeg(v)) state.resources[r] = v;
  }
  if (finiteNonNeg(data.villagers)) state.villagers = Math.floor(data.villagers);
  if (typeof data.migration === "number" && Math.abs(data.migration) < 1) state.migration = data.migration;
  if (finiteNonNeg(data.time)) state.time = data.time;
  if (Number.isInteger(data.rng)) state.rng = (data.rng as number) >>> 0;
  if (finiteNonNeg(data.hunger)) state.hunger = data.hunger;
  if (Array.isArray(data.sick)) {
    const max = content.events.sickness?.sickSeconds ?? 0;
    state.sick = data.sick.filter((t): t is number => finiteNonNeg(t) && t > 0 && t <= max).slice(0, state.villagers);
  }
  if (isObject(data.typhoon) && finiteNonNeg(data.typhoon.strikeAt) && content.events.typhoon) {
    state.typhoon = { strikeAt: data.typhoon.strikeAt };
  }
  if (isObject(data.nextEventAt)) {
    state.nextEventAt = Object.fromEntries(
      Object.entries(data.nextEventAt).filter((e): e is [string, number] => finiteNonNeg(e[1])),
    );
  }

  const b = data.barangay;
  if (isObject(b) && typeof b.id === "string" && b.id !== "" && isObject(b.region)) {
    const { x, y } = b.region;
    if (Number.isInteger(x) && Number.isInteger(y)) {
      state.barangay = { id: b.id, region: { x: x as number, y: y as number } };
    }
  }

  if (Array.isArray(data.buildings)) {
    // Re-place each building in order, dropping unknown types, overlaps and tiles that aren't land.
    const known = new Set(content.buildings.map((d) => d.id));
    let placed: GameState = { ...state, buildings: [] };
    for (const item of data.buildings as unknown[]) {
      if (!isObject(item) || typeof item.type !== "string" || !known.has(item.type)) continue;
      const { x, y } = item;
      if (typeof x !== "number" || typeof y !== "number" || !canPlace(placed, content, x, y)) continue;
      const building: PlacedBuilding = { type: item.type, x, y };
      if (item.damaged === true) building.damaged = true;
      else if (finiteNonNeg(item.burningSince) && item.burningSince <= state.time && content.events.fire) {
        building.burningSince = item.burningSince;
      }
      placed = { ...placed, buildings: [...placed.buildings, building] };
    }
    state.buildings = placed.buildings;
  }
  return state;
}

export function saveGame(state: GameState, storage: KeyValueStore = localStorage): void {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch {
    // Storage full or blocked (private mode): the game still plays, it just won't persist.
  }
}

/** Loads the saved game, or starts a new one with `seed` if there is none. */
export function loadGame(content: Content, storage: KeyValueStore = localStorage, seed?: number): GameState {
  try {
    const json = storage.getItem(SAVE_KEY);
    if (json) return parseSave(json, content) ?? newGame(content, seed);
  } catch {
    // Storage blocked: start fresh.
  }
  return newGame(content, seed);
}

export function clearSave(storage: KeyValueStore = localStorage): void {
  try {
    storage.removeItem(SAVE_KEY);
  } catch {
    // ignore
  }
}
