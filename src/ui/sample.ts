// A sample barangay for the title screen's background when the player has no save yet.
// Built with the engine's own placement, shown only, never saved or played.
import type { Content } from "../engine/content";
import { housing, newGame, placeAuto, type GameState } from "../engine/game";

/** A fixed seed, so every new player sees the same pleasant view. */
export const SAMPLE_SEED = 20260412;
const SAMPLE_BUILDINGS: Record<string, number> = { "bahay-kubo": 4, palayan: 3, "woodcutter-camp": 2, "babaylan-hut": 1 };

export function sampleBarangay(content: Content): GameState {
  let s = newGame(content, SAMPLE_SEED, false);
  for (const def of content.buildings) {
    for (let i = 0; i < (SAMPLE_BUILDINGS[def.id] ?? 0); i++) s = placeAuto(s, content, def.id);
  }
  return { ...s, villagers: housing(s, content), resources: { ...s.resources, rice: 500 } };
}
