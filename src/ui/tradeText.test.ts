import { describe, expect, it } from "vitest";
import { content } from "../engine/testUtils";
import type { TradeOffer } from "../engine/region";
import { loadUiContent } from "./uiContent";
import { offerPayment, offerText } from "./tradeText";
import { withState } from "../engine/testUtils";

const game = loadUiContent(content).game;

describe("trade offer text", () => {
  const flooded: TradeOffer = {
    from: "silangan",
    give: { resource: "salt", amount: 10 },
    want: { resource: "food", amount: 30 },
    expiresAt: 100,
    reason: "flooded",
    goods: { give: "salt", want: "food" },
  };

  it("says why they're trading, with the goods by name", () => {
    const t = offerText(flooded, content, game, "en", "Barangay Silangan");
    expect(t.reason).toBe("Barangay Silangan's fields flooded; they offer Asin for food.");
    expect(t.deal).toBe("10 Asin for 30 🥣 food");
    expect(offerText({ ...flooded, reason: "upriver", give: { resource: "wood", amount: 30 }, goods: { give: "hardwood", want: "dried-fish" } }, content, game, "fil", "X").reason).toContain("matigas na kahoy");
  });

  it("shows each side's worth in gold", () => {
    const v = content.rules.diplomacy.tradeDecision.values;
    const t = offerText(flooded, content, game, "en", "B");
    expect(t.worth).toContain(`≈${(10 * v.salt!) / v.gold!} gold`);
  });

  it("older offers without a reason still read", () => {
    const { reason, goods, ...old } = flooded;
    void reason;
    void goods;
    expect(offerText(old, content, game, "en", "B").reason).toBe("B offers Asin for food.");
  });
});

describe("paying for an offer", () => {
  const asin: TradeOffer = { from: "silangan", give: { resource: "food", amount: 20 }, want: { resource: "salt", amount: 9 }, expiresAt: 100 };

  it("shows what you'd give and how much you have, and the Accept button says what's missing", () => {
    const none = offerPayment(asin, withState({ resources: { salt: 0 } }), game, "en");
    expect(none.youGive).toBe("You give 9 Asin · you have 0");
    expect(none.short).toBe(true);
    expect(none.accept).toBe("Need 9 more Asin");
    expect(offerPayment(asin, withState({ resources: { salt: 4 } }), game, "en").accept).toBe("Need 5 more Asin");
    expect(offerPayment(asin, withState({ resources: { salt: 4 } }), game, "fil").accept).toBe("Kulang pa ng 5 asin");
  });

  it("says Accept when the player can pay", () => {
    const ok = offerPayment(asin, withState({ resources: { salt: 30 } }), game, "en");
    expect(ok).toEqual({ youGive: "You give 9 Asin · you have 30", short: false, accept: "Accept" });
  });
});
