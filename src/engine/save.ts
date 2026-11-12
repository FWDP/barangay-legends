// Saving to the browser. The only engine module allowed to touch browser APIs,
// and even here the storage is passed in so tests can use a fake.
import { RESOURCES, type BuildingDef, type Content, type Resource } from "./content";
import { newGame, placeAuto, STATE_VERSION, type ClearingJob, type GameState, type PlacedBuilding } from "./game";
import {
  generateMap,
  inBounds,
  isPlaza,
  isTileCode,
  NEIGHBOURS,
  setTiles,
  standingBridgeTiles,
  tileAt,
  type MapState,
  type Tile,
} from "./map";
import {
  aiContent,
  createRegion,
  newNeighborState,
  type NeighborState,
  type NeighborStatus,
  type Path,
  type RegionState,
  type Report,
  type TradeOffer,
} from "./region";

export const SAVE_KEY = "barangay-legends/save";

type KeyValueStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type RawSave = Record<string, unknown>;

const finiteNonNeg = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
const isObject = (v: unknown): v is RawSave => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * One migration per save format change: MIGRATIONS[n] turns a version-n save into version n+1.
 * Never change what an old migration produces; add a new one and bump STATE_VERSION.
 * Migrations must not depend on engine code that may change later, so the old map rules a
 * migration needs are frozen in this file.
 */
const MIGRATIONS: Record<number, (raw: RawSave, content: Content) => RawSave> = {
  // v1 → v2: buildings were counts ({ palayan: 2 }); now each one has a tile on the v2 map
  // (see LEGACY_V2). Buildings are auto-placed (best bonus, then nearest the plaza), houses
  // first, in content order.
  1: (raw, content) => {
    let buildings: PlacedBuilding[] = [];
    const counts = isObject(raw.buildings) ? raw.buildings : {};
    for (const def of content.buildings) {
      const n = counts[def.id];
      if (!finiteNonNeg(n)) continue;
      for (let i = 0; i < Math.floor(n); i++) buildings = [...buildings, legacyV2AutoPlace(buildings, def)];
    }
    return { ...raw, version: 2, buildings };
  },
  // v2 → v3: events. Adds the game clock, RNG seed, hunger, sickness, typhoon and cooldowns.
  // Old barangays restart the clock at 0, so they also get the disaster-free first minutes.
  // The seed comes from the save's own buildings, so each old save gets its own events.
  2: (raw) => {
    const buildings = Array.isArray(raw.buildings) ? raw.buildings : [];
    const seed = hashString(JSON.stringify(buildings));
    return { ...raw, version: 3, time: 0, rng: seed, hunger: 0, sick: [], typhoon: null, nextEventAt: {} };
  },
  // v3 → v4: the generated map. A map is generated from the save's seed, and the old
  // buildings move onto it around the new plaza, keeping their layout. If the river ends up
  // on the other side, the layout is mirrored so fields stay by the river and camps by the
  // forest. Every building's tile and the tiles around it become cleared land.
  3: (raw, content) => {
    const seed = Number.isInteger(raw.rng) ? (raw.rng as number) >>> 0 : 0;
    let map = generateMap(content, seed);
    const { plaza } = map;
    let riverX = 0;
    while (riverX < map.width && tileAt(map, riverX, plaza.y) !== "river") riverX++;
    const riverOnLeft = riverX < plaza.x;
    const flip = riverOnLeft ? 1 : -1;
    const defs = new Map(content.buildings.map((d) => [d.id, d]));
    const moved: RawSave[] = [];
    const clear: { x: number; y: number; tile: Tile }[] = [];
    const leftOver: string[] = [];
    for (const item of Array.isArray(raw.buildings) ? raw.buildings : []) {
      if (!isObject(item) || typeof item.type !== "string" || !defs.has(item.type)) continue;
      if (typeof item.x !== "number" || typeof item.y !== "number") continue;
      const x = plaza.x + flip * (item.x - LEGACY_V2.plaza.x);
      const y = plaza.y + (item.y - LEGACY_V2.plaza.y);
      if (!inBounds(map, x, y) || isPlaza(map, x, y)) {
        leftOver.push(item.type);
        continue;
      }
      moved.push({ ...item, x, y });
      for (const [dx, dy] of [[0, 0], ...NEIGHBOURS]) {
        const t = tileAt(map, x + dx, y + dy);
        // The building's own tile is always land; around it, only forest is cleared.
        if ((dx === 0 && dy === 0) || t === "forest" || t === "balete") clear.push({ x: x + dx, y: y + dy, tile: "cleared" });
      }
    }
    map = setTiles(map, clear);
    // Anything that fell off the map is auto-placed on cleared land instead.
    let state = { ...newGame(content, seed), map, buildings: moved as unknown as PlacedBuilding[] };
    for (const type of leftOver) state = placeAuto(state, content, type);
    return { ...raw, version: 4, map: state.map, buildings: state.buildings, clearing: null, tilesCleared: 0 };
  },
  // v4 → v5: the region. Adds warriors (none yet). The region itself is left empty here and
  // created from content when the save loads, with the truce starting from the save's clock.
  4: (raw) => ({ ...raw, version: 5, warriors: 0, region: null }),
  // v5 → v6: undo, move and demolish. Adds the last build (nothing to undo after loading).
  // Bridges now store the river tiles they span; older bridges work theirs out when loaded.
  5: (raw) => ({ ...raw, version: 6, lastBuild: null }),
};

// ---------- Frozen v2 map rules (for the v1 → v2 migration only) ----------

/** The v2 map: river in column 0, land in 1..8, forest in 9..10, plaza at (5, 0), rows from -3. */
const LEGACY_V2 = { width: 11, riverColumns: 1, forestColumns: 2, plaza: { x: 5, y: 0 }, minRadius: 3 };

function legacyV2Terrain(x: number, y: number): "river" | "forest" | "plaza" | "land" | null {
  if (x < 0 || x >= LEGACY_V2.width) return null;
  if (x < LEGACY_V2.riverColumns) return "river";
  if (x >= LEGACY_V2.width - LEGACY_V2.forestColumns) return "forest";
  return x === LEGACY_V2.plaza.x && y === LEGACY_V2.plaza.y ? "plaza" : "land";
}

function legacyV2AutoPlace(buildings: PlacedBuilding[], def: BuildingDef): PlacedBuilding {
  const radius = buildings.reduce((r, b) => Math.max(r, Math.abs(b.y) + 1), LEGACY_V2.minRadius);
  const taken = new Map(buildings.map((b) => [`${b.x},${b.y}`, b.type]));
  const bonusAt = (x: number, y: number) =>
    def.adjacencyBonus &&
    NEIGHBOURS.some(([dx, dy]) => {
      const t = legacyV2Terrain(x + dx, y + dy);
      const other = taken.get(`${x + dx},${y + dy}`);
      return (t !== null && def.adjacencyBonus!.nextTo.includes(t)) || (other !== undefined && def.adjacencyBonus!.nextTo.includes(other));
    })
      ? def.adjacencyBonus.percent
      : 0;
  let best: { x: number; y: number; bonus: number; dist: number } | null = null;
  for (let y = -radius; y <= radius; y++) {
    for (let x = 0; x < LEGACY_V2.width; x++) {
      if (legacyV2Terrain(x, y) !== "land" || taken.has(`${x},${y}`)) continue;
      const bonus = bonusAt(x, y);
      const dist = (x - LEGACY_V2.plaza.x) ** 2 + y ** 2;
      if (!best || bonus > best.bonus || (bonus === best.bonus && dist < best.dist)) best = { x, y, bonus, dist };
    }
  }
  return { type: def.id, x: best!.x, y: best!.y };
}

/** FNV-1a: a small, stable string hash. */
function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/**
 * Brings an older save up to version `to` (the current version by default). Returns null for
 * unknown or future versions.
 */
export function migrate(raw: RawSave, content: Content, to = STATE_VERSION): RawSave | null {
  let data = raw;
  while (typeof data.version === "number" && data.version < to) {
    const step = MIGRATIONS[data.version];
    if (!step) return null;
    data = step(data, content);
  }
  return data.version === to ? data : null;
}

function parseMap(raw: unknown): MapState | null {
  if (!isObject(raw) || !isObject(raw.plaza)) return null;
  const { width, height, seed, tiles } = raw;
  if (!Number.isInteger(width) || !Number.isInteger(height) || !Number.isInteger(seed) || typeof tiles !== "string") return null;
  if (tiles.length !== (width as number) * (height as number) || ![...tiles].every(isTileCode)) return null;
  const map: MapState = {
    width: width as number,
    height: height as number,
    seed: (seed as number) >>> 0,
    tiles,
    plaza: { x: raw.plaza.x as number, y: raw.plaza.y as number },
  };
  return tileAt(map, map.plaza.x, map.plaza.y) === "cleared" ? map : null;
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
  return parseState(data, content, true);
}

/**
 * Reads one barangay's state from current-version data: the player's (with its region) or
 * an AI neighbor's (without). Returns null if the map is broken.
 */
function parseState(data: RawSave, content: Content, isPlayer: boolean): GameState | null {
  const map = parseMap(data.map);
  if (!map) return null;

  const state: GameState = { ...newGame(content, map.seed, false), map };
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
  if (finiteNonNeg(data.tilesCleared)) state.tilesCleared = Math.floor(data.tilesCleared);

  const b = data.barangay;
  if (isObject(b) && typeof b.id === "string" && b.id !== "" && isObject(b.region)) {
    const { x, y } = b.region;
    if (Number.isInteger(x) && Number.isInteger(y)) {
      state.barangay = { id: b.id, region: { x: x as number, y: y as number } };
    }
  }

  // Buildings: known types on a fitting tile (cleared land, or a bridge for bridges), no overlaps.
  const defs = new Map(content.buildings.map((d) => [d.id, d]));
  const taken = new Set<string>();
  state.buildings = [];
  for (const item of Array.isArray(data.buildings) ? (data.buildings as unknown[]) : []) {
    if (!isObject(item) || typeof item.type !== "string") continue;
    const def = defs.get(item.type);
    const { x, y } = item;
    if (!def || typeof x !== "number" || typeof y !== "number" || taken.has(`${x},${y}`)) continue;
    const tile = tileAt(map, x, y);
    const fits = def.placeOn === "river" ? tile === "bridge" : tile === "cleared" && !isPlaza(map, x, y);
    if (!fits) continue;
    const building: PlacedBuilding = { type: item.type, x, y };
    if (def.bridge) {
      const span = parseSpan(item.span, map, def.bridge.maxSpan, x, y);
      building.span = span ?? standingBridgeTiles(map, def, x, y);
    }
    if (item.damaged === true) building.damaged = true;
    else if (finiteNonNeg(item.burningSince) && item.burningSince <= state.time && content.events.fire) {
      building.burningSince = item.burningSince;
    }
    taken.add(`${x},${y}`);
    state.buildings.push(building);
  }

  const job = data.clearing;
  if (isObject(job) && finiteNonNeg(job.progress) && finiteNonNeg(job.seconds) && typeof job.x === "number" && typeof job.y === "number") {
    const tile = tileAt(map, job.x, job.y);
    if (tile === "forest" || tile === "balete") {
      state.clearing = { x: job.x, y: job.y, progress: job.progress, seconds: job.seconds } satisfies ClearingJob;
    }
  }
  const last = data.lastBuild;
  if (
    isObject(last) &&
    typeof last.type === "string" &&
    finiteNonNeg(last.at) &&
    last.at <= state.time &&
    isObject(last.cost) &&
    state.buildings.some((b) => b.type === last.type && b.x === last.x && b.y === last.y)
  ) {
    const paid = last.cost as RawSave;
    const cost = Object.fromEntries(RESOURCES.map((r) => [r, finiteNonNeg(paid[r]) ? paid[r] : 0])) as Record<Resource, number>;
    state.lastBuild = { type: last.type, x: last.x as number, y: last.y as number, cost, at: last.at };
  }
  if (finiteNonNeg(data.warriors)) state.warriors = Math.min(Math.floor(data.warriors), state.villagers);
  if (isPlayer && content.neighbors.length > 0) state.region = parseRegion(data.region, content, state);
  return state;
}

/** A saved bridge span: bridge tiles in a straight line from the bridge's own tile. */
function parseSpan(raw: unknown, map: MapState, maxSpan: number, x: number, y: number): { x: number; y: number }[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > maxSpan) return null;
  const span = raw.filter(isObject).map((p) => ({ x: p.x as number, y: p.y as number }));
  if (span.length !== raw.length || span[0].x !== x || span[0].y !== y) return null;
  const straight = span.every((p, i) => Math.abs(p.x - x) + Math.abs(p.y - y) === i && (p.x === x || p.y === y));
  return straight && span.every((p) => tileAt(map, p.x, p.y) === "bridge") ? span : null;
}

const STATUSES: NeighborStatus[] = ["independent", "tributary", "ally"];
const PATHS: Path[] = ["trade", "marriage", "sandugo", "mangayaw"];
const isResource = (v: unknown): v is Resource => (RESOURCES as readonly unknown[]).includes(v);
const pct = (v: unknown, fallback: number) => (finiteNonNeg(v) ? Math.min(100, v) : fallback);

/** Reads the region; anything missing or broken is rebuilt from content. */
function parseRegion(raw: unknown, content: Content, player: GameState): RegionState {
  const fresh = createRegion(content, player.time, player.rng);
  if (!isObject(raw)) return fresh;
  const saved = new Map(
    (Array.isArray(raw.neighbors) ? raw.neighbors : []).filter(isObject).map((n) => [n.id as string, n as RawSave]),
  );
  const neighbors: NeighborState[] = fresh.neighbors.map((base) => {
    const n = saved.get(base.id);
    if (!n) return base;
    const def = content.neighbors.find((d) => d.id === base.id)!;
    const state = (isObject(n.state) && parseState(n.state, aiContent(content), false)) || newNeighborState(content, def, player.rng);
    const status = STATUSES.includes(n.status as NeighborStatus) ? (n.status as NeighborStatus) : "independent";
    const g = n.guard;
    return {
      ...base,
      state,
      trust: pct(n.trust, base.trust),
      influence: pct(n.influence, base.influence),
      status,
      marriage: n.marriage === true,
      loyalty: pct(n.loyalty, 0),
      guard:
        status === "tributary" && isObject(g) && finiteNonNeg(g.warriors) && finiteNonNeg(g.until)
          ? { warriors: Math.floor(g.warriors), until: g.until }
          : null,
      raidCooldownUntil: finiteNonNeg(n.raidCooldownUntil) ? n.raidCooldownUntil : 0,
      nextDecisionAt: finiteNonNeg(n.nextDecisionAt) ? n.nextDecisionAt : base.nextDecisionAt,
    };
  });
  const ids = new Set(neighbors.map((n) => n.id));
  const incoming = raw.incomingRaid;
  const offer = raw.offer;
  const victory = raw.victory;
  const paths = (Array.isArray(raw.paths) ? raw.paths : []).filter((p): p is Path => PATHS.includes(p as Path));
  return {
    ...fresh,
    neighbors,
    renown: finiteNonNeg(raw.renown) ? raw.renown : 0,
    truceUntil: finiteNonNeg(raw.truceUntil) ? raw.truceUntil : fresh.truceUntil,
    incomingRaid:
      isObject(incoming) && ids.has(incoming.from as string) && finiteNonNeg(incoming.strikeAt)
        ? { from: incoming.from as string, strikeAt: incoming.strikeAt }
        : null,
    nextAiRaidAt: finiteNonNeg(raw.nextAiRaidAt) ? raw.nextAiRaidAt : 0,
    offer:
      isObject(offer) &&
      ids.has(offer.from as string) &&
      isObject(offer.give) &&
      isObject(offer.want) &&
      isResource(offer.give.resource) &&
      isResource(offer.want.resource) &&
      finiteNonNeg(offer.give.amount) &&
      finiteNonNeg(offer.want.amount) &&
      finiteNonNeg(offer.expiresAt)
        ? (offer as unknown as TradeOffer)
        : null,
    reports: (Array.isArray(raw.reports) ? raw.reports : [])
      .filter((r): r is Report => isObject(r) && finiteNonNeg(r.id) && typeof r.kind === "string" && ids.has(r.neighbor as string))
      .slice(-12),
    nextReportId: finiteNonNeg(raw.nextReportId) ? Math.floor(raw.nextReportId) : 1,
    nextTributeAt: finiteNonNeg(raw.nextTributeAt) ? raw.nextTributeAt : fresh.nextTributeAt,
    paths,
    victory:
      isObject(victory) && finiteNonNeg(victory.time) && Array.isArray(victory.paths)
        ? { time: victory.time, paths: victory.paths.filter((p): p is Path => PATHS.includes(p as Path)) }
        : null,
  };
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
