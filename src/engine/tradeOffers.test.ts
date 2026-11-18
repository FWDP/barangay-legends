import { describe, expect, it } from "vitest";
import { tick, type GameState } from "./game";
import { createRegion, standardProposal, type NeighborState, type RegionState } from "./region";
import { Rng } from "./rng";
import { content, withState } from "./testUtils";
import { makeOffer, needsFood, stormHitsNeighbors, surplus, tradeIncome, tradeKind, tradeValue, worthInGold } from "./tradeOffers";
import { RESOURCES, type Resource } from "./content";

const o = content.rules.diplomacy.offers;

function world(): GameState {
  const s = withState({ villagers: 20 });
  return { ...s, region: createRegion(content, 0, 7, s.barangay.id) };
}
const region = (s: GameState) => s.region!;
const nb = (s: GameState, id: string) => region(s).neighbors.find((n) => n.id === id)!;
/** A neighbor with these stocks (the rest at 0) and villagers. */
const stocked = (n: NeighborState, resources: Partial<Record<Resource, number>>, villagers = 10): NeighborState => ({
  ...n,
  state: { ...n.state, villagers, resources: { ...Object.fromEntries(RESOURCES.map((r) => [r, 0])), ...resources } as NeighborState["state"]["resources"] },
});
const kindOf = (r: RegionState, n: NeighborState) => tradeKind(content, r, n);

describe("coast and upriver", () => {
  it("home-island barangays trade by where they sit on the river; upland traditions are inland", () => {
    const s = world();
    // Content: Pulang-Lupa (0.12) and Malinaw (0.32) upriver; Talampas (0.72) and Batong-Buhay (0.9) near the mouth.
    expect(kindOf(region(s), nb(s, "pulang-lupa"))).toBe("upriver");
    expect(kindOf(region(s), nb(s, "malinaw"))).toBe("upriver");
    expect(kindOf(region(s), nb(s, "talampas"))).toBe("coastal");
    expect(kindOf(region(s), nb(s, "batong-buhay"))).toBe("coastal");
    expect(kindOf(region(s), { ...nb(s, "talampas"), tradition: o.uplandTraditions[0] })).toBe("upriver");
  });

  it("on other islands, the barangay at the middle is inland and the rest coastal", () => {
    const r = region(world());
    const away = r.neighbors.filter((n) => !content.neighbors.find((d) => d.id === n.id)?.home && !o.uplandTraditions.includes(n.tradition));
    const kinds = away.map((n) => kindOf(r, n));
    expect(kinds).toContain("coastal");
    for (const n of away) {
      const p = r.places[n.id];
      const island = r.islands.find((i) => i.id === p.island)!;
      const inland = Math.hypot(p.x - island.x, p.y - island.y) < island.r * o.inlandWithin;
      expect(kindOf(r, n)).toBe(inland ? "upriver" : "coastal");
    }
  });
});

describe("offers follow each barangay's surplus and needs", () => {
  it("the coast offers Asin (or fish) for forest goods and Palay; upriver offers gold, root crops or hardwood for Asin and fish", () => {
    const s = world();
    const coast = stocked(nb(s, "talampas"), { salt: 200, food: 100, rice: 100, wood: 0 });
    const offer = makeOffer(content, region(s), coast, 1000)!;
    expect(offer.reason).toBe("coastal");
    expect(o.kinds.coastal.give).toContain(offer.give.resource);
    expect(o.kinds.coastal.want).toContain(offer.want.resource);
    // Asin, their biggest surplus by value, for hardwood, which they lack.
    expect(offer.give.resource).toBe("salt");
    expect(offer.want).toMatchObject({ resource: "wood" });
    expect(offer.goods).toEqual({ give: "salt", want: "hardwood" });
    // Fish when they have more of it than Asin: shown as dried fish or fish paste.
    const fishy = makeOffer(content, region(s), stocked(coast, { food: 400, rice: 100 }), 1000)!;
    expect(fishy.give.resource).toBe("food");
    expect(o.goods.coastal.food).toContain(fishy.goods!.give);

    const up = stocked(nb(s, "pulang-lupa"), { gold: 40, food: 100, rice: 100, wood: 60 });
    const upOffer = makeOffer(content, region(s), up, 1000)!;
    expect(upOffer.reason).toBe("upriver");
    expect(upOffer.give.resource).toBe("gold");
    expect(upOffer.want.resource).toBe("salt");
    // Root crops for fish.
    const roots = makeOffer(content, region(s), stocked(up, { food: 300, rice: 100, salt: 100 }), 1000)!;
    expect(roots.give.resource).toBe("food");
    expect(roots.goods!.give).toBe("root-crops");
    expect(roots.want.resource).not.toBe("food");
    // Hardwood only from upriver, and only from a surplus.
    const timber = makeOffer(content, region(s), stocked(up, { wood: 300, rice: 100, food: 60 }), 1000)!;
    expect(timber.give.resource).toBe("wood");
    expect(timber.goods!.give).toBe("hardwood");
  });

  it("only gives from what's above what they keep, and makes no offer with nothing to spare", () => {
    const s = world();
    for (const id of ["talampas", "pulang-lupa"]) {
      const n = stocked(nb(s, id), { food: 40, rice: 60, wood: 30 }, 10);
      expect(makeOffer(content, region(s), n, 1000)).toBeNull();
    }
    const rng = new Rng(99);
    for (let i = 0; i < 300; i++) {
      const n = stocked(nb(s, rng.next() < 0.5 ? "talampas" : "pulang-lupa"), Object.fromEntries(RESOURCES.map((r) => [r, Math.floor(rng.next() * 400)])), 1 + Math.floor(rng.next() * 30));
      const offer = makeOffer(content, region(s), n, 1000);
      if (!offer) continue;
      expect(offer.give.amount).toBeLessThanOrEqual(surplus(content, n.state, offer.give.resource));
      expect(offer.give.amount).toBeGreaterThanOrEqual(content.rules.diplomacy.tradeDecision.minAmount);
      expect(offer.give.resource).not.toBe(offer.want.resource);
      // Ordinary wood is never offered by the coast.
      if (kindOf(region(s), n) === "coastal") expect(offer.give.resource).not.toBe("wood");
    }
  });

  it("a barangay short of food asks for food, and never gives food away", () => {
    const s = world();
    const n = stocked(nb(s, "talampas"), { salt: 200, food: 5, rice: 5 }, 10);
    expect(needsFood(content, n.state)).toBe(true);
    const offer = makeOffer(content, region(s), n, 1000)!;
    expect(offer).toMatchObject({ reason: "hungry", give: { resource: "salt" }, want: { resource: "food" } });
  });

  it("a typhoon floods the fields of barangays on the player's island, and their offers say so", () => {
    let s = world();
    s = { ...s, region: { ...region(s), neighbors: region(s).neighbors.map((n) => stocked(n, { salt: 200, food: 32, rice: 0 }, 10)) } };
    const hit = stormHitsNeighbors(s, content, 500);
    const me = s.barangay.id;
    for (const n of region(hit).neighbors) {
      const home = region(s).places[n.id].island === region(s).places[me].island;
      expect(n.state.resources.food).toBeCloseTo(home ? 32 * (1 - o.typhoonFoodLossPercent / 100) : 32);
      expect(n.floodedAt).toBe(home ? 500 : undefined);
    }
    const talampas = nb(hit, "talampas");
    expect(makeOffer(content, region(hit), talampas, 600)).toMatchObject({ reason: "flooded", want: { resource: "food" } });
    // Long after, it was just a poor season.
    expect(makeOffer(content, region(hit), talampas, 500 + o.floodedForSeconds + 1)).toMatchObject({ reason: "hungry" });
  });

  it("a real typhoon on the player reaches the neighbors", () => {
    const s = world();
    const typhoon = content.events.typhoon!;
    const coming = { ...s, typhoon: { strikeAt: s.time + 1 }, nextEventAt: { ...s.nextEventAt, [typhoon.id]: 1e9 } };
    const after = tick(coming, content, 1.5);
    expect(region(after).neighbors.some((n) => n.floodedAt !== undefined)).toBe(true);
  });

  it("coastal barangays make Asin and upriver ones pan gold", () => {
    const s = world();
    const coast = tradeIncome(content, region(s), stocked(nb(s, "talampas"), {}, 20));
    const up = tradeIncome(content, region(s), stocked(nb(s, "pulang-lupa"), {}, 20));
    expect(coast.state.resources.salt).toBeCloseTo(((o.incomePerVillagerPerMinute.coastal.salt ?? 0) * 20) / 60);
    expect(up.state.resources.gold).toBeCloseTo(((o.incomePerVillagerPerMinute.upriver.gold ?? 0) * 20) / 60);
  });
});

describe("palay and gold", () => {
  it("palay is never traded below its value, and they rarely give it", () => {
    const s = world();
    const rng = new Rng(7);
    let givenPalay = 0;
    let offers = 0;
    for (let i = 0; i < 2000; i++) {
      const n = stocked(nb(s, rng.next() < 0.5 ? "talampas" : "pulang-lupa"), Object.fromEntries(RESOURCES.map((r) => [r, Math.floor(rng.next() * 600)])), 1 + Math.floor(rng.next() * 30));
      const offer = makeOffer(content, region(s), n, i);
      if (!offer) continue;
      offers++;
      const give = tradeValue(content, offer.give.resource, offer.give.amount);
      const want = tradeValue(content, offer.want.resource, offer.want.amount);
      if (offer.give.resource === "rice") {
        givenPalay++;
        // They ask more than its value.
        expect(want).toBeGreaterThanOrEqual((give * o.palayPremiumPercent) / 100 - 1e-9);
        expect(n.state.resources.rice / n.state.villagers).toBeGreaterThanOrEqual(o.palaySurplusPerVillager);
      }
      // Palay the player gives brings back at least its value.
      if (offer.want.resource === "rice") expect(give).toBeGreaterThanOrEqual(want);
    }
    expect(offers).toBeGreaterThan(100);
    expect(givenPalay / offers).toBeLessThan(0.25);
    // The standard parcel is valued the same way: a parcel of Palay is fewer sacks than one of wood.
    const palay = standardProposal(content, "malinaw", "rice");
    const wood = standardProposal(content, "malinaw", "wood");
    expect(tradeValue(content, "rice", palay.give.amount)).toBe(tradeValue(content, "wood", wood.give.amount));
    expect(palay.give.amount).toBeLessThan(wood.give.amount);
  });

  it("Palay is valued highly, and every offer has a worth in gold", () => {
    const v = content.rules.diplomacy.tradeDecision.values;
    expect(v.rice!).toBeGreaterThan(v.wood!);
    expect(v.rice!).toBeGreaterThan(v.food!);
    expect(worthInGold(content, { resource: "gold", amount: 7 })).toBe(7);
    const s = world();
    const offer = makeOffer(content, region(s), stocked(nb(s, "talampas"), { salt: 200, food: 100, rice: 100 }), 1000)!;
    expect(worthInGold(content, offer.give)).toBeCloseTo(o.worthGold, 0);
  });
});
