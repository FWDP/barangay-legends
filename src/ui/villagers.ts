// Where each villager sprite should be, worked out from the game state. Pure and read-only:
// the animation layer calls these every frame and never writes anything back to GameState.
import type { Content } from "../engine/content";
import { activeJobs } from "../engine/clearing";
import { buildingWorkers, type GameState } from "../engine/game";
import { isHungry } from "../engine/events";
import { tileAt, type MapState, type Point } from "../engine/map";
import { cachedPath, isWalkable } from "../engine/paths";
import { homeWarriors } from "../engine/region";
import { doorOf, isSolid } from "../engine/doors";
import { namedGender, type NamedVillager } from "../engine/people";
import { gatheringSpots, gatherSpot, houseFront } from "../engine/plaza";
import { healerStays } from "../engine/healing";
import { residentAt, type AgeGroup, type Gender, type Resident } from "../engine/residents";
import type { SocialClass } from "../engine/content";

/** Never draw more sprites than this, however big the barangay grows. Night comes from engine/daynight.ts. */
export const MAX_SPRITES = 60;

export type Role = "work" | "clearing" | "sick" | "warrior" | "idle";

export interface VillagerPlan {
  /** Stable sprite number, 0..MAX_SPRITES-1. */
  id: number;
  role: Role;
  /** Tile coordinates (tile centres are at x + 0.5). */
  home: Point;
  /** Workplace, Kuta or healer, if the role has one. */
  place: Point | null;
  /** The doorway tiles of home and place (buildings are solid: people go in by the door). */
  homeDoor?: Point | null;
  placeDoor?: Point | null;
  /** A part-time warrior on night watch at a Kuta (its doorway). */
  watch?: Point | null;
  /**
   * Where this villager stands when they gather at the Bahay ng Datu: an open spot around the
   * house and fire (engine/plaza.ts), or a waiting spot further out once the crowd is full.
   */
  gather?: Point | null;
  /** Who this sprite shows: a woman or man, child, adult or elder (engine/residents.ts), and how they dress. */
  look?: Appearance;
}

/** Who was tapped on the map: any villager (named or not), the datu, their spouse or an attendant. */
export interface Tapped {
  named: NamedVillager | null;
  look: Appearance;
  role: Role | "datu" | "spouse" | "attendant";
  /** The building they work at (its type), if any. */
  place: string | null;
}

/** How a villager sprite looks: from their resident record and the barangay's tradition. */
export interface Appearance {
  gender: Gender;
  age: AgeGroup;
  /** Their family's social class: shown only in dress details and where they live and work. */
  cls?: SocialClass;
  /** The malong, for women and men alike (a tradition with dress "malong"). */
  malong: boolean;
}

/** Where a villager is going, and whether they go inside when they get there. */
export interface Goal {
  p: Point;
  inside: boolean;
}

/** Walking speed in tiles per second. Sick villagers shuffle. */
export const SPEED: Record<Role | "leaving", number> = { work: 1.2, clearing: 1.2, idle: 1, warrior: 1.4, sick: 0.45, leaving: 1.6 };

/** Elders walk slower than everyone else (a share of their role's speed). */
export const ELDER_PACE = 0.65;

/** A plan's walking speed: its role's, slower for elders. */
export const speedOf = (plan: VillagerPlan) => SPEED[plan.role] * (plan.look?.age === "elder" ? ELDER_PACE : 1);


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
  // The sick: a hut is chosen for them below, once their homes are known (healing.ts).
  for (let k = 0; k < state.sick.length; k++) roles.push({ role: "sick", place: null });
  const forts = state.buildings.filter((b) => (defs.get(b.type)?.defense ?? 0) > 0 && !b.damaged);
  // Part-time warriors: between raids they're among the workers above. Called to arms (a raid
  // is coming) they leave work and go to meet it.
  const guards = state.region?.incomingRaid ? homeWarriors(state) : 0;
  // During a raid warriors leave their Kuta to meet the raiders at the landing.
  for (let k = 0; k < guards; k++) roles.push({ role: "warrior", place: rally ?? (forts.length ? forts[k % forts.length] : null) });

  const n = Math.min(total, cap);
  const plans: VillagerPlan[] = [];
  // Doorways, looked up once per building.
  const doors = new Map<string, Point | null>();
  const door = (p: Point | null): Point | null => {
    if (!p) return null;
    const key = `${p.x},${p.y}`;
    if (!doors.has(key)) {
      const b = state.buildings.find((x) => x.x === p.x && x.y === p.y);
      doors.set(key, b && isSolid(content, b) ? doorOf(state, content, b) : null);
    }
    return doors.get(key)!;
  };
  // Gathering spots at the Bahay ng Datu, never on the house (plaza.ts); villagers with no house
  // of their own stay about their gathering spot instead of the plaza tile.
  const gathering = gatheringSpots(state, content);
  const gatherMax = content.rules.plaza.gatherMax;
  // Part-time warriors keep watch at the Kuta at night: up to two a Kuta (the rest sleep).
  const watchers = Math.min(guards > 0 ? 0 : homeWarriors(state), forts.length * 2);
  let watching = 0;
  for (let j = 0; j < n; j++) {
    const i = total > cap ? Math.floor((j * total) / cap) : j;
    const r = roles[i] ?? { role: "idle" as const, place: null };
    const gather = gatherSpot(gathering, j, gatherMax);
    const home = homes[i] ?? (gather ? { x: Math.floor(gather.x), y: Math.floor(gather.y) } : plaza);
    const onWatch = r.role === "work" && watching < watchers ? forts[watching++ % forts.length] : null;
    plans.push({ id: j, role: r.role, home, place: r.place, homeDoor: door(homes[i] ? home : null), placeDoor: r.role === "clearing" ? null : door(r.place), watch: onWatch ? door(onWatch) ?? onWatch : null, gather });
  }
  dressPlans(plans, state, content, total, cap);
  sendSickInside(plans, state, content, door);
  return plans;
}

/**
 * Gives each sprite a person to show (residents.ts), the same sample of villagers the roles
 * come from. Mandirigma are adult men (for now: see content/lore/precolonial-dress.json);
 * work and clearing go to adults (women and men alike), then elders; children are among the
 * idle and the sick, staying near home and the house's clearing. If there are more workers to
 * show than grown-ups, the rest are drawn as adults.
 */
function dressPlans(plans: VillagerPlan[], state: GameState, content: Content, total: number, cap: number): void {
  const malong = content.traditions.find((t) => t.id === state.tradition)?.dress === "malong";
  const n = plans.length;
  const folk = Array.from({ length: n }, (_, j) => residentAt(state, content, total > cap ? Math.floor((j * total) / cap) : j));
  /** The first resident matching any of the tests, in order of the tests; taken out of the pool. */
  const take = (...tests: ((p: Resident) => boolean)[]): Resident | null => {
    for (const ok of tests) {
      const i = folk.findIndex(ok);
      if (i >= 0) return folk.splice(i, 1)[0];
    }
    return null;
  };
  const adult = (g?: Gender) => (p: Resident) => p.age === "adult" && (!g || p.gender === g);
  const look = (p: Resident | null, fallback: Appearance): Appearance => (p ? { gender: p.gender, age: p.age, cls: p.cls, malong } : fallback);
  let alt = 0;
  const order = (r: Role) => (r === "warrior" ? 0 : r === "work" || r === "clearing" ? 1 : r === "sick" ? 2 : 3);
  for (const plan of [...plans].sort((a, b) => order(a.role) - order(b.role) || a.id - b.id)) {
    if (plan.role === "warrior") {
      // Mostly from the warrior class (maharlika, timawa...), men for now.
      const p = take((x) => adult("man")(x) && x.cls === "warrior", adult("man"));
      plan.look = { gender: "man", age: "adult", cls: p?.cls ?? "warrior", malong };
    } else if (plan.role === "work" || plan.role === "clearing") {
      // Women and men both work the fields, the fishing and the crafts: alternate. Free
      // commoners and dependents do most of it; the noble families least.
      const g: Gender = alt++ % 2 === 0 ? "woman" : "man";
      const other: Gender = g === "woman" ? "man" : "woman";
      const worker = (x: Resident) => x.cls !== "nobility";
      plan.look = look(
        take((x) => adult(g)(x) && worker(x), (x) => adult(other)(x) && worker(x), adult(), (x) => x.age === "elder"),
        { gender: g, age: "adult", cls: "commoner", malong },
      );
    } else plan.look = look(take((x) => x.age === "child", (x) => x.age === "elder", () => true), { gender: plan.id % 2 ? "man" : "woman", age: "adult", cls: "commoner", malong });
  }
  houseByClass(plans, state, content);
}

/**
 * Noble families live nearest the Bahay ng Datu, and dependents near them (in the households
 * they serve); everyone else keeps the homes left over. Only homes that are houses are swapped.
 */
function houseByClass(plans: VillagerPlan[], state: GameState, content: Content): void {
  const housed = plans.filter((p) => p.homeDoor);
  if (housed.length < 2) return;
  const front = houseFront(state, content);
  const near = (h: Point) => Math.hypot(h.x + 0.5 - front.x, h.y + 0.5 - front.y);
  const homes = housed.map((p) => ({ home: p.home, door: p.homeDoor })).sort((a, b) => near(a.home) - near(b.home));
  const rank = (p: VillagerPlan) => (p.look?.cls === "nobility" ? 0 : p.look?.cls === "dependent" ? 1 : 2);
  const ordered = [...housed].sort((a, b) => rank(a) - rank(b) || a.id - b.id);
  ordered.forEach((p, i) => {
    p.home = homes[i].home;
    p.homeDoor = homes[i].door;
  });
}

/**
 * The sick go into a healer's hut: as many sprites as the share of the sick who are inside a hut
 * (healing.ts), each to the nearest hut from their home that still has room for its share. The
 * rest have no place: they wait inside their own homes.
 */
function sendSickInside(plans: VillagerPlan[], state: GameState, content: Content, door: (p: Point | null) => Point | null): void {
  const sick = plans.filter((p) => p.role === "sick");
  if (sick.length === 0 || state.sick.length === 0) return;
  const stays = healerStays(state, content).filter((h) => h.count > 0);
  const inside = stays.reduce((n, h) => n + h.count, 0);
  const share = sick.length / state.sick.length;
  const room = stays.map((h) => Math.ceil(h.count * share));
  let budget = Math.round(inside * share);
  for (const plan of sick) {
    if (budget <= 0) break;
    let best = -1;
    let bestD = Infinity;
    stays.forEach((h, k) => {
      const d = Math.abs(h.hut.x - plan.home.x) + Math.abs(h.hut.y - plan.home.y);
      if (room[k] > 0 && d < bestD) [best, bestD] = [k, d];
    });
    if (best < 0) break;
    room[best]--;
    budget--;
    plan.place = { x: stays[best].hut.x, y: stays[best].hut.y };
    plan.placeDoor = door(plan.place);
  }
}

/** A spot just in front of a doorway, leaning toward the building (people go in here). */
function doorSpot(door: Point, building: Point, o: Point): Point {
  const dx = building.x - door.x;
  const dy = building.y - door.y;
  return { x: door.x + 0.5 + dx * 0.32 + o.x * 0.25, y: door.y + 0.5 + dy * 0.32 + o.y * 0.2 };
}

/**
 * Where a villager is heading at time t, and whether they go indoors there. By day: workers at
 * their workplace's doorway (never on top of the building), idle villagers between home and the
 * plaza. At night most go home and inside; a few sit by the plaza fire; warriors on watch stay at
 * the Kuta; raids and the sick keep their own places. Buildings without a doorway (old saves,
 * plaza homes) fall back to the building's own tile.
 */
export function goal(plan: VillagerPlan, t: number, night: boolean, plaza: Point, hungry: boolean): Goal {
  const o = jitter(plan.id);
  const at = (b: Point, d: Point | null | undefined, dy = 0.2): Point => (d ? doorSpot(d, b, o) : destinationAt(b, o, dy));
  const fireside = plan.id % 6 === 0;
  if (night && plan.role !== "warrior" && plan.role !== "sick") {
    if (plan.watch) return { p: { x: plan.watch.x + 0.5 + o.x * 0.4, y: plan.watch.y + 0.5 + o.y * 0.3 }, inside: false };
    if (fireside) return { p: gatherAt(plan, plaza, o), inside: false };
    return { p: at(plan.home, plan.homeDoor, 0.3), inside: !!plan.homeDoor };
  }
  const cycle = (t / 80 + ((plan.id * 0.618) % 1)) % 1;
  switch (plan.role) {
    case "warrior":
      return { p: plan.place ? at(plan.place, plan.placeDoor, 0.35) : gatherAt(plan, plaza, o), inside: false };
    case "sick":
      // Into the healer's hut, or (no room there) inside their own home; never a crowd outside.
      return plan.place ? { p: at(plan.place, plan.placeDoor, 0.4), inside: !!plan.placeDoor } : { p: at(plan.home, plan.homeDoor, 0.3), inside: !!plan.homeDoor };
    case "clearing":
      return { p: destinationAt(plan.place!, o, 0.3), inside: false };
    case "work":
      if (hungry) return { p: gatherAt(plan, plaza, o), inside: false };
      // Most of the day at work, a short break at the plaza.
      return { p: cycle < 0.9 ? at(plan.place!, plan.placeDoor) : gatherAt(plan, plaza, o), inside: false };
    case "idle":
      // Mostly about their home, some time at the plaza; elders rest by the datu's house more
      // (children keep to the same two places: home and the gathering spots).
      return { p: cycle < (plan.look?.age === "elder" ? 0.35 : 0.7) ? at(plan.home, plan.homeDoor, 0.3) : gatherAt(plan, plaza, o), inside: false };
  }
}

/**
 * A villager's place at a gathering: their own spot around the Bahay ng Datu (a little jitter,
 * kept on its tile), or for a plan without one the plaza's 3 × 3 crowd (tests, old callers).
 */
function gatherAt(plan: VillagerPlan, plaza: Point, o: Point): Point {
  const g = plan.gather;
  if (!g) return square(plaza, o);
  const keep = (v: number, base: number) => Math.min(base + 0.92, Math.max(base + 0.08, v));
  return { x: keep(g.x + o.x * 0.15, Math.floor(g.x)), y: keep(g.y + o.y * 0.15, Math.floor(g.y)) };
}

/** A crowd around the fire, within the plaza's own 3 × 3 (always cleared land). */
function square(plaza: Point, o: Point): Point {
  return {
    x: Math.min(plaza.x + 1.9, Math.max(plaza.x - 0.9, plaza.x + 0.5 + o.x * 2.2)),
    y: Math.min(plaza.y + 1.9, Math.max(plaza.y - 0.9, plaza.y + 0.5 + o.y * 2.2)),
  };
}

/** A spot on a tile (kept inside it, so a house by the river never sends anyone onto the water). */
function destinationAt(p: Point, o: Point, dy: number): Point {
  const inTile = (v: number, base: number) => Math.min(base + 0.92, Math.max(base + 0.08, v));
  return { x: inTile(p.x + 0.5 + o.x, p.x), y: inTile(p.y + 0.5 + dy + o.y, p.y) };
}

/** Does this villager carry a torch when walking in the dark? About one in four; never the sick. */
export const carriesTorch = (plan: VillagerPlan) => plan.id % 4 === 1 && plan.role !== "sick";

/** Where a villager is heading at time t (see goal). */
export function destination(plan: VillagerPlan, t: number, night: boolean, plaza: Point, hungry: boolean): Point {
  return goal(plan, t, night, plaza, hungry).p;
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
  /** The solid-building tiles the route was planned around. */
  blocked?: Uint8Array;
  moving: boolean;
}

export const newWalker = (p: Point): Walker => ({ p, route: [], goal: null, map: null, moving: false });

const tileOf = (map: MapState, p: Point): Point => ({
  x: Math.min(map.width - 1, Math.max(0, Math.floor(p.x))),
  y: Math.min(map.height - 1, Math.max(0, Math.floor(p.y))),
});

/** The route from `from` to `to`: through tile centres, never over open water. Null if there is none. */
export function routeTo(map: MapState, from: Point, to: Point, blocked?: Uint8Array): Point[] | null {
  const path = cachedPath(map, tileOf(map, from), tileOf(map, to), blocked);
  if (!path) return null;
  return [...path.slice(1, -1).map((t) => ({ x: t.x + 0.5, y: t.y + 0.5 })), to];
}

/**
 * One frame of walking toward `to`. The route is planned once per goal tile (A* results are
 * cached per map) and re-planned when the map changes. With no way there (the river is in the
 * way and there's no bridge), the walker stays put rather than wade across. On Daan it walks
 * `roadSpeed` times faster.
 */
export function stepWalker(w: Walker, to: Point, map: MapState, speed: number, dt: number, roadSpeed = 1, blocked?: Uint8Array): Walker {
  const goal = `${Math.floor(to.x)},${Math.floor(to.y)}`;
  let route: Point[];
  // Buildings are solid: routes go around them (and are planned again when buildings change).
  if (w.goal !== goal || w.map !== map || w.blocked !== blocked) route = routeTo(map, w.p, to, blocked) ?? [];
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
  return { p, route: rest, goal, map, blocked, moving: rest.length > 0 };
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
    if (p.look && p.look.gender !== namedGender(content, v, state.map.seed)) return false;
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
    // Their kind of work and their own gender first; then any sprite (drawn as them).
    const loose = (p: VillagerPlan) => (v.sick ? p.role === "sick" : p.role !== "sick");
    for (const ok of [(p: VillagerPlan) => fits(p, v), loose, () => true]) {
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
