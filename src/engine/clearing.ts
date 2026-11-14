// Clearing forest, several tiles at once: a queue of jobs worked by free villagers.
// Pure and deterministic. Each tile is paid for upfront in rice (rising per tile, like the
// time it takes), runs while enough villagers are free, and gives wood when it's done.
import { curveFactor } from "./curve";
import { RESOURCES, type Content, type Resource } from "./content";
import { availableWorkers, baseBuildingWorkers, canAfford, type GameState } from "./game";
import { riceEaters } from "./population";
import { inBounds, isReachable, NEIGHBOURS, setTiles, TILE_CODE, tileAt, type MapState, type Point } from "./map";

/** One tile being cleared, or waiting its turn. */
export interface ClearingJob {
  x: number;
  y: number;
  /** Seconds worked so far, and seconds needed (fixed when it was queued). */
  progress: number;
  seconds: number;
  /** What was paid for it, for refunds. */
  paid: Record<Resource, number>;
}

const EPSILON = 1e-9;
const key = (x: number, y: number) => `${x},${y}`;

/** Land a clearing can start from: cleared ground, a bridge, or a Daan. */
const isOpenLand = (map: MapState, x: number, y: number) => {
  const t = tileAt(map, x, y);
  return t === "cleared" || t === "bridge" || t === "daan";
};

const isForest = (map: MapState, x: number, y: number) => {
  const t = tileAt(map, x, y);
  return t === "forest" || t === "balete";
};

/** n tiles from now: the rising factor (curve.ts) after the tiles cleared so far and queued. */
const growth = (state: GameState, content: Content, ahead: number) => curveFactor(content.rules.clearing.growth, state.tilesCleared + state.clearing.length + ahead);

/** Seconds the tile `ahead` places after the current queue would take. */
export function jobSeconds(state: GameState, content: Content, ahead = 0): number {
  return content.rules.clearing.baseSeconds * growth(state, content, ahead);
}

/** What the tile `ahead` places after the current queue costs, rising like the time does. */
export function jobCost(state: GameState, content: Content, ahead = 0): Record<Resource, number> {
  const f = growth(state, content, ahead);
  return Object.fromEntries(RESOURCES.map((r) => [r, Math.ceil((content.rules.clearing.cost[r] ?? 0) * f)])) as Record<Resource, number>;
}

/** The total for clearing `n` more tiles. */
export function selectionCost(state: GameState, content: Content, n: number): Record<Resource, number> {
  const total = Object.fromEntries(RESOURCES.map((r) => [r, 0])) as Record<Resource, number>;
  for (let i = 0; i < n; i++) {
    const c = jobCost(state, content, i);
    for (const r of RESOURCES) total[r] += c[r];
  }
  return total;
}

/** How many of the next `n` tiles the barangay can pay for, in order. */
export function affordableTiles(state: GameState, content: Content, n: number): number {
  const left = { ...state.resources };
  for (let i = 0; i < n; i++) {
    const c = jobCost(state, content, i);
    if (!RESOURCES.every((r) => left[r] >= c[r])) return i;
    for (const r of RESOURCES) left[r] -= c[r];
  }
  return n;
}

/**
 * The tiles of a selection that may be cleared, in the order they'll be worked: forest (or a
 * balete) the barangay can reach, next to open land, a tile already queued, or an earlier tile
 * in the selection, so a selection can reach inward. Tiles that don't connect are dropped.
 */
export function orderSelection(state: GameState, tiles: Point[]): Point[] {
  const { map } = state;
  const wanted = new Map<string, Point>();
  for (const t of tiles) {
    if (!t || !Number.isInteger(t.x) || !Number.isInteger(t.y) || !inBounds(map, t.x, t.y)) continue;
    if (!isForest(map, t.x, t.y) || !isReachable(map, t.x, t.y)) continue;
    if (state.clearing.some((j) => j.x === t.x && j.y === t.y)) continue;
    wanted.set(key(t.x, t.y), { x: t.x, y: t.y });
  }
  const reached = new Set(state.clearing.map((j) => key(j.x, j.y)));
  const touches = (p: Point) =>
    NEIGHBOURS.some(([dx, dy]) => isOpenLand(map, p.x + dx, p.y + dy) || reached.has(key(p.x + dx, p.y + dy)));
  // Breadth-first from the edge of the open land, keeping the player's order within each ring.
  const order: Point[] = [];
  let left = [...wanted.values()];
  for (;;) {
    const ring = left.filter(touches);
    if (ring.length === 0) break;
    for (const p of ring) {
      order.push(p);
      reached.add(key(p.x, p.y));
    }
    left = left.filter((p) => !reached.has(key(p.x, p.y)));
  }
  return order;
}

/** Can this tile be added to a selection (given the tiles already selected)? */
export function canSelect(state: GameState, selection: Point[], x: number, y: number): boolean {
  return orderSelection(state, [...selection, { x, y }]).some((p) => p.x === x && p.y === y);
}

/**
 * Queues a selection for clearing. Tiles are taken in order (see orderSelection) and paid for
 * one by one; it stops at the first tile the barangay can't pay for. A balete is only taken
 * with confirmBalete, because felling it is permanent.
 */
export function clearArea(state: GameState, content: Content, tiles: Point[], confirmBalete = false): GameState {
  const order = orderSelection(state, Array.isArray(tiles) ? tiles.slice(0, 400) : []);
  if (!confirmBalete && order.some((p) => tileAt(state.map, p.x, p.y) === "balete")) return state;
  let s = state;
  for (const p of order) {
    const cost = jobCost(s, content);
    if (!canAfford(s, cost)) break;
    const resources = { ...s.resources };
    for (const r of RESOURCES) resources[r] -= cost[r];
    const job: ClearingJob = { x: p.x, y: p.y, progress: 0, seconds: jobSeconds(s, content), paid: cost };
    s = { ...s, resources, clearing: [...s.clearing, job] };
  }
  return s;
}

/**
 * Cancels a queued or running job: a full refund if no work has been done yet, half (rounded
 * down) once it has started. Tiles queued behind it that now connect to nothing are cancelled
 * too, on the same terms.
 */
export function cancelClearing(state: GameState, x: number, y: number): GameState {
  const job = state.clearing.find((j) => j.x === x && j.y === y);
  if (!job) return state;
  const resources = { ...state.resources };
  const refund = (j: ClearingJob, full: boolean) => {
    for (const r of RESOURCES) resources[r] += full ? j.paid[r] : Math.floor(j.paid[r] / 2);
  };
  refund(job, job.progress <= EPSILON);
  let rest = state.clearing.filter((j) => j !== job);
  // Jobs that only connected through the cancelled tile can't be reached any more.
  for (;;) {
    const stranded = rest.filter((j) => !reachesOpen(state.map, rest, j));
    if (stranded.length === 0) break;
    for (const j of stranded) refund(j, j.progress <= EPSILON);
    rest = rest.filter((j) => !stranded.includes(j));
  }
  return { ...state, resources, clearing: rest };
}

/** Does this queued job connect to open land through other queued jobs? */
function reachesOpen(map: MapState, jobs: ClearingJob[], from: ClearingJob): boolean {
  const at = new Set(jobs.map((j) => key(j.x, j.y)));
  const seen = new Set([key(from.x, from.y)]);
  const stack: Point[] = [from];
  while (stack.length) {
    const p = stack.pop()!;
    for (const [dx, dy] of NEIGHBOURS) {
      const nx = p.x + dx;
      const ny = p.y + dy;
      if (isOpenLand(map, nx, ny)) return true;
      const k = key(nx, ny);
      if (at.has(k) && !seen.has(k)) {
        seen.add(k);
        stack.push({ x: nx, y: ny });
      }
    }
  }
  return false;
}

/** Jobs that can be worked now: they touch open land (a tile further in waits for its neighbour). */
export function workableJobs(state: GameState): ClearingJob[] {
  return state.clearing.filter((j) => NEIGHBOURS.some(([dx, dy]) => isOpenLand(state.map, j.x + dx, j.y + dy)));
}

/** Who works where once clearing has its crews: per building, and how many each lent out. */
export interface Workforce {
  /** Workers in each building (state.buildings order), after lending. */
  workers: number[];
  /** Villagers each building lent to clearing. */
  borrowed: number[];
  /** Villagers not working in any building. */
  free: number;
  /** Clearing jobs that can be worked at once. */
  crews: number;
}

const workforceCache = new WeakMap<GameState, WeakMap<Content, Workforce>>();

/** Is there enough rice to lend out the workers of a protected workplace (e.g. a Palayan)? */
export function riceIsSafe(state: GameState, content: Content): boolean {
  const eatenPerSecond = riceEaters(state, content) * content.rules.riceEatenPerVillagerPerSecond;
  return state.resources.rice >= content.rules.clearing.borrow.protectBelowRiceSeconds * eatenPerSecond;
}

/**
 * Villagers for clearing. Free villagers (not working in any building) go first. If waiting
 * jobs still need hands, villagers are borrowed from workplaces one at a time: the types in
 * rules.clearing.borrow.order first (Woodcutter Camps), then the workplace with the most
 * workers. Protected workplaces (Palayan) are never borrowed from while rice is short. Nothing
 * is stored: when a job ends or is cancelled, the villagers simply go back to work.
 */
export function workforce(state: GameState, content: Content): Workforce {
  let byContent = workforceCache.get(state);
  const cached = byContent?.get(content);
  if (cached) return cached;
  const base = baseBuildingWorkers(state, content);
  const working = base.reduce((a, b) => a + b, 0);
  const free = Math.max(0, availableWorkers(state, content) - working);
  const per = content.rules.clearing.workers;
  const workers = [...base];
  const borrowed = base.map(() => 0);
  let need = Math.max(0, workableJobs(state).length * per - free);
  if (need > 0) {
    const { order, protect } = content.rules.clearing.borrow;
    const safe = riceIsSafe(state, content);
    const rank = (i: number) => {
      const at = order.indexOf(state.buildings[i].type);
      return at < 0 ? order.length : at;
    };
    while (need > 0) {
      let pick = -1;
      for (let i = 0; i < workers.length; i++) {
        if (workers[i] <= 0 || (!safe && protect.includes(state.buildings[i].type))) continue;
        if (pick < 0 || rank(i) < rank(pick) || (rank(i) === rank(pick) && workers[i] > workers[pick])) pick = i;
      }
      if (pick < 0) break;
      workers[pick]--;
      borrowed[pick]++;
      need--;
    }
  }
  const lent = borrowed.reduce((a, b) => a + b, 0);
  const result: Workforce = { workers, borrowed, free, crews: Math.floor((free + lent) / per) };
  if (!byContent) workforceCache.set(state, (byContent = new WeakMap()));
  byContent.set(content, result);
  return result;
}

/** Villagers not working in any building: the ones free to clear forest. */
export function freeVillagers(state: GameState, content: Content): number {
  return workforce(state, content).free;
}

/** How many clearing jobs can be worked at once: free villagers plus any borrowed, ÷ villagers per job. */
export function clearingCrews(state: GameState, content: Content): number {
  return workforce(state, content).crews;
}

/** Villagers lent from workplaces to clearing right now. */
export function borrowedWorkers(state: GameState, content: Content): number {
  return workforce(state, content).borrowed.reduce((a, b) => a + b, 0);
}

/**
 * The jobs being worked right now: the first ones in the queue that touch open land, as many
 * as there are crews. The rest wait (a tile further in waits for the one in front of it).
 */
export function activeJobs(state: GameState, content: Content): ClearingJob[] {
  const crews = clearingCrews(state, content);
  if (crews <= 0) return [];
  return workableJobs(state).slice(0, crews);
}

/**
 * Works the queue for `dt` seconds, exactly: when a job finishes partway through, its crew
 * moves on to the next job for the rest of the time. Nothing moves while the barangay is
 * hungry. Each finished tile becomes cleared land and gives wood.
 */
export function advanceClearing(state: GameState, content: Content, dt: number, hungry: boolean): { state: GameState; cleared: number } {
  let s = state;
  let left = dt;
  let cleared = 0;
  if (hungry || s.clearing.length === 0) return { state: s, cleared };
  for (let guard = 0; left > EPSILON && guard < 1000; guard++) {
    const active = activeJobs(s, content);
    if (active.length === 0) break;
    const step = Math.min(left, ...active.map((j) => j.seconds - j.progress));
    const done: ClearingJob[] = [];
    const jobs = s.clearing.map((j) => {
      if (!active.includes(j)) return j;
      const next = { ...j, progress: j.progress + step };
      if (next.progress >= next.seconds - EPSILON) done.push(next);
      return next;
    });
    left -= step;
    if (done.length === 0) {
      s = { ...s, clearing: jobs };
      continue;
    }
    cleared += done.length;
    s = {
      ...s,
      clearing: jobs.filter((j) => !done.includes(j)),
      legacyReach: false,
      tilesCleared: s.tilesCleared + done.length,
      resources: { ...s.resources, wood: s.resources.wood + content.rules.clearing.wood * done.length },
      map: setTiles(s.map, done.map((j) => ({ x: j.x, y: j.y, tile: "cleared" as const }))),
    };
  }
  return { state: s, cleared };
}

/** Queued jobs on land that is no longer clearable or reachable (e.g. a bridge was removed) are dropped, refunded in full. */
export function dropUnreachableJobs(state: GameState): GameState {
  const keep = state.clearing.filter((j) => isForest(state.map, j.x, j.y) && isReachable(state.map, j.x, j.y));
  if (keep.length === state.clearing.length) return state;
  const resources = { ...state.resources };
  for (const j of state.clearing) if (!keep.includes(j)) for (const r of RESOURCES) resources[r] += j.paid[r];
  return { ...state, resources, clearing: keep };
}

/**
 * The forest tiles to clear next when the barangay needs room: plain forest (never a balete)
 * touching open land, nearest the plaza first. Used by the AI barangays and the balance bot.
 */
export function nearestClearable(state: GameState, n: number): Point[] {
  const { map } = state;
  const { plaza } = map;
  const out: { x: number; y: number; d: number }[] = [];
  const queued = new Set(state.clearing.map((j) => key(j.x, j.y)));
  const forest = TILE_CODE.forest;
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      // Cheap checks first: forest, at the edge of open land, not queued; then reachability.
      if (map.tiles[y * map.width + x] !== forest || !NEIGHBOURS.some(([dx, dy]) => isOpenLand(map, x + dx, y + dy))) continue;
      if (queued.has(key(x, y)) || !isReachable(map, x, y)) continue;
      out.push({ x, y, d: Math.hypot(x - plaza.x, y - plaza.y) });
    }
  }
  return out
    .sort((a, b) => a.d - b.d || a.y - b.y || a.x - b.x)
    .slice(0, n)
    .map(({ x, y }) => ({ x, y }));
}
