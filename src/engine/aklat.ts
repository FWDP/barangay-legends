// Aklat ng Alamat: the book of legends. An entry unlocks the first time the barangay meets
// that being or custom (content/lore, "aklat.unlock"). Conditions are read from GameState, so
// things an older save had already met unlock on its first step. Found entries are kept, so a
// demolished building never locks one again.
import type { AklatEntry, AklatUnlock, Content } from "./content";
import type { GameState } from "./game";
import { buildingGroveBonuses, tileAt } from "./map";
import { addHistory } from "./people";

function baleteNearLand(state: GameState, radius: number): boolean {
  const { map } = state;
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (tileAt(map, x, y) !== "balete") continue;
      for (let ty = Math.max(0, y - radius); ty <= Math.min(map.height - 1, y + radius); ty++) {
        for (let tx = Math.max(0, x - radius); tx <= Math.min(map.width - 1, x + radius); tx++) {
          const t = tileAt(map, tx, ty);
          if ((t === "cleared" || t === "daan") && (tx - x) ** 2 + (ty - y) ** 2 <= radius * radius) return true;
        }
      }
    }
  }
  return false;
}

/** Has the barangay met what this condition describes? */
export function unlockMet(state: GameState, content: Content, u: AklatUnlock): boolean {
  switch (u.type) {
    case "built":
      return state.buildings.some((b) => b.type === u.building);
    case "near":
      return baleteNearLand(state, u.radius);
    case "grove":
      return buildingGroveBonuses(state, content).some((g) => Object.values(g).some((v) => (v ?? 0) > 0));
    case "path":
      return state.region?.paths.includes(u.path as never) ?? false;
    case "flag":
      return state.flags.includes(u.flag);
    case "tradition":
      return state.tradition === u.tradition;
    case "report":
      return state.region?.reports.some((r) => r.kind === u.kind) ?? false;
    case "any":
      return u.of.some((x) => unlockMet(state, content, x));
  }
}

/** Entries not found yet whose condition now holds: they join the book (and the history, for the adviser). */
export function checkAklat(state: GameState, content: Content): GameState {
  const fresh = content.aklat.filter((e) => !state.aklat.includes(e.id) && unlockMet(state, content, e.aklat.unlock));
  if (fresh.length === 0) return state;
  let s: GameState = { ...state, aklat: [...state.aklat, ...fresh.map((e) => e.id)] };
  for (const e of fresh) s = addHistory(s, { at: state.time, kind: "aklat", entry: e.id });
  return s;
}

export const aklatEntry = (content: Content, id: string): AklatEntry | undefined => content.aklat.find((e) => e.id === id);

/** "12 of 30 found". */
export const aklatProgress = (state: GameState, content: Content) => ({ found: state.aklat.filter((id) => aklatEntry(content, id)).length, total: content.aklat.length });
