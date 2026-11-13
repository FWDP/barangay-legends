// A* pathfinding on the tile grid, for anyone walking: villagers, warriors, raiders.
// Pure and deterministic. Open river can't be walked on; bridges can. Daan is the quickest
// ground, cleared land next, and forest is slow (people only cut through it coming from outside).
import { TILE_CODE, inBounds, type MapState, type Point } from "./map";

/** Cost to step onto each kind of tile. Missing = can't walk there. */
export const STEP_COST: Record<string, number> = {
  [TILE_CODE.daan]: 2 / 3,
  [TILE_CODE.cleared]: 1,
  [TILE_CODE.bridge]: 1,
  [TILE_CODE.forest]: 4,
  [TILE_CODE.balete]: 4,
};

export const isWalkable = (map: MapState, x: number, y: number) => inBounds(map, x, y) && STEP_COST[map.tiles[y * map.width + x]] !== undefined;

/** A small binary heap of [priority, index], lowest first. */
class Heap {
  private items: [number, number][] = [];
  get size() {
    return this.items.length;
  }
  push(p: number, v: number) {
    const a = this.items;
    a.push([p, v]);
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (a[parent][0] <= a[i][0]) break;
      [a[parent], a[i]] = [a[i], a[parent]];
      i = parent;
    }
  }
  pop(): number {
    const a = this.items;
    const top = a[0][1];
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

const DIRS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
] as const;

/**
 * The cheapest walk from one tile to another, as the list of tiles stepped on (start
 * included), or null if there is none (the river is in the way and there's no bridge).
 * The start and goal may be any tile on the map; only the tiles in between must be walkable.
 */
export function findPath(map: MapState, from: Point, to: Point, blocked?: Uint8Array): Point[] | null {
  if (!inBounds(map, from.x, from.y) || !inBounds(map, to.x, to.y)) return null;
  const W = map.width;
  const start = from.y * W + from.x;
  const goal = to.y * W + to.x;
  if (start === goal) return [{ ...from }];
  const cost = new Float64Array(W * map.height).fill(Infinity);
  const came = new Int32Array(W * map.height).fill(-1);
  const open = new Heap();
  const minStep = Math.min(...Object.values(STEP_COST));
  const h = (i: number) => (Math.abs((i % W) - to.x) + Math.abs(Math.floor(i / W) - to.y)) * minStep;
  cost[start] = 0;
  open.push(h(start), start);
  while (open.size > 0) {
    const i = open.pop();
    if (i === goal) break;
    const x = i % W;
    const y = (i - x) / W;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inBounds(map, nx, ny)) continue;
      const j = ny * W + nx;
      const step = j === goal ? (STEP_COST[map.tiles[j]] ?? 1) : STEP_COST[map.tiles[j]];
      // Buildings are solid (doors.ts): walked around, except the goal itself.
      if (step === undefined || (blocked && blocked[j] && j !== goal)) continue;
      const c = cost[i] + step;
      if (c < cost[j]) {
        cost[j] = c;
        came[j] = i;
        open.push(c + h(j), j);
      }
    }
  }
  if (came[goal] === -1) return null;
  const path: Point[] = [];
  for (let i = goal; i !== -1; i = came[i]) path.push({ x: i % W, y: Math.floor(i / W) });
  return path.reverse();
}

const caches = new WeakMap<MapState, Map<number, Point[] | null>>();
const blockedCaches = new WeakMap<Uint8Array, WeakMap<MapState, Map<number, Point[] | null>>>();

/**
 * findPath with a cache per map. Maps are never changed in place: a new map (land cleared,
 * a bridge or Daan built or removed) gets a fresh cache, so cached paths are always current.
 */
export function cachedPath(map: MapState, from: Point, to: Point, blocked?: Uint8Array): Point[] | null {
  let cache: Map<number, Point[] | null> | undefined;
  if (blocked) {
    let byMap = blockedCaches.get(blocked);
    if (!byMap) blockedCaches.set(blocked, (byMap = new WeakMap()));
    cache = byMap.get(map);
    if (!cache) byMap.set(map, (cache = new Map()));
  } else {
    cache = caches.get(map);
    if (!cache) caches.set(map, (cache = new Map()));
  }
  const key = (from.y * map.width + from.x) * map.width * map.height + (to.y * map.width + to.x);
  if (!cache.has(key)) cache.set(key, findPath(map, from, to, blocked));
  return cache.get(key)!;
}
