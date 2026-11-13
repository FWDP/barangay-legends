// Days (Araw) since the barangay was founded, and whether it is day or night (the game's own
// clock, not the device's), for the HUD, the history, the Balita, the Ranggo and the share card.
import type { Content } from "../engine/content";
import { dayAt, isNightAt } from "../engine/daynight";
import type { GameState } from "../engine/game";
import type { Lang } from "./settings";
import { fill, type GameText } from "./uiContent";

/** The day number at a game time (now, by default). */
export const dayOf = (state: GameState, content: Content, time = state.time) => dayAt(content, state.foundedAt, time);

/** "Araw 12". */
export const arawText = (state: GameState, content: Content, game: GameText, lang: Lang, time = state.time) => fill(game.day.araw[lang], { n: dayOf(state, content, time) });

/** "on Araw 12". */
export const onArawText = (state: GameState, content: Content, game: GameText, lang: Lang, time: number) => fill(game.day.on[lang], { n: dayOf(state, content, time) });

/** The HUD chip: a sun or a moon, and Araw N. */
export function DayChip(props: { state: GameState; content: Content; game: GameText; lang: Lang; className?: string; /** Stacked and narrow, for the phone's map corner. */ compact?: boolean }) {
  const { state, content, game, lang, className = "", compact = false } = props;
  const night = isNightAt(content, state.time);
  const n = dayOf(state, content);
  const tip = fill(game.day.tip[lang], { phase: night ? game.day.night[lang] : game.day.day[lang], n });
  return (
    <span title={tip} aria-label={tip} className={`items-center rounded-lg bg-black/25 text-amber-50 shadow-inner ${compact ? "flex-col px-1 py-0.5" : "gap-1 px-1.5 py-0.5"} ${className}`}>
      <span aria-hidden className="text-base leading-none">
        {night ? "🌙" : "☀️"}
      </span>
      <span className={`leading-none whitespace-nowrap tabular-nums ${compact ? "text-[10px] text-amber-200/90" : "font-display text-sm"}`}>{fill(game.day.araw[lang], { n })}</span>
    </span>
  );
}
