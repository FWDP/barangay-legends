// The datu's household: the datu's gender and their spouse (named, with a gender), shown near
// the Bahay ng Datu and at gatherings. Made once from the map's seed and the datu's name: the
// datu is a woman if the name is one of the women's names on the title screen's list
// (content/names.json "datuWomen"), else a man; the spouse is the other, with a name from the
// villagers' list for their gender. Only the player's barangay stores it; AI barangays work
// theirs out the same way. Pure: no React, no browser APIs.
import type { Content } from "./content";
import type { GameState } from "./game";
import type { Gender } from "./residents";
import { rollAt } from "./rng";

export interface Household {
  datuGender: Gender;
  spouse: { name: string; gender: Gender };
}

const SALT_SPOUSE = 9201;

/** A household for a datu of this name, from the map's seed. */
export function makeHousehold(content: Content, seed: number, datuName: string): Household {
  const datuGender: Gender = content.villagers.datuWomen.includes(datuName.trim()) ? "woman" : "man";
  const gender: Gender = datuGender === "woman" ? "man" : "woman";
  const list = (gender === "woman" ? content.villagers.women : content.villagers.men).filter((n) => n !== datuName);
  const name = list.length ? list[Math.floor(rollAt(seed, 1, SALT_SPOUSE) * list.length)] : "";
  return { datuGender, spouse: { name, gender } };
}

/** The barangay's household: stored (the player's) or worked out from its seed and datu (an AI barangay's). */
export function householdOf(state: GameState, content: Content): Household {
  return state.household ?? makeHousehold(content, state.map.seed, state.barangay.datu);
}
