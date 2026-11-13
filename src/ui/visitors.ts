// Where trade boats and raiders are, worked out from game state. Pure and read-only, like
// villagers.ts: the canvas layer calls these and never writes back to GameState.
import type { Content } from "../engine/content";
import { tileAt, type MapState, type Point } from "../engine/map";
import { cachedPath, isWalkable } from "../engine/paths";

/** Game seconds a bangka takes to sail from the map edge to the dock. */
export const SAIL_SECONDS = 14;
/** Real seconds the clash at the Kuta lasts before the battle report shows. */
export const CLASH_MS = 4000;
/** Real seconds a boat takes to leave, or raiders to get back to their karakoa. */
export const LEAVE_SECONDS = 9;
/** Share of the raid warning the karakoa spends on the river before the raiders land. */
export const LANDING_SHARE = 0.3;
/** How far upstream or downstream of the map edge the karakoa beaches, in rows. */
const LANDING_ROWS = 5;

/** Boats float on river and under bridges: a Tulay is water to a boat and land to people walking. */
export const isWater = (map: MapState, x: number, y: number) => {
  const t = tileAt(map, x, y);
  return t === "river" || t === "bridge";
};

/**
 * The river as a line of points, one per row from the top of the map to the bottom (the middle
 * of the water in that row), with a point off the map at each end.
 */
export function riverPath(map: MapState): RiverPoint[] {
  const pts: RiverPoint[] = [];
  for (let y = 0; y < map.height; y++) {
    const xs: number[] = [];
    for (let x = 0; x < map.width; x++) if (isWater(map, x, y)) xs.push(x);
    const under = xs.some((x) => tileAt(map, x, y) === "bridge");
    if (xs.length) pts.push(under ? { x: (xs[0] + xs[xs.length - 1] + 1) / 2, y: y + 0.5, bridge: true } : { x: (xs[0] + xs[xs.length - 1] + 1) / 2, y: y + 0.5 });
  }
  if (pts.length === 0) return [];
  return [{ x: pts[0].x, y: -1.5 }, ...pts, { x: pts[pts.length - 1].x, y: map.height + 1.5 }];
}

/** A point on the river; `bridge` marks a row with a Tulay over it. */
export interface RiverPoint extends Point {
  bridge?: boolean;
}

/**
 * The index on the path nearest the plaza: where boats tie up. Never under a bridge (the boat
 * would be hidden by the deck) unless every row has one.
 */
export function dockIndex(path: RiverPoint[], plaza: Point): number {
  let best = 1;
  let bestD = Infinity;
  const open = path.slice(1, -1).some((p) => !p.bridge);
  for (let i = 1; i < path.length - 1; i++) {
    if (open && path[i].bridge) continue;
    const d = Math.hypot(path[i].x - (plaza.x + 0.5), path[i].y - (plaza.y + 0.5));
    if (d < bestD) [best, bestD] = [i, d];
  }
  return best;
}

/** The dock: on the water by the bank nearest the plaza. */
export function dockPoint(path: Point[], plaza: Point): Point {
  const p = path[dockIndex(path, plaza)];
  const side = Math.sign(plaza.x + 0.5 - p.x) || 1;
  return { x: p.x + side * 0.45, y: p.y };
}

/** Neighbors upstream (top half of the regional river) come from the top of the map. */
export const fromTop = (content: Content, neighborId: string) => (content.neighbors.find((n) => n.id === neighborId)?.river.position ?? 0) < 0.5;

/** The stretch of river from the map edge (top or bottom) to path index `to`. */
export function reach(path: Point[], to: number, top: boolean): Point[] {
  return top ? path.slice(0, to + 1) : path.slice(to).reverse();
}

/** A point `t` (0..1) of the way along a polyline, by length, and the heading there (radians). */
export function along(line: Point[], t: number): { p: Point; heading: number } {
  if (line.length === 1) return { p: line[0], heading: Math.PI / 2 };
  const lens = line.slice(1).map((p, i) => Math.hypot(p.x - line[i].x, p.y - line[i].y));
  let left = Math.min(1, Math.max(0, t)) * lens.reduce((a, b) => a + b, 0);
  for (let i = 0; i < lens.length; i++) {
    const a = line[i];
    const b = line[i + 1];
    const heading = Math.atan2(b.y - a.y, b.x - a.x);
    if (left <= lens[i] || i === lens.length - 1) {
      const f = lens[i] ? Math.min(1, left / lens[i]) : 1;
      return { p: { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }, heading };
    }
    left -= lens[i];
  }
  return { p: line[line.length - 1], heading: Math.PI / 2 };
}

/** Where an arriving trade boat is, `seconds` (game time) after the offer came. */
export function boatArriving(path: Point[], plaza: Point, top: boolean, seconds: number) {
  const line = [...reach(path, dockIndex(path, plaza), top), dockPoint(path, plaza)];
  const t = seconds / SAIL_SECONDS;
  return { ...along(line, t), docked: t >= 1 };
}

/** Where a leaving boat is, `seconds` (real time) after it cast off. Null once it is gone. */
export function boatLeaving(path: Point[], plaza: Point, top: boolean, seconds: number) {
  if (seconds >= LEAVE_SECONDS) return null;
  const line = [...reach(path, dockIndex(path, plaza), top), dockPoint(path, plaza)].reverse();
  return along(line, seconds / LEAVE_SECONDS);
}

/** Where a karakoa beaches: a few rows in from the map edge it came from. */
export function landingIndex(path: Point[], top: boolean): number {
  return top ? Math.min(path.length - 2, LANDING_ROWS) : Math.max(1, path.length - 1 - LANDING_ROWS);
}

/** The bank next to the landing, on the side of the barangay. */
export function landingBank(path: Point[], top: boolean, plaza: Point): Point {
  const p = path[landingIndex(path, top)];
  const side = Math.sign(plaza.x + 0.5 - p.x) || 1;
  return { x: p.x + side * 1.6, y: p.y };
}

/** The first walkable tile beside the beached karakoa, on the barangay's side of the river. */
export function landingTile(map: MapState, path: Point[], top: boolean, plaza: Point): Point | null {
  const p = path[landingIndex(path, top)];
  const y = Math.floor(p.y);
  const side = Math.sign(plaza.x + 0.5 - p.x) || 1;
  for (let x = Math.floor(p.x); x >= 0 && x < map.width; x += side) if (isWalkable(map, x, y)) return { x, y };
  return null;
}

/**
 * The raiders' walk from their landing to the target, over land (A*, never across open water),
 * as points through tile centres. Null if there's no way on foot.
 */
export function raidWalk(map: MapState, path: Point[], top: boolean, plaza: Point, target: Point): Point[] | null {
  const from = landingTile(map, path, top, plaza);
  const steps = from && cachedPath(map, from, target);
  return steps ? steps.map((t) => ({ x: t.x + 0.5, y: t.y + 0.5 })) : null;
}

export interface RaidScene {
  /** The war canoe on the river. */
  karakoa: { p: Point; heading: number };
  /** Raiders on land, or none while they're still on the water. */
  raiders: Point[];
}

/** How many raiders to draw for an attacking force. */
export const raiderCount = (warriors: number) => Math.max(3, Math.min(8, warriors));

/** A small fixed spread so raiders walk as a band, not in single file. */
export function raiderOffset(i: number): Point {
  return { x: ((i % 3) - 1) * 0.35, y: Math.floor(i / 3) * 0.35 - 0.3 };
}

/**
 * The raid during its warning: the karakoa sails in from the edge and beaches, then the raiders
 * walk to the target (the Kuta, or the plaza if there is none), arriving as the warning ends.
 * `progress` is 0 when the warning starts and 1 when the raid strikes.
 */
export function raidApproach(path: Point[], plaza: Point, target: Point, top: boolean, progress: number, count: number, walk?: Point[] | null): RaidScene {
  const land = landingIndex(path, top);
  const sail = along(reach(path, land, top), progress / LANDING_SHARE);
  if (progress < LANDING_SHARE) return { karakoa: sail, raiders: [] };
  const bank = landingBank(path, top, plaza);
  const share = (progress - LANDING_SHARE) / (1 - LANDING_SHARE);
  // Over land along the given walk (A*); without one, along the bank and straight across.
  const line = walk && walk.length > 0 ? walk : [bank, { x: bank.x, y: target.y + 0.5 }, { x: target.x + 0.5, y: target.y + 0.5 }];
  const lead = along(line, share).p;
  return {
    karakoa: sail,
    raiders: Array.from({ length: count }, (_, i) => {
      const o = raiderOffset(i);
      return { x: lead.x + o.x, y: lead.y + o.y + 0.4 };
    }),
  };
}
