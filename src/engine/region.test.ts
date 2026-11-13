import { describe, expect, it } from "vitest";
import type { Content } from "./content";
import { apply, availableWorkers, housing, owned, rates, tick, type GameState } from "./game";
import {
  aiContent,
  casualties,
  createRegion,
  defenseOf,
  homeWarriors,
  marriageBlocker,
  resolveBattle,
  tradingPaused,
  type NeighborState,
} from "./region";
import { offlineProgress } from "./offline";
import { nextRandom } from "./rng";
import { at, calm, content, withState } from "./testUtils";

const m = content.rules.military;
const d = content.rules.diplomacy;

/** A seed whose first roll satisfies `pred` (to force a battle's outcome). */
function seedWhere(pred: (roll: number) => boolean): number {
  for (let seed = 1; ; seed++) if (pred(nextRandom(seed)[0])) return seed;
}

/** Content with diplomacy numbers overridden. */
function withDiplomacy(patch: Partial<typeof d> & Record<string, unknown>, base: Content = calm): Content {
  const diplomacy = { ...base.rules.diplomacy } as Record<string, unknown>;
  for (const [k, v] of Object.entries(patch)) {
    const current = diplomacy[k];
    diplomacy[k] = typeof v === "object" && v && typeof current === "object" ? { ...current, ...v } : v;
  }
  return { ...base, rules: { ...base.rules, diplomacy: diplomacy as unknown as typeof d } };
}

/** A player with a region, plenty of goods and 20 villagers. */
function world(patch: Partial<GameState> = {}): GameState {
  const s = withState({ resources: { rice: 2000, wood: 2000 }, villagers: 20, buildings: [], ...patch });
  return { ...s, region: patch.region ?? createRegion(calm, s.time, 7) };
}

const nb = (s: GameState, id: string) => s.region!.neighbors.find((n) => n.id === id)!;
function setNb(s: GameState, id: string, patch: Partial<NeighborState>): GameState {
  return { ...s, region: { ...s.region!, neighbors: s.region!.neighbors.map((n) => (n.id === id ? { ...n, ...patch } : n)) } };
}
const setNbState = (s: GameState, id: string, patch: Partial<GameState>) => setNb(s, id, { state: { ...nb(s, id).state, ...patch } });

describe("neighbors", () => {
  it("come from content/neighbors: four barangays along the river, each with a datu and a trait", () => {
    expect(content.neighbors.map((n) => [n.id, n.trait])).toEqual([
      ["pulang-lupa", "trader"],
      ["malinaw", "peaceful"],
      ["talampas", "proud"],
      ["batong-buhay", "aggressive"],
    ]);
    for (const n of content.neighbors) expect(n.datu).toBeTruthy();
    const r = world().region!;
    expect(r.neighbors.map((n) => n.state.villagers)).toEqual(content.neighbors.map((n) => n.start.villagers));
    expect(r.neighbors.map((n) => n.state.warriors)).toEqual(content.neighbors.map((n) => n.start.warriors));
  });

  it("grow over time by the same engine rules", () => {
    const start = world();
    const later = tick(start, calm, 900);
    for (const n of later.region!.neighbors) {
      const before = nb(start, n.id);
      expect(n.state.buildings.length).toBeGreaterThan(before.state.buildings.length);
      expect(n.state.time).toBeCloseTo(900);
    }
    // At least one neighbor has grown in people too.
    expect(later.region!.neighbors.some((n) => n.state.villagers > nb(start, n.id).state.villagers)).toBe(true);
  });

  it("have no random disasters, but keep seasons and hunger", () => {
    expect(aiContent(content).events.fire).toBeUndefined();
    expect(aiContent(content).events.typhoon).toBeUndefined();
    expect(aiContent(content).events.seasons).toBeDefined();
  });
});

describe("Mandirigma and Kuta", () => {
  it("trains a villager into a warrior for rice and wood", () => {
    const s = world({ villagers: 5, buildings: [at("kuta", 2, 2)] });
    const t = apply(s, calm, { type: "train" });
    expect(t.warriors).toBe(1);
    expect(t.villagers).toBe(5); // still a villager
    expect(t.resources.rice).toBe(2000 - (m.warrior.cost.rice ?? 0));
    expect(t.resources.wood).toBe(2000 - (m.warrior.cost.wood ?? 0));
  });

  it("Mandirigma farm between raids, and leave work for a raid or guard duty", () => {
    const s = world({ villagers: 4, warriors: 3, buildings: [at("palayan", 3, 5), at("palayan", 6, 5)] });
    expect(availableWorkers(s, calm)).toBe(4);
    const raid = { ...s, region: { ...s.region!, incomingRaid: { from: "batong-buhay", strikeAt: s.time + 60 } } };
    expect(availableWorkers(raid, calm)).toBe(1);
  });

  it("needs a villager who isn't already a warrior, and the goods", () => {
    const full = world({ villagers: 2, warriors: 2 });
    expect(apply(full, calm, { type: "train" })).toBe(full);
    const poor = world({ resources: { rice: 0, wood: 0 } });
    expect(apply(poor, calm, { type: "train" })).toBe(poor);
  });

  it("defense = base + warriors at home + standing Kuta", () => {
    const kuta = content.buildings.find((b) => b.id === "kuta")!;
    const s = world({ warriors: 3, buildings: [at("kuta", 3, 5), { ...at("kuta", 4, 5), damaged: true }] });
    expect(defenseOf(s, calm)).toBe(m.baseDefense + 3 * m.warrior.defense + (kuta.defense ?? 0));
  });
});

describe("battle resolution", () => {
  it("wins when the seeded roll is under attack / (attack + defense)", () => {
    expect(resolveBattle(30, 10, 0.74, content)).toMatchObject({ attackerWins: true, chance: 0.75 });
    expect(resolveBattle(30, 10, 0.75, content)).toMatchObject({ attackerWins: false, chance: 0.75 });
    expect(resolveBattle(0, 10, 0, content).attackerWins).toBe(false);
    expect(resolveBattle(10, 0, 0.999, content).attackerWins).toBe(true);
  });

  it("is deterministic: same inputs, same result", () => {
    expect(resolveBattle(12, 9, 0.4, content)).toEqual(resolveBattle(12, 9, 0.4, content));
  });

  it("costs the loser more warriors than the winner", () => {
    const won = resolveBattle(30, 10, 0, content);
    expect(won.attackerLossPercent).toBe(m.winnerLossPercent);
    expect(won.defenderLossPercent).toBe(m.loserLossPercent);
    expect(casualties(10, m.loserLossPercent, true)).toBe(4);
    expect(casualties(1, m.winnerLossPercent, false)).toBe(0);
    expect(casualties(1, m.winnerLossPercent, true)).toBe(1); // a defeated side always loses someone
  });
});

describe("Mangayaw (raids)", () => {
  const target = "talampas";
  const ready = (rngPred: (r: number) => boolean) => {
    let s = world({ warriors: 10, rng: seedWhere(rngPred) });
    s = setNbState(s, target, { warriors: 2, resources: { rice: 400, wood: 200 } });
    return s;
  };
  // 10 warriors attack 30 vs talampas' defense (base + 2 warriors + walls).
  const chanceOf = (s: GameState) => {
    const attack = 10 * m.warrior.attack;
    return attack / (attack + defenseOf(nb(s, target).state, calm));
  };

  it("a win brings goods as tribute, renown and influence, but every neighbor trusts you less", () => {
    const s = ready((r) => r < 0.3);
    expect(chanceOf(s)).toBeGreaterThan(0.3);
    const after = apply(s, calm, { type: "raid", neighbor: target, warriors: 10 });
    const report = after.region!.reports.at(-1)!;
    expect(report).toMatchObject({ kind: "raid", win: true, neighbor: target });
    expect(after.resources.rice).toBe(2000 + 100); // 25% of their 400
    expect(after.resources.wood).toBe(2000 + 50);
    expect(after.region!.renown).toBe(d.raid.renown);
    expect(nb(after, target).influence).toBeCloseTo((d.raid.influence * 50) / 100); // proud: half influence
    expect(nb(after, target).trust).toBe(Math.max(0, nb(s, target).trust - d.raid.trustLossTarget));
    for (const other of after.region!.neighbors.filter((n) => n.id !== target)) {
      expect(other.trust).toBe(Math.max(0, nb(s, other.id).trust - d.raid.trustLossAll));
    }
    expect(after.region!.paths).toContain("mangayaw");
    // Only fallen warriors leave their village: no captives.
    expect(nb(after, target).state.villagers).toBe(nb(s, target).state.villagers - report.theirLosses!);
    expect(after.warriors).toBe(10 - report.ourLosses!);
  });

  it("a loss costs warriors and brings nothing", () => {
    const s = ready((r) => r > 0.99);
    const after = apply(s, calm, { type: "raid", neighbor: target, warriors: 10 });
    const report = after.region!.reports.at(-1)!;
    expect(report.win).toBe(false);
    expect(report.ourLosses).toBe(4); // 40% of 10
    expect(after.warriors).toBe(6);
    expect(after.villagers).toBe(16);
    expect(after.resources).toEqual(s.resources);
    expect(nb(after, target).influence).toBe(0);
    expect(after.region!.renown).toBe(0);
  });

  it("is deterministic for the same seed", () => {
    const s = ready(() => true);
    expect(apply(s, calm, { type: "raid", neighbor: target, warriors: 5 })).toEqual(apply(s, calm, { type: "raid", neighbor: target, warriors: 5 }));
  });

  it("can't target allies or tributaries, send more warriors than are home, or repeat during the cooldown", () => {
    const s = ready((r) => r < 0.3);
    expect(apply(setNb(s, target, { status: "ally" }), calm, { type: "raid", neighbor: target, warriors: 5 }).region!.reports).toHaveLength(0);
    expect(apply(s, calm, { type: "raid", neighbor: target, warriors: 11 })).toBe(s);
    const once = apply(s, calm, { type: "raid", neighbor: target, warriors: 2 });
    expect(apply(once, calm, { type: "raid", neighbor: target, warriors: 2 })).toBe(once);
  });
});

describe("influence: trade, marriage alliance, sandugo", () => {
  it("trade swaps a parcel of goods and builds trust and a little influence", () => {
    const s = world();
    const after = apply(s, calm, { type: "trade", neighbor: "malinaw", give: "rice" });
    expect(after.resources.rice).toBe(2000 - d.trade.give);
    expect(after.resources.wood).toBe(2000 + Math.floor((d.trade.give * d.trade.receivePercent) / 100));
    expect(nb(after, "malinaw").trust).toBeCloseTo(nb(s, "malinaw").trust + d.trade.trust * 1.5); // peaceful: +50% trust
    expect(nb(after, "malinaw").influence).toBeCloseTo(d.trade.influence);
    expect(after.region!.paths).toEqual(["trade"]);
  });

  it("traders give better rates", () => {
    const after = apply(world(), calm, { type: "trade", neighbor: "pulang-lupa", give: "rice" });
    expect(after.resources.wood).toBe(2000 + Math.floor((d.trade.give * (d.trade.receivePercent + 25)) / 100));
  });

  it("a marriage alliance needs trust above 50 and a large gift, and gives a big influence gain", () => {
    let s = setNb(world(), "malinaw", { trust: 50 });
    expect(marriageBlocker(s, calm, "malinaw")).toBe("trust");
    expect(apply(s, calm, { type: "marry", neighbor: "malinaw" })).toBe(s);
    s = setNb(s, "malinaw", { trust: 51 });
    const wed = apply(s, calm, { type: "marry", neighbor: "malinaw" });
    expect(nb(wed, "malinaw").marriage).toBe(true);
    expect(nb(wed, "malinaw").influence).toBeCloseTo(d.marriage.influence);
    expect(wed.resources.rice).toBe(2000 - (d.marriage.cost.rice ?? 0));
    expect(marriageBlocker(setNb(world({ resources: { rice: 0, wood: 0 } }), "malinaw", { trust: 80 }), calm, "malinaw")).toBe("cost");
  });

  it("sandugo needs a marriage alliance, and makes them an ally", () => {
    const s = setNb(world(), "malinaw", { trust: 80 });
    expect(apply(s, calm, { type: "sandugo", neighbor: "malinaw" })).toBe(s);
    const pact = apply(apply(s, calm, { type: "marry", neighbor: "malinaw" }), calm, { type: "sandugo", neighbor: "malinaw" });
    expect(nb(pact, "malinaw").status).toBe("ally");
    expect(pact.region!.reports.at(-1)).toMatchObject({ kind: "alliance", neighbor: "malinaw" });
  });

  it("at 100 influence a neighbor becomes a tributary", () => {
    const s = setNb(world(), "malinaw", { influence: 98 });
    const after = apply(s, calm, { type: "trade", neighbor: "malinaw", give: "wood" });
    expect(nb(after, "malinaw")).toMatchObject({ status: "tributary", influence: 100, loyalty: d.loyalty.start });
    expect(after.region!.reports.at(-1)).toMatchObject({ kind: "tributary", neighbor: "malinaw" });
  });

  it("proud neighbors give half the influence", () => {
    const after = apply(world(), calm, { type: "trade", neighbor: "talampas", give: "rice" });
    expect(nb(after, "talampas").influence).toBeCloseTo(d.trade.influence / 2);
  });
});

describe("tributaries", () => {
  // A player with no people or buildings, so any goods gained are tribute.
  const quiet = () => setNb(world({ villagers: 0, resources: { rice: 0, wood: 0 } }), "pulang-lupa", { status: "tributary", influence: 100, loyalty: 80 });

  it("send 10% of a minute's production every minute", () => {
    let s = quiet();
    s = { ...s, time: 59.5, region: { ...s.region!, nextTributeAt: 60 } };
    const produced = rates(nb(s, "pulang-lupa").state, aiContent(calm)).produced;
    const after = tick(s, calm, 1);
    expect(after.resources.rice).toBeCloseTo(Math.floor(produced.rice * 6), 0);
    expect(after.resources.wood).toBeCloseTo(Math.floor(produced.wood * 6), 0);
    expect(after.resources.rice + after.resources.wood).toBeGreaterThan(0);
  });

  it("lose loyalty over time unless guarded or traded with", () => {
    const s = quiet();
    expect(nb(tick(s, calm, 60), "pulang-lupa").loyalty).toBeCloseTo(80 - d.loyalty.decayPerMinute);
    const guarded = apply({ ...s, warriors: 0, villagers: 5, resources: { rice: 100, wood: 100 }, buildings: [...s.buildings, at("kuta", 2, 2)] }, calm, { type: "train" });
    const g = apply(guarded, calm, { type: "guard", neighbor: "pulang-lupa", warriors: 1 });
    expect(homeWarriors(g)).toBe(0);
    expect(nb(tick(g, calm, 60), "pulang-lupa").loyalty).toBeCloseTo(80 + d.loyalty.guardPerMinute);
    const traded = apply({ ...s, resources: { rice: 100, wood: 100 } }, calm, { type: "trade", neighbor: "pulang-lupa", give: "rice" });
    expect(nb(traded, "pulang-lupa").loyalty).toBe(80 + d.trade.loyalty);
  });

  it("guards come home when their watch ends", () => {
    let s = apply(world({ warriors: 3, buildings: [at("kuta", 2, 2)] }), calm, { type: "train" });
    s = setNb(s, "malinaw", { status: "tributary", loyalty: 80 });
    s = apply(s, calm, { type: "guard", neighbor: "malinaw", warriors: 2 });
    expect(homeWarriors(s)).toBe(2);
    s = tick(s, calm, d.loyalty.guardSeconds + 1);
    expect(nb(s, "malinaw").guard).toBeNull();
    expect(homeWarriors(s)).toBe(s.warriors);
  });

  it("rebel below 20 loyalty and become independent again", () => {
    const s = setNb(quiet(), "pulang-lupa", { loyalty: 21 });
    const after = tick(s, calm, 30);
    expect(nb(after, "pulang-lupa")).toMatchObject({ status: "independent", influence: d.loyalty.rebelInfluence });
    expect(after.region!.reports.at(-1)).toMatchObject({ kind: "rebellion", neighbor: "pulang-lupa" });
  });
});

describe("raids on the player", () => {
  const surely = withDiplomacy({ aiRaid: { ...d.aiRaid, chancePerSecond: 1 } });
  const fed = (patch: Partial<GameState> = {}) =>
    world({ resources: { rice: 1000, wood: 1000 }, buildings: [at("bahay-kubo", 5, 3), at("palayan", 3, 5)], ...patch });

  it("never come during the 10-minute truce", () => {
    expect(d.truceSeconds).toBe(600);
    const s = tick(fed(), surely, 599);
    expect(s.region!.incomingRaid).toBeNull();
  });

  it("come from aggressive neighbors with a 60-second warning", () => {
    const s = tick(fed(), surely, 600.5);
    expect(s.region!.incomingRaid).toMatchObject({ from: "batong-buhay", strikeAt: 600 + d.aiRaid.warningSeconds });
    // They land on a river bank, chosen when the raid starts.
    expect(s.region!.incomingRaid!.landing).toEqual(expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }));
    expect(s.region!.reports.filter((r) => r.kind === "defense")).toHaveLength(0);
  });

  /** A raid about to strike, with a seed chosen (by trying a few) so the battle goes the way the test needs. */
  function strike(patch: Partial<GameState>, raiders: number, playerWins: boolean) {
    for (let seed = 1; seed < 500; seed++) {
      let s = { ...fed({ ...patch, rng: seed }), time: 659.5 };
      s = { ...s, region: { ...s.region!, truceUntil: 0, nextAiRaidAt: 9999, incomingRaid: { from: "batong-buhay", strikeAt: 660 } } };
      s = setNbState(s, "batong-buhay", { warriors: raiders, villagers: raiders + 5 });
      const after = tick(s, surely, 1);
      if (after.region!.reports.at(-1)?.win === playerWins) return { s, after, report: after.region!.reports.at(-1)! };
    }
    throw new Error("no seed found");
  }

  it("take some rice and wood when they win, never buildings", () => {
    const { s, after, report } = strike({}, 10, false);
    expect(report).toMatchObject({ kind: "defense", win: false, neighbor: "batong-buhay" });
    expect(after.buildings).toEqual(s.buildings);
    // About 15% of what the barangay had when the raid struck (half a second into the tick).
    expect(report.lost!.rice! / s.resources.rice).toBeCloseTo(d.aiRaid.lootPercent / 100, 2);
    expect(report.lost!.wood! / s.resources.wood).toBeCloseTo(d.aiRaid.lootPercent / 100, 2);
    expect(after.region!.incomingRaid).toBeNull();
    expect(after.region!.nextAiRaidAt).toBe(660 + d.aiRaid.cooldownSeconds);
  });

  it("are beaten back by warriors and walls, which earns renown", () => {
    const { after, report } = strike({ warriors: 15, villagers: 20 }, 4, true);
    expect(report).toMatchObject({ kind: "defense", win: true });
    expect(report.defense).toBe(m.baseDefense + 15 * m.warrior.defense);
    expect(after.region!.renown).toBe(d.aiRaid.defendRenown);
    expect(after.resources).toBeTruthy();
  });

  it("face sandugo allies too: allies add to the player's defense", () => {
    const setup = (ally: boolean) => {
      let s = { ...fed({ rng: 1 }), time: 659.5 };
      s = { ...s, region: { ...s.region!, truceUntil: 0, nextAiRaidAt: 9999, incomingRaid: { from: "batong-buhay", strikeAt: 660 } } };
      if (ally) s = setNb(setNbState(s, "talampas", { warriors: 6 }), "talampas", { status: "ally" });
      return tick(s, surely, 1).region!.reports.at(-1)!.defense!;
    };
    expect(setup(true) - setup(false)).toBeCloseTo((6 * m.warrior.defense * d.sandugo.allyDefensePercent) / 100);
  });

  it("never come from peaceful, trader or proud neighbors", () => {
    let s = fed();
    s = setNb(s, "batong-buhay", { status: "ally" });
    expect(tick(s, surely, 700).region!.incomingRaid).toBeNull();
  });
});

describe("trade offers", () => {
  const offers = withDiplomacy({ offers: { ...d.offers, chancePerSecond: 1 } });

  it("arrive now and then, can be accepted, and expire", () => {
    let s = tick(world(), offers, 1.5);
    const offer = s.region!.offer!;
    expect(offer).toBeTruthy();
    expect(offer.give.amount).toBe(d.offers.give);
    const before = s.resources[offer.give.resource];
    const accepted = apply(s, offers, { type: "acceptOffer" });
    expect(accepted.resources[offer.give.resource]).toBe(before + offer.give.amount);
    expect(accepted.region!.offer).toBeNull();
    expect(accepted.region!.paths).toContain("trade");
    // Left alone, it expires (and a new one may follow).
    s = tick(s, offers, d.offers.expireSeconds + 1);
    expect(s.region!.offer?.expiresAt ?? 0).not.toBe(offer.expiresAt);
  });

  it("can be declined", () => {
    const s = tick(world(), offers, 1.5);
    expect(apply(s, offers, { type: "declineOffer" }).region!.offer).toBeNull();
  });
});

describe("no trading during a raid", () => {
  const offers = withDiplomacy({ offers: { ...d.offers, chancePerSecond: 1 }, aiRaid: { ...d.aiRaid, chancePerSecond: 0 } });
  /** A raid on its way, striking in `inSeconds`. */
  const raiding = (s: GameState, inSeconds = 30): GameState => ({
    ...s,
    region: { ...s.region!, truceUntil: 0, nextAiRaidAt: 99999, incomingRaid: { from: "batong-buhay", strikeAt: Math.floor(s.time) + inSeconds } },
  });

  it("refuses trades and accepting offers from the warning until the raid ends", () => {
    const s = tick(world(), offers, 1.5);
    expect(s.region!.offer).toBeTruthy();
    const r = raiding(s);
    expect(tradingPaused(r)).toBe(true);
    expect(apply(r, offers, { type: "acceptOffer" })).toBe(r);
    expect(apply(r, offers, { type: "trade", neighbor: "pulang-lupa", give: "rice" })).toBe(r);
    // Turning an offer down is still allowed.
    expect(apply(r, offers, { type: "declineOffer" }).region!.offer).toBeNull();
  });

  it("creates no new offers during a raid", () => {
    const r = tick(raiding(world(), 40), offers, 20);
    expect(r.region!.incomingRaid).not.toBeNull();
    expect(r.region!.offer).toBeNull();
  });

  it("pauses a waiting offer's timer, and starts it again after", () => {
    const s = tick(world(), offers, 1.5);
    const left = s.region!.offer!.expiresAt - s.time;
    const during = tick(raiding(s, 30), offers, 20);
    expect(during.region!.offer).toBeTruthy();
    expect(during.region!.offer!.expiresAt - during.time).toBeCloseTo(left, 0);
    // Even a wait longer than the offer's whole life doesn't make it expire.
    const long = tick(raiding(s, d.offers.expireSeconds * 3), offers, d.offers.expireSeconds * 2);
    expect(long.region!.offer).toBeTruthy();
    // After the raid the clock runs again.
    const after = tick(during, offers, 15);
    expect(after.region!.incomingRaid).toBeNull();
    expect(after.region!.offer!.expiresAt - after.time).toBeLessThan(left - 3);
  });

  it("trading works again after the raid", () => {
    const s = tick(raiding(tick(world(), offers, 1.5), 5), offers, 6);
    expect(s.region!.incomingRaid).toBeNull();
    expect(tradingPaused(s)).toBe(false);
    const accepted = apply(s, offers, { type: "acceptOffer" });
    expect(accepted.region!.offer).toBeNull();
    expect(accepted.region!.paths).toContain("trade");
    const traded = apply(s, offers, { type: "trade", neighbor: "pulang-lupa", give: "rice" });
    expect(traded).not.toBe(s);
  });

  it("keeps the offer's time paused through offline progress during a raid", () => {
    const s = raiding(tick(world(), offers, 1.5), 30);
    const left = s.region!.offer!.expiresAt - s.time;
    const { state } = offlineProgress(s, offers, 3600);
    expect(state.region!.offer).toBeTruthy();
    expect(state.region!.offer!.expiresAt - state.time).toBeCloseTo(left, 5);
  });
});

describe("Paramount Datu", () => {
  it("is won when every neighbor is a tributary or an ally, with the time and paths used", () => {
    let s = world();
    for (const id of ["pulang-lupa", "malinaw", "talampas"]) s = setNb(s, id, { status: "tributary", loyalty: 90, influence: 100 });
    s = { ...s, time: 1234, region: { ...s.region!, paths: ["trade", "marriage"] } };
    s = setNb(s, "batong-buhay", { trust: 80 });
    expect(s.region!.victory).toBeNull();
    s = apply(s, calm, { type: "marry", neighbor: "batong-buhay" });
    s = apply(s, calm, { type: "sandugo", neighbor: "batong-buhay" });
    expect(s.region!.victory).toEqual({ time: 1234, paths: ["trade", "marriage", "sandugo"] });
  });
});

describe("determinism", () => {
  it("one long tick equals many short ones", () => {
    const busy = withDiplomacy({ truceSeconds: 0, offers: { ...d.offers, chancePerSecond: 0.05 }, aiRaid: { ...d.aiRaid, chancePerSecond: 0.02 } });
    const start = world({ warriors: 4 });
    let small = start;
    for (let i = 0; i < 2000; i++) small = tick(small, busy, 0.1);
    const big = tick(start, busy, 200);
    const summary = (s: GameState) => ({
      rng: s.rng,
      warriors: s.warriors,
      offer: s.region!.offer,
      raid: s.region!.incomingRaid,
      reports: s.region!.reports.map((r) => [r.kind, r.win, r.neighbor, r.time]),
      neighbors: s.region!.neighbors.map((n) => [n.id, n.status, n.state.buildings.length, n.state.warriors]),
    });
    expect(summary(small)).toEqual(summary(big));
    expect(housing(big, busy)).toBeGreaterThan(0);
    expect(owned(big, "kuta")).toBe(0);
  });
});
