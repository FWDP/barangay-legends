// Earning Kabantugan (renown) with daily caps. Every bit of renown the player earns goes
// through earnRenown: it is counted by source (for the balance simulation and the help), and the
// repeatable sources (trades, feasts, fighting) count against a cap per renown day
// (rules.kabantugan.dailyCaps: so much per barangay level, as a greater barangay's feasts and
// battles are more talked about), so they can't be farmed. Achievements that happen once
// (villagers reached, tasks, Aklat entries, the Bahay ng Datu, tributaries and allies) are never
// capped. Rank changes in the Ranggo give no renown at all.
import type { Content } from "./content";
import type { GameState } from "./game";

/** Where renown comes from. */
export type RenownSource =
  | "villagers"
  | "tasks"
  | "trades"
  | "datu"
  | "aklat"
  | "raids"
  | "defenses"
  | "tributaries"
  | "allies"
  | "pista"
  | "honor"
  | "allyCalls";

export const RENOWN_SOURCES: RenownSource[] = ["villagers", "tasks", "aklat", "datu", "tributaries", "allies", "trades", "pista", "raids", "defenses", "honor", "allyCalls"];

/** The daily caps: trades, feasts and fighting (raids, defenses, honor and answering allies). */
export type RenownCap = "trades" | "pista" | "war";
export const RENOWN_CAPS: RenownCap[] = ["trades", "pista", "war"];

/** The cap each repeatable source counts against; the rest are once-only achievements. */
export const CAP_OF: Partial<Record<RenownSource, RenownCap>> = {
  trades: "trades",
  pista: "pista",
  raids: "war",
  defenses: "war",
  honor: "war",
  allyCalls: "war",
};

/** Renown earned so far: this renown day's capped sources, and every source ever. */
export interface RenownTally {
  /** The renown day (rules.kabantugan.dailyCaps.windowSeconds from foundedAt) `today` is for. */
  day: number;
  today: Partial<Record<RenownCap, number>>;
  total: Partial<Record<RenownSource, number>>;
  /** Neighbors that already gave renown for becoming a tributary or an ally (once each, ever). */
  tributaries: string[];
  allies: string[];
}

export const newRenownTally = (): RenownTally => ({ day: 0, today: {}, total: {}, tributaries: [], allies: [] });

/** Barangay level from renown: 1, then one more for each threshold reached (rules.kabantugan.levelAt). */
export function levelForRenown(content: Content, renown: number): number {
  let level = 1;
  for (const need of content.rules.kabantugan.levelAt) if (renown >= need) level++;
  return level;
}

/** Today's cap for one kind of repeatable renown: so much per barangay level. */
export const dailyCap = (state: GameState, content: Content, cap: RenownCap): number =>
  content.rules.kabantugan.dailyCaps.perLevel[cap] * levelForRenown(content, state.kabantugan);

/** The renown day at a game time: day 0 from the founding, a new one every windowSeconds. */
export function renownDay(state: GameState, content: Content): number {
  return Math.floor(Math.max(0, state.time - state.foundedAt) / content.rules.kabantugan.dailyCaps.windowSeconds);
}

/** Renown a source can still give this renown day (Infinity for once-only achievements). */
export function renownLeftToday(state: GameState, content: Content, source: RenownSource): number {
  const cap = CAP_OF[source];
  if (!cap) return Infinity;
  const t = state.renownTally;
  const got = t.day === renownDay(state, content) ? (t.today[cap] ?? 0) : 0;
  return Math.max(0, dailyCap(state, content, cap) - got);
}

/**
 * Adds `amount` renown from `source`, as much as today's cap for it allows. Returns `state`
 * itself when nothing is added (nothing earned, or the cap is reached).
 */
export function earnRenown(state: GameState, content: Content, source: RenownSource, amount: number): GameState {
  if (content.ai || !(amount > 0)) return state;
  const gained = Math.min(Math.round(amount), renownLeftToday(state, content, source));
  if (gained <= 0) return state;
  const day = renownDay(state, content);
  const t = state.renownTally;
  const today = t.day === day ? { ...t.today } : {};
  const cap = CAP_OF[source];
  if (cap) today[cap] = (today[cap] ?? 0) + gained;
  return {
    ...state,
    kabantugan: state.kabantugan + gained,
    renownTally: { ...t, day, today, total: { ...t.total, [source]: (t.total[source] ?? 0) + gained } },
  };
}
