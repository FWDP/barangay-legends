// Forest Balance: the spirits react to clearing (rules.forest). Clearing lowers it (more near
// an old balete); it recovers when the axes rest, faster with more forest and balete standing.
// Below stage1Below the anito of the balete hides a Woodcutter Camp's tools for a while; below stage2Below the
// diwata withhold part of the rice and sickness is a little more likely. Nothing is ever
// destroyed and nobody dies. Amends: asking permission at the Dambana (worship.ts) and
// replanting cleared land. AI barangays don't track it. Pure and deterministic.
import type { Content } from "./content";
import { asCost, canAfford, type GameState } from "./game";
import { buildingAt, isFootReachable, setTiles, tileAt, type MapState } from "./map";
import { isReserved } from "./plaza";
import { addHistory } from "./people";
import { rollAt } from "./rng";
import { addFlag } from "./worship";
import { freeVillagers } from "./clearing";
import { isHungry } from "./events";

export interface ForestState {
  /** 0–100. */
  balance: number;
  /** 0 calm, 1 restless (below stage1Below), 2 angry (below stage2Below). */
  stage: 0 | 1 | 2;
  /** Tiles left that may be cleared with the spirits' permission (they hurt the forest less). */
  permission: number;
  /** When a tile was last cleared: recovery waits quietSeconds after it. */
  lastClearAt: number | null;
}

/** A cleared tile being replanted: it grows back into forest over `seconds` of one villager's work. */
export interface ReplantJob {
  x: number;
  y: number;
  progress: number;
  seconds: number;
}

/** A Woodcutter Camp whose tools the anito of the balete hid. */
export interface Prank {
  x: number;
  y: number;
  until: number;
}

const SALT_PRANK = 9101;
const SALT_PRANK_WHO = 9102;
const clamp100 = (v: number) => Math.min(100, Math.max(0, v));

export const newForest = (content: Content): ForestState => ({ balance: content.rules.forest.start, stage: 0, permission: 0, lastClearAt: null });

export function forestStage(content: Content, balance: number): 0 | 1 | 2 {
  const f = content.rules.forest;
  return balance < f.stage2Below ? 2 : balance < f.stage1Below ? 1 : 0;
}

/** Is there a standing balete within `radius` tiles (straight line) of (x, y)? */
export function nearBalete(map: MapState, x: number, y: number, radius: number): boolean {
  for (let ty = Math.max(0, Math.floor(y - radius)); ty <= Math.min(map.height - 1, Math.ceil(y + radius)); ty++) {
    for (let tx = Math.max(0, Math.floor(x - radius)); tx <= Math.min(map.width - 1, Math.ceil(x + radius)); tx++) {
      if ((tx !== x || ty !== y) && tileAt(map, tx, ty) === "balete" && (tx - x) ** 2 + (ty - y) ** 2 <= radius * radius) return true;
    }
  }
  return false;
}

/** How much clearing this tile lowers Forest Balance (before any permission). */
export function clearingLoss(map: MapState, content: Content, x: number, y: number): number {
  const f = content.rules.forest;
  if (tileAt(map, x, y) === "balete") return f.baleteFelled;
  return nearBalete(map, x, y, f.baleteRadius) ? f.perTileNearBalete : f.perTile;
}

const forestCounts = new WeakMap<MapState, { share: number; balete: number }>();
/** The share of the map still forest (balete included), and how many balete stand. */
export function forestCover(map: MapState): { share: number; balete: number } {
  let c = forestCounts.get(map);
  if (!c) {
    let forest = 0;
    let balete = 0;
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const t = tileAt(map, x, y);
        if (t === "forest") forest++;
        if (t === "balete") balete++;
      }
    }
    c = { share: (forest + balete) / (map.width * map.height), balete };
    forestCounts.set(map, c);
  }
  return c;
}

/** Balance regained per second while the axes rest. */
export function recoveryPerSecond(state: GameState, content: Content): number {
  const f = content.rules.forest;
  const { share, balete } = forestCover(state.map);
  return (f.recoveryPerMinute + share * f.recoveryPerForestShare + balete * f.recoveryPerBalete) / 60;
}

/**
 * Tiles finished clearing between two states lower Forest Balance; with permission each hurts
 * the forest less (balanceFactor) and uses up one permitted tile.
 */
export function afterClearing(prev: GameState, next: GameState, content: Content): GameState {
  const done = prev.clearing.filter((j) => !next.clearing.some((k) => k.x === j.x && k.y === j.y) && tileAt(next.map, j.x, j.y) === "cleared" && tileAt(prev.map, j.x, j.y) !== "cleared");
  if (done.length === 0) return next;
  const p = content.rules.worship.permission;
  let forest = { ...next.forest };
  let permitted = 0;
  for (const j of done) {
    let loss = clearingLoss(prev.map, content, j.x, j.y);
    if (forest.permission > 0) {
      loss *= p.balanceFactor;
      forest.permission--;
      permitted++;
    }
    forest = { ...forest, balance: clamp100(forest.balance - loss), lastClearAt: next.time };
  }
  return { ...next, forest, stats: { ...next.stats, permittedClears: next.stats.permittedClears + permitted } };
}

/**
 * Recovery when no clearing has happened for quietSeconds, then the stage. When the stage
 * worsens and `reactions` is on (online play), the spirits' message is recorded in the history.
 */
export function updateForest(state: GameState, content: Content, dt: number, reactions: boolean): GameState {
  const f = content.rules.forest;
  let forest = state.forest;
  const quiet = forest.lastClearAt === null || state.time - forest.lastClearAt >= f.quietSeconds;
  if (quiet && forest.balance < 100) forest = { ...forest, balance: clamp100(forest.balance + recoveryPerSecond(state, content) * dt) };
  const stage = forestStage(content, forest.balance);
  let s: GameState = forest === state.forest ? state : { ...state, forest };
  if (stage !== forest.stage) {
    s = { ...s, forest: { ...s.forest, stage } };
    if (stage > forest.stage && reactions) s = addHistory(addFlag(s, "forest-spirits"), { at: state.time, kind: "spirits", stage });
  }
  return s;
}

// ---------- Balete spirit's pranks ----------

/** Is this building's work stopped by a balete spirit's prank? */
export const isPranked = (state: GameState, x: number, y: number) => state.pranks.some((p) => p.x === x && p.y === y && p.until > state.time);

/** Below stage 1, now and then the anito of the balete hides a Woodcutter Camp's tools (online only). */
export function updatePranks(state: GameState, content: Content, t0: number, t1: number): GameState {
  const f = content.rules.forest;
  let s = state;
  if (s.pranks.some((p) => p.until <= t1)) s = { ...s, pranks: s.pranks.filter((p) => p.until > t1) };
  if (s.forest.stage < 1) return s;
  for (let second = Math.floor(t0 + 1e-9) + 1; second <= Math.floor(t1 + 1e-9); second++) {
    if (s.pranks.length > 0 || rollAt(s.map.seed, second, SALT_PRANK) >= f.prankChancePerSecond) continue;
    const camps = s.buildings.filter((b) => content.buildings.find((d) => d.id === b.type)?.produces?.wood && !b.damaged);
    if (camps.length === 0) continue;
    const c = camps[Math.floor(rollAt(s.map.seed, second, SALT_PRANK_WHO) * camps.length)];
    s = addFlag({ ...s, pranks: [{ x: c.x, y: c.y, until: second + f.prankSeconds }] }, "anito-ng-balete");
  }
  return s;
}

// ---------- Replanting (Magtanim) ----------

/** Can this tile be replanted: cleared land (not the plaza, not a path), empty, reachable, not already growing? */
export function canReplant(state: GameState, content: Content, x: number, y: number): boolean {
  return (
    tileAt(state.map, x, y) === "cleared" &&
    !isReserved(state, content, x, y) &&
    !buildingAt(state, x, y) &&
    isFootReachable(state.map, x, y) &&
    !state.replanting.some((j) => j.x === x && j.y === y)
  );
}

/** Starts replanting a cleared tile, for the replant cost. */
export function replant(state: GameState, content: Content, x: number, y: number): GameState {
  const r = content.rules.forest.replant;
  const cost = asCost(r.cost);
  if (!Number.isInteger(x) || !Number.isInteger(y) || !canReplant(state, content, x, y) || !canAfford(state, cost)) return state;
  const resources = { ...state.resources };
  for (const k of Object.keys(cost) as (keyof typeof cost)[]) resources[k] -= cost[k];
  return { ...state, resources, replanting: [...state.replanting, { x, y, progress: 0, seconds: r.seconds }] };
}

/** Stops replanting a tile (its cost is returned, since nothing has grown yet that matters). */
export function cancelReplant(state: GameState, content: Content, x: number, y: number): GameState {
  if (!state.replanting.some((j) => j.x === x && j.y === y)) return state;
  const cost = asCost(content.rules.forest.replant.cost);
  const resources = { ...state.resources };
  for (const k of Object.keys(cost) as (keyof typeof cost)[]) resources[k] += cost[k];
  return { ...state, resources, replanting: state.replanting.filter((j) => j.x !== x || j.y !== y) };
}

/** Villagers free to replant: those left once clearing has taken its crews. */
export function replanters(state: GameState, content: Content): number {
  if (isHungry(state)) return 0;
  const busy = state.clearing.length * content.rules.clearing.workers;
  return Math.max(0, freeVillagers(state, content) - busy);
}

/** Replanting carries on, one villager per tile in order; finished tiles become forest again. */
export function advanceReplanting(state: GameState, content: Content, dt: number): GameState {
  if (state.replanting.length === 0) return state;
  const hands = replanters(state, content);
  if (hands <= 0) return state;
  const jobs = state.replanting.map((j, i) => (i < hands ? { ...j, progress: Math.min(j.seconds, j.progress + dt) } : j));
  const grown = jobs.filter((j) => j.progress >= j.seconds - 1e-9 && tileAt(state.map, j.x, j.y) === "cleared" && !buildingAt(state, j.x, j.y));
  if (grown.length === 0) return { ...state, replanting: jobs };
  const r = content.rules.forest.replant;
  return {
    ...state,
    replanting: jobs.filter((j) => !grown.includes(j) && j.progress < j.seconds - 1e-9),
    map: setTiles(state.map, grown.map((j) => ({ x: j.x, y: j.y, tile: "forest" as const }))),
    forest: { ...state.forest, balance: clamp100(state.forest.balance + r.balance * grown.length) },
    stats: { ...state.stats, replanted: state.stats.replanted + grown.length },
  };
}
