// Every villager as a person: a stored gender, age group, class and family, so the map can show
// women, men, children and elders. Children don't work and elders work less (population.ts). Assigned at birth or
// arrival from the map's seed and the person's id (rollAt), so it is deterministic and doesn't
// touch the game's other rolls. Kept in step with the villager count: arrivals are added, and
// when the barangay shrinks the newest leave first. Pure: no React, no browser APIs.
import { SOCIAL_CLASSES, type Content, type SocialClass } from "./content";
import type { GameState } from "./game";
import { rollAt } from "./rng";

export type Gender = "woman" | "man";
export type AgeGroup = "child" | "adult" | "elder";

export interface Resident {
  id: number;
  gender: Gender;
  age: AgeGroup;
  /** Their family's social class (the tradition names it: content/traditions "classes"). */
  cls: SocialClass;
  /** Game second they entered their age group (population.ts grows them up from it). */
  since?: number;
  /** Their husband or wife (a resident id). */
  spouse?: number;
  /** Their mother and father (resident ids), if born here or arriving with them. */
  parents?: number[];
  /** Born in the barangay, arrived, or among the founders (missing: from before v30). */
  came?: "born" | "arrived" | "founder";
  /** Why they came (arrived): a reason id in content/villagers/arrivals.json. */
  why?: string;
  /** Where they came from (arrived): a barangay id. */
  from?: string;
}

export const GENDERS: readonly Gender[] = ["woman", "man"];
export const AGE_GROUPS: readonly AgeGroup[] = ["child", "adult", "elder"];

const SALT_GENDER = 9101;
const SALT_AGE = 9102;
const SALT_CLASS = 9103;
const SALT_SETTLE_AGE = 9104;
const SALT_SETTLE_SINCE = 9105;

/** A resident's social class from the map's seed and their id (rules.residents.classPercent). */
export function classFor(content: Content, seed: number, id: number): SocialClass {
  const roll = rollAt(seed, id, SALT_CLASS) * 100;
  let acc = 0;
  for (const c of SOCIAL_CLASSES) {
    acc += content.rules.residents.classPercent[c];
    if (roll < acc) return c;
  }
  return "commoner";
}

/** A new resident's look, from the map's seed and their id (rules.residents shares). */
export function makeResident(content: Content, seed: number, id: number): Resident {
  const r = content.rules.residents;
  const gender: Gender = rollAt(seed, id, SALT_GENDER) * 100 < r.womanPercent ? "woman" : "man";
  const a = rollAt(seed, id, SALT_AGE) * 100;
  const age: AgeGroup = a < r.childPercent ? "child" : a < r.childPercent + r.elderPercent ? "elder" : "adult";
  return { id, gender, age, cls: classFor(content, seed, id) };
}

/**
 * A villager who joined without a birth or an arrival of their own (the founders, a choice
 * event): the founders are adults; others mostly adults, by the newcomer shares
 * (rules.population). Each is partway through their age group so they don't all grow up together.
 */
export function settler(content: Content, seed: number, id: number, time: number): Resident {
  const p = content.rules.population;
  const day = content.rules.dayNight.daySeconds;
  const a = rollAt(seed, id, SALT_SETTLE_AGE) * 100;
  // The founders (at the very start) are grown-ups: the families who cleared the first land.
  const age: AgeGroup = time === 0 ? "adult" : a < p.newcomerChildPercent ? "child" : a < p.newcomerChildPercent + p.newcomerElderPercent ? "elder" : "adult";
  const span = age === "child" ? p.childDays * day : age === "adult" ? p.elderAfterDays * day : 0;
  const since = time - rollAt(seed, id, SALT_SETTLE_SINCE) * span * 0.9;
  return { ...makeResident(content, seed, id), age, since, came: time === 0 ? "founder" : "arrived" };
}

/**
 * Residents for the villager count: the stored ones (the player's save), then new ones for
 * anyone not yet assigned (settler); when there are fewer villagers, the newest leave first.
 * Returns the state itself when nothing changes. The id counter (residentsNext) only grows.
 */
export function syncResidents(state: GameState, content: Content): GameState {
  const n = Math.max(0, Math.floor(state.villagers));
  const have = state.residents;
  if (have.length === n) return state;
  if (have.length > n) return { ...state, residents: have.slice(0, n) };
  const add: Resident[] = [];
  let next = Math.max(state.residentsNext, ...have.map((p) => p.id + 1), 1);
  while (have.length + add.length < n) add.push(settler(content, state.map.seed, next++, state.time));
  return { ...state, residents: [...have, ...add], residentsNext: next };
}

/**
 * The resident behind villager number i: the stored one, or (an AI barangay, which stores none)
 * the one its seed gives for that place.
 */
export function residentAt(state: GameState, content: Content, i: number): Resident {
  return state.residents[i] ?? makeResident(content, state.map.seed, i + 1);
}
