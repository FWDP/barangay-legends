// Death, shown gently. Villagers die only after a warning, never from one random roll out of
// nowhere, and never during offline catch-up:
//   - old age: a named villager grows frail first (rules.death.oldAge.frailAfterSeconds after
//     they were named), and only then may die (unnamed villagers' ages aren't tracked);
//   - long sickness: only once a sickness has lingered past afterSeconds with no healer standing
//     (the warning shows from warnAfterSeconds);
//   - hunger: only after hunger has already driven families away;
//   - a lost battle: warriors who fall (see reconcilePeople in people.ts).
// Each death brings a short mourning that lowers happiness; a Libingan makes it pass faster and
// a rite at the Dambana shortens it. The named are remembered in the history and the Libingan.
// Workers and clearing crews are worked out from the villager count every step, so a death
// simply leaves one fewer: a clearing job waits for another worker, a building's count drops.
import type { Content } from "./content";
import type { GameState } from "./game";
import { addHistory, type HistoryEntry, type NamedVillager } from "./people";
import { rollAt } from "./rng";
import { finalStory, type LifeStory } from "./talambuhay";

export type DeathCause = "age" | "sickness" | "hunger" | "raid";

/** A villager the barangay remembers by name. */
export interface Remembered {
  name: string;
  cause: DeathCause;
  at: number;
  /** Their life story as it was when they died (named villagers since v31). */
  story?: LifeStory;
}

export const MAX_REMEMBERED = 200;
const SALT_AGE = 6101;
const SALT_SICK = 6102;
const SALT_WHO = 6103;

/** Adds mourning for `deaths` deaths, up to rules.mourning.maxSeconds. */
export function addMourning(state: GameState, content: Content, deaths: number): GameState {
  if (deaths <= 0) return state;
  const m = content.rules.mourning;
  return { ...state, mourning: Math.min(m.maxSeconds, state.mourning + m.seconds * deaths) };
}

/** Remembers a named villager who died. */
export function remember(state: GameState, content: Content, v: NamedVillager, cause: DeathCause, at: number): GameState {
  const story = content.ai ? undefined : finalStory(state, content, v, cause);
  return { ...state, remembered: [...state.remembered, { name: v.name, cause, at, ...(story ? { story } : {}) }].slice(-MAX_REMEMBERED) };
}

/**
 * One villager dies of `cause`. `who` is the named villager it is, if known; otherwise a
 * seeded roll decides whether it is one of the named (`candidates`) or someone unnamed.
 * A sick villager's sickness goes with them. Warriors are spared while anyone else is left.
 */
export function die(state: GameState, content: Content, cause: DeathCause, opts: { who?: NamedVillager; candidates?: NamedVillager[]; pool?: number; sick?: boolean; second: number }): GameState {
  if (state.villagers <= 0) return state;
  let who = opts.who;
  if (!who && opts.candidates?.length) {
    const r = rollAt(state.map.seed, opts.second, SALT_WHO + state.stats.deaths);
    if (r < opts.candidates.length / Math.max(1, opts.pool ?? state.villagers)) who = opts.candidates[Math.floor((r * (opts.pool ?? state.villagers)) % opts.candidates.length)];
  }
  const villagers = state.villagers - 1;
  let sick = state.sick;
  if (opts.sick && sick.length > 0) sick = sick.slice(1);
  sick = sick.slice(0, villagers);
  // Their life story is kept at the Libingan, as it was (family still linked).
  let s: GameState = who ? remember(state, content, who, cause, state.time) : state;
  s = {
    ...s,
    // The one who died leaves (not the newest villager, which syncResidents would drop).
    residents: who?.resident !== undefined ? s.residents.filter((r) => r.id !== who.resident) : s.residents,
    villagers,
    warriors: Math.min(state.warriors, villagers),
    sick,
    named: who ? state.named.filter((v) => v.id !== who.id) : state.named,
    stats: { ...state.stats, deaths: state.stats.deaths + 1 },
  };
  const entry: HistoryEntry = { at: state.time, kind: "died", cause, ...(who ? { name: who.name, story: who.story, ...(who.gender ? { gender: who.gender } : {}) } : {}) };
  s = addHistory(s, entry);
  return addMourning(s, content, 1);
}

/** Is a healer standing (a Babaylan's Hut)? */
const healerStanding = (state: GameState, content: Content) => state.buildings.some((b) => !b.damaged && content.buildings.find((d) => d.id === b.type)?.heals);

/** Has a sickness lingered long enough, with no healer, to warn that people may die? */
export function sicknessWarning(state: GameState, content: Content): boolean {
  return state.sick.length > 0 && state.sickFor >= content.rules.death.sickness.warnAfterSeconds && !healerStanding(state, content);
}

/** Seconds of hunger after which people start to die (families have left by then). */
export const hungerDeathAt = (content: Content) => (content.events.hunger?.graceSeconds ?? 0) + content.rules.death.hunger.afterSeconds;

/** How many hunger deaths are due by `hunger` seconds of hunger. */
function hungerDeathsBy(content: Content, hunger: number): number {
  const at = hungerDeathAt(content);
  return hunger < at ? 0 : Math.floor((hunger - at) / content.rules.death.hunger.everySeconds) + 1;
}

/**
 * Deaths for one engine step from `prev` to `next` (online only): frailty and old age, long
 * sickness, hunger after families have left; then mourning passes (faster with a Libingan).
 */
export function updateDeaths(prev: GameState, next: GameState, content: Content, dt: number): GameState {
  const d = content.rules.death;
  let s = next;
  const t0 = prev.time;
  const t1 = next.time;
  // Frailty: the warning before old age.
  for (const v of s.named) {
    if (!v.frail && s.time - v.since >= d.oldAge.frailAfterSeconds) {
      s = addHistory({ ...s, named: s.named.map((x) => (x.id === v.id ? { ...x, frail: true } : x)) }, { at: s.time, kind: "frail", name: v.name, story: v.story, ...(v.gender ? { gender: v.gender } : {}) });
    }
  }
  // Long sickness: how long the barangay has had sickness without a break.
  s = { ...s, sickFor: s.sick.length > 0 ? s.sickFor + dt : 0 };
  for (let second = Math.floor(t0 + 1e-9) + 1; second <= Math.floor(t1 + 1e-9); second++) {
    for (const v of s.named.filter((x) => x.frail)) {
      if (rollAt(s.map.seed, second, SALT_AGE + v.id) < d.oldAge.chancePerSecond) s = die(s, content, "age", { who: v, second });
    }
    if (s.sick.length > 0 && s.sickFor >= d.sickness.afterSeconds && !healerStanding(s, content) && rollAt(s.map.seed, second, SALT_SICK) < d.sickness.chancePerSecond) {
      s = die(s, content, "sickness", { sick: true, candidates: s.named.filter((v) => v.sick), pool: s.sick.length, second });
    }
  }
  // Hunger, once families have already left.
  const due = hungerDeathsBy(content, s.hunger) - hungerDeathsBy(content, prev.hunger);
  for (let i = 0; i < due && s.villagers > 0; i++) {
    const others = s.named.filter((v) => v.role !== "warrior");
    s = die(s, content, "hunger", { candidates: others, pool: Math.max(1, s.villagers - s.warriors), second: Math.floor(t1) + i });
  }
  return passMourning(s, content, dt);
}

/** How much faster mourning passes (1 = normal): a standing Libingan speeds it. */
export function mourningRate(state: GameState, content: Content): number {
  const fastest = state.buildings.reduce((m, b) => {
    const pct = b.damaged ? 0 : (content.buildings.find((d) => d.id === b.type)?.burial?.mourningPercentFaster ?? 0);
    return Math.max(m, pct);
  }, 0);
  return 1 + fastest / 100;
}

/** Mourning passes with time (offline too). */
export function passMourning(state: GameState, content: Content, dt: number): GameState {
  if (state.mourning <= 0) return state;
  return { ...state, mourning: Math.max(0, state.mourning - dt * mourningRate(state, content)) };
}
