// Named villagers and the barangay's history. About 1 in 5 villagers who arrive (and new
// Mandirigma) get a name and a one-line story (content/villagers.json, names in names.json).
// Rolls use rollAt with a counter kept in stats, so they never shift the shared RNG that
// drives events. When villagers leave or warriors fall, named ones may be among them; that is
// recorded in the history. Pure: called after every engine step and every command.
import type { Content, VillagerRole, VillagerStory } from "./content";
import type { GameState } from "./game";
import { rollAt } from "./rng";
import { addMourning, remember } from "./death";

export interface NamedVillager {
  id: number;
  name: string;
  /** Story id in content/villagers.json. */
  story: string;
  role: VillagerRole;
  /** Game second they were named. */
  since: number;
  /** One of the sick villagers right now. */
  sick?: boolean;
  /** Grown old: they may die of old age now (the warning comes first). */
  frail?: boolean;
}

export type HistoryKind = "named" | "left" | "fell" | "task" | "spirits" | "aklat" | "event" | "died" | "frail" | "datu";

/** One line of the barangay's history. Text is made by the UI, so it follows the language setting. */
export interface HistoryEntry {
  at: number;
  kind: HistoryKind;
  /** The villager (named, left, fell). */
  name?: string;
  story?: string;
  /** Why they left ("hunger", "crowded": no house, "other"), or what they died of (died). */
  cause?: "hunger" | "crowded" | "other" | "age" | "sickness" | "raid";
  /** How many died together (died, unnamed). */
  count?: number;
  /** The level the Bahay ng Datu reached (datu). */
  level?: number;
  /** The task (task). */
  task?: string;
  /** The forest spirits' stage (spirits): 1 restless, 2 angry. */
  stage?: number;
  /** The Aklat ng Alamat entry found (aklat). */
  entry?: string;
  /** What happened (event): eclipseWon, eclipseLost, sarimanok, riddleRight; and what it gave or took. */
  event?: string;
  amounts?: Partial<Record<"rice" | "wood" | "gold", number>>;
  favor?: number;
}

/** Counters kept for tasks and for the villager rolls. */
export interface Stats {
  /** AI raids the barangay beat off. */
  raidsDefended: number;
  /** Rolls made for named villagers so far (the "second" given to rollAt). */
  rolls: number;
  /** Villagers ever named (ids). */
  named: number;
  /** Tiles replanted into forest. */
  replanted: number;
  /** Tiles cleared with the spirits' permission. */
  permittedClears: number;
  /** Villagers who died (any cause). */
  deaths: number;
  /** Balangay voyages that reached another island. */
  voyages: number;
}

export const MAX_HISTORY = 60;

const SALT_NAME = 7101;
const SALT_STORY = 7102;
const SALT_PICKNAME = 7103;
const SALT_LEAVE = 7104;
const SALT_WHO = 7105;
const SALT_SICK = 7106;

export function addHistory(state: GameState, entry: HistoryEntry): GameState {
  return { ...state, history: [...state.history, entry].slice(-MAX_HISTORY) };
}

/** A roll for the people module: deterministic, and only advances stats.rolls. */
function roll(s: GameState, salt: number): [number, GameState] {
  const r = rollAt(s.map.seed, s.stats.rolls, salt);
  return [r, { ...s, stats: { ...s.stats, rolls: s.stats.rolls + 1 } }];
}

const isWarrior = (v: NamedVillager) => v.role === "warrior";

/** A story's text with the name filled in. */
export function storyText(content: Content, v: { name: string; story: string }, lang: "en" | "fil" = "en"): string {
  const story = content.villagers.stories.find((s) => s.id === v.story);
  return story ? story.text[lang].replaceAll("{name}", v.name) : v.name;
}

/** Stories that fit a new villager (or a new warrior) now. */
function storiesFor(state: GameState, content: Content, warrior: boolean): VillagerStory[] {
  const vc = content.villagers;
  if (!warrior && state.stats.named === 0) {
    const first = vc.stories.filter((s) => s.first);
    if (first.length) return first;
  }
  const fits = vc.stories.filter((s) => {
    if (s.first) return false;
    if (warrior !== (s.role === "warrior")) return false;
    const needs = vc.roleBuildings[s.role];
    return !needs || state.buildings.some((b) => b.type === needs && !b.damaged);
  });
  // Stories no living villager has, if any are left.
  const unused = fits.filter((s) => !state.named.some((v) => v.story === s.id));
  return unused.length ? unused : fits;
}

/** Gives one new villager (or warrior) a name and story, maybe (content.villagers.chance). */
function maybeName(state: GameState, content: Content, warrior: boolean): GameState {
  const vc = content.villagers;
  if (vc.chance <= 0 || vc.names.length === 0) return state;
  let [r, s] = roll(state, SALT_NAME);
  if (r >= vc.chance) return s;
  const stories = storiesFor(s, content, warrior);
  if (stories.length === 0) return s;
  const taken = new Set([...s.named.map((v) => v.name), s.barangay.datu]);
  const free = vc.names.filter((n) => !taken.has(n));
  const names = free.length ? free : vc.names;
  let a: number;
  let b: number;
  [a, s] = roll(s, SALT_STORY);
  [b, s] = roll(s, SALT_PICKNAME);
  const story = stories[Math.floor(a * stories.length)];
  const name = names[Math.floor(b * names.length)];
  const v: NamedVillager = { id: s.stats.named + 1, name, story: story.id, role: story.role, since: s.time };
  s = { ...s, named: [...s.named, v], stats: { ...s.stats, named: s.stats.named + 1 } };
  return addHistory(s, { at: s.time, kind: "named", name, story: story.id });
}

/**
 * One villager of a group of `pool` leaves (or falls): a named one among `candidates` with the
 * chance candidates/pool. Returns the state and who went, if it was a named villager.
 */
function maybeLose(state: GameState, candidates: NamedVillager[], pool: number, entry: Omit<HistoryEntry, "name" | "story" | "at">): GameState {
  if (candidates.length === 0) return state;
  let [r, s] = roll(state, SALT_LEAVE);
  if (r >= candidates.length / Math.max(1, pool)) return s;
  let w: number;
  [w, s] = roll(s, SALT_WHO);
  const who = candidates[Math.floor(w * candidates.length)];
  s = { ...s, named: s.named.filter((v) => v !== who) };
  return addHistory(s, { ...entry, at: s.time, name: who.name, story: who.story });
}

/** Removes the named ones that can't still be there (more named than people), newest first. */
function trim(state: GameState, warriorsLeft: number, othersLeft: number, cause: HistoryEntry["cause"]): GameState {
  let s = state;
  const over = (warrior: boolean) => s.named.filter((v) => isWarrior(v) === warrior);
  while (over(true).length > warriorsLeft) {
    const who = over(true).at(-1)!;
    s = addHistory({ ...s, named: s.named.filter((v) => v !== who) }, { at: s.time, kind: "fell", name: who.name, story: who.story });
  }
  while (over(false).length > othersLeft) {
    const who = over(false).at(-1)!;
    s = addHistory({ ...s, named: s.named.filter((v) => v !== who) }, { at: s.time, kind: "left", name: who.name, story: who.story, ...(cause ? { cause } : {}) });
  }
  return s;
}

/**
 * Brings the named villagers in line with what happened between `prev` and `next`: arrivals
 * and new warriors may get names; villagers who left and warriors who fell may be named ones;
 * new sickness may strike a named villager. Returns `next` itself if nothing changed.
 */
export function reconcilePeople(prev: GameState, next: GameState, content: Content, leftBecause: HistoryEntry["cause"] = "other"): GameState {
  // Deaths already handled (death.ts) aren't departures.
  const fewer = prev.villagers - next.villagers - (next.stats.deaths - prev.stats.deaths);
  const warriorLoss = Math.max(0, prev.warriors - next.warriors);
  const newWarriors = Math.max(0, next.warriors - prev.warriors);
  const sickChange = next.sick.length - prev.sick.length;
  const flaggedSick = next.named.filter((v) => v.sick).length;
  if (fewer === 0 && warriorLoss === 0 && newWarriors === 0 && sickChange <= 0 && flaggedSick <= next.sick.length) return next;

  let s = next;
  const hungry = next.hunger > 0;
  const cause: HistoryEntry["cause"] = hungry ? "hunger" : leftBecause;
  // Fallen warriors (or warriors who left with their families).
  if (warriorLoss > 0) {
    const before = s.named;
    let pool = prev.warriors;
    for (let i = 0; i < warriorLoss; i++, pool--) {
      s = maybeLose(s, s.named.filter(isWarrior), pool, hungry ? { kind: "left", cause } : { kind: "fell" });
    }
    if (!hungry) {
      // Fallen in battle: deaths, remembered by name, and mourned.
      const fallen = before.filter((v) => isWarrior(v) && !s.named.includes(v));
      for (const v of fallen) s = remember(s, v, "raid", s.time);
      if (warriorLoss > fallen.length) s = addHistory(s, { at: s.time, kind: "died", cause: "raid", count: warriorLoss - fallen.length });
      s = addMourning({ ...s, stats: { ...s.stats, deaths: s.stats.deaths + warriorLoss } }, content, warriorLoss);
    }
  }
  // Other villagers who left.
  const othersGone = Math.max(0, fewer - warriorLoss);
  if (othersGone > 0) {
    let pool = prev.villagers - prev.warriors;
    for (let i = 0; i < othersGone; i++, pool--) {
      s = maybeLose(s, s.named.filter((v) => !isWarrior(v)), pool, { kind: "left", cause });
    }
  }
  s = trim(s, s.warriors, Math.max(0, s.villagers - s.warriors), cause);
  // Newcomers and new Mandirigma.
  const arrived = Math.max(0, -fewer);
  for (let i = 0; i < arrived; i++) s = maybeName(s, content, false);
  for (let i = 0; i < newWarriors; i++) s = maybeName(s, content, true);
  // Sickness: a new case may be a named villager; recoveries clear the oldest marks first.
  for (let i = 0; i < sickChange; i++) {
    const healthy = s.named.filter((v) => !v.sick && !isWarrior(v));
    const pool = Math.max(1, s.villagers - s.warriors - (s.sick.length - sickChange + i));
    let r: number;
    [r, s] = roll(s, SALT_SICK);
    if (healthy.length && r < healthy.length / pool) {
      const who = healthy[Math.floor((r * pool) % healthy.length)];
      s = { ...s, named: s.named.map((v) => (v === who ? { ...v, sick: true } : v)) };
    }
  }
  while (s.named.filter((v) => v.sick).length > s.sick.length) {
    const who = s.named.find((v) => v.sick)!;
    s = { ...s, named: s.named.map((v) => (v === who ? recovered(v) : v)) };
  }
  return s;
}

function recovered(v: NamedVillager): NamedVillager {
  const out = { ...v };
  delete out.sick;
  return out;
}

/** Named villagers who are sick now. */
export const namedSick = (state: GameState) => state.named.filter((v) => v.sick);

/** History entries between two game times (from exclusive, to inclusive). */
export const historyBetween = (state: GameState, from: number, to: number) => state.history.filter((h) => h.at > from && h.at <= to);
