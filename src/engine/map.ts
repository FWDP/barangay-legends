// The barangay map: a seeded, generated world of forest with a winding river, a few old
// balete trees and a small cleared start around the plaza. The player grows it by clearing
// forest and bridging the river. Pure and deterministic, like the rest of the engine.
import type { BuildingDef, Content, GroveBlessing, Resource } from "./content";
import type { GameState, PlacedBuilding } from "./game";
import { Rng } from "./rng";

export type Tile = "forest" | "cleared" | "river" | "bridge" | "balete" | "daan";

/** Tiles are stored as one character each, row by row, to keep saves small. */
export const TILE_CODE: Record<Tile, string> = { forest: "f", cleared: "c", river: "r", bridge: "b", balete: "t", daan: "d" };
const CODE_TILE: Record<string, Tile> = Object.fromEntries(Object.entries(TILE_CODE).map(([t, c]) => [c, t as Tile]));
export const isTileCode = (c: string) => c in CODE_TILE;

export interface MapState {
  width: number;
  height: number;
  /** Seed the map was generated from. */
  seed: number;
  /** width × height characters, row by row (see TILE_CODE). */
  tiles: string;
  /** The gathering spot. Cleared, but never built on. */
  plaza: Point;
}

export interface Point {
  x: number;
  y: number;
}

/** Orthogonal neighbours: "next to" means sharing an edge. */
export const NEIGHBOURS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
] as const;

// ---------- Tiles ----------

export function inBounds(map: MapState, x: number, y: number): boolean {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < map.width && y < map.height;
}

export function tileAt(map: MapState, x: number, y: number): Tile | null {
  return inBounds(map, x, y) ? CODE_TILE[map.tiles[y * map.width + x]] : null;
}

export function setTiles(map: MapState, changes: { x: number; y: number; tile: Tile }[]): MapState {
  if (changes.length === 0) return map;
  const chars = map.tiles.split("");
  for (const { x, y, tile } of changes) if (inBounds(map, x, y)) chars[y * map.width + x] = TILE_CODE[tile];
  return { ...map, tiles: chars.join("") };
}

export const isPlaza = (map: MapState, x: number, y: number) => map.plaza.x === x && map.plaza.y === y;

/** What a tile counts as for adjacency bonuses: balete trees are forest, bridges stand on the river. */
export function terrainFeature(tile: Tile | null): "river" | "forest" | null {
  if (tile === "forest" || tile === "balete") return "forest";
  if (tile === "river" || tile === "bridge") return "river";
  return null;
}

export function countTiles(map: MapState, tile: Tile): number {
  const code = TILE_CODE[tile];
  let n = 0;
  for (const c of map.tiles) if (c === code) n++;
  return n;
}

// ---------- Generation ----------

/**
 * Builds the map for a seed: all forest, a river winding from top to bottom, a cleared
 * square around the plaza on one bank (touching the river), and a few balete trees.
 */
export function generateMap(content: Content, seed: number): MapState {
  const { width: W, height: H, startClearRadius: R, riverWidth, baleteTrees, baleteMinDistance } = content.rules.map;
  const rng = new Rng(seed >>> 0);
  const grid: Tile[][] = Array.from({ length: H }, () => Array.from({ length: W }, (): Tile => "forest"));

  // River: a random walk across columns, one row at a time. Shifting at most one column per
  // row keeps a river at least 2 wide connected. Keep a forest margin on both sides.
  const margin = 2 * R + 4;
  let rx = rng.int(Math.floor(W * 0.35), Math.floor(W * 0.6));
  let drift = 0;
  const riverX: number[] = [];
  for (let y = 0; y < H; y++) {
    const roll = rng.next();
    if (roll < 0.2) drift = -1;
    else if (roll < 0.4) drift = 1;
    else if (roll < 0.65) drift = 0;
    rx = Math.min(W - margin - riverWidth, Math.max(margin, rx + drift));
    riverX.push(rx);
    for (let k = 0; k < riverWidth; k++) grid[y][rx + k] = "river";
  }

  // Plaza: near the middle row, on a random bank, with the start square touching the river.
  const py = Math.floor(H / 2) + rng.int(-2, 2);
  const rows = riverX.slice(py - R, py + R + 1);
  const leftBank = rng.next() < 0.5;
  const px = leftBank ? Math.min(...rows) - 1 - R : Math.max(...rows) + riverWidth + R;
  const plaza = { x: Math.min(W - R - 2, Math.max(R + 1, px)), y: py };
  for (let y = plaza.y - R; y <= plaza.y + R; y++) {
    for (let x = plaza.x - R; x <= plaza.x + R; x++) if (grid[y][x] === "forest") grid[y][x] = "cleared";
  }

  // Balete trees: on forest, away from the plaza and from each other. The first one grows
  // fairly close, so players meet it early.
  const placed: Point[] = [];
  for (let attempt = 0; placed.length < baleteTrees && attempt < 2000; attempt++) {
    const x = rng.int(1, W - 2);
    const y = rng.int(1, H - 2);
    const d = Math.max(Math.abs(x - plaza.x), Math.abs(y - plaza.y));
    const tooFar = placed.length === 0 && d > baleteMinDistance + 5;
    if (grid[y][x] !== "forest" || d < baleteMinDistance || tooFar) continue;
    if (placed.some((p) => Math.abs(p.x - x) + Math.abs(p.y - y) < 6)) continue;
    grid[y][x] = "balete";
    placed.push({ x, y });
  }

  return {
    width: W,
    height: H,
    seed: seed >>> 0,
    tiles: grid.map((row) => row.map((t) => TILE_CODE[t]).join("")).join(""),
    plaza,
  };
}

// ---------- Buildings on the map ----------

const tileKey = (x: number, y: number) => `${x},${y}`;

/** Building type by tile, for quick neighbour lookups. */
export function occupancy(state: GameState): Map<string, string> {
  return new Map(state.buildings.map((b) => [tileKey(b.x, b.y), b.type]));
}

export function buildingAt(state: GameState, x: number, y: number): PlacedBuilding | undefined {
  return state.buildings.find((b) => b.x === x && b.y === y);
}

// ---------- Reach: the land villagers can walk to ----------

const reachCache = new WeakMap<MapState, Uint8Array>();

/**
 * Which tiles villagers can walk to from the plaza (1 = yes). Only open river blocks the way;
 * bridges cross it. Without a bridge the far bank is cut off: buildings already there keep
 * working, but no new land can be cleared or built on. Maps are never mutated, so the result
 * is cached per map.
 */
export function reachMap(map: MapState): Uint8Array {
  const cached = reachCache.get(map);
  if (cached) return cached;
  const W = map.width;
  const reach = new Uint8Array(W * map.height);
  const river = TILE_CODE.river;
  const startAt = map.plaza.y * W + map.plaza.x;
  if (inBounds(map, map.plaza.x, map.plaza.y) && map.tiles[startAt] !== river) {
    const queue = [startAt];
    reach[startAt] = 1;
    while (queue.length > 0) {
      const i = queue.pop()!;
      const x = i % W;
      const y = (i - x) / W;
      for (const [dx, dy] of NEIGHBOURS) {
        const nx = x + dx;
        const ny = y + dy;
        if (!inBounds(map, nx, ny)) continue;
        const j = ny * W + nx;
        if (reach[j] || map.tiles[j] === river) continue;
        reach[j] = 1;
        queue.push(j);
      }
    }
  }
  reachCache.set(map, reach);
  return reach;
}

export function isReachable(map: MapState, x: number, y: number): boolean {
  return inBounds(map, x, y) && reachMap(map)[y * map.width + x] === 1;
}

/** Land tiles (not river or bridge) the barangay can reach. Fewer after a demolition = land cut off. */
export function reachableLand(map: MapState): number {
  const reach = reachMap(map);
  let n = 0;
  for (let i = 0; i < reach.length; i++) {
    const c = map.tiles[i];
    if (reach[i] && c !== TILE_CODE.bridge && c !== TILE_CODE.river) n++;
  }
  return n;
}

// ---------- On foot: where villagers can walk to work ----------

/**
 * The barangay's center, where every path starts: the plaza for now. Kept in one place so it
 * can move later (for example to a datu's house).
 */
export function barangayCenter(map: MapState): Point {
  return map.plaza;
}

/** Tiles people walk on inside the barangay: cleared land, Daan and bridges. */
export const isFootTile = (t: Tile | null) => t === "cleared" || t === "daan" || t === "bridge";

const footCache = new WeakMap<MapState, Uint8Array>();
const roadCache = new WeakMap<MapState, Uint8Array>();

/** Flood fill from the center over tiles that pass `ok`. */
function flood(map: MapState, ok: (code: string) => boolean): Uint8Array {
  const W = map.width;
  const seen = new Uint8Array(W * map.height);
  const c = barangayCenter(map);
  if (!inBounds(map, c.x, c.y)) return seen;
  const start = c.y * W + c.x;
  seen[start] = 1;
  const queue = [start];
  while (queue.length > 0) {
    const i = queue.pop()!;
    const x = i % W;
    const y = (i - x) / W;
    for (const [dx, dy] of NEIGHBOURS) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inBounds(map, nx, ny)) continue;
      const j = ny * W + nx;
      if (seen[j] || !ok(map.tiles[j])) continue;
      seen[j] = 1;
      queue.push(j);
    }
  }
  return seen;
}

const FOOT_CODES = new Set([TILE_CODE.cleared, TILE_CODE.daan, TILE_CODE.bridge]);
const ROAD_CODES = new Set([TILE_CODE.daan, TILE_CODE.bridge]);

/**
 * Tiles reachable on foot from the barangay's center through cleared land, Daan and bridges
 * (1 = yes). Forest and open river are in the way. Cached per map (maps are never mutated).
 */
export function footReach(map: MapState): Uint8Array {
  let r = footCache.get(map);
  if (!r) footCache.set(map, (r = flood(map, (c) => FOOT_CODES.has(c))));
  return r;
}

export function isFootReachable(map: MapState, x: number, y: number): boolean {
  return inBounds(map, x, y) && footReach(map)[y * map.width + x] === 1;
}

/**
 * The road network: Daan (and bridges along it) joined to the center without a break. The
 * center counts, so a path starting next to the plaza is connected.
 */
export function roadNetwork(map: MapState): Uint8Array {
  let r = roadCache.get(map);
  if (!r) roadCache.set(map, (r = flood(map, (c) => ROAD_CODES.has(c))));
  return r;
}

/** A building on (x, y) is "Connected" when a tile next to it is part of the road network. */
export function isConnected(map: MapState, x: number, y: number): boolean {
  const net = roadNetwork(map);
  const c = barangayCenter(map);
  return NEIGHBOURS.some(([dx, dy]) => {
    const nx = x + dx;
    const ny = y + dy;
    if (!inBounds(map, nx, ny) || (nx === c.x && ny === c.y)) return false;
    return net[ny * map.width + nx] === 1 && tileAt(map, nx, ny) !== "bridge";
  });
}

/** Can a Daan go here? Cleared land the barangay can reach, free of buildings, not the plaza. */
export function canPlaceRoad(state: GameState, x: number, y: number): boolean {
  return tileAt(state.map, x, y) === "cleared" && !isPlaza(state.map, x, y) && !buildingAt(state, x, y) && isReachable(state.map, x, y);
}

/** Is this building available yet (from the start, or at a villager count)? */
export function isUnlocked(state: GameState, def: BuildingDef): boolean {
  if (def.unlock.start) return true;
  return def.unlock.villagers !== undefined && state.villagers >= def.unlock.villagers;
}

/**
 * The river tiles a bridge at (x, y) would span: starting from a tile next to cleared land the
 * barangay can reach, straight across until the far bank, at most maxSpan tiles. Null if
 * there's no such crossing.
 */
export function bridgeSpan(map: MapState, def: BuildingDef, x: number, y: number): Point[] | null {
  if (!def.bridge || tileAt(map, x, y) !== "river") return null;
  for (const [dx, dy] of NEIGHBOURS) {
    // We come from cleared land on the opposite side and build towards (dx, dy).
    const from = tileAt(map, x - dx, y - dy);
    if ((from !== "cleared" && from !== "daan") || !isReachable(map, x - dx, y - dy)) continue;
    const span: Point[] = [];
    let cx = x;
    let cy = y;
    while (tileAt(map, cx, cy) === "river" && span.length < def.bridge.maxSpan) {
      span.push({ x: cx, y: cy });
      cx += dx;
      cy += dy;
    }
    const far = tileAt(map, cx, cy);
    if (far === "forest" || far === "cleared" || far === "balete" || far === "daan") return span;
  }
  return null;
}

/**
 * The bridge tiles a standing bridge at (x, y) covers, for bridges saved before spans were
 * stored: straight across from land, over bridge tiles, to land on the other side.
 */
export function standingBridgeTiles(map: MapState, def: BuildingDef, x: number, y: number): Point[] {
  const isLand = (t: Tile | null) => t === "cleared" || t === "forest" || t === "balete" || t === "daan";
  if (!def.bridge || tileAt(map, x, y) !== "bridge") return [];
  for (const [dx, dy] of NEIGHBOURS) {
    if (!isLand(tileAt(map, x - dx, y - dy))) continue;
    const span: Point[] = [];
    let cx = x;
    let cy = y;
    while (tileAt(map, cx, cy) === "bridge" && span.length < def.bridge.maxSpan) {
      span.push({ x: cx, y: cy });
      cx += dx;
      cy += dy;
    }
    if (isLand(tileAt(map, cx, cy))) return span;
  }
  return [{ x, y }];
}

/**
 * Can this building go at (x, y)? Cleared, free, not the plaza and reachable (not on a bank cut
 * off by a lost bridge); or a river crossing for bridges.
 */
export function canPlace(state: GameState, _content: Content, def: BuildingDef, x: number, y: number): boolean {
  if (!inBounds(state.map, x, y) || buildingAt(state, x, y)) return false;
  if (def.placeOn === "river") return bridgeSpan(state.map, def, x, y) !== null;
  return tileAt(state.map, x, y) === "cleared" && !isPlaza(state.map, x, y) && isReachable(state.map, x, y);
}

/** Every tile where the building could go, optionally limited to a rectangle (the view). */
export function validTiles(
  state: GameState,
  content: Content,
  def: BuildingDef,
  area = { x0: 0, y0: 0, x1: state.map.width - 1, y1: state.map.height - 1 },
): Point[] {
  const tiles: Point[] = [];
  const taken = occupancy(state);
  for (let y = Math.max(0, area.y0); y <= Math.min(state.map.height - 1, area.y1); y++) {
    for (let x = Math.max(0, area.x0); x <= Math.min(state.map.width - 1, area.x1); x++) {
      if (taken.has(tileKey(x, y))) continue;
      if (canPlace(state, content, def, x, y)) tiles.push({ x, y });
    }
  }
  return tiles;
}

// ---------- Adjacency bonuses ----------

/**
 * The adjacency bonus (0.1 = +10%) a building of this type gets at (x, y), given the tiles
 * and buildings around it. Uses the current map, so a camp's "forest" bonus moves with the
 * forest edge as land is cleared. Works for previews: the building need not be placed yet.
 */
export function adjacencyBonusAt(
  map: MapState,
  taken: Map<string, string>,
  def: BuildingDef,
  x: number,
  y: number,
): number {
  const bonus = def.adjacencyBonus;
  if (!bonus) return 0;
  const matches = NEIGHBOURS.some(([dx, dy]) => {
    const feature = terrainFeature(tileAt(map, x + dx, y + dy));
    if (feature && bonus.nextTo.includes(feature)) return true;
    const neighbour = taken.get(tileKey(x + dx, y + dy));
    return neighbour !== undefined && bonus.nextTo.includes(neighbour);
  });
  return matches ? bonus.percent / 100 : 0;
}

export function bonusAt(state: GameState, def: BuildingDef, x: number, y: number): number {
  return adjacencyBonusAt(state.map, occupancy(state), def, x, y);
}

/** Bonus for every placed building, in the same order as state.buildings. */
export function buildingBonuses(state: GameState, content: Content): number[] {
  const taken = occupancy(state);
  const defs = new Map(content.buildings.map((d) => [d.id, d]));
  return state.buildings.map((b) => {
    const def = defs.get(b.type);
    return def ? adjacencyBonusAt(state.map, taken, def, b.x, b.y) : 0;
  });
}

// ---------- Groves (Kapre's grove) ----------

/** The grove tiles (standing balete) within the grove's radius of (x, y), nearest first. */
export function grovesNear(map: MapState, grove: GroveBlessing, x: number, y: number): Point[] {
  const r = grove.radius;
  const found: Point[] = [];
  for (let ty = Math.max(0, Math.floor(y - r)); ty <= Math.min(map.height - 1, Math.ceil(y + r)); ty++) {
    for (let tx = Math.max(0, Math.floor(x - r)); tx <= Math.min(map.width - 1, Math.ceil(x + r)); tx++) {
      if (tileAt(map, tx, ty) === grove.tile && (tx - x) ** 2 + (ty - y) ** 2 <= r * r) found.push({ x: tx, y: ty });
    }
  }
  return found.sort((a, b) => (a.x - x) ** 2 + (a.y - y) ** 2 - ((b.x - x) ** 2 + (b.y - y) ** 2));
}

/**
 * The grove bonus (0.25 = +25%) a building of this type gets for one resource at (x, y).
 * Being near several balete trees still gives the bonus once; different groves (if content
 * ever adds more) don't stack either: the largest applies.
 */
export function groveBonusAt(map: MapState, content: Content, def: BuildingDef, x: number, y: number, resource: Resource): number {
  let best = 0;
  for (const grove of content.groves) {
    if (grove.affects !== def.id || grove.resource !== resource) continue;
    if (grove.percent / 100 > best && grovesNear(map, grove, x, y).length > 0) best = grove.percent / 100;
  }
  return best;
}

/** Grove bonus for every placed building, per resource, in the same order as state.buildings. */
export function buildingGroveBonuses(state: GameState, content: Content): Partial<Record<Resource, number>>[] {
  if (content.groves.length === 0) return state.buildings.map(() => ({}));
  const defs = new Map(content.buildings.map((d) => [d.id, d]));
  return state.buildings.map((b) => {
    const def = defs.get(b.type);
    const out: Partial<Record<Resource, number>> = {};
    if (!def?.produces) return out;
    for (const r of Object.keys(def.produces) as Resource[]) {
      const g = groveBonusAt(state.map, content, def, b.x, b.y, r);
      if (g > 0) out[r] = g;
    }
    return out;
  });
}

/**
 * Picks a tile for a building without asking the player (starting buildings, old saves).
 * Best bonus first, then nearest the plaza, then top-to-bottom, left-to-right.
 * Returns null if there is no free cleared land.
 */
export function autoPlaceTile(state: GameState, content: Content, def: BuildingDef): Point | null {
  const { plaza } = state.map;
  const taken = occupancy(state);
  let best: { t: Point; bonus: number; dist: number } | null = null;
  for (const t of validTiles(state, content, def)) {
    const bonus = adjacencyBonusAt(state.map, taken, def, t.x, t.y);
    const dist = (t.x - plaza.x) ** 2 + (t.y - plaza.y) ** 2;
    if (!best || bonus > best.bonus || (bonus === best.bonus && dist < best.dist)) best = { t, bonus, dist };
  }
  return best?.t ?? null;
}

// ---------- Clearing land ----------

/** Seconds of work the next clearing takes: baseSeconds × secondsGrowth^(tiles cleared so far). */
export function clearSeconds(state: GameState, content: Content): number {
  const c = content.rules.clearing;
  return c.baseSeconds * c.secondsGrowth ** state.tilesCleared;
}

/** Forest (or a balete) that touches cleared land or a bridge, on land the barangay can reach. */
export function isClearable(map: MapState, x: number, y: number): boolean {
  const tile = tileAt(map, x, y);
  if ((tile !== "forest" && tile !== "balete") || !isReachable(map, x, y)) return false;
  return NEIGHBOURS.some(([dx, dy]) => {
    const n = tileAt(map, x + dx, y + dy);
    return n === "cleared" || n === "bridge" || n === "daan";
  });
}

export type ClearBlocker = "not-forest" | "not-adjacent" | "queued" | "cost" | "balete";

/**
 * Why clearing just the tile at (x, y) would be refused, or null if it can be queued.
 * A balete needs `confirmBalete`, because felling it is permanent.
 */
export function clearBlocker(state: GameState, content: Content, x: number, y: number, confirmBalete = false): ClearBlocker | null {
  const tile = tileAt(state.map, x, y);
  if (tile !== "forest" && tile !== "balete") return "not-forest";
  if (state.clearing.some((j) => j.x === x && j.y === y)) return "queued";
  if (!isClearable(state.map, x, y)) return "not-adjacent";
  const f = content.rules.clearing.secondsGrowth ** (state.tilesCleared + state.clearing.length);
  const cost = content.rules.clearing.cost;
  if (Object.entries(cost).some(([r, n]) => state.resources[r as keyof typeof state.resources] < Math.ceil((n ?? 0) * f))) return "cost";
  if (tile === "balete" && !confirmBalete) return "balete";
  return null;
}
