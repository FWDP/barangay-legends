// Every villager as a person: a stored gender and age group, so the map can show women, men,
// children and elders (display; the economy still counts villagers). Assigned at birth or
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
}

export const GENDERS: readonly Gender[] = ["woman", "man"];
export const AGE_GROUPS: readonly AgeGroup[] = ["child", "adult", "elder"];

const SALT_GENDER = 9101;
const SALT_AGE = 9102;
const SALT_CLASS = 9103;

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
 * Residents for the villager count: the stored ones (the player's save), then new ones for
 * anyone not yet assigned; when there are fewer villagers, the newest leave first. Returns the
 * state itself when nothing changes. The id counter (residentsNext) only grows.
 */
export function syncResidents(state: GameState, content: Content): GameState {
  const n = Math.max(0, Math.floor(state.villagers));
  const have = state.residents;
  if (have.length === n) return state;
  if (have.length > n) return { ...state, residents: have.slice(0, n) };
  const add: Resident[] = [];
  let next = Math.max(state.residentsNext, ...have.map((p) => p.id + 1), 1);
  while (have.length + add.length < n) add.push(makeResident(content, state.map.seed, next++));
  return { ...state, residents: [...have, ...add], residentsNext: next };
}

/**
 * The resident behind villager number i: the stored one, or (an AI barangay, which stores none)
 * the one its seed gives for that place.
 */
export function residentAt(state: GameState, content: Content, i: number): Resident {
  return state.residents[i] ?? makeResident(content, state.map.seed, i + 1);
}
