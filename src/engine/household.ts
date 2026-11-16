// The datu's household: the ruler's gender and their spouse (named, with a gender), shown near
// the Bahay ng Datu and at gatherings. The player chooses the ruler's gender on the title screen
// (and may change it once in Settings); older saves and AI barangays work it out from the
// datu's name (a woman if it's on content/names.json "datuWomen", else a man). The spouse is the
// other, with a name from the villagers' list for their gender. The title is "Datu" for both; a
// woman ruler may be called by her tradition's sourced honorific instead (e.g. Dayang for the
// Tagalog: content/traditions womanHonorific). Pure: no React, no browser APIs.
import type { Content } from "./content";
import type { GameState } from "./game";
import type { Gender } from "./residents";
import { rollAt } from "./rng";

export interface Household {
  datuGender: Gender;
  spouse: { name: string; gender: Gender };
  /** The ruler's gender was changed once in Settings (no more changes). */
  changed?: true;
  /** A woman ruler is called by her tradition's honorific (when it has one). */
  honorific?: true;
}

const SALT_SPOUSE = 9201;

/** A household for a datu of this name, from the map's seed. */
export function makeHousehold(content: Content, seed: number, datuName: string, chosen?: Gender): Household {
  const datuGender: Gender = chosen ?? (content.villagers.datuWomen.includes(datuName.trim()) ? "woman" : "man");
  const gender: Gender = datuGender === "woman" ? "man" : "woman";
  const list = (gender === "woman" ? content.villagers.women : content.villagers.men).filter((n) => n !== datuName);
  const name = list.length ? list[Math.floor(rollAt(seed, 1, SALT_SPOUSE) * list.length)] : "";
  return { datuGender, spouse: { name, gender } };
}

/** The barangay's household: stored (the player's) or worked out from its seed and datu (an AI barangay's). */
export function householdOf(state: GameState, content: Content): Household {
  return state.household ?? makeHousehold(content, state.map.seed, state.barangay.datu);
}

/** Change the ruler's gender, once (Settings): the spouse becomes the other gender, with a new name. */
export function setRulerGender(state: GameState, content: Content, gender: Gender): GameState {
  const home = householdOf(state, content);
  if (content.ai || home.changed || home.datuGender === gender) return state;
  const made = makeHousehold(content, state.map.seed, state.barangay.datu, gender);
  return { ...state, household: { ...made, changed: true } };
}

/** The honorific a woman ruler of this barangay may use (its tradition's), or null. */
export function honorificFor(state: GameState, content: Content): string | null {
  return content.traditions.find((t) => t.id === state.tradition)?.womanHonorific?.term ?? null;
}

/** Be called by the honorific, or by "Datu" again. Only a woman ruler, in a tradition that has one. */
export function setHonorific(state: GameState, content: Content, on: boolean): GameState {
  const home = householdOf(state, content);
  if (content.ai || home.datuGender !== "woman" || !honorificFor(state, content) || !!home.honorific === on) return state;
  const next: Household = { ...home };
  if (on) next.honorific = true;
  else delete next.honorific;
  return { ...state, household: next };
}

/** The ruler's title: "Datu", or the tradition's honorific for a woman ruler who chose it. */
export function rulerTitle(state: GameState, content: Content): string {
  const home = householdOf(state, content);
  const h = honorificFor(state, content);
  return home.datuGender === "woman" && home.honorific && h ? h : "Datu";
}
