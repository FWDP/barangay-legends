// The barangay map: a seeded, generated world of forest with a winding river, a few old
// balete trees and a small cleared start around the plaza. The player grows it by clearing
// forest and bridging the river. Pure and deterministic, like the rest of the engine.
import { curveFactor } from "./curve";
import { closesPlaza, cutsOffLand, entrancesBlockedBy, wouldHaveEntrance } from "./doors";
import { clearingShape, isReserved } from "./plaza";
import type { BuildingDef, Content, GroveBlessing, Resource } from "./content";
import type { GameState, PlacedBuilding } from "./game";
import { rollAt, Rng } from "./rng";

export type Tile = "forest" | "cleared" | "river" | "bridge" | "balete" | "daan" | "sea";

/** Tiles are stored as one character each, row by row, to keep saves small. */
export const TILE_CODE: Record<Tile, string> = { forest: "f", cleared: "c", river: "r", bridge: "b", balete: "t", daan: "d", sea: "s" };
const CODE_TILE: Record<string, Tile> = Object.fromEntries(Object.entries(TILE_CODE).map(([t, c]) => [c, t as Tile]));
export const isTileCode = (c: string) => c in CODE_TILE;

export interface MapState {
  width: number;
  height: number;
  /** Seed the map was generated from. */
  seed: number;
  /** width × height characters, row by row (see TILE_CODE). */
  tiles: string;
  /** The Bahay ng Datu's tile (internal name kept from when it was a plaza). Cleared, never built on. */
  plaza: Point;
  /**
   * The clearing beside the Bahay ng Datu where people gather (plaza.ts): a few irregular open
   * tiles in front of the house, walkable and never built on. Missing on hand-made test maps.
   */
  gathering?: Point[];
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
export function terrainFeature(tile: Tile | null): "river" | "forest" | "sea" | null {
  if (tile === "forest" || tile === "balete") return "forest";
  if (tile === "river" || tile === "bridge") return "river";
  if (tile === "sea") return "sea";
  return null;
}

/** How many rows of sea at column x: `depth`, give or take one, so the shore isn't a ruler line. */
export function coastDepthAt(seed: number, x: number, depth: number): number {
  if (depth <= 0) return 0;
  return Math.max(1, depth + (rollAt(seed, x, 4242) < 0.3 ? -1 : rollAt(seed, x, 4243) < 0.3 ? 1 : 0));
}

/**
 * The coast: open sea along one edge of the map (the river runs into it), `depth` rows deep
 * with a slightly ragged shore. Only forest, river and balete become sea, never cleared land,
 * paths, bridges or anything built on; so an older barangay keeps every tile it has worked.
 */
export function addCoast(map: MapState, edge: "top" | "bottom", depth: number, built: Point[] = []): MapState {
  if (depth <= 0) return map;
  const taken = new Set(built.map((p) => `${p.x},${p.y}`));
  const changes: { x: number; y: number; tile: Tile }[] = [];
  for (let x = 0; x < map.width; x++) {
    const ragged = coastDepthAt(map.seed, x, depth);
    for (let k = 0; k < ragged; k++) {
      const y = edge === "bottom" ? map.height - 1 - k : k;
      const t = tileAt(map, x, y);
      if ((t === "forest" || t === "river" || t === "balete") && !taken.has(`${x},${y}`)) changes.push({ x, y, tile: "sea" });
    }
  }
  return setTiles(map, changes);
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
  // One row more behind the house: the land the clearing in front of it keeps open (plaza.ts).
  for (let y = plaza.y - R - 1; y <= plaza.y + R; y++) {
    for (let x = plaza.x - R; x <= plaza.x + R; x++) if (grid[y][x] === "forest") grid[y][x] = "cleared";
  }

  // The coast: sea along the bottom edge, where the river runs out (before the balete, so none grows in the sea).
  const seaDepth = content.rules.map.seaDepth ?? 0;
  for (let x = 0; x < W; x++) {
    for (let k = 0; k < coastDepthAt(seed >>> 0, x, seaDepth); k++) {
      const y = H - 1 - k;
      if (grid[y][x] === "forest" || grid[y][x] === "river") grid[y][x] = "sea";
    }
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

  // The clearing beside the Bahay ng Datu: inside the start square, so already open.
  const gathering = clearingShape({ width: W, height: H, seed: seed >>> 0, plaza }, content).filter((p) => grid[p.y][p.x] === "cleared");
  const map: MapState = {
    width: W,
    height: H,
    seed: seed >>> 0,
    tiles: grid.map((row) => row.map((t) => TILE_CODE[t]).join("")).join(""),
    plaza,
    gathering,
  };
  return map;
}

// ---------- Buildings on the map ----------

const tileKey = (x: number, y: number) => `${x},${y}`;

/** Building type by tile, for quick neighbour lookups. */
const occupancyCache = new WeakMap<PlacedBuilding[], ReadonlyMap<string, string>>();
/** Which building type stands on each tile (worked out once per buildings list; read-only). */
export function occupancy(state: GameState): ReadonlyMap<string, string> {
  let m = occupancyCache.get(state.buildings);
  if (!m) occupancyCache.set(state.buildings, (m = new Map(state.buildings.map((b) => [tileKey(b.x, b.y), b.type]))));
  return m;
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

const gatheringCache = new WeakMap<MapState, ReadonlySet<number>>();

/** The clearing's tiles that people can still walk on (cleared land or a Daan), as tile indices. Cached per map. */
export function gatheringIndex(map: MapState): ReadonlySet<number> {
  let out = gatheringCache.get(map);
  if (out) return out;
  const set = new Set<number>();
  for (const p of map.gathering ?? []) if (isFootTile(tileAt(map, p.x, p.y)) && tileAt(map, p.x, p.y) !== "bridge") set.add(p.y * map.width + p.x);
  gatheringCache.set(map, (out = set));
  return out;
}

/** Flood fill from the center over tiles that pass `ok` (`withClearing`: the clearing's tiles count too). */
function flood(map: MapState, pass: (code: string) => boolean, withClearing = false): Uint8Array {
  const W = map.width;
  const seen = new Uint8Array(W * map.height);
  const c = barangayCenter(map);
  if (!inBounds(map, c.x, c.y)) return seen;
  const start = c.y * W + c.x;
  seen[start] = 1;
  const clearing = withClearing ? gatheringIndex(map) : null;
  const ok = (code: string, j: number) => pass(code) || (clearing !== null && clearing.has(j));
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
      if (seen[j] || !ok(map.tiles[j], j)) continue;
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
 * center and the clearing beside it count, so a path starting at the clearing is connected.
 */
export function roadNetwork(map: MapState): Uint8Array {
  let r = roadCache.get(map);
  if (!r) roadCache.set(map, (r = flood(map, (c) => ROAD_CODES.has(c), true)));
  return r;
}

/** A building on (x, y) is "Connected" when a tile next to it is part of the road network. */
export function isConnected(map: MapState, x: number, y: number): boolean {
  const net = roadNetwork(map);
  const c = barangayCenter(map);
  const clearing = gatheringIndex(map);
  return NEIGHBOURS.some(([dx, dy]) => {
    const nx = x + dx;
    const ny = y + dy;
    // Standing beside the house or its clearing isn't a Daan: only a path is.
    if (!inBounds(map, nx, ny) || (nx === c.x && ny === c.y) || (clearing.has(ny * map.width + nx) && tileAt(map, nx, ny) !== "daan")) return false;
    return net[ny * map.width + nx] === 1 && tileAt(map, nx, ny) !== "bridge";
  });
}

/** Can a Daan go here? Cleared land the barangay can reach, free of buildings, not kept for the Bahay ng Datu (plaza.ts). */
export function canPlaceRoad(state: GameState, content: Content, x: number, y: number): boolean {
  return tileAt(state.map, x, y) === "cleared" && !isReserved(state, content, x, y) && !buildingAt(state, x, y) && isReachable(state.map, x, y) && !state.replanting.some((j) => j.x === x && j.y === y);
}

/** Is this building available yet (from the start, or at a villager count)? */
export function isUnlocked(state: GameState, def: BuildingDef): boolean {
  if (def.unlock.datuLevel !== undefined) return (state.datuLevel ?? 1) >= def.unlock.datuLevel && (def.unlock.villagers === undefined || state.villagers >= def.unlock.villagers);
  if (def.unlock.start) return true;
  return def.unlock.villagers !== undefined && state.villagers >= def.unlock.villagers;
}

/** Which way a bridge runs: across a river flowing down the map it's horizontal, and the reverse. */
export type BridgeDir = "h" | "v";

const isLandTile = (t: Tile | null) => t === "cleared" || t === "forest" || t === "balete" || t === "daan";

/**
 * The crossing a bridge placed at (x, y) would make: straight across the river through that
 * tile, perpendicular to its flow, spanning exactly the river's width there. Both ways (left to
 * right, top to bottom) are measured; a way is possible if it is at most maxSpan tiles of open
 * river with land at both ends, one of them land the barangay can reach. The shorter possible
 * way wins: that is the one across the flow, never along it. Null if neither way works.
 */
export function crossingAt(map: MapState, def: BuildingDef, x: number, y: number): { span: Point[]; dir: BridgeDir } | null {
  if (!def.bridge || tileAt(map, x, y) !== "river") return null;
  let best: { span: Point[]; dir: BridgeDir } | null = null;
  for (const dir of ["h", "v"] as const) {
    const [dx, dy] = dir === "h" ? [1, 0] : [0, 1];
    let ax = x;
    let ay = y;
    while (tileAt(map, ax - dx, ay - dy) === "river") [ax, ay] = [ax - dx, ay - dy];
    const span: Point[] = [];
    let bx = ax;
    let by = ay;
    while (tileAt(map, bx, by) === "river") {
      span.push({ x: bx, y: by });
      [bx, by] = [bx + dx, by + dy];
    }
    if (span.length > def.bridge.maxSpan) continue;
    const startEnd = { x: ax - dx, y: ay - dy };
    const farEnd = { x: bx, y: by };
    const ends = [startEnd, farEnd];
    if (!ends.every((e) => isLandTile(tileAt(map, e.x, e.y)))) continue;
    const fromHome = ends.some((e) => {
      const t = tileAt(map, e.x, e.y);
      return (t === "cleared" || t === "daan") && isReachable(map, e.x, e.y);
    });
    if (!fromHome) continue;
    if (!best || span.length < best.span.length) best = { span, dir };
  }
  return best;
}

/** The river tiles a bridge at (x, y) would span (see crossingAt), or null if it can't cross there. */
export function bridgeSpan(map: MapState, def: BuildingDef, x: number, y: number): Point[] | null {
  return crossingAt(map, def, x, y)?.span ?? null;
}

/** One bridge tile as drawn: which way the deck runs, and whether it meets a bank on either end. */
export interface BridgeTile {
  dir: BridgeDir;
  /** The first tile (left or top end) and the last (right or bottom end): posts go there. */
  start: boolean;
  end: boolean;
}

/** Every bridge tile of a span, keyed "x,y", laid out for drawing. */
export function layOutSpan(map: MapState, span: Point[], into = new Map<string, BridgeTile>()): Map<string, BridgeTile> {
  if (span.length === 0) return into;
  const dir = bridgeDir(map, span);
  const sorted = [...span].sort((a, b) => (dir === "h" ? a.x - b.x : a.y - b.y));
  sorted.forEach((p, i) => into.set(`${p.x},${p.y}`, { dir, start: i === 0, end: i === sorted.length - 1 }));
  return into;
}

/** Which way a standing bridge runs, from its tiles (or, for one tile, the land beside it). */
export function bridgeDir(map: MapState, span: Point[]): BridgeDir {
  if (span.length > 1) return span[0].y === span[1].y ? "h" : "v";
  const p = span[0];
  if (!p) return "h";
  const landSides = (dx: number, dy: number) => isLandTile(tileAt(map, p.x - dx, p.y - dy)) && isLandTile(tileAt(map, p.x + dx, p.y + dy));
  return landSides(1, 0) || !landSides(0, 1) ? "h" : "v";
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
  if (def.placeNextTo && !isNextTo(state.map, x, y, def.placeNextTo)) return false;
  if (state.replanting.some((j) => j.x === x && j.y === y)) return false;
  if (def.requiresNear) {
    const { building, radius } = def.requiresNear;
    if (!state.buildings.some((b) => b.type === building && !b.damaged && (b.x - x) ** 2 + (b.y - y) ** 2 <= radius * radius)) return false;
  }
  if (tileAt(state.map, x, y) !== "cleared" || isReserved(state, _content, x, y) || !isReachable(state.map, x, y)) return false;
  // Never shut every way into a building already there, nor the plaza in.
  return !closesPlaza(state, _content, x, y) && entrancesBlockedBy(state, _content, x, y).length === 0;
}

/** Does (x, y) touch one of these terrains on a side (not a corner)? */
export function isNextTo(map: MapState, x: number, y: number, terrains: readonly string[]): boolean {
  return NEIGHBOURS.some(([dx, dy]) => {
    const t = tileAt(map, x + dx, y + dy);
    return t !== null && terrains.includes(t);
  });
}

/** Every tile where the building could go, optionally limited to a rectangle (the view). */
export function validTiles(
  state: GameState,
  content: Content,
  def: BuildingDef,
  area = { x0: 0, y0: 0, x1: state.map.width - 1, y1: state.map.height - 1 },
  /** Optional cheap test run before the full one: tiles it rejects are skipped. */
  prefilter?: (x: number, y: number) => boolean,
): Point[] {
  const tiles: Point[] = [];
  const taken = occupancy(state);
  // Only cleared land (or open river, for a bridge) can take a building: skip the rest cheaply.
  const want = def.placeOn === "river" ? TILE_CODE.river : TILE_CODE.cleared;
  const { width, tiles: codes } = state.map;
  for (let y = Math.max(0, area.y0); y <= Math.min(state.map.height - 1, area.y1); y++) {
    for (let x = Math.max(0, area.x0); x <= Math.min(state.map.width - 1, area.x1); x++) {
      if (codes[y * width + x] !== want || taken.has(tileKey(x, y))) continue;
      if (prefilter && !prefilter(x, y)) continue;
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
  taken: ReadonlyMap<string, string>,
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
export function autoPlaceTile(state: GameState, content: Content, def: BuildingDef, opts: { keepEdge?: boolean } = {}): Point | null {
  const { plaza } = state.map;
  // Look near the plaza first (where a barangay builds anyway); the whole map only if nothing fits there.
  const near = { x0: plaza.x - AUTO_PLACE_RADIUS, y0: plaza.y - AUTO_PLACE_RADIUS, x1: plaza.x + AUTO_PLACE_RADIUS, y1: plaza.y + AUTO_PLACE_RADIUS };
  // Tiles at the forest's edge are kept free when there is any other choice, so land cleared
  // later stays joined to the plaza on foot.
  // A growing barangay (keepEdge: AI decisions) clears more forest rather than build on the edge.
  const inside = bestTile(state, content, def, near, true) ?? bestTile(state, content, def, undefined, true);
  if (inside || opts.keepEdge) return inside;
  return bestTile(state, content, def, near) ?? bestTile(state, content, def);
}

/** Does the tile touch forest (or a balete), where the next clearing will open land? */
const atForestEdge = (map: MapState, x: number, y: number) =>
  NEIGHBOURS.some(([dx, dy]) => {
    const t = tileAt(map, x + dx, y + dy);
    return t === "forest" || t === "balete";
  });

/** How far from the plaza autoPlaceTile looks first. */
const AUTO_PLACE_RADIUS = 9;

function bestTile(state: GameState, content: Content, def: BuildingDef, area?: { x0: number; y0: number; x1: number; y1: number }, avoidEdge = false): Point | null {
  const { plaza } = state.map;
  const taken = occupancy(state);
  let best: { t: Point; bonus: number; dist: number } | null = null;
  // Cheap checks first (the full placement check is the costly one).
  const quick = (x: number, y: number) =>
    !!def.bridge || (!(avoidEdge && atForestEdge(state.map, x, y)) && !cutsOffLand(state, content, x, y) && wouldHaveEntrance(state, content, x, y));
  for (const t of validTiles(state, content, def, area, quick)) {
    const bonus = adjacencyBonusAt(state.map, taken, def, t.x, t.y);
    const dist = (t.x - plaza.x) ** 2 + (t.y - plaza.y) ** 2;
    if (!best || bonus > best.bonus || (bonus === best.bonus && dist < best.dist)) best = { t, bonus, dist };
  }
  return best?.t ?? null;
}

// ---------- Clearing land ----------

/** Seconds of work the next clearing takes: baseSeconds × the clearing curve after the tiles cleared so far. */
export function clearSeconds(state: GameState, content: Content): number {
  const c = content.rules.clearing;
  return c.baseSeconds * curveFactor(c.growth, state.tilesCleared);
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
  const f = curveFactor(content.rules.clearing.growth, state.tilesCleared + state.clearing.length);
  const cost = content.rules.clearing.cost;
  if (Object.entries(cost).some(([r, n]) => state.resources[r as keyof typeof state.resources] < Math.ceil((n ?? 0) * f))) return "cost";
  if (tile === "balete" && !confirmBalete) return "balete";
  return null;
}
