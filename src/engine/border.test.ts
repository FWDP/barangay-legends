import { describe, expect, it } from "vitest";
import { borderDefense, chooseLanding, closestLandings, directionFrom, kutaShare, landingCandidates, muster, raidLanding, travelSeconds } from "./border";
import { newGame, tick, type GameState } from "./game";
import { tileAt } from "./map";
import { at, calm, content, mapFrom, withState } from "./testUtils";

// The barangay (cleared) west of a two-wide river; it touches the river at row 2.
// Forest all round; the far bank (east) can't be reached without a bridge.
const map = mapFrom([
  "TTTTTT~~TT",
  "T....T~~TT",
  "T.P...~~TT",
  "T....T~~TT",
  "TTTTTT~~TT",
]);
const military = content.rules.military;
const aiRaid = content.rules.diplomacy.aiRaid;
const state = (patch: Partial<GameState> = {}) => withState({ map, buildings: [], villagers: 8, warriors: 4, ...patch });

describe("landing point", () => {
  it("is land next to open river, on the barangay's side", () => {
    const spots = landingCandidates(map);
    expect(spots.length).toBeGreaterThan(0);
    for (const p of spots) {
      expect(["cleared", "forest"]).toContain(tileAt(map, p.x, p.y));
      expect(p.x).toBe(5); // the near bank only
    }
  });

  it("never on a bridge, and nowhere without a river", () => {
    const bridged = mapFrom(["P.=~", "...~"]);
    expect(landingCandidates(bridged).some((p) => tileAt(bridged, p.x, p.y) === "bridge")).toBe(false);
    expect(landingCandidates(mapFrom(["P..", "..."]))).toEqual([]);
    expect(chooseLanding(withState({ map: mapFrom(["P..", "..."]) }), content, 10)).toBeNull();
  });

  it("is one of the spots nearest the barangay's cleared land", () => {
    const closest = closestLandings(map, aiRaid.landingChoices);
    expect(closest[0]).toEqual({ x: 5, y: 2 }); // cleared land right on the bank
    const s = state();
    const picks = new Set<string>();
    for (let second = 0; second < 200; second++) {
      const p = chooseLanding(s, content, second)!;
      expect(closest).toContainEqual(p);
      picks.add(`${p.x},${p.y}`);
    }
    // The seeded roll spreads raids over the closest spots.
    expect(picks.size).toBeGreaterThan(1);
  });

  it("is the same for the same seed and second, and stored on the raid", () => {
    const s = state();
    expect(chooseLanding(s, content, 77)).toEqual(chooseLanding(s, content, 77));
    const raid = { ...s, region: { ...newGame(content, 2).region!, incomingRaid: { from: "batong-buhay", strikeAt: 200, landing: { x: 5, y: 1 } } } };
    expect(raidLanding(raid, content)).toEqual({ x: 5, y: 1 });
    // An older save's raid without a landing gets the seeded one for its start time.
    const old = { ...raid, region: { ...raid.region, incomingRaid: { from: "batong-buhay", strikeAt: 200 } } };
    expect(raidLanding(old, content)).toEqual(chooseLanding(old, content, 200 - aiRaid.warningSeconds));
  });

  it("names the direction for the warning", () => {
    expect(directionFrom({ x: 5, y: 5 }, { x: 5, y: 0 })).toBe("north");
    expect(directionFrom({ x: 5, y: 5 }, { x: 9, y: 9 })).toBe("south-east");
    expect(directionFrom({ x: 5, y: 5 }, { x: 0, y: 5 })).toBe("west");
  });
});

describe("Kuta radius", () => {
  const landing = { x: 5, y: 2 };

  it(`gives full defense within ${military.kutaRadius} tiles, ${military.kutaOutsidePercent}% beyond`, () => {
    expect(kutaShare(content, { x: 1, y: 2 }, landing)).toBe(1);
    expect(kutaShare(content, { x: 5 - military.kutaRadius, y: 2 }, landing)).toBe(1);
    expect(kutaShare(content, { x: 5 - military.kutaRadius - 1, y: 2 }, landing)).toBe(military.kutaOutsidePercent / 100);
  });

  it("counts each Kuta by its own distance", () => {
    const kuta = content.buildings.find((b) => b.id === "kuta")!;
    const wide = mapFrom([
      "T.............T~~",
      "T..P...........~~",
      "T.............T~~",
    ]);
    const near = { x: 15, y: 1 };
    const s = withState({ map: wide, buildings: [at("kuta", 13, 0), at("kuta", 1, 0)], villagers: 2, warriors: 0 });
    const m = muster(s, content, near, aiRaid.warningSeconds);
    expect(m.walls).toBeCloseTo(kuta.defense! * (1 + military.kutaOutsidePercent / 100));
    expect(m.covered).toBe(true);
    const far = withState({ map: wide, buildings: [at("kuta", 1, 0)], villagers: 2, warriors: 0 });
    expect(muster(far, content, near, aiRaid.warningSeconds).covered).toBe(false);
  });

  it("a damaged Kuta gives nothing", () => {
    const s = state({ buildings: [{ ...at("kuta", 4, 1), damaged: true }] });
    expect(muster(s, content, { x: 5, y: 2 }, aiRaid.warningSeconds).walls).toBe(0);
  });
});

describe("defenders on the way", () => {
  it("walk from the Kuta to the landing; the closer ones make it", () => {
    const s = state({ buildings: [at("kuta", 4, 1)] });
    const m = muster(s, content, { x: 5, y: 2 }, aiRaid.warningSeconds);
    expect(m.joined).toBe(4);
    expect(m.late).toBe(0);
  });

  it("don't join if they can't get there in time", () => {
    const s = state({ buildings: [at("kuta", 1, 1)] });
    const seconds = travelSeconds(map, { x: 1, y: 1 }, { x: 5, y: 2 }, content)!;
    expect(muster(s, content, { x: 5, y: 2 }, seconds - 0.5)).toMatchObject({ joined: 0, late: 4 });
    expect(muster(s, content, { x: 5, y: 2 }, seconds)).toMatchObject({ joined: 4, late: 0 });
  });

  it("forest is slower to cross than cleared land", () => {
    expect(travelSeconds(map, { x: 4, y: 1 }, { x: 5, y: 1 }, content)).toBeGreaterThan(travelSeconds(map, { x: 4, y: 2 }, { x: 5, y: 2 }, content)!);
  });

  it("splits warriors over the Kutas; only the groups in time join", () => {
    const long = mapFrom([
      "......................T~~",
      ".P....................T~~",
    ]);
    const s = withState({ map: long, buildings: [at("kuta", 21, 0), at("kuta", 0, 0)], villagers: 6, warriors: 3 });
    const landing = { x: 22, y: 1 };
    const tight = travelSeconds(long, { x: 21, y: 0 }, landing, content)! + 1;
    const m = muster(s, content, landing, tight);
    expect(m.posts.map((p) => p.warriors)).toEqual([2, 1]);
    expect(m).toMatchObject({ joined: 2, late: 1 });
  });

  it("with no Kuta, they set out from the plaza", () => {
    const m = muster(state(), content, { x: 5, y: 2 }, aiRaid.warningSeconds);
    expect(m.posts).toHaveLength(1);
    expect(m.posts[0].from).toEqual(map.plaza);
    expect(m.joined).toBe(4);
  });

  it("defense at the landing: base, warriors who arrive, Kutas by radius", () => {
    const s = state({ buildings: [at("kuta", 4, 1)] });
    const kuta = content.buildings.find((b) => b.id === "kuta")!;
    expect(borderDefense(s, content, { x: 5, y: 2 }, aiRaid.warningSeconds).defense).toBe(military.baseDefense + 4 * military.warrior.defense + kuta.defense!);
  });
});

describe("raids strike at the landing", () => {
  /** A real barangay with warriors and a Kuta, a raid about to strike. */
  function raid(seed: number): GameState {
    const g = newGame(content, seed);
    const plaza = g.map.plaza;
    let s: GameState = {
      ...g,
      time: 659.5,
      villagers: 10,
      warriors: 4,
      resources: { rice: 500, wood: 500, gold: 0 },
      buildings: [...g.buildings, at("kuta", plaza.x + 1, plaza.y + 1)],
    };
    const landing = chooseLanding(s, content, 600)!;
    s = {
      ...s,
      region: {
        ...s.region!,
        truceUntil: 0,
        nextAiRaidAt: 9999,
        incomingRaid: { from: "batong-buhay", strikeAt: 660, landing },
        neighbors: s.region!.neighbors.map((n) => (n.id === "batong-buhay" ? { ...n, state: { ...n.state, warriors: 6, villagers: 12 } } : n)),
      },
    };
    return s;
  }

  it("uses the defense at the landing, and records where and who was late", () => {
    const s = raid(9);
    const expected = borderDefense(s, content, s.region!.incomingRaid!.landing!, aiRaid.warningSeconds);
    const after = tick(s, calm, 1);
    const report = after.region!.reports.at(-1)!;
    expect(report.kind).toBe("defense");
    expect(report.defense).toBeCloseTo(expected.defense);
    expect(report).toMatchObject({ landing: s.region!.incomingRaid!.landing, late: expected.muster.late, covered: expected.muster.covered });
  });

  it("gives identical results for the same seed", () => {
    for (const seed of [3, 9, 27]) {
      const a = tick(raid(seed), calm, 5);
      const b = tick(raid(seed), calm, 5);
      expect(a).toEqual(b);
    }
  });

  it("warriors who were too far away don't die in the battle", () => {
    const s = raid(9);
    const landing = s.region!.incomingRaid!.landing!;
    const expected = borderDefense(s, content, landing, aiRaid.warningSeconds).muster;
    const after = tick(s, calm, 1);
    const report = after.region!.reports.at(-1)!;
    expect(report.ourLosses!).toBeLessThanOrEqual(expected.joined);
    expect(after.warriors).toBeGreaterThanOrEqual(expected.late);
  });
});
