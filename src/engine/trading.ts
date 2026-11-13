// Trading with AI barangays: whether they take a proposed trade, counter it or refuse it, and
// peace gifts (Handog). Plain, deterministic functions, so later code (and a server) can reuse
// them. Close calls use the seeded RNG in GameState; nothing else here is random.
import { RESOURCES, type Content, type RefusalReason, type Resource } from "./content";
import type { GameState } from "./game";
import { executeTrade, traitOf, tradingPaused, type NeighborState } from "./region";
import { Rng } from "./rng";

/** One side of a trade: so much of one resource. */
export interface Goods {
  resource: Resource;
  amount: number;
}

/** What the player proposes: they give `give` and ask for `want` in return. */
export interface Proposal {
  give: Goods;
  want: Goods;
}

/** A counter-offer from a neighbor, waiting for the player's answer. */
export interface CounterOffer extends Proposal {
  neighbor: string;
  expiresAt: number;
}

export type TradeDecision = { outcome: "accept" } | { outcome: "counter"; want: number } | { outcome: "refuse"; reason: RefusalReason };

const clamp100 = (v: number) => Math.min(100, Math.max(0, v));

/** Is this neighbor refusing every trade (their grudge is at the embargo line)? */
export const isEmbargo = (n: NeighborState, content: Content) => n.grudge >= content.rules.diplomacy.grudge.embargoAt;

const value = (g: Goods, content: Content) => g.amount * (content.rules.diplomacy.tradeDecision.values[g.resource] ?? 1);

/** How good a deal is for them: what they get over what they give (1 = even). */
export function fairness(p: Proposal, content: Content): number {
  return value(p.give, content) / Math.max(1e-9, value(p.want, content));
}

/**
 * How good a deal they need before they'll say yes: an even trade, more for every point of
 * grudge, less for trust and for a trader's willingness (more for a proud datu).
 */
export function fairnessNeeded(n: NeighborState, content: Content): number {
  const td = content.rules.diplomacy.tradeDecision;
  return 1 + (n.grudge / 100) * td.grudgeWeight - (n.trust / 100) * td.trustWeight - traitOf(content, n.id).tradeWillingness;
}

/** Is a proposal well formed: two different resources, whole amounts within the limits? */
export function validProposal(p: Proposal, content: Content): boolean {
  const td = content.rules.diplomacy.tradeDecision;
  const ok = (g: Goods) => RESOURCES.includes(g?.resource) && Number.isInteger(g.amount) && g.amount >= td.minAmount && g.amount <= td.maxAmount;
  return ok(p?.give) && ok(p?.want) && p.give.resource !== p.want.resource;
}

/**
 * Would this neighbor take the trade? `roll` (0..1) settles close calls: within closeBand of
 * what they need, the better the deal the likelier a yes. A deal that falls a little short
 * gets a counter-offer (they give less); one far short, or anything during an embargo, is
 * refused, with the reason.
 */
export function decideTrade(n: NeighborState, content: Content, p: Proposal, roll: number): TradeDecision {
  const td = content.rules.diplomacy.tradeDecision;
  const g = content.rules.diplomacy.grudge;
  if (isEmbargo(n, content)) return { outcome: "refuse", reason: "embargo" };
  if (n.state.resources[p.want.resource] < p.want.amount) return { outcome: "refuse", reason: "short" };
  const need = fairnessNeeded(n, content);
  const margin = fairness(p, content) - need;
  if (margin >= td.closeBand) return { outcome: "accept" };
  if (margin > -td.closeBand && roll < (margin + td.closeBand) / (2 * td.closeBand)) return { outcome: "accept" };
  if (margin >= -td.counterBand) {
    // They give what makes the deal just good enough for them.
    const want = Math.floor(value(p.give, content) / need / (td.values[p.want.resource] ?? 1));
    if (want >= td.minAmount && want < p.want.amount) return { outcome: "counter", want };
  }
  return { outcome: "refuse", reason: n.grudge > g.raidsReasonAbove ? "raids" : "unfair" };
}

/** Is a margin close enough that the seeded roll decides? */
function isClose(n: NeighborState, content: Content, p: Proposal): boolean {
  const margin = fairness(p, content) - fairnessNeeded(n, content);
  return Math.abs(margin) < content.rules.diplomacy.tradeDecision.closeBand;
}

function setNeighbor(state: GameState, id: string, fn: (n: NeighborState) => NeighborState): GameState {
  if (!state.region) return state;
  return { ...state, region: { ...state.region, neighbors: state.region.neighbors.map((n) => (n.id === id ? fn(n) : n)) } };
}

/**
 * The player proposes a trade. Accepted: the goods change hands (trust and influence grow as
 * with any trade). Countered: the counter-offer waits for the player's answer. Refused: the
 * reason is remembered for the diplomacy panel. Nothing happens during a raid.
 */
export function proposeTrade(state: GameState, content: Content, id: string, p: Proposal): GameState {
  if (tradingPaused(state) || !validProposal(p, content) || state.resources[p.give.resource] < p.give.amount) return state;
  const n = state.region?.neighbors.find((x) => x.id === id);
  if (!n) return state;
  // Only a close call draws on the seeded RNG, so ordinary trades don't shift other rolls.
  let s = state;
  let roll = 0;
  if (!isEmbargo(n, content) && isClose(n, content, p)) {
    const rng = new Rng(state.rng);
    roll = rng.next();
    s = { ...s, rng: rng.seed };
  }
  const decision = decideTrade(n, content, p, roll);
  if (decision.outcome === "accept") {
    const done = executeTrade(s, content, id, p);
    return setNeighbor(done, id, (x) => ({ ...x, lastRefusal: null }));
  }
  if (decision.outcome === "counter") {
    const counter: CounterOffer = { neighbor: id, give: p.give, want: { ...p.want, amount: decision.want }, expiresAt: state.time + content.rules.diplomacy.tradeDecision.counterSeconds };
    return { ...s, region: { ...s.region!, counter } };
  }
  return setNeighbor(s, id, (x) => ({ ...x, lastRefusal: { reason: decision.reason, at: state.time } }));
}

/** The player takes the counter-offer (while it lasts and both sides still have the goods). */
export function acceptCounter(state: GameState, content: Content): GameState {
  const c = state.region?.counter;
  if (!c || tradingPaused(state) || state.time > c.expiresAt) return state;
  const done = executeTrade(state, content, c.neighbor, c);
  if (done === state) return state;
  return { ...done, region: { ...done.region!, counter: null } };
}

export function declineCounter(state: GameState): GameState {
  return state.region?.counter ? { ...state, region: { ...state.region, counter: null } } : state;
}

/** What a gift is worth: each resource at its handog value (resources that don't exist yet are skipped). */
export function giftValue(gift: Partial<Record<Resource, number>>, content: Content): number {
  const values = content.rules.diplomacy.handog.values;
  return RESOURCES.reduce((sum, r) => sum + Math.max(0, gift[r] ?? 0) * (values[r] ?? 0), 0);
}

/**
 * Handog: a peace gift of rice and/or wood. It goes to their stores, lowers their grudge and
 * raises their trust, both by the gift's value. Needs at least handog.minValue.
 */
export function handog(state: GameState, content: Content, id: string, gift: Partial<Record<Resource, number>>): GameState {
  const h = content.rules.diplomacy.handog;
  const n = state.region?.neighbors.find((x) => x.id === id);
  if (!n) return state;
  const clean: Record<Resource, number> = Object.fromEntries(RESOURCES.map((r) => [r, Number.isInteger(gift?.[r]) && gift[r]! > 0 ? gift[r]! : 0])) as Record<Resource, number>;
  const v = giftValue(clean, content);
  if (v < h.minValue || RESOURCES.some((r) => state.resources[r] < clean[r])) return state;
  const resources = { ...state.resources };
  const theirs = { ...n.state.resources };
  for (const r of RESOURCES) {
    resources[r] -= clean[r];
    theirs[r] += clean[r];
  }
  const s = { ...state, resources };
  return setNeighbor(s, id, (x) => ({
    ...x,
    state: { ...x.state, resources: theirs },
    grudge: clamp100(x.grudge - v * h.grudgePerValue),
    trust: clamp100(x.trust + v * h.trustPerValue),
  }));
}

/** The datu's words for a refusal. */
export function refusalText(reason: RefusalReason, content: Content, datu: string, resource = ""): string {
  return content.rules.diplomacy.refusals[reason].replaceAll("{datu}", datu).replaceAll("{resource}", resource);
}
