// Barangay level badges: the player's level (from Kabantugan) and AI barangays' (from their renown).
import type { Content } from "../engine/content";
import type { GameState } from "../engine/game";
import { barangayLevel, levelForRenown, maxLevel, renownForLevel } from "../engine/kabantugan";
import type { Lang } from "./settings";
import { fill, type GameText } from "./uiContent";

/** Any barangay's level: the player's, or a neighbor's. Null if it isn't known. */
export function levelOf(state: GameState, content: Content, id: string): number | null {
  if (id === state.barangay.id) return barangayLevel(state, content);
  const n = state.region?.neighbors.find((x) => x.id === id);
  return n ? levelForRenown(content, n.fame.renown) : null;
}

/** A small "Lv 3" pill. */
export function LevelBadge(props: { level: number | null; game: GameText; lang: Lang; tone?: "light" | "dark" }) {
  const { level, game, lang, tone = "light" } = props;
  if (level === null) return null;
  return (
    <span
      title={fill(game.level.title[lang], { level })}
      aria-label={fill(game.level.title[lang], { level })}
      className={`inline-block rounded-full px-1.5 align-middle text-[10px] leading-4 font-bold whitespace-nowrap tabular-nums ${
        tone === "dark" ? "bg-amber-300 text-amber-950" : "border border-amber-700/50 bg-amber-100 text-amber-900"
      }`}
    >
      {fill(game.level.badge[lang], { level })}
    </span>
  );
}

/** What the HUD chip says in its tooltip: renown, and how much more to the next level. */
export function levelProgress(state: GameState, content: Content, game: GameText, lang: Lang): string {
  const level = barangayLevel(state, content);
  const renown = fill(game.level.renown[lang], { renown: state.kabantugan });
  const next = renownForLevel(content, level + 1);
  const tail = next === null || level >= maxLevel(content) ? game.level.max[lang] : fill(game.level.next[lang], { left: next - state.kabantugan, level: level + 1 });
  return `${fill(game.level.title[lang], { level })} · ${renown} · ${tail}`;
}

/** The HUD chip: the level, with renown and progress to the next level in its tooltip. */
export function LevelChip(props: { state: GameState; content: Content; game: GameText; lang: Lang; onClick?: () => void }) {
  const { state, content, game, lang, onClick } = props;
  const level = barangayLevel(state, content);
  const next = renownForLevel(content, level + 1);
  const prev = renownForLevel(content, level) ?? 0;
  const pct = next === null ? 100 : Math.round(((state.kabantugan - prev) / Math.max(1, next - prev)) * 100);
  const text = levelProgress(state, content, game, lang);
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${text} · ${game.rank.open[lang]}`}
      aria-label={`${text}. ${game.rank.title[lang]}`}
      className="flex h-8 shrink-0 flex-col items-center justify-center rounded-lg bg-black/25 px-1.5 text-amber-50 shadow-inner sm:h-9"
    >
      <span className="font-display text-sm leading-none whitespace-nowrap">⭐{level}</span>
      <span aria-hidden className="mt-0.5 block h-1 w-6 overflow-hidden rounded-full bg-black/40">
        <span className="block h-full bg-amber-300" style={{ width: `${pct}%` }} />
      </span>
    </button>
  );
}
