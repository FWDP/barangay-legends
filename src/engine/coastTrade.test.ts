// Early-game clarity for the coast and trade: buildings by the sea wait for a coast tile
// villagers can reach (map.siteLock), the first trade offers are easy, early offers never ask
// for what the player can't make yet, and coastal barangays bring Asin to a barangay with none.
import { describe, expect, it } from "vitest";
import { apply, tick, type GameState } from "./game";
import { hasReachableSite, nearestCoast, siteLock } from "./map";
import { createRegion, type NeighborState } from "./region";
import { at, calm, content, mapFrom, withState } from "./testUtils";
import { canProduce, makeOffer, offerChanceFactor, offerShortfall, SALT_OFFERED, tradeKind } from "./tradeOffers";
import { RESOURCES, type Resource } from "./content";
import { taskMet } from "./gawain";

const def = (id: string) => content.buildings.find((b) => b.id === id)!;
const o = content.rules.diplomacy.offers;

// The plaza up the river bank, forest between it and the sea along the bottom.
const ROWS = ["~.......TT", "~..P....TT", "~.......TT", "~TTTTTTTTT", "~TTTTTTTTT", "ssssssssss"];
const onMap = (rows: string[]) => withState({ villagers: 20, map: mapFrom(rows), buildings: [] });

describe("buildings by the sea", () => {
  it("the Asinan is locked until a cleared coast tile can be walked to from the Bahay ng Datu", () => {
    const inland = onMap(ROWS);
    expect(siteLock(inland, content, def("asinan"))).toBe("coast");
    // A cleared tile by the sea, but cut off by forest: still locked.
    const island = onMap(["~.......TT", "~..P....TT", "~.......TT", "~TTTTTTTTT", "~TTTTTT.TT", "ssssssssss"]);
    expect(siteLock(island, content, def("asinan"))).toBe("coast");
    // Cleared all the way down to the shore: open.
    const reached = onMap(["~.......TT", "~..P....TT", "~.......TT", "~......TTT", "~......TTT", "ssssssssss"]);
    expect(siteLock(reached, content, def("asinan"))).toBeNull();
    expect(hasReachableSite(reached, content, def("asinan"))).toBe(true);
  });

  it("the Pangangalap may stand on a river bank, so it stays available without the coast", () => {
    expect(def("pangangalap").placeNextTo).toEqual(expect.arrayContaining(["sea", "river"]));
    expect(siteLock(onMap(ROWS), content, def("pangangalap"))).toBeNull();
    // With no river bank cleared either, it waits for "the coast or a river bank".
    const noBank = onMap(["T.......TT", "T..P....TT", "T.......TT", "TTTTTTTTTT", "TTTTTTTTTT", "ssssssssss"]);
    expect(siteLock(noBank, content, def("pangangalap"))).toBe("shore");
  });

  it("buildings that don't need the sea are never site-locked", () => {
    for (const id of ["gabihan", "palayan", "woodcutter-camp"]) expect(siteLock(onMap(ROWS), content, def(id))).toBeNull();
  });

  it("knows where the nearest coast is, to show it", () => {
    expect(nearestCoast(mapFrom(ROWS))).toEqual({ x: 3, y: 4 });
  });
});

/** A new game's player in a region, with these stocks. */
function player(resources: Partial<Record<Resource, number>>, patch: Partial<GameState> = {}): GameState {
  const s = withState({ villagers: 20, resources, buildings: [at("bahay-kubo", 5, 3)], ...patch });
  return { ...s, region: createRegion(content, 0, 7, s.barangay.id) };
}
/** A neighbor with plenty of everything to spare (and lacking nothing), so only the rules choose. */
const rich = (n: NeighborState, stock = 2000): NeighborState => ({
  ...n,
  state: { ...n.state, villagers: 10, resources: Object.fromEntries(RESOURCES.map((r) => [r, stock])) as NeighborState["state"]["resources"] },
});
/** Neighbors that lack everything they could ask for (so they ask for the first in their list). */
const poor = (n: NeighborState, give: Resource): NeighborState => ({
  ...n,
  state: { ...n.state, villagers: 10, resources: { ...(Object.fromEntries(RESOURCES.map((r) => [r, 0])) as NeighborState["state"]["resources"]), rice: 100, food: 100, [give]: 500 } },
});

describe("learning to trade", () => {
  it("the first offers ask only for what the player has plenty of, and give something useful", () => {
    const p = player({ food: 120, wood: 60 });
    for (const n of p.region!.neighbors) {
      for (const [i, nb] of [rich(n), poor(n, "salt"), poor(n, "gold")].entries()) {
        const offer = makeOffer(content, p.region!, nb, 1000, p);
        if (!offer) continue;
        expect(offer.lesson).toBe("first");
        // Affordable with plenty left over.
        expect(offerShortfall(p, offer)).toBeNull();
        expect(offer.want.amount).toBeLessThanOrEqual((p.resources[offer.want.resource] * o.learning.maxSharePercent) / 100);
        expect(canProduce(content, p, offer.want.resource)).toBe(true);
        // Something the player doesn't make yet, when the neighbor has some to spare (the rich one).
        if (i === 0) expect(canProduce(content, p, offer.give.resource)).toBe(false);
        expect(offer.expiresAt - 1000).toBe(o.learning.expireSeconds);
      }
    }
  });

  it("a player with nothing to spare gets no first offer rather than one they can't pay", () => {
    const p = player({ food: 0, wood: 0 });
    for (const n of p.region!.neighbors) expect(makeOffer(content, p.region!, rich(n), 1000, p)).toBeNull();
  });

  it("early offers never ask for goods the player can't produce yet; later, harder ones can", () => {
    const past = { stats: { ...player({}).stats, offersSeen: o.learning.firstOffers } };
    const p = player({ food: 500, wood: 500 }, past);
    const asked = new Set<Resource>();
    for (const n of p.region!.neighbors) {
      for (const give of ["salt", "gold", "food", "wood"] as Resource[]) {
        for (const second of [600, 1200, 2400]) {
          const offer = makeOffer(content, p.region!, poor(n, give), second, p);
          if (offer) asked.add(offer.want.resource);
        }
      }
    }
    expect(asked.size).toBeGreaterThan(0);
    for (const r of asked) expect(canProduce(content, p, r)).toBe(true);
    expect(asked.has("salt")).toBe(false);
    // After the early game, an inland barangay may ask for Asin even from a player with none.
    const later = o.learning.earlySeconds + 600;
    const up = p.region!.neighbors.find((n) => tradeKind(content, p.region!, n) === "upriver")!;
    expect(makeOffer(content, p.region!, poor(up, "gold"), later, p)?.want.resource).toBe("salt");
    // With an Asinan of their own, inland barangays want the player's salt right away.
    const salter = { ...p, buildings: [...p.buildings, at("asinan", 1, 1)], resources: { ...p.resources, salt: 50 } };
    expect(makeOffer(content, p.region!, poor(up, "gold"), 600, salter)?.want.resource).toBe("salt");
  });

  it("offers seen and accepted are counted, and accepting one meets the first-trade task", () => {
    let s = player({ food: 300, wood: 300 }, { gawainDone: [] });
    s = { ...s, region: { ...s.region!, neighbors: s.region!.neighbors.map((n) => ({ ...rich(n), trust: 60 })) } };
    let seen = 0;
    for (let i = 0; i < 1200 && !s.region!.offer; i++) s = tick(s, calm, 1);
    seen = s.stats.offersSeen ?? 0;
    expect(seen).toBe(1);
    expect(s.region!.offer!.lesson).toBe("first");
    const accepted = apply(s, calm, { type: "acceptOffer" });
    expect(accepted.stats.offersAccepted).toBe(1);
    expect(taskMet(accepted, content, content.quests.find((q) => q.id === "accept-offer")!)).toBe(true);
  });
});

describe("accepting an offer is worth its value", () => {
  it("a small offer brings less trust than a large one, like a proposed trade", () => {
    const base = player({ food: 1000, wood: 1000 });
    const n = rich(base.region!.neighbors[0]);
    const withOffer = (amount: number): GameState => ({
      ...base,
      region: { ...base.region!, neighbors: base.region!.neighbors.map((x) => (x.id === n.id ? { ...n, trust: 40 } : x)), offer: { from: n.id, give: { resource: "gold", amount: 5 }, want: { resource: "food", amount }, expiresAt: base.time + 60 } },
    });
    const trust = (s: GameState) => s.region!.neighbors.find((x) => x.id === n.id)!.trust;
    const small = apply(withOffer(4), calm, { type: "acceptOffer" });
    const large = apply(withOffer(200), calm, { type: "acceptOffer" });
    expect(trust(small)).toBeGreaterThan(40);
    expect(trust(large) - 40).toBeGreaterThan(trust(small) - 40);
  });
});

describe("salt by trade", () => {
  const coastal = (s: GameState) => s.region!.neighbors.find((n) => tradeKind(content, s.region!, n) === "coastal")!;
  const upriver = (s: GameState) => s.region!.neighbors.find((n) => tradeKind(content, s.region!, n) === "upriver")!;

  it("coastal barangays come more often to a barangay with no Asinan, much more once it fishes, less once it makes salt", () => {
    const c = o.salt;
    const p = player({ food: 100, wood: 100 });
    expect(offerChanceFactor(content, p.region!, coastal(p), p)).toBe(c.noCoastMultiplier);
    expect(offerChanceFactor(content, p.region!, upriver(p), p)).toBe(1);
    const fishing = { ...p, buildings: [...p.buildings, at("fishing-dock", 1, 2)] };
    expect(offerChanceFactor(content, p.region!, coastal(p), fishing)).toBe(c.saltPromptMultiplier);
    // Spoiling fresh food counts too; once Asin has been offered, back to the usual.
    const spoiling = { ...p, foodStore: { ...p.foodStore, fresh: c.spoilingFresh } };
    expect(offerChanceFactor(content, p.region!, coastal(p), spoiling)).toBe(c.saltPromptMultiplier);
    expect(offerChanceFactor(content, p.region!, coastal(p), { ...fishing, flags: [...fishing.flags, SALT_OFFERED] })).toBe(c.noCoastMultiplier);
    const salter = { ...p, buildings: [...p.buildings, at("asinan", 1, 1)] };
    expect(offerChanceFactor(content, p.region!, coastal(p), salter)).toBe(c.ownAsinanMultiplier);
  });

  it("a coastal barangay offers Asin first to a barangay with no Asinan, for what it can spare", () => {
    const p = player({ food: 200, wood: 200 }, { stats: { ...player({}).stats, offersSeen: o.learning.firstOffers } });
    const offer = makeOffer(content, p.region!, rich(coastal(p)), 1000, p)!;
    expect(offer).toMatchObject({ give: { resource: "salt" }, lesson: "salt" });
    expect(canProduce(content, p, offer.want.resource)).toBe(true);
    // With its own Asinan, it no longer favors Asin.
    const salter = { ...p, buildings: [...p.buildings, at("asinan", 1, 1)] };
    expect(makeOffer(content, p.region!, rich(coastal(p)), 1000, salter)?.lesson).toBeUndefined();
  });

  it("nothing essential needs Asin: no building, task or feast costs it", () => {
    for (const b of content.buildings) expect(b.cost.salt ?? 0).toBe(0);
    for (const q of content.quests) expect(q.condition.type === "built" && q.condition.building === "asinan" && !q.next).toBe(false);
    expect(content.rules.food.pista.cost.salt ?? 0).toBe(0);
  });
});
