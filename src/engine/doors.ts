// Solid buildings and doorways. People can't walk through buildings (bridges excepted: a Tulay
// is walked over). Each building has an entrance: a walkable tile beside it, reached on foot
// from the plaza, preferably a Daan. Workplaces without a reachable entrance can't be staffed,
// and a building can't be placed where it would cut off every entrance of a building already
// there. Old saves (from before solid buildings) keep boxed-in buildings working
// ("grandfathered") until something next to them changes or they are moved.
import type { Content } from "./content";
import type { GameState, PlacedBuilding } from "./game";
import { inBounds, NEIGHBOURS, TILE_CODE, type MapState, type Point } from "./map";

/** Tiles people walk on: cleared land, Daan and bridges (forest, balete and water aren't). Made on first use (map.ts imports this module). */
let footCodes: Set<string> | null = null;
const FOOT = { has: (c: string) => (footCodes ??= new Set([TILE_CODE.cleared, TILE_CODE.daan, TILE_CODE.bridge])).has(c) };

/** Doorway sides in order of preference when nothing else decides: front (down), right, left, back. */
const SIDES: readonly (readonly [number, number])[] = [
  [0, 1],
  [1, 0],
  [-1, 0],
  [0, -1],
];

const bridgeTypes = new WeakMap<Content, Set<string>>();
function bridges(content: Content): Set<string> {
  let s = bridgeTypes.get(content);
  if (!s) bridgeTypes.set(content, (s = new Set(content.buildings.filter((d) => d.bridge).map((d) => d.id))));
  return s;
}

/** Does this building take up its tile (everything except bridges)? */
export const isSolid = (content: Content, b: { type: string }) => !bridges(content).has(b.type);

const solidCache = new WeakMap<PlacedBuilding[], Map<number, Uint8Array>>();

/** Tiles taken by solid buildings (1 = blocked). Cached per buildings list. */
export function solidTiles(state: GameState, content: Content): Uint8Array {
  const W = state.map.width;
  let byW = solidCache.get(state.buildings);
  if (!byW) solidCache.set(state.buildings, (byW = new Map()));
  const key = W * 100000 + state.map.height;
  let s = byW.get(key);
  if (!s) {
    s = new Uint8Array(W * state.map.height);
    for (const b of state.buildings) if (isSolid(content, b) && inBounds(state.map, b.x, b.y)) s[b.y * W + b.x] = 1;
    byW.set(key, s);
  }
  return s;
}

/** Flood fill from the plaza over foot tiles not blocked by `solid`. */
function floodWalk(map: MapState, solid: Uint8Array): Uint8Array {
  const W = map.width;
  const seen = new Uint8Array(W * map.height);
  const c = map.plaza;
  if (!inBounds(map, c.x, c.y)) return seen;
  const start = c.y * W + c.x;
  seen[start] = 1;
  const queue = [start];
  while (queue.length) {
    const i = queue.pop()!;
    const x = i % W;
    const y = (i - x) / W;
    for (const [dx, dy] of NEIGHBOURS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= map.height) continue;
      const j = ny * W + nx;
      if (seen[j] || solid[j] || !FOOT.has(map.tiles[j])) continue;
      seen[j] = 1;
      queue.push(j);
    }
  }
  return seen;
}

const walkCache = new WeakMap<Uint8Array, WeakMap<MapState, Uint8Array>>();

/**
 * Tiles reachable on foot from the plaza with buildings in the way (1 = yes). Cached per map and
 * buildings list (neither is ever changed in place).
 */
export function walkReach(state: GameState, content: Content): Uint8Array {
  const solid = solidTiles(state, content);
  let byMap = walkCache.get(solid);
  if (!byMap) walkCache.set(solid, (byMap = new WeakMap()));
  let r = byMap.get(state.map);
  if (!r) byMap.set(state.map, (r = floodWalk(state.map, solid)));
  return r;
}

/** Is (x, y) a tile people can stand on and reach from the plaza? */
export function isWalkReachable(state: GameState, content: Content, x: number, y: number): boolean {
  return inBounds(state.map, x, y) && walkReach(state, content)[y * state.map.width + x] === 1;
}

/**
 * The best entrance for a building at (x, y), given which tiles are reachable: a reachable side
 * tile, a Daan first, then the one nearest the plaza, then front, right, left, back. Null if none.
 */
function bestDoor(map: MapState, reach: Uint8Array, x: number, y: number, skip = -1): Point | null {
  const W = map.width;
  let bx = 0;
  let by = 0;
  let bestScore = Infinity;
  for (let k = 0; k < 4; k++) {
    const nx = x + SIDES[k][0];
    const ny = y + SIDES[k][1];
    if (nx < 0 || ny < 0 || nx >= W || ny >= map.height) continue;
    const j = ny * W + nx;
    if (j === skip || !reach[j]) continue;
    const daan = map.tiles[j] === TILE_CODE.daan ? 0 : 1;
    const score = daan * 1e6 + (Math.abs(nx - map.plaza.x) + Math.abs(ny - map.plaza.y)) * 10 + k;
    if (score < bestScore) [bx, by, bestScore] = [nx, ny, score];
  }
  return bestScore === Infinity ? null : { x: bx, y: by };
}

/** The building's entrance now (worked out from the map; null if every side is cut off). */
export function entranceOf(state: GameState, content: Content, b: { x: number; y: number }): Point | null {
  return bestDoor(state.map, walkReach(state, content), b.x, b.y);
}

/** Where people go in: the reachable entrance, or the side kept for a grandfathered building. */
export function doorOf(state: GameState, content: Content, b: PlacedBuilding): Point {
  return entranceOf(state, content, b) ?? b.door ?? { x: b.x, y: b.y + 1 };
}

/** Can people get into it: a reachable entrance, or grandfathered from an old save. */
export function hasEntrance(state: GameState, content: Content, b: PlacedBuilding): boolean {
  return !isSolid(content, b) || b.legacyDoor === true || entranceOf(state, content, b) !== null;
}

/** For a grandfathered building: the side with the most open ground (a walkable tile if any). */
function leastBlockedSide(map: MapState, solid: Uint8Array, b: PlacedBuilding): Point {
  const W = map.width;
  let best: Point = { x: b.x, y: b.y + 1 };
  let bestScore = -1;
  for (const [dx, dy] of SIDES) {
    const nx = b.x + dx;
    const ny = b.y + dy;
    if (!inBounds(map, nx, ny)) continue;
    const j = ny * W + nx;
    const score = (solid[j] ? 0 : 2) + (FOOT.has(map.tiles[j]) ? 1 : 0);
    if (score > bestScore) [best, bestScore] = [{ x: nx, y: ny }, score];
  }
  return best;
}

/** Has anything changed in the 3 × 3 around (x, y): a tile or a building? */
function aroundChanged(prev: GameState, next: GameState, content: Content, x: number, y: number): boolean {
  if (prev.map.width !== next.map.width || prev.map.height !== next.map.height) return true;
  const a = solidTiles(prev, content);
  const b = solidTiles(next, content);
  const W = next.map.width;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inBounds(next.map, nx, ny)) continue;
      const j = ny * W + nx;
      if (a[j] !== b[j] || prev.map.tiles[j] !== next.map.tiles[j]) return true;
    }
  }
  return false;
}

/**
 * Keeps every building's stored entrance up to date after a change (placed, moved, demolished,
 * land cleared, a Daan laid). `prev` is the state before (null on loading a save: then any
 * boxed-in building is grandfathered when `grandfather` is set). Returns `next` itself when no
 * entrance changed.
 */
export function updateDoors(prev: GameState | null, next: GameState, content: Content, grandfather = false): GameState {
  if (prev && prev.buildings === next.buildings && prev.map === next.map) return next;
  const reach = walkReach(next, content);
  const solid = solidTiles(next, content);
  const prevAt = prev ? new Map(prev.buildings.map((b) => [`${b.x},${b.y}:${b.type}`, b])) : null;
  let changed = false;
  const buildings = next.buildings.map((b) => {
    if (!isSolid(content, b)) {
      if (b.door === undefined && b.legacyDoor === undefined) return b;
      changed = true;
      const { door: _d, legacyDoor: _l, ...rest } = b;
      return rest;
    }
    const door = bestDoor(next.map, reach, b.x, b.y);
    let legacy = false;
    let at: Point | null = door;
    if (!door) {
      // Kept as it was while nothing around it changed (and it wasn't moved).
      const was = prevAt?.get(`${b.x},${b.y}:${b.type}`);
      if (b.legacyDoor && (!prev || (was?.legacyDoor && !aroundChanged(prev, next, content, b.x, b.y)))) legacy = true;
      else if (grandfather && !prev) legacy = true;
      if (legacy) at = b.door ?? leastBlockedSide(next.map, solid, b);
    }
    const same = (b.door?.x === at?.x && b.door?.y === at?.y) && (b.legacyDoor === true) === legacy;
    if (same) return b;
    changed = true;
    const { door: _d, legacyDoor: _l, ...rest } = b;
    return { ...rest, ...(at ? { door: at } : {}), ...(legacy ? { legacyDoor: true as const } : {}) };
  });
  return changed ? { ...next, buildings } : next;
}

// ---------- Placement ----------

/**
 * How the walkable land hangs together (an iterative Tarjan search from the plaza): for each
 * tile that would split it if taken (an articulation point), the ranges of discovery order of
 * the parts it would cut off. A tile u is in a cut-off part [a, b] when a <= disc[u] <= b.
 */
interface Cuts {
  disc: Int32Array;
  cutOff: Map<number, [number, number][]>;
}
const cutCache = new WeakMap<Uint8Array, Cuts>();
function cutsOf(map: MapState, reach: Uint8Array): Cuts {
  let c = cutCache.get(reach);
  if (c) return c;
  const W = map.width;
  const N = W * map.height;
  const disc = new Int32Array(N).fill(-1);
  const low = new Int32Array(N);
  const parent = new Int32Array(N).fill(-1);
  const next = new Uint8Array(N);
  const cutOff = new Map<number, [number, number][]>();
  c = { disc, cutOff };
  cutCache.set(reach, c);
  const root = map.plaza.y * W + map.plaza.x;
  if (!reach[root]) return c;
  let time = 0;
  const stack = [root];
  disc[root] = low[root] = time++;
  while (stack.length) {
    const v = stack[stack.length - 1];
    if (next[v] < 4) {
      const [dx, dy] = NEIGHBOURS[next[v]++];
      const x = (v % W) + dx;
      const y = Math.floor(v / W) + dy;
      if (x < 0 || y < 0 || x >= W || y >= map.height) continue;
      const u = y * W + x;
      if (!reach[u]) continue;
      if (disc[u] === -1) {
        parent[u] = v;
        disc[u] = low[u] = time++;
        stack.push(u);
      } else if (u !== parent[v]) low[v] = Math.min(low[v], disc[u]);
    } else {
      stack.pop();
      const p = parent[v];
      if (p === -1) continue;
      low[p] = Math.min(low[p], low[v]);
      // v's part hangs on p alone (for the plaza itself, every part but the one people stand in
      // is cut off; the plaza can't be built on, so it never matters).
      if (low[v] >= disc[p]) {
        const list = cutOff.get(p) ?? [];
        list.push([disc[v], time - 1]);
        cutOff.set(p, list);
      }
    }
  }
  return c;
}

/**
 * The buildings that would lose every entrance if a building were placed at (x, y). Empty when
 * the placement is fine: a building loses its way in when each of its reachable sides is the
 * tile itself or in a part of the land that tile would cut off.
 */
export function entrancesBlockedBy(state: GameState, content: Content, x: number, y: number): PlacedBuilding[] {
  const reach = walkReach(state, content);
  const W = state.map.width;
  if (!inBounds(state.map, x, y) || !reach[y * W + x]) return [];
  const t = y * W + x;
  const { disc, cutOff } = cutsOf(state.map, reach);
  const parts = cutOff.get(t);
  const lost = (j: number) => j === t || (!!parts && parts.some(([a, b]) => disc[j] >= a && disc[j] <= b));
  const out: PlacedBuilding[] = [];
  const candidates = parts ? state.buildings : NEIGHBOURS.map(([dx, dy]) => buildingIndex(state).get((y + dy) * W + x + dx)).filter((b): b is PlacedBuilding => !!b);
  for (const b of candidates) {
    if (!isSolid(content, b) || b.legacyDoor) continue;
    const opts = sidesOf(state.map, reach, b);
    if (opts.length > 0 && opts.every(lost)) out.push(b);
  }
  return out;
}

/** A building's reachable side tiles (as indexes). */
function sidesOf(map: MapState, reach: Uint8Array, b: { x: number; y: number }): number[] {
  const out: number[] = [];
  for (const [dx, dy] of SIDES) {
    const nx = b.x + dx;
    const ny = b.y + dy;
    if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue;
    const j = ny * map.width + nx;
    if (reach[j]) out.push(j);
  }
  return out;
}

const indexCache = new WeakMap<PlacedBuilding[], Map<number, PlacedBuilding>>();
function buildingIndex(state: GameState): Map<number, PlacedBuilding> {
  let m = indexCache.get(state.buildings);
  if (!m) indexCache.set(state.buildings, (m = new Map(state.buildings.map((b) => [b.y * state.map.width + b.x, b]))));
  return m;
}

/** Would a new building at (x, y) have a way in (a reachable side tile once it stands)? */
export function wouldHaveEntrance(state: GameState, content: Content, x: number, y: number): boolean {
  const reach = walkReach(state, content);
  return SIDES.some(([dx, dy]) => inBounds(state.map, x + dx, y + dy) && reach[(y + dy) * state.map.width + x + dx] === 1);
}

/**
 * Would a building at (x, y) close the plaza in: is it the last open side people can walk out
 * of the plaza by? Everyone's way runs through the plaza, so that is never allowed.
 */
export function closesPlaza(state: GameState, content: Content, x: number, y: number): boolean {
  const { plaza } = state.map;
  if (Math.abs(x - plaza.x) + Math.abs(y - plaza.y) !== 1) return false;
  const reach = walkReach(state, content);
  const W = state.map.width;
  return !NEIGHBOURS.some(([dx, dy]) => {
    const nx = plaza.x + dx;
    const ny = plaza.y + dy;
    return (nx !== x || ny !== y) && inBounds(state.map, nx, ny) && reach[ny * W + nx] === 1;
  });
}
