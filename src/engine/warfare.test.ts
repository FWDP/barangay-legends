// Battles end quickly; few die (W.1, warfare.ts and the raids in region.ts).
import { describe, expect, it } from "vitest";
import { apply, availableWorkers, tick, type GameState } from "./game";
import { createRegion, homeWarriors, type NeighborState } from "./region";
import { addWounded, endBattle, healWounded, heldAway, isHiding, lossTotal, ransomFor, shouldFlee, sideLosses, woundedCount } from "./warfare";
import { acquainted, at, calm, content, withState } from "./testUtils";

const b = content.rules.military.battle;
const target = "talampas";
const nb = (s: GameState, id: string) => s.region!.neighbors.find((n) => n.id === id)!;
const setNb = (s: GameState, id: string, patch: Partial<NeighborState>): GameState => ({
  ...s,
  region: { ...s.region!, neighbors: s.region!.neighbors.map((n) => (n.id === id ? { ...n, ...patch } : n)) },
});
const world = (patch: Partial<GameState> = {}) => {
  const s = withState({ resources: { rice: 2000, wood: 2000, gold: 500, food: 2000 }, villagers: 30, warriors: 20, buildings: [], ...patch });
  return { ...s, region: acquainted(createRegion(calm, s.time, 7)) };
};

describe("a battle ends when one side's morale breaks", () => {
  it("the beaten side breaks after its first losses and withdraws; the winner loses few", () => {
    const end = endBattle(true, 12, 10, [0.5, 0.5, 0.5, 0.5, 0.9], content);
    expect(end.broke).toBe("defenders");
    expect(end.withdrew).toBe("land");
    expect(lossTotal(end.defender)).toBeGreaterThanOrEqual(1);
    expect(lossTotal(end.defender)).toBeLessThan(10);
    expect(lossTotal(end.attacker)).toBeLessThan(lossTotal(end.defender));
    expect(end.reason).toBe("losses");
    const raidersBeaten = endBattle(false, 12, 10, [0.5, 0.5, 0.5, 0.5, 0.9], content);
    expect(raidersBeaten).toMatchObject({ broke: "attackers", withdrew: "boat" });
  });

  it("can break when the bravest falls", () => {
    const end = endBattle(true, 20, 20, [0.99, 0.5, 0.99, 0.5, 0], content);
    expect(end.defender.fallen).toBeGreaterThan(0);
    expect(end.reason).toBe("leader");
  });

  it("is the same for the same rolls", () => {
    expect(endBattle(true, 9, 7, [0.1, 0.2, 0.3, 0.4, 0.5], content)).toEqual(endBattle(true, 9, 7, [0.1, 0.2, 0.3, 0.4, 0.5], content));
  });
});

describe("most casualties are wounded; deaths are rare", () => {
  it("of the hurt, only fallenPercent die (more in a feud), and the beaten lose some to capture", () => {
    const l = sideLosses(20, true, [0, 0], content);
    expect(lossTotal(l)).toBe(Math.round((20 * b.loserCasualtyPercent) / 100));
    expect(l.fallen).toBe(Math.floor(lossTotal(l) * (b.fallenPercent / 100)));
    expect(l.wounded).toBeGreaterThan(l.fallen);
    expect(l.captured).toBeGreaterThanOrEqual(0);
    const feud = sideLosses(20, true, [0, 0], content, { fierce: true });
    expect(feud.fallen).toBeGreaterThanOrEqual(l.fallen);
    expect(sideLosses(20, false, [0, 0], content).captured).toBe(0);
  });

  it("the wounded don't fight or work, and heal over time, faster at a healer's hut", () => {
    const s = addWounded(world(), content, 3);
    expect(woundedCount(s)).toBe(3);
    expect(homeWarriors(s)).toBe(17);
    const plain = healWounded(s, content, b.woundSeconds / 2);
    expect(woundedCount(plain)).toBe(3);
    expect(woundedCount(healWounded(s, content, b.woundSeconds + 1))).toBe(0);
    const healer = { ...s, buildings: [at("babaylan-hut", 3, 3)] };
    expect(woundedCount(healWounded(healer, content, b.woundSeconds * 0.9))).toBe(0);
  });

  it("a raid kills far fewer than it wounds, and the report names how it ended", () => {
    let fallen = 0;
    let hurt = 0;
    for (let seed = 1; seed <= 15; seed++) {
      let s = setNb({ ...world(), rng: seed, map: { ...world().map, seed } }, target, { status: "independent", raidCooldownUntil: 0 });
      s = apply(s, calm, { type: "raid", neighbor: target, warriors: 10 });
      const r = s.region!.reports.at(-1)!;
      expect(r.broke).toBeDefined();
      expect(r.withdrew).toBeDefined();
      fallen += r.fallen!.ours + r.fallen!.theirs;
      hurt += r.ourLosses! + r.theirLosses!;
    }
    expect(fallen).toBeLessThan(hurt * 0.3);
  }, 30000);
});

describe("ransom, never slavery: captives always come home", () => {
  const held = (side: "ours" | "theirs", patch: Partial<GameState> = {}) => {
    const s = world(patch);
    return { ...s, region: { ...s.region!, captives: [{ id: 1, side, neighbor: target, count: 2, at: 0, until: b.captiveSeconds, ransom: ransomFor(content, 2) }], nextCaptiveId: 2 } };
  };

  it("our warriors held elsewhere are away, and paying the ransom brings them home", () => {
    const s = held("ours");
    expect(heldAway(s)).toBe(2);
    expect(homeWarriors(s)).toBe(18);
    const paid = apply(s, calm, { type: "payRansom", captive: 1 });
    expect(paid.resources.gold).toBe(500 - ransomFor(content, 2));
    expect(heldAway(paid)).toBe(0);
    expect(nb(paid, target).state.resources.gold).toBe(nb(s, target).state.resources.gold + ransomFor(content, 2));
    expect(apply({ ...s, resources: { ...s.resources, gold: 0 } }, calm, { type: "payRansom", captive: 1 }).region!.captives).toHaveLength(1);
  });

  it("without a ransom they still come home when their time is up", () => {
    const s = held("ours");
    const later = tick({ ...s, time: b.captiveSeconds - 1 }, calm, 2);
    expect(later.region!.captives ?? []).toHaveLength(0);
    expect(later.warriors).toBe(20);
  });

  it("an AI barangay ransoms its warriors held by us when it has the gold, else they go home in time", () => {
    const s0 = held("theirs");
    const rich = setNb(s0, target, { state: { ...nb(s0, target).state, resources: { ...nb(s0, target).state.resources, gold: 100 } } });
    const before = nb(rich, target).state.warriors;
    const paid = tick({ ...rich, time: b.aiRansomAfterSeconds }, calm, 1);
    expect(paid.resources.gold).toBe(500 + ransomFor(content, 2));
    expect(nb(paid, target).state.warriors).toBeGreaterThanOrEqual(before + 2 - 1);
    const poor = setNb(s0, target, { state: { ...nb(s0, target).state, resources: { ...nb(s0, target).state.resources, gold: 0 } } });
    expect(tick({ ...poor, time: b.aiRansomAfterSeconds }, calm, 1).region!.captives).toHaveLength(1);
    expect(tick({ ...poor, time: b.captiveSeconds }, calm, 1).region!.captives ?? []).toHaveLength(0);
  });
});

describe("fleeing into the forest", () => {
  it("with no Kuta and an overwhelming raid villagers hide, safe but not working, then return", () => {
    const s = world({ buildings: [at("bahay-kubo", 5, 3)] });
    expect(shouldFlee(s, content, 30, 10)).toBe(true);
    expect(shouldFlee(s, content, 10, 10)).toBe(false);
    expect(shouldFlee({ ...s, buildings: [...s.buildings, at("kuta", 4, 6)] }, content, 30, 10)).toBe(false);
    const hiding = { ...s, hiding: { until: s.time + 10 } };
    expect(isHiding(hiding)).toBe(true);
    expect(availableWorkers(hiding, calm)).toBe(0);
    expect(tick(hiding, calm, 11).hiding ?? null).toBeNull();
  });
});

describe("the same seed gives the same battle", () => {
  it("a raid with the same state ends the same way", () => {
    const s = setNb(world({ rng: 9 }), target, { status: "independent", raidCooldownUntil: 0 });
    expect(apply(s, calm, { type: "raid", neighbor: target, warriors: 8 })).toEqual(apply(s, calm, { type: "raid", neighbor: target, warriors: 8 }));
  });
});
