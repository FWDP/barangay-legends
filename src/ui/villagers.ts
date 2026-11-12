// Where each villager sprite should be, worked out from the game state. Pure and read-only:
// the animation layer calls these every frame and never writes anything back to GameState.
import type { Content } from "../engine/content";
import { buildingWorkers, healthyWorkers, type GameState } from "../engine/game";
import { isHungry } from "../engine/events";
import type { Point } from "../engine/map";
import { homeWarriors } from "../engine/region";

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
export function planVillagers(state: GameState, content: Content, cap = MAX_SPRITES): VillagerPlan[] {
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
  if (state.clearing && !isHungry(state) && healthyWorkers(state) >= content.rules.clearing.workers) {
    for (let k = 0; k < content.rules.clearing.workers; k++) roles.push({ role: "clearing", place: state.clearing });
  }
  const healer = state.buildings.find((b) => defs.get(b.type)?.heals && !b.damaged) ?? null;
  for (let k = 0; k < state.sick.length; k++) roles.push({ role: "sick", place: healer });
  const forts = state.buildings.filter((b) => (defs.get(b.type)?.defense ?? 0) > 0 && !b.damaged);
  const guards = homeWarriors(state);
  for (let k = 0; k < guards; k++) roles.push({ role: "warrior", place: forts.length ? forts[k % forts.length] : null });

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
  const at = (p: Point, dy = 0.2): Point => ({ x: centre(p).x + o.x, y: centre(p).y + dy + o.y });
  const home = at(plan.home, 0.3);
  const square = { x: centre(plaza).x + o.x * 2.2, y: centre(plaza).y + o.y * 2.2 };
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
