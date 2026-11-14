// The Bahay ng Datu's footprint, the clearing beside it and the gatherings there. ("Plaza" is
// the internal name only: precolonial barangays had no town square. People gathered in an open
// clearing by the datu's house; see content/lore/settlement-layout.json.) The house stands on the plaza
// tile; from rules.plaza.bigFromLevel it takes bigWidth × bigHeight tiles (the plaza tile is the
// footprint's front-left corner: it grows right and back, away from the doorway in front). Those
// extra tiles are reserved from the start, so new buildings, Daan and replanting never take them.
// An old save whose buildings already stand there keeps the one-tile house ("grandfathered":
// worked out from the state, so nothing needs migrating) until the tiles are free again.
// Footprint tiles are solid (doors.ts). The clearing (map.gathering) is a few irregular open
// tiles in front of the house, with the fire pit in it: walkable, never built on. People who
// gather at the house stand on it first, then on open tiles around the house, spread out, never
// on it. Pure: no React, no browser APIs.
import type { Content } from "./content";
import type { GameState } from "./game";
import type { MapState, Point } from "./map";
import { inBounds, isFootTile, tileAt } from "./map";
import { Rng } from "./rng";
import { buildingSolid, hasReachableSide, isSolid, reachWith, walkReach } from "./doors";

/** The tiles the big house takes (plaza tile included), whether or not it stands that big yet. */
export function reservedTiles(map: Pick<MapState, "plaza">, content: Content): Point[] {
  const { bigWidth, bigHeight } = content.rules.plaza;
  const out: Point[] = [];
  for (let dy = 0; dy < bigHeight; dy++) for (let dx = 0; dx < bigWidth; dx++) out.push({ x: map.plaza.x + dx, y: map.plaza.y - dy });
  return out;
}

/**
 * The clearing's shape for a map: grown from the two tiles in front of the house (its doorway
 * opens onto it), a seeded, irregular patch of clearingMin..clearingMax tiles in front of and
 * beside the house, never on the big house's tiles, and inside the start square's inner columns
 * (its edge column runs along the river: that land is kept for fields and docks). Only the map's seed and the house's tile
 * decide it, so a new map and an old save's migration agree.
 */
export function clearingShape(map: Pick<MapState, "width" | "height" | "seed" | "plaza">, content: Content): Point[] {
  const { clearingMin, clearingMax } = content.rules.plaza;
  const P = map.plaza;
  const rng = new Rng((map.seed ^ 0x2c1b3c6d) >>> 0);
  const house = new Set(reservedTiles(map, content).map((p) => `${p.x},${p.y}`));
  const ok = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < map.width && y < map.height && x >= P.x - 2 && x <= P.x + 2 && y >= P.y && y <= P.y + 3 && !house.has(`${x},${y}`);
  const out: Point[] = [
    { x: P.x, y: P.y + 1 },
    { x: P.x + 1, y: P.y + 1 },
  ].filter((p) => ok(p.x, p.y));
  const n = rng.int(clearingMin, clearingMax);
  // The middle it grows around: in front of the house, a little to the right of its doorway.
  const mid = { x: P.x + 1, y: P.y + 1.8 };
  while (out.length < n) {
    const has = new Set(out.map((p) => `${p.x},${p.y}`));
    const frontier: Point[] = [];
    for (const p of out) {
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
        const q = { x: p.x + dx, y: p.y + dy };
        const k = `${q.x},${q.y}`;
        if (ok(q.x, q.y) && !has.has(k) && !frontier.some((f) => f.x === q.x && f.y === q.y)) frontier.push(q);
      }
    }
    if (frontier.length === 0) break;
    frontier.sort((a, b) => a.y - b.y || a.x - b.x);
    // Nearest the middle wins, with a seeded jitter, so the edge is uneven; the last tile never
    // squares it off into a full rectangle when there is another choice.
    const scored = frontier.map((q) => ({ q, v: Math.hypot(q.x + 0.5 - mid.x, q.y + 0.5 - mid.y) + rng.next() * 1.6 }));
    scored.sort((a, b) => a.v - b.v);
    const last = out.length === n - 1;
    out.push((last ? scored.find((c) => !fillsBox([...out, c.q])) : undefined)?.q ?? scored[0].q);
  }
  return out;
}

/** Do the tiles fill their bounding box (a rectangle, at least 2 × 2)? */
function fillsBox(tiles: Point[]): boolean {
  const w = Math.max(...tiles.map((p) => p.x)) - Math.min(...tiles.map((p) => p.x)) + 1;
  const h = Math.max(...tiles.map((p) => p.y)) - Math.min(...tiles.map((p) => p.y)) + 1;
  return w > 1 && h > 1 && tiles.length === w * h;
}

/**
 * The clearing's open tiles now: its tiles that are still open ground (cleared land or a Daan)
 * with nothing built on them and not under the house. Empty on a map without a clearing.
 */
export function clearingTiles(state: GameState, content: Content): Point[] {
  const { map } = state;
  if (!map.gathering?.length) return [];
  const fp = houseFootprint(state, content);
  return map.gathering.filter((p) => {
    const t = tileAt(map, p.x, p.y);
    if (!isFootTile(t) || t === "bridge") return false;
    if (fp.some((f) => f.x === p.x && f.y === p.y)) return false;
    return !state.buildings.some((b) => b.x === p.x && b.y === p.y);
  });
}

/** Is (x, y) one of the clearing's tiles (kept open: nothing is built there)? */
export const inClearing = (map: MapState, x: number, y: number) => (map.gathering ?? []).some((p) => p.x === x && p.y === y);

/**
 * Is (x, y) kept for the Bahay ng Datu: the plaza tile and the clearing always, and from
 * reserveFromLevel the tiles the big house will take (so the first minutes keep all their
 * building land).
 */
export function isReserved(state: GameState, content: Content, x: number, y: number): boolean {
  const { plaza } = state.map;
  if (x === plaza.x && y === plaza.y) return true;
  if (inClearing(state.map, x, y)) return true;
  if ((state.datuLevel ?? 1) < content.rules.plaza.reserveFromLevel) return false;
  return reservedTiles(state.map, content).some((p) => p.x === x && p.y === y);
}

const roomCache = new WeakMap<GameState["buildings"], WeakMap<MapState, Map<string, boolean>>>();

/**
 * Can the big house stand: every extra tile on the map, open cleared land with nothing on it,
 * and growing cuts nothing off (all the land it doesn't stand on stays reachable on foot, and
 * every building keeps a way in). Cached per buildings list and map.
 */
function roomForBig(state: GameState, content: Content): boolean {
  const { map } = state;
  const { plaza } = map;
  const key = state.replanting.map((j) => `${j.x},${j.y}`).join(";");
  let byMap = roomCache.get(state.buildings);
  if (!byMap) roomCache.set(state.buildings, (byMap = new WeakMap()));
  let byKey = byMap.get(map);
  if (!byKey) byMap.set(map, (byKey = new Map()));
  const hit = byKey.get(key);
  if (hit !== undefined) return hit;
  const extra = reservedTiles(map, content).filter((p) => p.x !== plaza.x || p.y !== plaza.y);
  let ok = extra.every((p) => {
    if (!inBounds(map, p.x, p.y) || tileAt(map, p.x, p.y) !== "cleared") return false;
    return !state.buildings.some((b) => b.x === p.x && b.y === p.y) && !state.replanting.some((j) => j.x === p.x && j.y === p.y);
  });
  if (ok) {
    const small = buildingSolid(state, content);
    const before = reachWith(map, small);
    const big = small.slice();
    for (const p of extra) big[p.y * map.width + p.x] = 1;
    const after = reachWith(map, big);
    for (let j = 0; ok && j < before.length; j++) if (before[j] && !big[j] && !after[j]) ok = false;
    for (const b of state.buildings) {
      if (!ok) break;
      if (isSolid(content, b) && hasReachableSide(map, before, b.x, b.y) && !hasReachableSide(map, after, b.x, b.y)) ok = false;
    }
  }
  byKey.set(key, ok);
  return ok;
}

/** Does the house stand on its big footprint now (high enough level, and the room for it)? */
export const isBigHouse = (state: GameState, content: Content) => (state.datuLevel ?? 1) >= content.rules.plaza.bigFromLevel && roomForBig(state, content);

/**
 * Is the house drawn smaller than its level (a high level kept on one tile, because an old
 * save's buildings stand where it would grow)?
 */
export const isGrandfatheredHouse = (state: GameState, content: Content) => (state.datuLevel ?? 1) >= content.rules.plaza.bigFromLevel && !roomForBig(state, content);

/** The tiles the Bahay ng Datu takes now. */
export function houseFootprint(state: GameState, content: Content): Point[] {
  return isBigHouse(state, content) ? reservedTiles(state.map, content) : [{ ...state.map.plaza }];
}

/** Is (x, y) under the Bahay ng Datu now? */
export const inHouse = (state: GameState, content: Content, x: number, y: number) => houseFootprint(state, content).some((p) => p.x === x && p.y === y);

/** The footprint's bounds: left and right columns, back and front rows. */
function bounds(fp: Point[]): { x0: number; x1: number; y0: number; y1: number } {
  return { x0: Math.min(...fp.map((p) => p.x)), x1: Math.max(...fp.map((p) => p.x)), y0: Math.min(...fp.map((p) => p.y)), y1: Math.max(...fp.map((p) => p.y)) };
}

/** Is this tile somewhere people can stand at the plaza: reachable on foot, not under anything? */
function open(state: GameState, reach: Uint8Array, x: number, y: number): boolean {
  return inBounds(state.map, x, y) && reach[y * state.map.width + x] === 1 && !(x === state.map.plaza.x && y === state.map.plaza.y);
}

/**
 * The fire pit, in tile units: in the clearing, on its open tile nearest the clearing's middle
 * (not the one right before the doorway). On a map without a clearing: beside the one-tile
 * house on the right, in front of the big house's right side.
 */
export function firePit(state: GameState, content: Content): Point {
  const tiles = clearingTiles(state, content);
  if (tiles.length > 0) {
    const cx = tiles.reduce((n, p) => n + p.x + 0.5, 0) / tiles.length;
    const cy = tiles.reduce((n, p) => n + p.y + 0.5, 0) / tiles.length;
    const door = houseFront(state, content);
    const atDoor = (p: Point) => Math.floor(door.x) === p.x && Math.floor(door.y) === p.y;
    const pool = tiles.length > 1 ? tiles.filter((p) => !atDoor(p)) : tiles;
    const best = [...pool].sort((a, b) => Math.hypot(a.x + 0.5 - cx, a.y + 0.5 - cy) - Math.hypot(b.x + 0.5 - cx, b.y + 0.5 - cy) || a.y - b.y || a.x - b.x)[0];
    return { x: best.x + 0.5, y: best.y + 0.55 };
  }
  const b = bounds(houseFootprint(state, content));
  return isBigHouse(state, content) ? { x: b.x1 + 0.6, y: b.y1 + 1.5 } : { x: b.x1 + 1.3, y: b.y1 + 0.75 };
}

/** Is the fire pit drawn (its tile is open, not built on)? */
export function hasFirePit(state: GameState, content: Content): boolean {
  const f = firePit(state, content);
  return !state.buildings.some((b) => b.x === Math.floor(f.x) && b.y === Math.floor(f.y));
}

/**
 * Where people stand when they come to the house: the house's doorway, a point just in front of
 * it (the datu, envoys and messengers go here).
 */
export function houseFront(state: GameState, content: Content): Point {
  const b = bounds(houseFootprint(state, content));
  return { x: (b.x0 + b.x1 + 1) / 2, y: b.y1 + 1.25 };
}

export interface Gathering {
  /** Spots on open tiles right around the house and the fire, nearest the front first (at most gatherMax). */
  spots: Point[];
  /** Spots one tile further out, where the rest wait. */
  waiting: Point[];
}

/** Two (or more) spread spots on a tile, away from the fire pit. */
function tileSpots(x: number, y: number, n: number, fire: Point): Point[] {
  const offsets = [
    [0.3, 0.4],
    [0.72, 0.78],
    [0.72, 0.35],
    [0.3, 0.8],
  ];
  const out: Point[] = [];
  for (const [ox, oy] of offsets) {
    const p = { x: x + ox, y: y + oy };
    if (Math.hypot(p.x - fire.x, p.y - fire.y) < 0.35) continue;
    out.push(p);
    if (out.length >= n) break;
  }
  return out;
}

const gatherCache = new WeakMap<Uint8Array, Map<string, Gathering>>();

/**
 * The gathering spots at the Bahay ng Datu: on open, walkable tiles around the house (and its
 * fire), never on it or on a building; the first gatherMax are the crowd, the rest wait one ring
 * further out. If the house is boxed in, everyone waits at the nearest open ground.
 */
export function gatheringSpots(state: GameState, content: Content): Gathering {
  const reach = walkReach(state, content);
  const fp = houseFootprint(state, content);
  const key = `${state.datuLevel ?? 1}:${fp.length}`;
  let byKey = gatherCache.get(reach);
  const hit = byKey?.get(key);
  if (hit) return hit;
  const { spotsPerTile, gatherMax } = content.rules.plaza;
  const b = bounds(fp);
  const fire = firePit(state, content);
  const front = houseFront(state, content);
  const ring = (r: number): Point[] => {
    const tiles: Point[] = [];
    for (let y = b.y0 - r; y <= b.y1 + r; y++) {
      for (let x = b.x0 - r; x <= b.x1 + r; x++) {
        const d = Math.max(b.x0 - x, x - b.x1, b.y0 - y, y - b.y1);
        if (d === r && open(state, reach, x, y)) tiles.push({ x, y });
      }
    }
    // Nearest the front of the house first, then left to right.
    return tiles.sort((p, q) => Math.hypot(p.x + 0.5 - front.x, p.y + 0.5 - front.y) - Math.hypot(q.x + 0.5 - front.x, q.y + 0.5 - front.y) || p.y - q.y || p.x - q.x);
  };
  // The clearing first (nearest the front of the house), then the open tiles right around the house.
  const clearing = clearingTiles(state, content).filter((t) => open(state, reach, t.x, t.y));
  const inC = new Set(clearing.map((t) => `${t.x},${t.y}`));
  const byFront = (p: Point, q: Point) => Math.hypot(p.x + 0.5 - front.x, p.y + 0.5 - front.y) - Math.hypot(q.x + 0.5 - front.x, q.y + 0.5 - front.y) || p.y - q.y || p.x - q.x;
  const near = [...clearing.sort(byFront), ...ring(1).filter((t) => !inC.has(`${t.x},${t.y}`))].flatMap((t) => tileSpots(t.x, t.y, spotsPerTile, fire));
  let spots = near.slice(0, gatherMax);
  // The rest wait further out, rings 2 to 4, so a crowd rarely has to share a spot.
  let waiting = [...near.slice(gatherMax), ...[2, 3, 4].flatMap((r) => ring(r).filter((t) => !inC.has(`${t.x},${t.y}`)).flatMap((t) => tileSpots(t.x, t.y, spotsPerTile, fire)))];
  for (let r = 3; spots.length === 0 && waiting.length === 0 && r <= 6; r++) waiting = ring(r).flatMap((t) => tileSpots(t.x, t.y, spotsPerTile, fire));
  if (spots.length === 0) {
    spots = waiting.slice(0, gatherMax);
    waiting = waiting.slice(gatherMax);
  }
  const out = { spots, waiting };
  if (!byKey) gatherCache.set(reach, (byKey = new Map()));
  byKey.set(key, out);
  return out;
}

/**
 * The spot for gatherer number `n` (a stable sprite number): the first gatherMax have a place in
 * the crowd, the rest wait further out. Null only on a map with no open ground near the house.
 */
export function gatherSpot(g: Gathering, n: number, gatherMax: number): Point | null {
  if (n < gatherMax && g.spots.length > 0) return lap(g.spots, n);
  if (g.waiting.length > 0) return lap(g.waiting, n);
  return g.spots.length > 0 ? lap(g.spots, n) : null;
}

/**
 * Spot n of a list; when there are more people than spots, each further round stands a little
 * aside on the same tile, so nobody stands on someone else.
 */
function lap(list: Point[], n: number): Point {
  const p = list[n % list.length];
  const round = Math.floor(n / list.length);
  if (round === 0) return p;
  const keep = (v: number, base: number) => Math.min(base + 0.9, Math.max(base + 0.1, v));
  const a = round * 2.39996;
  const r = 0.12 + 0.06 * (round % 3);
  return { x: keep(p.x + Math.cos(a) * r, Math.floor(p.x)), y: keep(p.y + Math.sin(a) * r, Math.floor(p.y)) };
}
