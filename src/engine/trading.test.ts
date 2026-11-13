import { describe, expect, it } from "vitest";
import { apply, tick, type GameState } from "./game";
import { offlineProgress } from "./offline";
import { createRegion, marriageBlocker, type NeighborState } from "./region";
import { parseSave } from "./save";
import { calm, content, withState } from "./testUtils";
import { decideTrade, fairnessNeeded, giftValue, isEmbargo, refusalText, type Proposal } from "./trading";

const d = content.rules.diplomacy;
const g = d.grudge;
const td = d.tradeDecision;

function world(patch: Partial<GameState> = {}): GameState {
  const s = withState({ resources: { rice: 2000, wood: 2000 }, villagers: 20, buildings: [], ...patch });
  return { ...s, region: patch.region ?? createRegion(calm, s.time, 7) };
}
const nb = (s: GameState, id: string) => s.region!.neighbors.find((n) => n.id === id)!;
const setNb = (s: GameState, id: string, patch: Partial<NeighborState>): GameState => ({
  ...s,
  region: { ...s.region!, neighbors: s.region!.neighbors.map((n) => (n.id === id ? { ...n, ...patch } : n)) },
});
/** A neighbor with plenty of goods to trade. */
const rich = (s: GameState, id: string, patch: Partial<NeighborState> = {}) =>
  setNb(s, id, { state: { ...nb(s, id).state, resources: { rice: 1000, wood: 1000 } }, ...patch });
const deal = (give: number, want: number): Proposal => ({ give: { resource: "rice", amount: give }, want: { resource: "wood", amount: want } });

describe("grudge", () => {
  it("rises with each raid, more when the raid succeeds", () => {
    // Find one winning and one losing raid by trying seeds (the battle roll is seeded).
    let won: number | null = null;
    let lost: number | null = null;
    for (let seed = 1; seed < 300 && (won === null || lost === null); seed++) {
      const s = setNb(world({ warriors: 6, villagers: 20, rng: seed }), "malinaw", { trust: 50 });
      const after = apply(s, calm, { type: "raid", neighbor: "malinaw", warriors: 6 });
      const r = after.region!.reports.at(-1)!;
      if (r.win && won === null) won = nb(after, "malinaw").grudge;
      if (!r.win && lost === null) lost = nb(after, "malinaw").grudge;
    }
    expect(won).toBe(g.raidWon);
    expect(lost).toBe(g.raidLost);
    expect(g.raidWon).toBeGreaterThan(g.raidLost);
  });

  it("is separate from trust", () => {
    const s = setNb(world(), "malinaw", { trust: 80, grudge: 50 });
    const n = nb(s, "malinaw");
    expect(n.trust).toBe(80);
    expect(n.grudge).toBe(50);
  });

  it("fades slowly over time, and while the player is away", () => {
    const s = setNb(world(), "malinaw", { grudge: 50 });
    expect(nb(tick(s, calm, 60), "malinaw").grudge).toBeCloseTo(50 - g.decayPerMinute, 5);
    expect(nb(tick(s, calm, 60 * 60), "malinaw").grudge).toBe(0);
    expect(nb(offlineProgress(s, content, 600).state, "malinaw").grudge).toBeCloseTo(50 - g.decayPerMinute * 10, 5);
  });
});

describe("trade decisions", () => {
  const base = () => rich(world(), "malinaw", { trust: 50, grudge: 0 });

  it("accepts a fair deal", () => {
    expect(decideTrade(nb(base(), "malinaw"), content, deal(20, 16), 0.99)).toEqual({ outcome: "accept" });
    const s = apply(base(), calm, { type: "proposeTrade", neighbor: "malinaw", ...deal(20, 16) });
    expect(s.resources.wood).toBe(2016);
    expect(s.resources.rice).toBe(1980);
  });

  it("counters a deal that's a little short, with less of what they give", () => {
    const n = nb(base(), "malinaw");
    const need = fairnessNeeded(n, content);
    const p = deal(20, Math.ceil(20 / (need - td.closeBand - 0.1)));
    const decision = decideTrade(n, content, p, 0.5);
    expect(decision.outcome).toBe("counter");
    if (decision.outcome === "counter") expect(decision.want).toBeLessThan(p.want.amount);
    const s = apply(base(), calm, { type: "proposeTrade", neighbor: "malinaw", ...p });
    expect(s.region!.counter).toMatchObject({ neighbor: "malinaw", give: p.give });
    // Taking the counter makes the trade at their amounts.
    const done = apply(s, calm, { type: "acceptCounter" });
    expect(done.region!.counter).toBeNull();
    expect(done.resources.wood).toBe(2000 + s.region!.counter!.want.amount);
  });

  it("refuses a very unfair deal as unfair, and one from a raider as remembered raids", () => {
    expect(decideTrade(nb(base(), "malinaw"), content, deal(5, 100), 0.5)).toEqual({ outcome: "refuse", reason: "unfair" });
    const raided = nb(rich(world(), "malinaw", { trust: 50, grudge: g.raidsReasonAbove + 15 }), "malinaw");
    expect(decideTrade(raided, content, deal(10, 40), 0.5)).toEqual({ outcome: "refuse", reason: "raids" });
    const s = apply(rich(world(), "malinaw", { trust: 50, grudge: 40 }), calm, { type: "proposeTrade", neighbor: "malinaw", ...deal(10, 40) });
    expect(nb(s, "malinaw").lastRefusal).toMatchObject({ reason: "raids" });
  });

  it("refuses what they don't have", () => {
    const poor = setNb(base(), "malinaw", { state: { ...nb(base(), "malinaw").state, resources: { rice: 0, wood: 3 } } });
    expect(decideTrade(nb(poor, "malinaw"), content, deal(20, 10), 0.5)).toEqual({ outcome: "refuse", reason: "short" });
  });

  it("traders are more willing than proud datus", () => {
    const s = world();
    // Pulang-Lupa are traders, Talampas proud (content/neighbors).
    const trader = { ...nb(s, "pulang-lupa"), trust: 40, grudge: 10 };
    const proud = { ...nb(s, "talampas"), trust: 40, grudge: 10 };
    expect(fairnessNeeded(trader, content)).toBeLessThan(fairnessNeeded(proud, content));
  });

  it("close calls are settled by the seeded roll", () => {
    const n = nb(base(), "malinaw");
    const need = fairnessNeeded(n, content);
    // Just under what they need: a high roll refuses or counters, a low one accepts.
    const p = deal(100, Math.round(100 / (need - td.closeBand / 4)));
    expect(decideTrade(n, content, p, 0.01).outcome).toBe("accept");
    expect(decideTrade(n, content, p, 0.99).outcome).not.toBe("accept");
  });

  it("gives identical results for the same seed, and only close calls use the RNG", () => {
    const n = nb(base(), "malinaw");
    const need = fairnessNeeded(n, content);
    const close = deal(100, Math.round(100 / (need - td.closeBand / 4)));
    const s = { ...base(), rng: 12345 };
    const a = apply(s, calm, { type: "proposeTrade", neighbor: "malinaw", ...close });
    const b = apply(s, calm, { type: "proposeTrade", neighbor: "malinaw", ...close });
    expect(a).toEqual(b);
    expect(a.rng).not.toBe(s.rng);
    const clear = apply(s, calm, { type: "proposeTrade", neighbor: "malinaw", ...deal(20, 16) });
    expect(clear.rng).toBe(s.rng);
  });

  it("refuses badly formed proposals outright", () => {
    const s = base();
    expect(apply(s, calm, { type: "proposeTrade", neighbor: "malinaw", give: { resource: "rice", amount: 20 }, want: { resource: "rice", amount: 10 } })).toBe(s);
    expect(apply(s, calm, { type: "proposeTrade", neighbor: "malinaw", ...deal(2, 1) })).toBe(s);
    expect(apply(s, calm, { type: "proposeTrade", neighbor: "malinaw", ...deal(5000, 10) })).toBe(s);
  });

  it("a counter-offer can be declined, and runs out", () => {
    const n = nb(base(), "malinaw");
    const need = fairnessNeeded(n, content);
    const p = deal(20, Math.ceil(20 / (need - td.closeBand - 0.1)));
    const s = apply(base(), calm, { type: "proposeTrade", neighbor: "malinaw", ...p });
    expect(apply(s, calm, { type: "declineCounter" }).region!.counter).toBeNull();
    expect(tick(s, calm, td.counterSeconds + 1).region!.counter).toBeNull();
  });
});

describe("embargo", () => {
  it("refuses all trade while the grudge is at the line, then lifts as it fades", () => {
    const s = rich(world(), "talampas", { trust: 100, grudge: g.embargoAt });
    const n = nb(s, "talampas");
    expect(isEmbargo(n, content)).toBe(true);
    expect(decideTrade(n, content, deal(100, 5), 0)).toEqual({ outcome: "refuse", reason: "embargo" });
    const after = apply(s, calm, { type: "trade", neighbor: "talampas", give: "rice" });
    expect(after.resources).toEqual(s.resources);
    expect(nb(after, "talampas").lastRefusal).toMatchObject({ reason: "embargo" });
    const later = tick(s, calm, 120);
    expect(isEmbargo(nb(later, "talampas"), content)).toBe(false);
  });

  it("sends no offers during an embargo, and fewer with a grudge", () => {
    const offers = { ...calm, rules: { ...calm.rules, diplomacy: { ...d, offers: { ...d.offers, chancePerSecond: 1 } } } };
    let s = world();
    for (const n of s.region!.neighbors) s = setNb(s, n.id, { grudge: g.embargoAt + 30, trust: 80 });
    expect(tick(s, offers, 10).region!.offer).toBeNull();
    let calmed = world();
    for (const n of calmed.region!.neighbors) calmed = setNb(calmed, n.id, { grudge: 0, trust: 80 });
    expect(tick(calmed, offers, 2).region!.offer).not.toBeNull();
  });
});

describe("Handog", () => {
  it("lowers grudge and raises trust by the gift's value", () => {
    const s = setNb(world(), "malinaw", { trust: 20, grudge: 50 });
    const after = apply(s, calm, { type: "handog", neighbor: "malinaw", gift: { rice: 40, wood: 10 } });
    const value = giftValue({ rice: 40, wood: 10 }, content);
    expect(value).toBe(40 * d.handog.values.rice! + 10 * d.handog.values.wood!);
    expect(nb(after, "malinaw").grudge).toBeCloseTo(50 - value * d.handog.grudgePerValue, 5);
    expect(nb(after, "malinaw").trust).toBeCloseTo(20 + value * d.handog.trustPerValue, 5);
    expect(after.resources).toEqual({ rice: 1960, wood: 1990 });
    expect(nb(after, "malinaw").state.resources.rice).toBe(nb(s, "malinaw").state.resources.rice + 40);
  });

  it("needs a worthwhile gift the barangay can pay for", () => {
    const s = setNb(world({ resources: { rice: 30, wood: 0 } }), "malinaw", { grudge: 50 });
    expect(apply(s, calm, { type: "handog", neighbor: "malinaw", gift: { rice: 2 } })).toBe(s);
    expect(apply(s, calm, { type: "handog", neighbor: "malinaw", gift: { rice: 100 } })).toBe(s);
  });

  it("lists gold for later, but skips it until gold exists", () => {
    expect(d.handog.values.gold).toBeGreaterThan(0);
    expect(giftValue({ rice: 10, gold: 50 } as never, content)).toBe(10 * d.handog.values.rice!);
  });
});

describe("alliances with a grudge", () => {
  it("marriage and sandugo are refused while the grudge is high", () => {
    const s = setNb(world(), "malinaw", { trust: 90, grudge: g.noAlliancesAbove + 1 });
    expect(marriageBlocker(s, content, "malinaw")).toBe("grudge");
    expect(apply(s, calm, { type: "marry", neighbor: "malinaw" })).toBe(s);
    const married = setNb(s, "malinaw", { marriage: true });
    expect(apply(married, calm, { type: "sandugo", neighbor: "malinaw" })).toBe(married);
    const forgiven = setNb(s, "malinaw", { grudge: 0 });
    expect(marriageBlocker(forgiven, content, "malinaw")).toBeNull();
  });

  it("speaks the refusal in the datu's words", () => {
    expect(refusalText("raids", content, "Datu Malakas")).toBe("Datu Malakas remembers your raids.");
    expect(refusalText("unfair", content, "x")).toBe("This trade is unfair to us.");
  });
});

describe("saves", () => {
  it("keep grudges, refusals and counter-offers", () => {
    let s = setNb(world(), "malinaw", { grudge: 33, lastRefusal: { reason: "raids", at: 5 } });
    s = { ...s, region: { ...s.region!, counter: { neighbor: "malinaw", ...deal(20, 12), expiresAt: 50 } } };
    const loaded = parseSave(JSON.stringify(s), content)!;
    expect(nb(loaded, "malinaw")).toMatchObject({ grudge: 33, lastRefusal: { reason: "raids", at: 5 } });
    expect(loaded.region!.counter).toEqual(s.region!.counter);
  });

  it("rebuild an older save's grudge from its raid reports", () => {
    const s = world({ time: 600 });
    const region = { ...s.region!, reports: [{ id: 1, time: 600, kind: "raid" as const, neighbor: "malinaw", win: true }, { id: 2, time: 0, kind: "raid" as const, neighbor: "talampas", win: false }] };
    const raw = { ...s, region: { ...region, neighbors: region.neighbors.map((n) => ({ ...n, grudge: undefined, lastRefusal: undefined })) }, version: 15 };
    const loaded = parseSave(JSON.stringify(raw), content)!;
    expect(nb(loaded, "malinaw").grudge).toBe(g.raidWon);
    // Ten minutes ago, faded since.
    expect(nb(loaded, "talampas").grudge).toBeCloseTo(Math.max(0, g.raidLost - g.decayPerMinute * 10), 5);
    expect(nb(loaded, "batong-buhay").grudge).toBe(0);
  });
});
