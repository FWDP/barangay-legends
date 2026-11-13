// Replays of expeditions (engine/expeditions.ts): a timed script of boats and people, built from
// a record and the village it happened in. Display only: it reads the record and the village and
// never changes either; the outcome is the record's, decided by the engine beforehand. Pure, so
// tests can check it, and the same script gives the stills shown with reduced motion.
import type { Content } from "../engine/content";
import type { GameState } from "../engine/game";
import type { Expedition } from "../engine/expeditions";
import { closestLandings } from "../engine/border";
import { doorOf, solidTiles } from "../engine/doors";
import { inBounds, type Point } from "../engine/map";
import { isWalkable } from "../engine/paths";
import { edgeTile, routeTo } from "./villagers";
import { bandAt, dockIndex, dockPoint, lootTarget, reach, riverPath, sailToLanding } from "./visitors";

export type ActorLook = "envoy" | "raider" | "warrior" | "defender" | "ally";
export type BoatKind = "bangka" | "balangay" | "karakoa";
export type Phase = "arrive" | "walk" | "datu" | "return" | "march" | "clash" | "loot" | "retreat" | "leave";

/** A point in the replay's time (seconds from its start). */
export interface Key {
  t: number;
  p: Point;
}

export interface Actor {
  id: number;
  look: ActorLook;
  label?: string;
  keys: Key[];
  /** Shown from `start` until `end` (seconds). */
  start: number;
  end: number;
  /** Carrying goods from this time on. */
  bundleFrom?: number;
}

export interface BoatTrack {
  kind: BoatKind;
  keys: Key[];
  start: number;
  end: number;
}

export interface Script {
  duration: number;
  actors: Actor[];
  boats: BoatTrack[];
  clash: { p: Point; start: number; end: number } | null;
  phases: { t: number; phase: Phase }[];
  /** Moments shown as stills with reduced motion. */
  stills: number[];
  /** People drawn, and people there in all (the report gives the full counts). */
  shown: number;
  total: number;
}

export interface Frame {
  boats: { kind: BoatKind; p: Point; heading: number }[];
  people: { id: number; look: ActorLook; p: Point; moving: boolean; label?: string; bundle: boolean }[];
  sparks: Point | null;
  phase: Phase;
}

const SAIL = 5;
const WALK = 2.5;
const MAX_WALK = 8;
const PAUSE = 2;
const CLASH = 3;
const LEAVE = 5;

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const length = (line: Point[]) => line.slice(1).reduce((n, p, i) => n + dist(line[i], p), 0);

/** Keys along a line from time t0, at `speed` tiles a second (never longer than MAX_WALK, so big maps don't drag). */
function timed(line: Point[], t0: number, speed = WALK, maxSeconds = MAX_WALK): Key[] {
  if (line.length === 0) return [];
  const total = length(line);
  const v = Math.max(speed, total / maxSeconds, 1e-6);
  const keys: Key[] = [{ t: t0, p: line[0] }];
  let t = t0;
  for (let i = 1; i < line.length; i++) {
    t += dist(line[i - 1], line[i]) / v;
    keys.push({ t, p: line[i] });
  }
  return keys;
}

const lastT = (keys: Key[]) => keys[keys.length - 1]?.t ?? 0;
const lastP = (keys: Key[]) => keys[keys.length - 1].p;

/** Where a set of keys is at time t, and whether it is moving. */
export function at(keys: Key[], t: number): { p: Point; heading: number; moving: boolean } {
  if (t <= keys[0].t) return { p: keys[0].p, heading: heading(keys, 0), moving: false };
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1];
    const b = keys[i];
    if (t <= b.t) {
      const f = b.t > a.t ? (t - a.t) / (b.t - a.t) : 1;
      return { p: { x: a.p.x + (b.p.x - a.p.x) * f, y: a.p.y + (b.p.y - a.p.y) * f }, heading: heading(keys, i - 1), moving: dist(a.p, b.p) > 1e-6 };
    }
  }
  return { p: lastP(keys), heading: heading(keys, keys.length - 2), moving: false };
}

function heading(keys: Key[], i: number): number {
  for (let k = Math.max(0, i); k < keys.length - 1; k++) {
    const a = keys[k].p;
    const b = keys[k + 1].p;
    if (dist(a, b) > 1e-6) return Math.atan2(b.y - a.y, b.x - a.x);
  }
  return -Math.PI / 2;
}

/** The nearest open land tile to a point (its centre), for stepping ashore. */
function landNear(village: GameState, p: Point, blocked: Uint8Array): Point {
  const { map } = village;
  const cx = Math.floor(p.x);
  const cy = Math.floor(p.y);
  for (let r = 0; r <= 6; r++) {
    let best: Point | null = null;
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== r || !isWalkable(map, x, y) || blocked[y * map.width + x]) continue;
        const c = { x: x + 0.5, y: y + 0.5 };
        if (!best || dist(c, p) < dist(best, p)) best = c;
      }
    }
    if (best) return best;
  }
  return { x: map.plaza.x + 0.5, y: map.plaza.y + 0.5 };
}

/** A walk over land, around buildings (the same A* as everyone), or straight if there's no way. */
function walkLine(village: GameState, from: Point, to: Point, blocked: Uint8Array): Point[] {
  return [from, ...(routeTo(village.map, from, to, blocked) ?? [to])];
}

/** Shares `cap` sprites among groups in proportion, keeping at least one for any group that has people. */
export function share(counts: number[], cap: number): number[] {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total <= cap) return [...counts];
  const out = counts.map((n) => (n > 0 ? Math.max(1, Math.floor((n * cap) / total)) : 0));
  while (out.reduce((a, b) => a + b, 0) > cap) {
    const i = out.indexOf(Math.max(...out));
    out[i]--;
  }
  return out;
}

/** Of `shown` sprites standing for `count` people, how many fall when `losses` do. */
const shownLoss = (losses: number, count: number, shown: number) => (losses <= 0 || shown <= 0 ? 0 : Math.min(shown, Math.max(1, Math.round((losses * shown) / Math.max(1, count)))));

/** A boat's way in from the map's edge to `to`: along the river if there is one, else in from the sea. */
function waterIn(village: GameState, to: Point, dock: boolean): Point[] {
  const path = riverPath(village.map);
  const { plaza, height } = village.map;
  if (path.length > 2) return dock ? [...reach(path, dockIndex(path, plaza), false), dockPoint(path, plaza)] : sailToLanding(path, to, false);
  return [
    { x: to.x + 0.5, y: height + 1.5 },
    { x: to.x + 0.5, y: Math.min(height - 0.5, to.y + 1.3) },
  ];
}

/** The building standing on a tile, if any. */
const buildingAt = (village: GameState, p: Point) => village.buildings.find((b) => b.x === p.x && b.y === p.y);

/**
 * The replay script for an expedition, in `village` (the target's village: an AI barangay's
 * generated one, or the player's own for raids on them). At most `cap` people are drawn.
 */
export function buildReplay(e: Expedition, village: GameState, content: Content, cap = content.rules.expeditions.maxSprites): Script {
  return e.kind === "trade" ? tradeScript(e, village, content, cap) : raidScript(e, village, content, cap);
}

function tradeScript(e: Expedition, village: GameState, content: Content, cap: number): Script {
  const blocked = solidTiles(village, content);
  const { plaza } = village.map;
  const line = waterIn(village, plaza, true);
  const boatIn = timed(line, 0, 0, SAIL);
  const sailEnd = lastT(boatIn);
  const dock = lastP(boatIn);
  const shore = landNear(village, dock, blocked);
  const n = Math.min(e.party.count, cap);
  const actors: Actor[] = [];
  let atDatu = sailEnd;
  let back = sailEnd;
  for (let i = 0; i < n; i++) {
    // To the Bahay ng Datu at the plaza, along the Daan where there is one.
    const spot = { x: plaza.x + 0.25 + (i % 3) * 0.25, y: plaza.y + 1.1 + Math.floor(i / 3) * 0.2 };
    const out = timed([dock, ...walkLine(village, shore, spot, blocked)], sailEnd + i * 0.3);
    const arrive = lastT(out);
    const home = timed([...walkLine(village, spot, shore, blocked), dock], arrive + PAUSE);
    atDatu = Math.max(atDatu, arrive);
    back = Math.max(back, lastT(home));
    actors.push({ id: i, look: "envoy", label: e.party.named[i]?.name, keys: [...out, ...home], start: sailEnd, end: lastT(home), bundleFrom: arrive + PAUSE * 0.5 });
  }
  const leaveAt = back + 0.3;
  const boatOut = timed([...line].reverse(), leaveAt, 0, LEAVE);
  const boat: BoatTrack = { kind: e.boat === "balangay" ? "balangay" : "bangka", keys: [...boatIn, ...boatOut], start: 0, end: lastT(boatOut) };
  return {
    duration: boat.end,
    actors,
    boats: [boat],
    clash: null,
    phases: [
      { t: 0, phase: "arrive" },
      { t: sailEnd, phase: "walk" },
      { t: atDatu, phase: "datu" },
      { t: atDatu + PAUSE, phase: "return" },
      { t: leaveAt, phase: "leave" },
    ],
    stills: [sailEnd, atDatu + PAUSE * 0.5, Math.min(back, atDatu + PAUSE + 1.5), leaveAt + LEAVE * 0.4],
    shown: n,
    total: e.party.count,
  };
}

function raidScript(e: Expedition, village: GameState, content: Content, cap: number): Script {
  const b = e.battle!;
  const blocked = solidTiles(village, content);
  const { map } = village;
  const valid = (p: Point | null) => p && inBounds(map, p.x, p.y) && isWalkable(map, p.x, p.y) && !blocked[p.y * map.width + p.x];
  const landing = valid(e.landing) ? e.landing! : (closestLandings(map, 1)[0] ?? map.plaza);
  const L = { x: landing.x + 0.5, y: landing.y + 0.5 };
  const mine = e.side === "out";
  const attackLook: ActorLook = mine ? "warrior" : "raider";
  const defendLook: ActorLook = mine ? "defender" : "warrior";

  const joined = b.defenders.posts.filter((p) => p.arrives);
  const late = b.defenders.posts.filter((p) => !p.arrives);
  const joinedCount = joined.reduce((n, p) => n + p.warriors, 0);
  const lateCount = late.reduce((n, p) => n + p.warriors, 0);
  const allies = b.allies.filter((a) => a.arrives);
  const allyCount = allies.reduce((n, a) => n + a.warriors, 0);
  const [aN, dN, lN, alN] = share([e.party.count, joinedCount, lateCount, allyCount], cap);

  // The karakoa sails in and beaches beside the landing.
  const line = waterIn(village, landing, false);
  const boatIn = timed(line, 0, 0, SAIL);
  const sailEnd = lastT(boatIn);
  const beach = lastP(boatIn);
  const ashore = sailEnd + 1.2;
  // Defenders face the raiders from the village side of the landing.
  const toward = (() => {
    const v = { x: map.plaza.x + 0.5 - L.x, y: map.plaza.y + 0.5 - L.y };
    const d = Math.hypot(v.x, v.y) || 1;
    return { x: v.x / d, y: v.y / d };
  })();
  const front = landNear(village, { x: L.x + toward.x * 1.1, y: L.y + toward.y * 1.1 }, blocked);
  const defendSpots = bandAt({ x: Math.floor(front.x), y: Math.floor(front.y) }, Math.max(1, dN + alN));

  // Who is drawn falling, and which named villagers they are.
  const aFall = shownLoss(b.attackerLosses, e.party.count, aN);
  const dFall = shownLoss(b.defenderLosses, b.defenders.count, dN);
  const labels = (named: { name: string; fell: boolean }[], n: number, fall: number): (string | undefined)[] => {
    const out: (string | undefined)[] = Array(n).fill(undefined);
    const fallen = named.filter((v) => v.fell);
    const alive = named.filter((v) => !v.fell);
    // The last `fall` sprites fall: fallen named villagers go there, the living ones up front.
    fallen.slice(0, fall).forEach((v, i) => (out[n - 1 - i] = v.name));
    alive.slice(0, n - fall).forEach((v, i) => (out[i] = v.name));
    return out;
  };
  const aLabels = labels(e.party.named, aN, aFall);
  const dLabels = labels(b.defenders.named, dN, dFall);

  const actors: Actor[] = [];
  const band = bandAt(landing, Math.max(1, aN));
  const attackers: Actor[] = band.slice(0, aN).map((p, i) => ({ id: i, look: attackLook, label: aLabels[i], keys: [{ t: sailEnd, p: beach }, { t: ashore, p }], start: sailEnd, end: 0 }));

  // Defenders walk out from their Kuta (its doorway) to the landing; allies come from the edge or by sea.
  const defenders: Actor[] = [];
  const allyBoats: BoatTrack[] = [];
  let arriveBy = ashore;
  const fromPost = (from: Point) => {
    const kuta = buildingAt(village, from);
    const door = kuta ? doorOf(village, content, kuta) : from;
    return { x: door.x + 0.5, y: door.y + 0.5 };
  };
  const counts = share(joined.map((p) => p.warriors), dN);
  let k = 0;
  joined.forEach((post, j) => {
    const start = fromPost(post.from);
    for (let i = 0; i < counts[j]; i++, k++) {
      const spot = defendSpots[k];
      const keys = timed(walkLine(village, start, spot, blocked), 0, WALK, ashore);
      arriveBy = Math.max(arriveBy, lastT(keys));
      defenders.push({ id: 1000 + k, look: defendLook, label: dLabels[k], keys, start: 0, end: 0 });
    }
  });
  allies.forEach((a, j) => {
    const n = share(allies.map((x) => x.warriors), alN)[j];
    for (let i = 0; i < n; i++, k++) {
      const spot = defendSpots[k] ?? front;
      if (a.by === "sea") {
        const from = { x: L.x + (j % 2 ? 1.5 : -1.5), y: map.height + 1.5 };
        const shore = { x: spot.x, y: Math.min(map.height - 0.5, spot.y + 0.8) };
        if (i === 0) allyBoats.push({ kind: "bangka", keys: timed([from, shore], 0, 0, SAIL), start: 0, end: Infinity });
        defenders.push({ id: 3000 + k, look: "ally", keys: [...timed([from, shore], 0, 0, SAIL), { t: SAIL + 0.8, p: spot }], start: SAIL, end: 0 });
      } else {
        const edge = edgeTile(map, spot);
        const keys = timed(walkLine(village, { x: edge.x + 0.5, y: edge.y + 0.5 }, spot, blocked), 0, WALK, ashore);
        arriveBy = Math.max(arriveBy, lastT(keys));
        defenders.push({ id: 3000 + k, look: "ally", keys, start: 0, end: 0 });
      }
    }
  });

  const clashStart = Math.max(ashore, arriveBy) + 0.3;
  const clashEnd = clashStart + CLASH;
  // Those who fall leave at the end of the clash.
  attackers.forEach((a, i) => (a.end = i >= aN - aFall ? clashEnd : 0));
  defenders.filter((d) => d.look === defendLook).forEach((d, i) => (d.end = i >= dN - dFall ? clashEnd : 0));

  // Warriors too far away arrive after it is over.
  const lateCounts = share(late.map((p) => p.warriors), lN);
  late.forEach((post, j) => {
    const start = fromPost(post.from);
    for (let i = 0; i < lateCounts[j]; i++, k++) {
      const spot = { x: front.x + ((i % 3) - 1) * 0.3, y: front.y + 0.3 };
      const walk = walkLine(village, start, spot, blocked);
      const keys = timed(walk, clashStart, WALK, CLASH + 1.5);
      defenders.push({ id: 5000 + k, look: defendLook, keys, start: clashStart, end: 0 });
    }
  });

  // After the clash: the winners take their loot, or the beaten run for the boat.
  const survivors = attackers.filter((a) => a.end === 0);
  let back = clashEnd;
  if (b.attackerWins) {
    const target = lootTarget(village, content, landing);
    const store = buildingAt(village, target);
    const door = store ? doorOf(village, content, store) : target;
    const goal = { x: door.x + 0.5, y: door.y + 0.5 };
    survivors.forEach((a, i) => {
      const from = lastP(a.keys);
      const out = timed(walkLine(village, from, goal, blocked), clashEnd + i * 0.15);
      const arrive = lastT(out);
      const home = timed([...walkLine(village, goal, L, blocked), beach], arrive + 1.2);
      a.keys = [...a.keys, ...out, ...home];
      a.bundleFrom = arrive + 0.6;
      a.end = lastT(home);
      back = Math.max(back, a.end);
    });
  } else {
    survivors.forEach((a) => {
      const run = timed([lastP(a.keys), beach], clashEnd, 3.5);
      a.keys = [...a.keys, ...run];
      a.end = lastT(run);
      back = Math.max(back, a.end);
    });
  }
  const leaveAt = back + 0.3;
  const boatOut = timed([...line].reverse(), leaveAt, 0, LEAVE);
  const duration = lastT(boatOut);
  for (const d of defenders) if (d.end === 0) d.end = duration;
  for (const bt of allyBoats) bt.end = duration;
  actors.push(...attackers, ...defenders);
  const total = e.party.count + joinedCount + lateCount + allyCount;
  return {
    duration,
    actors,
    boats: [{ kind: "karakoa", keys: [...boatIn, ...boatOut], start: 0, end: duration }, ...allyBoats],
    clash: { p: { x: (L.x + front.x) / 2, y: (L.y + front.y) / 2 }, start: clashStart, end: clashEnd },
    phases: [
      { t: 0, phase: "arrive" },
      { t: sailEnd, phase: "march" },
      { t: clashStart, phase: "clash" },
      { t: clashEnd, phase: b.attackerWins ? "loot" : "retreat" },
      { t: leaveAt, phase: "leave" },
    ],
    stills: [ashore, clashStart + CLASH / 2, b.attackerWins ? (clashEnd + back) / 2 : clashEnd + 0.8, leaveAt + LEAVE * 0.4],
    shown: aN + dN + lN + alN,
    total,
  };
}

/** What the replay shows at time t. */
export function sampleReplay(script: Script, t: number): Frame {
  const boats = script.boats
    .filter((b) => t >= b.start && t <= b.end)
    .map((b) => {
      const s = at(b.keys, t);
      return { kind: b.kind, p: s.p, heading: s.heading };
    });
  const people = script.actors
    .filter((a) => t >= a.start && t < a.end)
    .map((a) => {
      const s = at(a.keys, t);
      return { id: a.id, look: a.look, p: s.p, moving: s.moving, label: a.label, bundle: a.bundleFrom !== undefined && t >= a.bundleFrom };
    });
  const c = script.clash;
  const fighting = c && t >= c.start && t < c.end;
  const phase = [...script.phases].reverse().find((p) => t >= p.t)?.phase ?? "arrive";
  // In the clash both sides lunge back and forth.
  if (fighting) for (const p of people) p.p = { x: p.p.x + Math.sin(t * 11 + p.id * 2) * 0.1, y: p.p.y + Math.cos(t * 9 + p.id) * 0.05 };
  return { boats, people, sparks: fighting ? c.p : null, phase };
}

