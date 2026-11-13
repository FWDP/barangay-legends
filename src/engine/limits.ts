// Limits against spamming the AI barangays (rules.json "limits"). Plain engine code, so a server
// can apply the same rules later. A trade's trust and influence follow its value; doing the same
// thing again with the same barangay on the same day (Araw) gives sharply less (trades, Handog
// gifts, renown from raiding them); trading with them too often tires them (they ask for a better
// deal, then refuse); and alliances need a relationship of some days, counted from first contact.
import type { Content } from "./content";
import { dayAt } from "./daynight";
import type { GameState } from "./game";
import type { NeighborState } from "./region";

/** What the player did with one barangay on one day. */
export interface Today {
  day: number;
  trades: number;
  gifts: number;
  raids: number;
}

export type DailyKind = "trades" | "gifts" | "raids";

/** The player's day number now. */
export const currentDay = (state: GameState, content: Content) => dayAt(content, state.foundedAt, state.time);

/** Today's counts with a barangay (zero on a new day). */
export function todayWith(state: GameState, content: Content, n: NeighborState): Today {
  const day = currentDay(state, content);
  return n.today && n.today.day === day ? n.today : { day, trades: 0, gifts: 0, raids: 0 };
}

/** How much the next one of these counts today: 1 the first time, then less (rules.limits.dailyReturns). */
export function dailyFactor(state: GameState, content: Content, n: NeighborState, kind: DailyKind): number {
  const r = content.rules.limits.dailyReturns;
  return r[Math.min(todayWith(state, content, n)[kind], r.length - 1)];
}

/** The barangay after one more of these today, and first contact noted if it's the first. */
export function counted(state: GameState, content: Content, n: NeighborState, kind: DailyKind): NeighborState {
  const t = todayWith(state, content, n);
  return { ...metNow(state, n), today: { ...t, [kind]: t[kind] + 1 } };
}

/** First contact: noted the first time the player deals with them. */
export function metNow(state: GameState, n: NeighborState): NeighborState {
  return n.metAt === null ? { ...n, metAt: state.time } : n;
}

/** Whole days since first contact (0 if they haven't met). */
export function relationshipDays(state: GameState, content: Content, n: NeighborState): number {
  if (n.metAt === null) return 0;
  return Math.floor(Math.max(0, state.time - n.metAt) / content.rules.dayNight.daySeconds);
}

/** A trade's weight by its value: full at tradeValueFull, scaled up to tradeValueMax times. */
export function tradeValueFactor(content: Content, value: number): number {
  const l = content.rules.limits;
  return Math.min(l.tradeValueMax, Math.max(0, value / l.tradeValueFull));
}

/** Too many trades today: "counter" (they want a better deal), "refuse", or null. */
export function tradeFatigue(state: GameState, content: Content, n: NeighborState): "counter" | "refuse" | null {
  const l = content.rules.limits;
  const trades = todayWith(state, content, n).trades;
  if (trades >= l.fatigueRefuseAt) return "refuse";
  if (trades >= l.fatigueCounterAt) return "counter";
  return null;
}
