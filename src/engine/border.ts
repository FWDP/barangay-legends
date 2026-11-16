// Raids at the border: where raiders land (preferring what no Bantayan watches), and who gets
// there to meet them from the Kutas where they rally. Pure and deterministic: everything depends on GameState, the map and its seed.
import type { Content } from "./content";
import type { GameState } from "./game";
import { barangayCenter, inBounds, isReachable, NEIGHBOURS, tileAt, type MapState, type Point } from "./map";
import { findPath, STEP_COST } from "./paths";
import { homeWarriors } from "./region";
import { rollAt } from "./rng";
import { isWatched } from "./watch";

/** Salt for the landing roll, so it never lines up with other rolls of the same second. */
const LANDING_SALT = 41;

const isLand = (map: MapState, x: number, y: number) => {
  const t = tileAt(map, x, y);
  return t === "cleared" || t === "forest" || t === "balete" || t === "daan";
};

/**
 * Where a boat can put raiders ashore: land next to open river (bridges aren't landing spots),
 * or next to the sea (a beach), on ground the barangay's own people can walk to.
 */
export function landingCandidates(map: MapState): Point[] {
  const out: Point[] = [];
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (!isLand(map, x, y) || !isReachable(map, x, y)) continue;
      // River banks and the beach along the sea.
      if (NEIGHBOURS.some(([dx, dy]) => {
        const t = tileAt(map, x + dx, y + dy);
        return t === "river" || t === "sea";
      })) out.push({ x, y });
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

/** A cove or a river mouth: a landing on the beach, or on a river bank within two tiles of the sea. */
export function isCove(map: MapState, p: Point): boolean {
  const near = (dist: number, tile: "sea" | "river") => {
    for (let dy = -dist; dy <= dist; dy++) for (let dx = -dist; dx <= dist; dx++) if (Math.abs(dx) + Math.abs(dy) <= dist && tileAt(map, p.x + dx, p.y + dy) === tile) return true;
    return false;
  };
  return near(1, "sea") || (near(1, "river") && near(2, "sea"));
}

/**
 * Where raiders land when a raid starts at game second `second` (or, for a raid on an AI
 * barangay, the day's key): one of the rules.diplomacy.aiRaid.landingChoices spots nearest the
 * barangay, picked with a roll seeded by the map's seed and the second, weighted toward landings
 * no staffed Bantayan watches (unwatchedWeight) and toward coves and river mouths (coveWeight).
 * Null if there's no river bank or beach at all.
 */
export function chooseLanding(state: GameState, content: Content, second: number): Point | null {
  const r = content.rules.diplomacy.aiRaid;
  const options = closestLandings(state.map, r.landingChoices);
  if (options.length === 0) return null;
  const weights = options.map((p) => (isWatched(state, content, p) ? 1 : r.unwatchedWeight) * (isCove(state.map, p) ? r.coveWeight : 1));
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = rollAt(state.map.seed, second, LANDING_SALT) * total;
  for (let i = 0; i < options.length; i++) {
    roll -= weights[i];
    if (roll < 0) return options[i];
  }
  return options[options.length - 1];
}

/** The landing of a raid: stored when the raid starts (older saves: worked out the same way). */
export function raidLanding(state: GameState, content: Content): Point | null {
  const raid = state.region?.incomingRaid;
  if (!raid) return null;
  return raid.landing ?? chooseLanding(state, content, raid.warnedAt ?? raid.strikeAt - content.rules.watch.unwatchedWarningSeconds);
}

/** The warning a raid gave, in seconds: from when it was seen to when it strikes. */
export function raidWindow(state: GameState, content: Content): number {
  const raid = state.region?.incomingRaid;
  if (!raid) return content.rules.watch.unwatchedWarningSeconds;
  return raid.warnedAt !== undefined ? raid.strikeAt - raid.warnedAt : content.rules.watch.unwatchedWarningSeconds;
}

/** Is a point within a standing Kuta's shelter? */
export const sheltered = (content: Content, kuta: Point, p: Point) => Math.hypot(kuta.x - p.x, kuta.y - p.y) <= content.rules.kuta.shelterRadius;

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
  /** Where they rally and set out from: a Kuta, or the barangay's center if there is none. */
  from: Point;
  warriors: number;
  /** Seconds to rally and get there, or null if there's no way. */
  seconds: number | null;
  /** In time for the battle. */
  arrives: boolean;
  /** In time with readySeconds to spare: they meet the raiders ready. */
  ready: boolean;
}

export interface Muster {
  posts: Post[];
  /** Warriors who get to the landing in time (and of them, ready), and those who don't. */
  joined: number;
  ready: number;
  late: number;
  /** A staffed Bantayan watched the landing (so the warning was long). */
  watched: boolean;
}

/**
 * Who meets the raiders at the landing. On the alarm the Mandirigma at home rally at the
 * standing Kutas (spread over them in order, as on the map; with none, at the barangay's
 * center), taking rules.kuta.rallySeconds, then march by the shortest way. Each group joins only
 * if it arrives within `windowSeconds` (the raid's warning), ready if with time to spare.
 */
export function muster(state: GameState, content: Content, landing: Point, windowSeconds: number): Muster {
  const defs = new Map(content.buildings.map((d) => [d.id, d]));
  const forts = state.buildings.filter((b) => (defs.get(b.type)?.defense ?? 0) > 0 && !b.damaged);
  const warriors = homeWarriors(state);
  const k = content.rules.kuta;
  const starts: Point[] = forts.length ? forts.map((b) => ({ x: b.x, y: b.y })) : [barangayCenter(state.map)];
  const counts = starts.map((_, i) => Math.floor(warriors / starts.length) + (i < warriors % starts.length ? 1 : 0));
  const posts: Post[] = starts.map((from, i) => {
    const walk = inBounds(state.map, landing.x, landing.y) ? travelSeconds(state.map, from, landing, content) : null;
    const seconds = walk === null ? null : k.rallySeconds + walk;
    return { from, warriors: counts[i], seconds, arrives: seconds !== null && seconds <= windowSeconds, ready: seconds !== null && seconds + k.readySeconds <= windowSeconds };
  });
  const joined = posts.reduce((n, p) => n + (p.arrives ? p.warriors : 0), 0);
  const ready = posts.reduce((n, p) => n + (p.ready ? p.warriors : 0), 0);
  return { posts, joined, ready, late: warriors - joined, watched: isWatched(state, content, landing) };
}

/** Defense at the landing: the base, warriors who got there in time, and a bonus for those who got there ready. */
export function borderDefense(state: GameState, content: Content, landing: Point, windowSeconds: number): { defense: number; muster: Muster } {
  const m = muster(state, content, landing, windowSeconds);
  const rules = content.rules.military;
  return { defense: rules.baseDefense + m.joined * rules.warrior.defense + m.ready * content.rules.kuta.readyBonus, muster: m };
}

/** Which way the landing lies from the barangay's center, for the warning ("north", "south-east"...). */
export function directionFrom(center: Point, p: Point): string {
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  const ns = Math.abs(dy) > Math.abs(dx) / 2 ? (dy < 0 ? "north" : "south") : "";
  const ew = Math.abs(dx) > Math.abs(dy) / 2 ? (dx < 0 ? "west" : "east") : "";
  return ns && ew ? `${ns}-${ew}` : ns || ew || "here";
}
