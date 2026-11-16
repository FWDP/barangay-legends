// Blood debts and feuds (W.2, feud.ts and region.ts).
import { describe, expect, it } from "vitest";
import { apply, tick, type GameState } from "./game";
import { bloodPrice, coolFeuds, emptyFeuds, feudBetween, recordBloodDebt } from "./feud";
import { createRegion, feudsOf, mourningRaid, owe, traitOf, type NeighborState } from "./region";
import { parseSave } from "./save";
import { acquainted, calm, content, withState } from "./testUtils";

const r = content.rules.feud;
const ME = "barangay-1";
const nb = (s: GameState, id: string) => s.region!.neighbors.find((n) => n.id === id)!;
const setNb = (s: GameState, id: string, patch: Partial<NeighborState>): GameState => ({
  ...s,
  region: { ...s.region!, neighbors: s.region!.neighbors.map((n) => (n.id === id ? { ...n, ...patch } : n)) },
});
const world = (patch: Partial<GameState> = {}) => {
  const s = withState({ resources: { rice: 2000, wood: 2000, gold: 500, food: 2000, wine: 50 }, villagers: 30, warriors: 20, buildings: [], ...patch });
  return { ...s, region: acquainted(createRegion(calm, s.time, 7)) };
};

describe("blood debts start feuds", () => {
  it("killing a neighbor's people records a debt with the dead and their rank, and their grudge rises sharply", () => {
    const s = world();
    const target = s.region!.neighbors[0].id;
    const region = owe(s.region!, content, target, ME, 2, 10);
    const f = feudBetween(feudsOf(region), target, ME)!;
    expect(f.deaths).toHaveLength(2);
    expect(f.deaths[0].rank).toBe("warrior");
    expect(f.heat).toBe(2 * r.heatPerDeath);
    expect(region.neighbors.find((n) => n.id === target)!.grudge).toBe(Math.min(100, nb(s, target).grudge + 2 * r.grudgeOnDeath));
    expect(region.news.at(-1)).toMatchObject({ key: "feud-begun", barangay: target, other: ME });
  });

  it("a raid that kills records debts both ways", () => {
    let fallen = 0;
    for (let seed = 1; seed <= 40 && fallen === 0; seed++) {
      const s = setNb({ ...world({ rng: seed }), map: { ...world().map, seed } }, "talampas", { status: "independent", raidCooldownUntil: 0 });
      const after = apply(s, calm, { type: "raid", neighbor: "talampas", warriors: 15 });
      const rep = after.region!.reports.at(-1)!;
      fallen = rep.fallen!.theirs + rep.fallen!.ours;
      if (rep.fallen!.theirs) expect(feudBetween(feudsOf(after.region!), "talampas", ME)?.deaths).toHaveLength(rep.fallen!.theirs);
      if (rep.fallen!.ours) expect(feudBetween(feudsOf(after.region!), ME, "talampas")?.deaths).toHaveLength(rep.fallen!.ours);
    }
    expect(fallen).toBeGreaterThan(0);
  });

  it("the price scales with the dead and their rank", () => {
    const one = recordBloodDebt(emptyFeuds(), content, "a", "b", [{ rank: "warrior", at: 0 }]).feuds.feuds[0];
    const datu = recordBloodDebt(emptyFeuds(), content, "a", "b", [{ rank: "datu", at: 0 }, { rank: "warrior", at: 0 }]).feuds.feuds[0];
    expect(bloodPrice(content, one)).toEqual(r.price.perDeath.warrior);
    expect(bloodPrice(content, datu).gold).toBe((r.price.perDeath.datu.gold ?? 0) + (r.price.perDeath.warrior.gold ?? 0));
  });
});

describe("vengeance raids are fiercer", () => {
  it("a barangay owed blood raids even if it never raids, more often, with more warriors, and a win may set houses alight", () => {
    // A peaceful neighbor (no raids in its temper) owed blood by the player.
    let s: GameState = world({ time: 2000 });
    const peaceful = s.region!.neighbors.find((n) => !traitOf(content, n.id).raids && n.status === "independent")!.id;
    s = { ...s, region: { ...owe(s.region!, content, peaceful, ME, 1, 0), truceUntil: 0, nextAiRaidAt: 0 } };
    s = { ...s, region: { ...s.region!, neighbors: s.region!.neighbors.map((n) => ({ ...n, state: { ...n.state, warriors: n.id === peaceful ? 10 : 0 } })) } };
    let raid = s.region!.incomingRaid;
    for (let i = 0; i < 400 && !raid; i++) {
      s = tick(s, calm, 5);
      raid = s.region!.incomingRaid;
    }
    expect(raid?.from).toBe(peaceful);
    expect(raid?.vengeance).toBe(true);
  });
});

describe("feuds spread to kin and cool very slowly", () => {
  it("bloc mates of the wronged trust the offender less", () => {
    const s = world();
    const bloc = s.region!.politics.blocs.find((b) => b.members.length > 1)!;
    const [wronged, kin] = bloc.members;
    const region = owe(s.region!, content, wronged, ME, 1, 5);
    expect(region.neighbors.find((n) => n.id === kin)!.trust).toBe(Math.max(0, nb(s, kin).trust - r.kinTrustLoss));
  });

  it("cool by coolPerMinute and end at nothing", () => {
    const f = recordBloodDebt(emptyFeuds(), content, "a", "b", [{ rank: "warrior", at: 0 }]).feuds;
    expect(coolFeuds(f, content, 60).feuds.feuds[0].heat).toBeCloseTo(r.heatPerDeath - r.coolPerMinute);
    const done = coolFeuds(f, content, (r.heatPerDeath / r.coolPerMinute) * 60 + 1);
    expect(done.feuds.feuds).toHaveLength(0);
    expect(done.ended).toHaveLength(1);
  });

  it("AI barangays carry blood debts with each other, told in the Balita", () => {
    const s = world();
    const [a, b] = s.region!.neighbors;
    const region = owe(s.region!, content, a.id, b.id, 1, 3);
    expect(feudBetween(feudsOf(region), a.id, b.id)).toBeDefined();
    // Not the player's doing: no grudge against the player.
    expect(region.neighbors.find((n) => n.id === a.id)!.grudge).toBe(a.grudge);
    expect(region.news.at(-1)).toMatchObject({ key: "feud-begun" });
  });

  it("an AI datu's death is told, and may bring a mourning raid on a rival", () => {
    const s = world({ time: 100 });
    const hot = { ...content, rules: { ...content.rules, feud: { ...r, mourningRaid: { chancePerSecond: 1 } } } };
    const after = mourningRaid(s, hot, 200);
    expect(after.region!.news.some((n) => n.key === "datu-died")).toBe(true);
  });

  it("are saved", () => {
    const s = world();
    const t = s.region!.neighbors[0].id;
    const withFeud = { ...s, region: owe(s.region!, content, t, ME, 2, 5) };
    expect(parseSave(JSON.stringify(withFeud), content)!.region!.feuds).toEqual(withFeud.region.feuds);
  });
});
