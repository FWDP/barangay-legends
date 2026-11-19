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

/** Does the player make this resource yet: by hand (Gather), in a building they own, or rice wine from their own Palay? */
export function canProduce(content: Content, player: GameState, r: Resource): boolean {
  if (content.rules.gatherable.includes(r)) return true;
  const owned = new Set(player.buildings.map((b) => b.type));
  const makes = (res: Resource) => content.buildings.some((d) => owned.has(d.id) && (d.produces?.[res] ?? 0) > 0);
  return makes(r) || (r === "wine" && makes("rice"));
}

/** Does the player have a building that makes Asin (an Asinan)? */
export const makesSalt = (content: Content, player: GameState) => player.buildings.some((b) => (content.buildings.find((d) => d.id === b.type)?.produces?.salt ?? 0) > 0);

/** Does the player catch fish (a fishing building), or is fresh Pagkain spoiling? Then salt is worth offering. */
export function wantsSalt(content: Content, player: GameState): boolean {
  if (makesSalt(content, player)) return false;
  const fishing = player.buildings.some((b) => content.buildings.find((d) => d.id === b.type)?.foodGroup === "fish");
  return fishing || (player.foodStore?.fresh ?? 0) >= content.rules.diplomacy.offers.salt.spoilingFresh;
}

/** Is this one of the first, easy offers of the player's game? */
export const learningOffer = (content: Content, player: GameState) => (player.stats.offersSeen ?? 0) < content.rules.diplomacy.offers.learning.firstOffers;

/** When an offer's boat set out (older saves: worked out from its expiry, at the usual wait). */
export const offerSetOut = (content: Content, offer: Pick<TradeOffer, "at" | "expiresAt">) => offer.at ?? offer.expiresAt - content.rules.diplomacy.offers.expireSeconds;

/** How much the player is short to accept an offer (what they'd give), or null when they can pay. */
export function offerShortfall(player: GameState, offer: Pick<TradeOffer, "want">): { resource: Resource; missing: number } | null {
  const missing = Math.ceil(offer.want.amount - player.resources[offer.want.resource]);
  return missing > 0 ? { resource: offer.want.resource, missing } : null;
}

/**
 * The offer this neighbor would make now, or null if it has nothing to spare. They give the
 * surplus they hold most of (by value) among what their kind trades; they ask for food when
 * short of it, otherwise for what they lack most. Palay is given only from a large surplus and
 * for more than its value; given to them, it brings more than its value back.
 *
 * With the player's state: early in a game they never ask for what the player can't produce
 * yet (learning.earlySeconds); the first offers (learning.firstOffers) ask only for what the
 * player has plenty of, at most maxSharePercent of it, and give something the player doesn't
 * make; and a coastal barangay gives Asin first to a player with no Asinan.
 */
export function makeOffer(content: Content, region: Pick<RegionState, "islands" | "places">, n: NeighborState, second: number, player?: GameState): TradeOffer | null {
  const o = content.rules.diplomacy.offers;
  const td = content.rules.diplomacy.tradeDecision;
  const s = n.state;
  const kind = tradeKind(content, region, n);
  const hungry = needsFood(content, s);
  const first = player !== undefined && learningOffer(content, player);
  const early = player !== undefined && (first || second - player.foundedAt < o.learning.earlySeconds);
  const produces = (r: Resource) => !player || canProduce(content, player, r);
  // What they could give: their kind's goods, Palay only from a large surplus, never food while hungry.
  const palay = s.villagers > 0 && s.resources.rice / s.villagers >= o.palaySurplusPerVillager;
  const can = [...o.kinds[kind].give, ...(palay ? (["rice"] as Resource[]) : [])].filter((r) => !(hungry && (r === "food" || r === "rice")) && Math.floor(surplus(content, s, r)) >= td.minAmount);
  // Asin first for a player with no Asinan; on the first offers, something the player doesn't make.
  const saltFirst = player !== undefined && kind === "coastal" && !makesSalt(content, player) && can.includes("salt");
  const useful = first ? can.filter((r) => !produces(r)) : [];
  const pool = saltFirst ? ["salt" as Resource] : useful.length ? useful : can;
  let give: Resource | null = null;
  let best = 0;
  for (const r of pool) {
    const v = tradeValue(content, r, Math.floor(surplus(content, s, r)));
    if (v > best) {
      give = r;
      best = v;
    }
  }
  if (!give) return null;
  let amount = Math.min(Math.round((o.worthGold * unitValue(content, "gold")) / unitValue(content, give)), Math.floor(surplus(content, s, give)), td.maxAmount);
  // What they ask for: food when hungry, otherwise the first thing they lack, else the first they take.
  // Early on, only what the player can make; on the first offers, only what the player has plenty of.
  let wants = (hungry ? (["food"] as Resource[]) : o.kinds[kind].want).filter((r) => r !== give && (!early || produces(r)));
  if (first) {
    const share = o.learning.maxSharePercent / 100;
    const plenty = (r: Resource) => player!.resources[r] * share;
    // The player's own plenty (Pagkain, wood) when what they'd ask for is short.
    const extra = (["food", "wood"] as Resource[]).filter((r) => r !== give && !wants.includes(r));
    wants = [...wants, ...extra].filter((r) => plenty(r) >= 1).sort((a, b) => tradeValue(content, b, plenty(b)) - tradeValue(content, a, plenty(a)));
  }
  const lacking = wants.find((r) => s.resources[r] < o.keepPerVillager[r] * s.villagers);
  const want = first ? wants[0] : hungry ? (wants[0] ?? null) : (lacking ?? wants[0]);
  if (!want || want === give) return null;
  // Palay costs more than its value; anything else they let go for a little less than it's worth.
  const ask = (giveAmount: number) => {
    const value = tradeValue(content, give!, giveAmount);
    return give === "rice" ? Math.ceil((value * o.palayPremiumPercent) / 100 / unitValue(content, want)) : Math.max(1, Math.floor((value * 100) / o.receivePercent / unitValue(content, want)));
  };
  let wantAmount = ask(amount);
  if (first) {
    // Small enough to afford with plenty left: scale the whole offer down.
    const most = Math.floor((player!.resources[want] * o.learning.maxSharePercent) / 100);
    if (wantAmount > most) {
      amount = Math.floor((amount * most) / wantAmount);
      if (amount < 1) return null;
      wantAmount = Math.min(most, ask(amount));
    }
    if (wantAmount < 1 || wantAmount > most) return null;
  }
  const other: TradeKind = kind === "coastal" ? "upriver" : "coastal";
  const reason: OfferReason = hungry ? (wasFlooded(content, n, second) ? "flooded" : "hungry") : kind;
  const lesson = first ? "first" : saltFirst && give === "salt" ? "salt" : undefined;
  return {
    from: n.id,
    give: { resource: give, amount },
    want: { resource: want, amount: wantAmount },
    expiresAt: second + (first ? o.learning.expireSeconds : o.expireSeconds),
    at: second,
    reason,
    goods: { give: goodsId(content, kind, give, second), want: hungry ? want : goodsId(content, other, want, second) },
    ...(lesson ? { lesson } : {}),
  };
}

/**
 * How much more (or less) often this neighbor brings an offer to the player: coastal barangays
 * come more to a barangay with no Asinan (much more once it fishes or its food spoils, until it
 * has had an Asin offer), and less once it makes its own salt.
 */
export function offerChanceFactor(content: Content, region: Pick<RegionState, "islands" | "places">, n: NeighborState, player: GameState): number {
  if (tradeKind(content, region, n) !== "coastal") return 1;
  const c = content.rules.diplomacy.offers.salt;
  if (makesSalt(content, player)) return c.ownAsinanMultiplier;
  return wantsSalt(content, player) && !player.flags.includes(SALT_OFFERED) ? c.saltPromptMultiplier : c.noCoastMultiplier;
}

/** Flag set once a coastal barangay has offered Asin to a player with no Asinan. */
export const SALT_OFFERED = "salt-offered";

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
