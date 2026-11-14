// Every villager as a person: a stored gender and age group, so the map can show women, men,
// children and elders (display; the economy still counts villagers). Assigned at birth or
// arrival from the map's seed and the person's id (rollAt), so it is deterministic and doesn't
// touch the game's other rolls. Kept in step with the villager count: arrivals are added, and
// when the barangay shrinks the newest leave first. Pure: no React, no browser APIs.
import type { Content } from "./content";
import type { GameState } from "./game";
import { rollAt } from "./rng";

export type Gender = "woman" | "man";
export type AgeGroup = "child" | "adult" | "elder";

export interface Resident {
  id: number;
  gender: Gender;
  age: AgeGroup;
}

export const GENDERS: readonly Gender[] = ["woman", "man"];
export const AGE_GROUPS: readonly AgeGroup[] = ["child", "adult", "elder"];

const SALT_GENDER = 9101;
const SALT_AGE = 9102;

/** A new resident's look, from the map's seed and their id (rules.residents shares). */
export function makeResident(content: Content, seed: number, id: number): Resident {
  const r = content.rules.residents;
  const gender: Gender = rollAt(seed, id, SALT_GENDER) * 100 < r.womanPercent ? "woman" : "man";
  const a = rollAt(seed, id, SALT_AGE) * 100;
  const age: AgeGroup = a < r.childPercent ? "child" : a < r.childPercent + r.elderPercent ? "elder" : "adult";
  return { id, gender, age };
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
