// Pressure and events: seasons, hunger, sickness, fire and typhoons.
// Deterministic: all randomness comes from the seeded RNG stored in GameState, and random
// rolls happen only on whole game seconds, so the outcome does not depend on frame rate.
import type { Content, Resource, Season } from "./content";
import type { GameState, PlacedBuilding } from "./game";
import { Rng } from "./rng";

export { DEFAULT_SEED, nextRandom } from "./rng";

// ---------- Seasons ----------

export interface SeasonNow {
  season: Season;
  index: number;
  /** Seconds since this season began, and until it ends. */
  elapsed: number;
  remaining: number;
}

export function seasonAt(content: Content, time: number): SeasonNow | null {
  const seasons = content.events.seasons?.seasons;
  if (!seasons?.length) return null;
  const year = seasons.reduce((sum, s) => sum + s.durationSeconds, 0);
  let t = time % year;
  for (let index = 0; index < seasons.length; index++) {
    const season = seasons[index];
    if (t < season.durationSeconds) return { season, index, elapsed: t, remaining: season.durationSeconds - t };
    t -= season.durationSeconds;
  }
  const last = seasons.length - 1;
  return { season: seasons[last], index: last, elapsed: seasons[last].durationSeconds, remaining: 0 };
}

/** Production multiplier for a resource in the current season (tag-araw rice = 0.5). */
export function seasonMultiplier(content: Content, time: number, r: Resource): number {
  const pct = seasonAt(content, time)?.season.productionPercent[r];
  return pct === undefined ? 1 : pct / 100;
}

// ---------- Hunger ----------

/** Gutom: with no rice left, villagers are too hungry to work. */
export function isHungry(state: GameState): boolean {
  return state.resources.rice <= 0 && state.villagers > 0;
}

/** Seconds until hungry families start leaving, or 0 once they are. Null when not hungry. */
export function secondsUntilLeaving(state: GameState, content: Content): number | null {
  if (!isHungry(state) || !content.events.hunger) return null;
  return Math.max(0, content.events.hunger.graceSeconds - state.hunger);
}

// ---------- Sickness ----------

const defOf = (content: Content, type: string) => content.buildings.find((b) => b.id === type);

/** How much faster sick villagers recover: 1 + the sum of every working healer's bonus. */
export function healRate(state: GameState, content: Content): number {
  return state.buildings.reduce((rate, b) => {
    const pct = b.damaged ? 0 : (defOf(content, b.type)?.heals?.percentFaster ?? 0);
    return rate + pct / 100;
  }, 1);
}

/** Pairs of buildings of this type that share an edge (each pair counted once). */
export function adjacentPairs(state: GameState, type: string): number {
  const tiles = new Set(state.buildings.filter((b) => b.type === type).map((b) => `${b.x},${b.y}`));
  let pairs = 0;
  for (const key of tiles) {
    const [x, y] = key.split(",").map(Number);
    if (tiles.has(`${x + 1},${y}`)) pairs++;
    if (tiles.has(`${x},${y + 1}`)) pairs++;
  }
  return pairs;
}

/** Chance per second that one more villager falls sick. */
export function spreadChance(state: GameState, content: Content): number {
  const ev = content.events.sickness;
  if (!ev || state.sick.length === 0 || state.sick.length >= state.villagers) return 0;
  const crowding = 1 + (adjacentPairs(state, ev.crowding.building) * ev.crowding.percentPerAdjacentPair) / 100;
  return Math.min(0.9, ev.spreadChancePerSecond * state.sick.length * crowding);
}

// ---------- Fire ----------

const tileKey = (x: number, y: number) => `${x},${y}`;
const NEIGHBOURS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
] as const;

export const isBurning = (b: PlacedBuilding) => b.burningSince !== undefined;

// ---------- Per-step updates ----------

const EPSILON = 1e-9;

/**
 * Time-based updates for one engine step from state.time to state.time + dt:
 * sickness recovery, fires spreading and burning down, then the random rolls for every whole
 * game second crossed. Hunger and villagers are handled in game.ts.
 */
export function updateEvents(state: GameState, content: Content, dt: number): GameState {
  const t0 = state.time;
  const t1 = t0 + dt;
  let s: GameState = { ...state };

  // Sakit: recover over time (faster with healers). Never more sick than villagers.
  const rate = healRate(s, content);
  s.sick = s.sick.map((left) => left - dt * rate).filter((left) => left > EPSILON);
  if (s.sick.length > s.villagers) s.sick = [...s.sick].sort((a, b) => a - b).slice(0, s.villagers);

  // Sunog: spread every spreadAfterSeconds, burn down (become damaged) after burnDownSeconds.
  const fire = content.events.fire;
  if (fire && s.buildings.some(isBurning)) s = updateFires(s, content, t0, t1);

  // Random rolls and scheduled strikes, once per whole second crossed.
  const rng = new Rng(s.rng);
  for (let second = Math.floor(t0 + EPSILON) + 1; second <= Math.floor(t1 + EPSILON); second++) {
    s = onSecond(s, content, second, rng);
  }
  return { ...s, rng: rng.seed, time: t1 };
}

function updateFires(state: GameState, content: Content, t0: number, t1: number): GameState {
  const fire = content.events.fire!;
  const buildings = state.buildings.map((b) => ({ ...b }));
  const at = new Map(buildings.map((b) => [tileKey(b.x, b.y), b]));
  for (const b of buildings) {
    if (b.burningSince === undefined) continue;
    const since = b.burningSince;
    // Spread at since + k × spreadAfterSeconds for every k crossed in this step.
    const first = Math.floor((t0 - since) / fire.spreadAfterSeconds + EPSILON) + 1;
    const last = Math.floor((t1 - since) / fire.spreadAfterSeconds + EPSILON);
    for (let k = Math.max(1, first); k <= last; k++) {
      const when = since + k * fire.spreadAfterSeconds;
      if (when >= since + fire.burnDownSeconds) break;
      for (const [dx, dy] of NEIGHBOURS) {
        const n = at.get(tileKey(b.x + dx, b.y + dy));
        if (n && n.type === fire.target && !n.damaged && n.burningSince === undefined) n.burningSince = when;
      }
    }
  }
  for (const b of buildings) {
    if (b.burningSince !== undefined && t1 - b.burningSince >= fire.burnDownSeconds - EPSILON) {
      delete b.burningSince;
      b.damaged = true;
    }
  }
  return { ...state, buildings };
}

function onSecond(state: GameState, content: Content, second: number, rng: Rng): GameState {
  const { sickness, fire, typhoon } = content.events;
  let s = state;
  const ready = (id: string, startsAfter: number) => second >= startsAfter && second >= (s.nextEventAt[id] ?? 0);

  // Bagyo strikes when its warning runs out.
  if (typhoon && s.typhoon && second >= s.typhoon.strikeAt) s = typhoonStrikes(s, content, second, rng);

  // Sakit spreads.
  const spread = spreadChance(s, content);
  if (sickness && spread > 0 && rng.next() < spread) s = { ...s, sick: [...s.sick, sickness.sickSeconds] };

  // New disasters, in a fixed order so the rolls are reproducible.
  if (sickness && s.sick.length === 0 && s.villagers > 0 && ready(sickness.id, sickness.startsAfterSeconds)) {
    if (rng.next() < sickness.chancePerSecond) {
      const cases = Math.min(sickness.firstCases, s.villagers);
      s = {
        ...s,
        sick: Array.from({ length: cases }, () => sickness.sickSeconds),
        nextEventAt: { ...s.nextEventAt, [sickness.id]: second + sickness.cooldownSeconds },
      };
    }
  }
  if (fire && !s.buildings.some(isBurning) && ready(fire.id, fire.startsAfterSeconds)) {
    const targets = s.buildings.map((b, i) => [b, i] as const).filter(([b]) => b.type === fire.target && !b.damaged);
    if (targets.length > 0 && rng.next() < fire.chancePerSecond) {
      const [, i] = targets[rng.int(0, targets.length - 1)];
      s = {
        ...s,
        buildings: s.buildings.map((b, j) => (j === i ? { ...b, burningSince: second } : b)),
        nextEventAt: { ...s.nextEventAt, [fire.id]: second + fire.cooldownSeconds },
      };
    }
  }
  if (typhoon && !s.typhoon && ready(typhoon.id, typhoon.startsAfterSeconds) && rng.next() < typhoon.chancePerSecond) {
    s = { ...s, typhoon: { strikeAt: second + typhoon.warningSeconds } };
  }
  return s;
}

function typhoonStrikes(state: GameState, content: Content, second: number, rng: Rng): GameState {
  const typhoon = content.events.typhoon!;
  const standing = state.buildings.map((b, i) => [b, i] as const).filter(([b]) => !b.damaged);
  const count = Math.min(standing.length, rng.int(typhoon.damagedBuildings.min, typhoon.damagedBuildings.max));
  const hit = new Set<number>();
  for (let n = 0; n < count; n++) {
    const remaining = standing.filter(([, i]) => !hit.has(i));
    hit.add(remaining[rng.int(0, remaining.length - 1)][1]);
  }
  return {
    ...state,
    typhoon: null,
    buildings: state.buildings.map((b, i) => {
      if (!hit.has(i)) return b;
      const damaged = { ...b, damaged: true };
      delete damaged.burningSince;
      return damaged;
    }),
    nextEventAt: { ...state.nextEventAt, [typhoon.id]: second + typhoon.cooldownSeconds },
  };
}
