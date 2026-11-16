// The words for raids on the barangay: which bank the raiders land on, why a defense went the way
// it did, and the raid warning. From content/ui.json (defense, visit), in the player's language.
import { barangayCenter, type Point } from "../engine/map";
import { directionFrom } from "../engine/border";
import { landingKnown, raidReason, raidWarning } from "../engine/defense";
import type { Content } from "../engine/content";
import type { GameState } from "../engine/game";
import type { Report } from "../engine/region";
import type { Lang } from "./settings";
import { fill, type GameText } from "./uiContent";

/** "north" / "hilagang": the main direction of a landing from the barangay's center. */
export function bankWord(state: GameState, landing: Point | null | undefined, game: GameText, lang: Lang): string {
  if (!landing) return "";
  const dir = directionFrom(barangayCenter(state.map), landing).split("-")[0];
  const key = (["north", "south", "east", "west"] as const).find((d) => d === dir) ?? "north";
  return game.visit[key][lang];
}

/** Why a defense went the way it did, in one line (and that the Kuta kept the stores safe, if it did). */
export function defenseReasonLine(r: Report, state: GameState, game: GameText, lang: Lang): string {
  const t = game.defense;
  const reason = raidReason(r);
  const key = reason === "unwatched" ? "unwatchedReason" : reason;
  const line = fill(t[key][lang], { direction: bankWord(state, r.landing, game, lang) });
  return !r.win && r.lootShare !== undefined && r.lootShare < 100 ? `${line} ${t.sheltered[lang]}` : line;
}

/** The raid warning's text: who is coming, where they land (once it's known), what happens. */
export function raidBannerText(state: GameState, content: Content, game: GameText, lang: Lang): string {
  const raid = state.region?.incomingRaid;
  if (!raid) return "";
  const t = game.defense;
  const who = content.neighbors.find((n) => n.id === raid.from);
  const vars = { datu: who?.datu ?? "", barangay: who?.name ?? raid.from };
  const warn = raidWarning(state, content);
  const where = warn && landingKnown(state, content) ? fill(t.raidLands[lang], { ...vars, direction: bankWord(state, warn.landing, game, lang) }) : fill(t.raidUnknown[lang], vars);
  const rally = state.warriors > 0 ? fill(t.raidRally[lang], { n: state.warriors }) : t.raidNoWarriors[lang];
  return `${where} ${rally}`;
}
