// How a trade offer reads: why they're trading (coast, upriver, a poor harvest, flooded fields),
// the goods by their names (dried fish, root crops, hardwood…), and each side's rough worth in
// gold, the measure of value. Presentation only (engine/tradeOffers.ts makes the offers).
import type { Content } from "../engine/content";
import type { TradeOffer } from "../engine/region";
import { offerShortfall, worthInGold } from "../engine/tradeOffers";
import type { GameState } from "../engine/game";
import { RESOURCE_ICON } from "./format";
import type { Lang } from "./settings";
import { fill, type GameText } from "./uiContent";

/** A goods id's name (ui.json tradeGoods), falling back to the id. */
export function goodsName(game: GameText, id: string, lang: Lang): string {
  return (game.tradeGoods as Record<string, Record<Lang, string> | undefined>)[id]?.[lang] ?? id;
}

/** The offer's words: why, what for what (with amounts and icons), and its worth in gold. */
export function offerText(offer: TradeOffer, content: Content, game: GameText, lang: Lang, barangay: string): { reason: string; deal: string; worth: string } {
  const t = game.offer;
  const give = goodsName(game, offer.goods?.give ?? offer.give.resource, lang);
  const want = goodsName(game, offer.goods?.want ?? offer.want.resource, lang);
  const reason = offer.reason ? fill(t[offer.reason][lang], { barangay, give, want }) : fill(t.plain[lang], { barangay, give, want });
  // Asin has a word for its icon, not a picture: then the name alone.
  const side = (g: TradeOffer["give"], name: string) => {
    const icon = RESOURCE_ICON[g.resource];
    return /^\p{L}/u.test(icon) ? `${g.amount} ${name}` : `${g.amount} ${icon} ${name}`;
  };
  const deal = fill(t.deal[lang], { give: side(offer.give, give), want: side(offer.want, want) });
  const round = (n: number) => (n >= 10 ? String(Math.round(n)) : String(Math.round(n * 10) / 10));
  const worth = fill(t.worth[lang], { give: round(worthInGold(content, offer.give)), want: round(worthInGold(content, offer.want)) });
  return { reason, deal, worth };
}

/**
 * What the player would give and how much of it they have ("You give 9 Asin · you have 0"),
 * short when they can't pay; and the Accept button's words: "Accept", or what's missing
 * ("Need 9 more Asin") so it is never silently disabled.
 */
export function offerPayment(offer: TradeOffer, state: GameState, game: GameText, lang: Lang): { youGive: string; short: boolean; accept: string } {
  const t = game.offer;
  const name = goodsName(game, offer.want.resource, lang);
  const have = Math.floor(state.resources[offer.want.resource]);
  const gap = offerShortfall(state, offer);
  return {
    youGive: fill(t.youGive[lang], { amount: offer.want.amount, name, have }),
    short: gap !== null,
    accept: gap ? fill(t.need[lang], { amount: gap.missing, name }) : t.accept[lang],
  };
}
