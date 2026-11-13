// Where each villager sprite should be, worked out from the game state. Pure and read-only:
// the animation layer calls these every frame and never writes anything back to GameState.
import type { Content } from "../engine/content";
import { activeJobs } from "../engine/clearing";
import { buildingWorkers, type GameState } from "../engine/game";
import { isHungry } from "../engine/events";
import { tileAt, type MapState, type Point } from "../engine/map";
import { cachedPath, isWalkable } from "../engine/paths";
import { homeWarriors } from "../engine/region";
import type { NamedVillager } from "../engine/people";

/** Length of the day/night tint cycle (the CSS day-night animation), in real seconds. */
export const DAY_SECONDS = 240;
/** Never draw more sprites than this, however big the barangay grows. */
export const MAX_SPRITES = 60;

/** Where in the day/night cycle we are (0..1). Matches the tint, which is keyed on the same clock. */
export const dayPhase = (nowMs: number) => (nowMs / 1000 / DAY_SECONDS) % 1;
/** Villagers head home at dusk and come out at dawn (the tint is darkest from 62% to 82%). */
export const isNight = (phase: number) => phase >= 0.55 && phase < 0.88;

export type Role = "work" | "clearing" | "sick" | "warrior" | "idle";

export interface VillagerPlan {
  /** Stable sprite number, 0..MAX_SPRITES-1. */
  id: number;
  role: Role;
  /** Tile coordinates (tile centres are at x + 0.5). */
  home: Point;
  /** Workplace, Kuta or healer, if the role has one. */
  place: Point | null;
}

/** Walking speed in tiles per second. Sick villagers shuffle. */
export const SPEED: Record<Role | "leaving", number> = { work: 1.2, clearing: 1.2, idle: 1, warrior: 1.4, sick: 0.45, leaving: 1.6 };

const centre = (p: Point): Point => ({ x: p.x + 0.5, y: p.y + 0.5 });

/** A small fixed offset per villager so a crowd doesn't stand on one pixel. */
export function jitter(id: number): Point {
  const a = Math.imul(id + 1, 2654435761) >>> 0;
  return { x: ((a & 0xff) / 255 - 0.5) * 0.6, y: (((a >>> 8) & 0xff) / 255 - 0.5) * 0.5 };
}

/** Villagers at home in the barangay: everyone except warriors away guarding a tributary. */
export function presentVillagers(state: GameState): number {
  const away = state.warriors - homeWarriors(state);
  return Math.max(0, state.villagers - away);
}

/**
 * One plan per sprite. Roles follow the real numbers: workers per building, villagers clearing
 * land, the sick, warriors at home, and the rest idle. Above MAX_SPRITES an even sample is drawn.
 */
export function planVillagers(state: GameState, content: Content, cap = MAX_SPRITES, rally: Point | null = null): VillagerPlan[] {
  const defs = new Map(content.buildings.map((d) => [d.id, d]));
  const plaza = state.map.plaza;
  const total = presentVillagers(state);

  const homes: Point[] = [];
  for (const b of state.buildings) for (let i = 0; i < (defs.get(b.type)?.housing ?? 0); i++) homes.push(b);

  const roles: { role: Role; place: Point | null }[] = [];
  const workers = buildingWorkers(state, content);
  state.buildings.forEach((b, i) => {
    for (let k = 0; k < workers[i]; k++) roles.push({ role: "work", place: b });
  });
  if (!isHungry(state)) {
    for (const job of activeJobs(state, content)) {
      for (let k = 0; k < content.rules.clearing.workers; k++) roles.push({ role: "clearing", place: job });
    }
  }
  const healer = state.buildings.find((b) => defs.get(b.type)?.heals && !b.damaged) ?? null;
  for (let k = 0; k < state.sick.length; k++) roles.push({ role: "sick", place: healer });
  const forts = state.buildings.filter((b) => (defs.get(b.type)?.defense ?? 0) > 0 && !b.damaged);
  // Part-time warriors: between raids they're among the workers above. Called to arms (a raid
  // is coming) they leave work and go to meet it.
  const guards = state.region?.incomingRaid ? homeWarriors(state) : 0;
  // During a raid warriors leave their Kuta to meet the raiders at the landing.
  for (let k = 0; k < guards; k++) roles.push({ role: "warrior", place: rally ?? (forts.length ? forts[k % forts.length] : null) });

  const n = Math.min(total, cap);
  const plans: VillagerPlan[] = [];
  for (let j = 0; j < n; j++) {
    const i = total > cap ? Math.floor((j * total) / cap) : j;
    const r = roles[i] ?? { role: "idle" as const, place: null };
    plans.push({ id: j, role: r.role, home: homes[i] ?? plaza, place: r.place });
  }
  return plans;
}

/**
 * Where a villager is heading at time t (seconds): home at night, otherwise their routine.
 * Workers spend most of the day at work with a break at the plaza; idle villagers drift
 * between home and plaza; the sick go to the healer (or rest at home); warriors man the Kuta.
 */
export function destination(plan: VillagerPlan, t: number, night: boolean, plaza: Point, hungry: boolean): Point {
  const o = jitter(plan.id);
  // Stay inside the tile, so a house by the river never sends anyone onto the water.
  const inTile = (v: number, base: number) => Math.min(base + 0.92, Math.max(base + 0.08, v));
  const at = (p: Point, dy = 0.2): Point => ({ x: inTile(centre(p).x + o.x, p.x), y: inTile(centre(p).y + dy + o.y, p.y) });
  const home = at(plan.home, 0.3);
  // A crowd around the fire, within the plaza's own 3 × 3 (always cleared land).
  const square = {
    x: Math.min(plaza.x + 1.9, Math.max(plaza.x - 0.9, centre(plaza).x + o.x * 2.2)),
    y: Math.min(plaza.y + 1.9, Math.max(plaza.y - 0.9, centre(plaza).y + o.y * 2.2)),
  };
  // Each villager keeps their own rhythm, so they don't all move at once.
  const cycle = (t / 80 + ((plan.id * 0.618) % 1)) % 1;
  if (night && plan.role !== "warrior") return home;
  switch (plan.role) {
    case "warrior":
      return plan.place ? at(plan.place, 0.35) : square;
    case "sick":
      return plan.place ? at(plan.place, 0.4) : home;
    case "clearing":
      return at(plan.place!, 0.3);
    case "work":
      if (hungry) return square;
      return cycle < 0.8 ? at(plan.place!) : square;
    case "idle":
      return cycle < 0.45 ? home : square;
  }
}

/** The nearest point just off the map's edge, where leaving villagers walk to. */
export function exitPoint(from: Point, map: { width: number; height: number }): Point {
  const options = [
    { d: from.x, p: { x: -1, y: from.y } },
    { d: map.width - from.x, p: { x: map.width + 1, y: from.y } },
    { d: from.y, p: { x: from.x, y: -1 } },
    { d: map.height - from.y, p: { x: from.x, y: map.height + 1 } },
  ];
  return options.sort((a, b) => a.d - b.d)[0].p;
}

/**
 * One frame of walking: along x first, then y, like following the paths between plots.
 * Returns the new position and whether the villager is still on the move.
 */
export function walk(from: Point, to: Point, speed: number, dt: number): { p: Point; moving: boolean } {
  let left = speed * dt;
  let { x, y } = from;
  const dx = to.x - x;
  if (Math.abs(dx) > 1e-3) {
    const step = Math.min(left, Math.abs(dx));
    x += Math.sign(dx) * step;
    left -= step;
  }
  const dy = to.y - y;
  if (left > 0 && Math.abs(dy) > 1e-3) {
    const step = Math.min(left, Math.abs(dy));
    y += Math.sign(dy) * step;
  }
  return { p: { x, y }, moving: Math.abs(to.x - x) > 1e-3 || Math.abs(to.y - y) > 1e-3 };
}

// ---------- Walking along paths ----------

/** A sprite walking along an A* route (display only). */
export interface Walker {
  p: Point;
  /** Points still to walk to: tile centres, then the exact spot. */
  route: Point[];
  /** The tile the route leads to, and the map it was planned on (a new map means re-planning). */
  goal: string | null;
  map: MapState | null;
  moving: boolean;
}

export const newWalker = (p: Point): Walker => ({ p, route: [], goal: null, map: null, moving: false });

const tileOf = (map: MapState, p: Point): Point => ({
  x: Math.min(map.width - 1, Math.max(0, Math.floor(p.x))),
  y: Math.min(map.height - 1, Math.max(0, Math.floor(p.y))),
});

/** The route from `from` to `to`: through tile centres, never over open water. Null if there is none. */
export function routeTo(map: MapState, from: Point, to: Point): Point[] | null {
  const path = cachedPath(map, tileOf(map, from), tileOf(map, to));
  if (!path) return null;
  return [...path.slice(1, -1).map((t) => ({ x: t.x + 0.5, y: t.y + 0.5 })), to];
}

/**
 * One frame of walking toward `to`. The route is planned once per goal tile (A* results are
 * cached per map) and re-planned when the map changes. With no way there (the river is in the
 * way and there's no bridge), the walker stays put rather than wade across. On Daan it walks
 * `roadSpeed` times faster.
 */
export function stepWalker(w: Walker, to: Point, map: MapState, speed: number, dt: number, roadSpeed = 1): Walker {
  const goal = `${Math.floor(to.x)},${Math.floor(to.y)}`;
  let route: Point[];
  if (w.goal !== goal || w.map !== map) route = routeTo(map, w.p, to) ?? [];
  else route = w.route.length ? [...w.route.slice(0, -1), to] : [];
  let p = w.p;
  let left = speed * dt;
  let i = 0;
  while (left > 1e-9 && i < route.length) {
    const target = route[i];
    const boost = tileAt(map, Math.floor(p.x), Math.floor(p.y)) === "daan" ? roadSpeed : 1;
    const d = Math.hypot(target.x - p.x, target.y - p.y);
    const reach = left * boost;
    if (reach >= d) {
      p = target;
      left -= d / boost;
      i++;
    } else {
      p = { x: p.x + ((target.x - p.x) / d) * reach, y: p.y + ((target.y - p.y) / d) * reach };
      left = 0;
    }
  }
  const rest = route.slice(i);
  return { p, route: rest, goal, map, moving: rest.length > 0 };
}

/** The nearest walkable tile on the map's edge: where newcomers come in and leavers go out. */
export function edgeTile(map: MapState, from: Point): Point {
  let best: Point = { x: 0, y: 0 };
  let bestD = Infinity;
  const consider = (x: number, y: number) => {
    if (!isWalkable(map, x, y)) return;
    const d = Math.abs(x + 0.5 - from.x) + Math.abs(y + 0.5 - from.y);
    if (d < bestD) [best, bestD] = [{ x, y }, d];
  };
  for (let x = 0; x < map.width; x++) {
    consider(x, 0);
    consider(x, map.height - 1);
  }
  for (let y = 0; y < map.height; y++) {
    consider(0, y);
    consider(map.width - 1, y);
  }
  return best;
}

// ---------- Named villagers ----------

/**
 * Which sprite shows each named villager (sprite id → villager): one doing their kind of work
 * if there is one (a farmer at a Palayan, a fisher at a Fishing Dock, the sick at the healer),
 * otherwise any sprite left. Each villager starts looking at a spot of their own (by id), so
 * the same villager tends to keep the same sprite as the barangay changes.
 */
export function namedSprites(plans: VillagerPlan[], state: GameState, content: Content): Map<number, NamedVillager> {
  const out = new Map<number, NamedVillager>();
  if (plans.length === 0 || state.named.length === 0) return out;
  const typeAt = new Map(state.buildings.map((b) => [`${b.x},${b.y}`, b.type]));
  const workplace = (p: VillagerPlan) => (p.place ? typeAt.get(`${p.place.x},${p.place.y}`) : undefined);
  const roleBuilding = content.villagers.roleBuildings;
  const fits = (p: VillagerPlan, v: NamedVillager) => {
    if (v.sick) return p.role === "sick";
    if (p.role === "sick") return false;
    if (v.role === "warrior") return p.role === "warrior" || p.role === "work";
    const b = roleBuilding[v.role];
    if (b) return p.role === "work" && workplace(p) === b;
    return p.role !== "warrior";
  };
  const used = new Set<number>();
  for (const v of [...state.named].sort((a, b) => a.id - b.id)) {
    const start = (Math.imul(v.id, 2654435761) >>> 0) % plans.length;
    let pick: VillagerPlan | null = null;
    for (const ok of [(p: VillagerPlan) => fits(p, v), () => true]) {
      for (let k = 0; k < plans.length && !pick; k++) {
        const p = plans[(start + k) % plans.length];
        if (!used.has(p.id) && ok(p)) pick = p;
      }
      if (pick) break;
    }
    if (!pick) break;
    used.add(pick.id);
    out.set(pick.id, v);
  }
  return out;
}
