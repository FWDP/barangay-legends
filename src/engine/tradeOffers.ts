// Trade offers from AI barangays, shaped like precolonial exchange: the coast offers Asin and
// fish (as Pagkain: dried fish, fish paste) for hardwood, Palay and gold from upriver; upriver
// and inland barangays offer root crops, gold and hardwood for Asin and fish. A barangay short of
// food (after a poor season, or fields flooded by a typhoon) asks for food. Offers come from real
// stocks: only what a barangay has above what it keeps. Gold is the measure of value
// (rules.diplomacy.tradeDecision.values), and Palay, valued highly, is never traded below its
// value. Pure and deterministic: no randomness here (the chance of an offer is rolled in region.ts).
import type { Content, Resource, TradeKind } from "./content";
import type { GameState } from "./game";
import type { NeighborState, RegionState, TradeOffer } from "./region";
import { sameIsland } from "./archipelago";

/** Why a barangay is trading. */
export type OfferReason = "coastal" | "upriver" | "hungry" | "flooded";

/** Value of so much of a resource, in the trade measure (tradeDecision.values). */
export const unitValue = (content: Content, resource: Resource) => content.rules.diplomacy.tradeDecision.values[resource] ?? 1;
export const tradeValue = (content: Content, resource: Resource, amount: number) => amount * unitValue(content, resource);

/** Roughly what goods are worth in gold, the measure of value. */
export function worthInGold(content: Content, g: { resource: Resource; amount: number }): number {
  return tradeValue(content, g.resource, g.amount) / unitValue(content, "gold");
}

/**
 * Where a barangay trades from. On the home island, by how far down the river it sits; on other
 * islands, inland if it sits near the island's middle; upland traditions are always inland.
 */
export function tradeKind(content: Content, region: Pick<RegionState, "islands" | "places">, n: Pick<NeighborState, "id" | "tradition">): TradeKind {
  const o = content.rules.diplomacy.offers;
  if (o.uplandTraditions.includes(n.tradition)) return "upriver";
  const def = content.neighbors.find((x) => x.id === n.id);
  if (def?.home) return (def.river?.position ?? 0.5) >= o.coastFrom ? "coastal" : "upriver";
  const place = region.places[n.id];
  const island = place && region.islands.find((i) => i.id === place.island);
  if (!place || !island) return "coastal";
  return Math.hypot(place.x - island.x, place.y - island.y) < island.r * o.inlandWithin ? "upriver" : "coastal";
}

/** What a barangay has above what it keeps for itself. */
export function surplus(content: Content, s: GameState, r: Resource): number {
  return Math.max(0, s.resources[r] - content.rules.diplomacy.offers.keepPerVillager[r] * s.villagers);
}

/** Is a barangay short of food (Pagkain and Palay per villager)? */
export function needsFood(content: Content, s: GameState): boolean {
  return s.villagers > 0 && (s.resources.food + s.resources.rice) / s.villagers < content.rules.diplomacy.offers.needFoodPerVillager;
}

/** Were its fields flooded by a typhoon not long ago? */
export const wasFlooded = (content: Content, n: Pick<NeighborState, "floodedAt">, time: number) =>
  n.floodedAt !== undefined && time - n.floodedAt < content.rules.diplomacy.offers.floodedForSeconds;

/** The goods id (ui.json trade.goods) a resource shows as, from barangays of this kind. */
function goodsId(content: Content, kind: TradeKind | null, r: Resource, second: number): string {
  const list = kind ? content.rules.diplomacy.offers.goods[kind][r] : undefined;
  return list?.length ? list[second % list.length] : r;
}

/**
 * The offer this neighbor would make now, or null if it has nothing to spare. They give the
 * surplus they hold most of (by value) among what their kind trades; they ask for food when
 * short of it, otherwise for what they lack most. Palay is given only from a large surplus and
 * for more than its value; given to them, it brings more than its value back.
 */
export function makeOffer(content: Content, region: Pick<RegionState, "islands" | "places">, n: NeighborState, second: number): TradeOffer | null {
  const o = content.rules.diplomacy.offers;
  const td = content.rules.diplomacy.tradeDecision;
  const s = n.state;
  const kind = tradeKind(content, region, n);
  const hungry = needsFood(content, s);
  // What they could give: their kind's goods, Palay only from a large surplus, never food while hungry.
  const palay = s.villagers > 0 && s.resources.rice / s.villagers >= o.palaySurplusPerVillager;
  const can = [...o.kinds[kind].give, ...(palay ? (["rice"] as Resource[]) : [])].filter((r) => !(hungry && (r === "food" || r === "rice")));
  let give: Resource | null = null;
  let best = 0;
  for (const r of can) {
    const v = tradeValue(content, r, Math.floor(surplus(content, s, r)));
    if (v > best && Math.floor(surplus(content, s, r)) >= td.minAmount) {
      give = r;
      best = v;
    }
  }
  if (!give) return null;
  const target = Math.round((o.worthGold * unitValue(content, "gold")) / unitValue(content, give));
  const amount = Math.min(target, Math.floor(surplus(content, s, give)), td.maxAmount);
  // What they ask for: food when hungry, otherwise the first thing they lack, else the first they take.
  const wants = hungry ? (["food"] as Resource[]) : o.kinds[kind].want.filter((r) => r !== give);
  const lacking = wants.find((r) => s.resources[r] < o.keepPerVillager[r] * s.villagers);
  const want = hungry ? "food" : (lacking ?? wants[0]);
  if (!want || want === give) return null;
  const value = tradeValue(content, give, amount);
  // Palay costs more than its value; anything else they let go for a little less than it's worth.
  const wantAmount =
    give === "rice"
      ? Math.ceil((value * o.palayPremiumPercent) / 100 / unitValue(content, want))
      : Math.max(1, Math.floor((value * 100) / o.receivePercent / unitValue(content, want)));
  const other: TradeKind = kind === "coastal" ? "upriver" : "coastal";
  const reason: OfferReason = hungry ? (wasFlooded(content, n, second) ? "flooded" : "hungry") : kind;
  return {
    from: n.id,
    give: { resource: give, amount },
    want: { resource: want, amount: wantAmount },
    expiresAt: second + o.expireSeconds,
    reason,
    goods: { give: goodsId(content, kind, give, second), want: hungry ? want : goodsId(content, other, want, second) },
  };
}

/** Coastal barangays make Asin and upriver ones pan gold, a second's worth (per villager). */
export function tradeIncome(content: Content, region: Pick<RegionState, "islands" | "places">, n: NeighborState): NeighborState {
  const income = content.rules.diplomacy.offers.incomePerVillagerPerMinute[tradeKind(content, region, n)];
  const entries = Object.entries(income) as [Resource, number][];
  if (entries.length === 0 || n.state.villagers <= 0) return n;
  const resources = { ...n.state.resources };
  for (const [r, rate] of entries) resources[r] += (rate * n.state.villagers) / 60;
  return { ...n, state: { ...n.state, resources } };
}

/**
 * A typhoon that hits the player floods the fields of AI barangays on the same island too: they
 * lose a share of their Pagkain, and for a while their offers say so. Nothing else happens to them.
 */
export function stormHitsNeighbors(state: GameState, content: Content, time: number): GameState {
  const region = state.region;
  if (!region) return state;
  const loss = content.rules.diplomacy.offers.typhoonFoodLossPercent / 100;
  const me = state.barangay.id;
  const neighbors = region.neighbors.map((n) =>
    sameIsland(region.places, me, n.id)
      ? { ...n, floodedAt: time, state: { ...n.state, resources: { ...n.state.resources, food: n.state.resources.food * (1 - loss) } } }
      : n,
  );
  return { ...state, region: { ...region, neighbors } };
}
