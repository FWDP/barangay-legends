// Names and news for the archipelago's politics, in the player's language. Pure, so it is tested.
import type { Content } from "../engine/content";
import type { GameState } from "../engine/game";
import { blocById, blocOf, enemiesOf } from "../engine/politics";
import type { NewsItem } from "../engine/region";
import type { Lang } from "./settings";
import { fill, type GameText } from "./uiContent";

/** A barangay's short name: "Malinaw" for "Barangay Malinaw", or "You" for the player. */
export function barangayName(state: GameState, content: Content, id: string | undefined, game: GameText, lang: Lang): string {
  if (!id) return "";
  if (id === state.barangay.id) return game.balita.you[lang];
  return content.neighbors.find((n) => n.id === id)?.name.replace(/^Barangay /, "") ?? id;
}

/** A bloc's name: after its leader ("Batong-Buhay's alliance"), or "your alliance". */
export function blocName(state: GameState, content: Content, blocId: string | undefined, game: GameText, lang: Lang): string {
  const bloc = blocId && state.region ? blocById(state.region.politics, blocId) : undefined;
  if (!bloc) return "";
  if (bloc.leader === state.barangay.id) return game.balita.yourBloc[lang];
  return fill(game.balita.blocName[lang], { leader: barangayName(state, content, bloc.leader, game, lang) });
}

/** A Balita line: a scripted event's own text, or an action's. */
export function newsLine(item: NewsItem, state: GameState, content: Content, game: GameText, lang: Lang): string {
  const ev = content.politics.find((e) => e.id === item.key);
  const n = item.barangay ? content.neighbors.find((x) => x.id === item.barangay) : undefined;
  // "other" is a bloc for scripted events and joined wars, a barangay for battles.
  const otherIsBloc = !!ev || item.key === "war-joined";
  const vars = {
    barangay: barangayName(state, content, item.barangay, game, lang),
    datu: n?.datu ?? "",
    bloc: blocName(state, content, item.bloc, game, lang),
    other: otherIsBloc ? blocName(state, content, item.other, game, lang) : barangayName(state, content, item.other, game, lang),
  };
  if (ev) return fill(ev.text[lang], vars);
  // The player's own actions read "You form…", not "You forms…".
  const own = item.barangay === state.barangay.id ? ((item.key + "You") as keyof GameText["balita"]) : null;
  const key = (own && game.balita[own] ? own : item.key) as keyof GameText["balita"];
  const t = game.balita[key];
  return t ? fill(t[lang], vars) : item.key;
}

/** Bloc colors for the political map (the player's bloc is always gold). */
const PALETTE = ["#dc2626", "#2563eb", "#9333ea", "#0d9488", "#db2777", "#65a30d"];
export function blocColor(state: GameState, blocId: string | undefined): string {
  if (!blocId || !state.region) return "#a8a29e";
  const bloc = blocById(state.region.politics, blocId);
  if (bloc?.leader === state.barangay.id || bloc?.members.includes(state.barangay.id)) return "#f59e0b";
  const i = state.region.politics.blocs.findIndex((b) => b.id === blocId);
  return PALETTE[i % PALETTE.length];
}

/** "At war with Batong-Buhay's alliance", for a barangay whose bloc is at war. */
export function warLine(state: GameState, content: Content, id: string, game: GameText, lang: Lang): string | null {
  const region = state.region;
  const bloc = region ? blocOf(region.politics, id) : undefined;
  if (!region || !bloc) return null;
  const foes = enemiesOf(region.politics, bloc.id);
  return foes.length ? fill(game.balita.atWar[lang], { other: foes.map((f) => blocName(state, content, f, game, lang)).join(", ") }) : null;
}
