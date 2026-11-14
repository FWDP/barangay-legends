// Which notification is on show: at most ONE large banner at a time, chosen by priority, the
// rest waiting behind a small "+N" badge. Ongoing states (mourning, embargo, the season, active
// blessings, trade paused) are not notifications at all: they are small status icons in the HUD
// (see statusIcons). Pure: worked out from GameState every render, so nothing can drift.
import type { Content } from "../engine/content";
import type { GameState } from "../engine/game";
import { isActive, ritualDef } from "../engine/worship";
import { isEmbargo } from "../engine/trading";
import { neighborDef, tradingPaused } from "../engine/region";
import { activeBanners } from "./EventBanners";

/** 0: needs action now. 1: trade offers and diplomacy. 2: information. */
export type Tier = 0 | 1 | 2;

export interface Notice {
  id: string;
  tier: Tier;
  /** Game time it runs out (offers, riddles, eclipses), if it does. */
  expiresAt?: number;
  /** Information can be dismissed; the key changes when the news does, so new news shows again. */
  dismissKey?: string;
}

/** A timed notice this close to running out shows on the badge. */
export const SOON_SECONDS = 15;

/** Within a tier, in this order (urgent first). */
const ORDER = ["eclipse", "fire", "raid", "hunger", "tikbalang", "typhoon", "offer", "choice", "expedition", "overcrowded", "sickness", "damaged", "prank", "sailing"];

/** Extra notices the App knows about (it holds the "seen" state for expeditions). */
export interface NoticeContext {
  /** The player's expedition has just arrived and can be watched. */
  expeditionFresh: boolean;
  /** A Balangay is at sea (an information line). */
  sailing: boolean;
  /** Trade is still held after a raid while the waiting bangka comes back (a status, not a banner). */
  tradeHeld?: boolean;
}

/** Every notification that would want a banner now, most important first. */
export function noticeQueue(state: GameState, content: Content, ctx: NoticeContext): Notice[] {
  const out: Notice[] = [];
  if (state.eclipse && state.eclipse.endsAt > state.time) out.push({ id: "eclipse", tier: 0, expiresAt: state.eclipse.endsAt });
  for (const b of activeBanners(state, content)) {
    if (b.id === "fire" || b.id === "raid" || b.id === "hunger" || b.id === "typhoon") out.push({ id: b.id, tier: 0, ...(b.id === "raid" ? { expiresAt: state.region!.incomingRaid!.strikeAt } : {}) });
    else if (b.id === "overcrowded" || b.id === "sickness" || b.id === "damaged") out.push({ id: b.id, tier: 2, dismissKey: `${b.id}:${b.title}` });
  }
  if (state.tikbalang && state.time < state.tikbalang.until) out.push({ id: "tikbalang", tier: 0, expiresAt: state.tikbalang.until });
  // While trade is paused the offer waits (a status icon says so), not a banner.
  const offer = state.region?.offer;
  if (offer && !tradingPaused(state) && !ctx.tradeHeld) out.push({ id: "offer", tier: 1, expiresAt: offer.expiresAt });
  // A raid holds back the choice events.
  // An ally's call for help runs out when the raid on it strikes (the badge counts it down).
  const call = state.region?.allyCall;
  if (state.choice && !state.region?.incomingRaid) out.push({ id: "choice", tier: 1, ...(call ? { expiresAt: call.strikeAt } : {}) });
  if (ctx.expeditionFresh) out.push({ id: "expedition", tier: 1 });
  if (state.pranks.length > 0) out.push({ id: "prank", tier: 2, dismissKey: `prank:${state.pranks.length}` });
  if (!ctx.expeditionFresh && ctx.sailing) out.push({ id: "sailing", tier: 2, dismissKey: `sailing:${state.region?.nextVoyageId ?? 0}` });
  return out.sort((a, b) => a.tier - b.tier || ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
}

/** The banner on show and the ones waiting, after the player's dismissals and their pick from the list. */
export function arrange(queue: Notice[], dismissed: ReadonlySet<string>, front: string | null): { shown: Notice | null; waiting: Notice[] } {
  const live = queue.filter((n) => !n.dismissKey || !dismissed.has(n.dismissKey));
  if (live.length === 0) return { shown: null, waiting: [] };
  // A pick from the list comes forward, but never over something that needs action now.
  const picked = front ? live.find((n) => n.id === front) : undefined;
  const shown = picked && (picked.tier === 0 || live[0].tier !== 0) ? picked : live[0];
  return { shown, waiting: live.filter((n) => n !== shown) };
}

/** Does any waiting notice run out soon (the badge shows it)? */
export const endingSoon = (waiting: Notice[], time: number) => waiting.some((n) => n.expiresAt !== undefined && n.expiresAt - time <= SOON_SECONDS);

export type StatusId = "mourning" | "embargo" | "tradePaused" | "blessings";

export interface Status {
  id: StatusId;
  icon: string;
  /** What the tooltip names (barangays, blessings) or a time. */
  detail: string;
}

/** The ongoing states, as small HUD status icons. (The season has its own chip.) */
export function statusIcons(state: GameState, content: Content, lang: "en" | "fil" = "en", tradeHeld = false): Status[] {
  const out: Status[] = [];
  if (state.mourning > 0) out.push({ id: "mourning", icon: "🕯️", detail: String(Math.ceil(state.mourning)) });
  const embargo = (state.region?.neighbors ?? []).filter((n) => isEmbargo(n, content)).map((n) => neighborDef(content, n.id)?.name ?? n.id);
  if (embargo.length) out.push({ id: "embargo", icon: "⛔", detail: embargo.join(", ") });
  if (tradingPaused(state) || tradeHeld) out.push({ id: "tradePaused", icon: "⏸️", detail: "" });
  const blessings = Object.keys(state.blessings).filter((id) => isActive(state, id)).map((id) => ritualDef(content, id)?.name[lang] ?? id);
  if (blessings.length) out.push({ id: "blessings", icon: "✨", detail: blessings.join(", ") });
  return out;
}
