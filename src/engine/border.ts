// Raids at the border: where raiders land, who gets there to meet them, and how much the
// Kutas help. Pure and deterministic: everything depends on GameState, the map and its seed.
import type { Content } from "./content";
import type { GameState } from "./game";
import { barangayCenter, inBounds, isReachable, NEIGHBOURS, tileAt, type MapState, type Point } from "./map";
import { findPath, STEP_COST } from "./paths";
import { homeWarriors } from "./region";
import { rollAt } from "./rng";

/** Salt for the landing roll, so it never lines up with other rolls of the same second. */
const LANDING_SALT = 41;

const isLand = (map: MapState, x: number, y: number) => {
  const t = tileAt(map, x, y);
  return t === "cleared" || t === "forest" || t === "balete" || t === "daan";
};

/**
 * Where a boat can put raiders ashore: land next to open river (bridges aren't landing spots),
 * on ground the barangay's own people can walk to. Coast tiles can join this list once the map
 * has a coast.
 */
export function landingCandidates(map: MapState): Point[] {
  const out: Point[] = [];
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (!isLand(map, x, y) || !isReachable(map, x, y)) continue;
      if (NEIGHBOURS.some(([dx, dy]) => tileAt(map, x + dx, y + dy) === "river")) out.push({ x, y });
    }
  }
  return out;
}

/** Straight-line distance (tile centres) from a point to the nearest cleared land or Daan. */
export function distanceToBarangay(map: MapState, p: Point): number {
  let best = Infinity;
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const t = tileAt(map, x, y);
      if (t !== "cleared" && t !== "daan") continue;
      const d = Math.hypot(x - p.x, y - p.y);
      if (d < best) best = d;
    }
  }
  return best;
}

/** The closest landing spots to the barangay's land, nearest first (ties: top to bottom, left to right). */
const landingCache = new WeakMap<MapState, Map<number, Point[]>>();

export function closestLandings(map: MapState, count: number): Point[] {
  let byCount = landingCache.get(map);
  if (!byCount) landingCache.set(map, (byCount = new Map()));
  const hit = byCount.get(count);
  if (hit) return hit;
  const result = landingCandidates(map)
    .map((p) => ({ p, d: distanceToBarangay(map, p) }))
    .sort((a, b) => a.d - b.d || a.p.y - b.p.y || a.p.x - b.p.x)
    .slice(0, Math.max(1, count))
    .map((c) => c.p);
  byCount.set(count, result);
  return result;
}

/**
 * Where raiders land when a raid starts at game second `second`: one of the
 * rules.diplomacy.aiRaid.landingChoices spots nearest the barangay, picked with a roll seeded
 * by the map's seed and the second. Null if there's no river bank at all.
 */
export function chooseLanding(state: GameState, content: Content, second: number): Point | null {
  const options = closestLandings(state.map, content.rules.diplomacy.aiRaid.landingChoices);
  if (options.length === 0) return null;
  return options[Math.floor(rollAt(state.map.seed, second, LANDING_SALT) * options.length)];
}

/** The landing of a raid: stored when the raid starts (older saves: worked out the same way). */
export function raidLanding(state: GameState, content: Content): Point | null {
  const raid = state.region?.incomingRaid;
  if (!raid) return null;
  return raid.landing ?? chooseLanding(state, content, raid.strikeAt - content.rules.diplomacy.aiRaid.warningSeconds);
}

/** Is the landing within a Kuta's defense radius? (Straight line between tile centres.) */
export function kutaCovers(content: Content, kuta: Point, landing: Point): boolean {
  return Math.hypot(kuta.x - landing.x, kuta.y - landing.y) <= content.rules.military.kutaRadius;
}

/** The share of a Kuta's defense that counts: all of it within its radius, less outside. */
export function kutaShare(content: Content, kuta: Point, landing: Point): number {
  return kutaCovers(content, kuta, landing) ? 1 : content.rules.military.kutaOutsidePercent / 100;
}

/** Seconds a warrior takes to walk a path (forest is slow), or null if there's no way on foot. */
export function travelSeconds(map: MapState, from: Point, to: Point, content: Content): number | null {
  const path = findPath(map, from, to);
  if (!path) return null;
  let cost = 0;
  for (let i = 1; i < path.length; i++) cost += STEP_COST[map.tiles[path[i].y * map.width + path[i].x]] ?? 1;
  return cost / content.rules.military.warriorTilesPerSecond;
}

/** One group of warriors setting out for the landing. */
export interface Post {
  /** Where they start: a Kuta, or the barangay's center if there is none. */
  from: Point;
  warriors: number;
  /** Seconds to get there, or null if there's no way. */
  seconds: number | null;
  /** In time for the battle. */
  arrives: boolean;
}

export interface Muster {
  posts: Post[];
  /** Warriors who get to the landing in time, and those who don't. */
  joined: number;
  late: number;
  /** The Kutas' defense after their radius: full within it, reduced outside. */
  walls: number;
  /** Any standing Kuta has the landing within its radius. */
  covered: boolean;
}

/**
 * Who meets the raiders at the landing. Warriors at home are spread over the standing Kutas
 * in order (as on the map); each group walks there by the shortest way and joins only if it
 * arrives within `windowSeconds` (the raid warning).
 */
export function muster(state: GameState, content: Content, landing: Point, windowSeconds: number): Muster {
  const defs = new Map(content.buildings.map((d) => [d.id, d]));
  const forts = state.buildings.filter((b) => (defs.get(b.type)?.defense ?? 0) > 0 && !b.damaged);
  const warriors = homeWarriors(state);
  const starts: Point[] = forts.length ? forts.map((b) => ({ x: b.x, y: b.y })) : [barangayCenter(state.map)];
  const counts = starts.map((_, i) => Math.floor(warriors / starts.length) + (i < warriors % starts.length ? 1 : 0));
  const posts: Post[] = starts.map((from, i) => {
    const seconds = inBounds(state.map, landing.x, landing.y) ? travelSeconds(state.map, from, landing, content) : null;
    return { from, warriors: counts[i], seconds, arrives: seconds !== null && seconds <= windowSeconds };
  });
  const joined = posts.reduce((n, p) => n + (p.arrives ? p.warriors : 0), 0);
  let walls = 0;
  let covered = false;
  for (const b of forts) {
    const share = kutaShare(content, b, landing);
    if (share === 1) covered = true;
    walls += (defs.get(b.type)?.defense ?? 0) * share;
  }
  return { posts, joined, late: warriors - joined, walls, covered };
}

/** Defense at the landing: the base, warriors who got there, and the Kutas after their radius. */
export function borderDefense(state: GameState, content: Content, landing: Point, windowSeconds: number): { defense: number; muster: Muster } {
  const m = muster(state, content, landing, windowSeconds);
  const rules = content.rules.military;
  return { defense: rules.baseDefense + m.joined * rules.warrior.defense + m.walls, muster: m };
}

/** Which way the landing lies from the barangay's center, for the warning ("north", "south-east"...). */
export function directionFrom(center: Point, p: Point): string {
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  const ns = Math.abs(dy) > Math.abs(dx) / 2 ? (dy < 0 ? "north" : "south") : "";
  const ew = Math.abs(dx) > Math.abs(dy) / 2 ? (dx < 0 ? "west" : "east") : "";
  return ns && ew ? `${ns}-${ew}` : ns || ew || "here";
}
