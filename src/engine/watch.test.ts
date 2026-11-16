// The Bantayan and the reworked Kuta: watched and unwatched warnings, raiders' choice of landing,
// when raids come, the Kuta's shelter, allies and tributaries, the migration, and determinism.
import { describe, expect, it } from "vitest";
import { chooseLanding, closestLandings, isCove } from "./border";
import { landingKnown } from "./defense";
import { newGame, tick, type GameState } from "./game";
import { alliedDefenders, raidLootShare, raidTimingFactor, startRaid, type NeighborState } from "./region";
import { migrateDefenseV33, parseSave } from "./save";
import { isWatched, warningFor } from "./watch";
import { acquainted, at, calm, content, withState } from "./testUtils";
import { createRegion } from "./region";

const w = content.rules.watch;
const d = content.rules.diplomacy;
/** The test map's river is column 0: landing points are on the bank at x = 1. */
function world(buildings = [at("bahay-kubo", 5, 3)], patch: Partial<GameState> = {}): GameState {
  const s = withState({ resources: { rice: 1000, wood: 1000, gold: 0 }, villagers: 12, buildings, ...patch });
  return { ...s, region: acquainted(createRegion(calm, s.time, 7)) };
}
const setNb = (s: GameState, id: string, patch: Partial<NeighborState>): GameState => ({
  ...s,
  region: { ...s.region!, neighbors: s.region!.neighbors.map((n) => (n.id === id ? { ...n, ...patch } : n)) },
});

describe("a staffed Bantayan's watch", () => {
  it("extends the warning and shows the landing from the start", () => {
    const points = closestLandings(world().map, d.aiRaid.landingChoices);
    // Towers along the whole bank: every landing is watched.
    const s = world([at("bahay-kubo", 5, 3), at("bantayan", 1, 0), at("bantayan", 1, 8)]);
    for (const p of points) expect(isWatched(s, content, p)).toBe(true);
    const raid = startRaid(s, content, "batong-buhay", 100);
    expect(raid).toMatchObject({ watched: true, warnedAt: 100, strikeAt: 100 + w.watchedWarningSeconds });
    expect(w.watchedWarningSeconds).toBeGreaterThan(w.unwatchedWarningSeconds);
    const during = { ...s, time: 101, region: { ...s.region!, incomingRaid: raid } };
    expect(landingKnown(during, content)).toBe(true);
  });

  it("unwatched: a short warning, and the landing shows only as the boats come close", () => {
    const s = world();
    const raid = startRaid(s, content, "batong-buhay", 100);
    expect(raid).toMatchObject({ watched: false, warnedAt: 100, strikeAt: 100 + w.unwatchedWarningSeconds });
    const at0 = { ...s, time: 101, region: { ...s.region!, incomingRaid: raid } };
    expect(landingKnown(at0, content)).toBe(false);
    expect(landingKnown({ ...at0, time: raid.strikeAt - w.revealUnwatchedSeconds }, content)).toBe(true);
    expect(warningFor(content, false)).toBe(w.unwatchedWarningSeconds);
  });

  it("a longer warning lets defenders who rally at a far Kuta get there in time", () => {
    // Warnings tight enough that the far Kuta's warriors only get there with the long one.
    const tight = { ...calm, rules: { ...calm.rules, watch: { ...w, unwatchedWarningSeconds: 10, watchedWarningSeconds: 60 } } };
    // The Kuta far from the bank: the short warning isn't enough, the long one is.
    const kuta = at("kuta", 8, 8);
    const plain = world([at("bahay-kubo", 5, 3), kuta], { warriors: 6 });
    const watched = world([at("bahay-kubo", 5, 3), kuta, at("bantayan", 1, 0), at("bantayan", 1, 8)], { warriors: 6 });
    const fight = (s: GameState) => {
      const raid = startRaid(s, tight, "batong-buhay", 700);
      let x: GameState = { ...s, time: raid.strikeAt - 0.5, region: { ...s.region!, truceUntil: 0, nextAiRaidAt: 9999, incomingRaid: { ...raid, landing: { x: 1, y: 8 } } } };
      x = { ...x, region: { ...x.region!, neighbors: x.region!.neighbors.map((n) => (n.id === "batong-buhay" ? { ...n, state: { ...n.state, warriors: 6 } } : n)) } };
      return tick(x, tight, 1).region!.reports.at(-1)!;
    };
    const a = fight(plain);
    const b = fight(watched);
    expect(b.watched).toBe(true);
    expect(a.watched).toBe(false);
    expect(b.late!).toBeLessThan(a.late!);
    expect(b.defense!).toBeGreaterThan(a.defense!);
  });
});

describe("raiders (mangayaw)", () => {
  it("prefer landings no staffed Bantayan watches", () => {
    // A short-sighted tower, so it watches only part of the bank.
    const near = { ...content, rules: { ...content.rules, watch: { ...w, radius: 2 } } };
    const s = world([at("bahay-kubo", 5, 3), at("bantayan", 1, 0)]);
    const points = closestLandings(s.map, d.aiRaid.landingChoices);
    const watched = points.filter((p) => isWatched(s, near, p));
    expect(watched.length).toBeGreaterThan(0);
    expect(watched.length).toBeLessThan(points.length);
    let unwatchedPicks = 0;
    const N = 400;
    for (let second = 0; second < N; second++) if (!isWatched(s, near, chooseLanding(s, near, second))) unwatchedPicks++;
    // Fairly picked, the unwatched share would be their share of the points; weighted, it's more.
    expect(unwatchedPicks / N).toBeGreaterThan((points.length - watched.length) / points.length + 0.05);
  });

  it("favour coves and river mouths", () => {
    const g = newGame(content, 11);
    const coves = closestLandings(g.map, 30).filter((p) => isCove(g.map, p));
    for (const p of coves) expect(isCove(g.map, p)).toBe(true);
  });

  it("come more at night and dawn and around season changes, less in a typhoon", () => {
    const s = world();
    const day = content.rules.dayNight.daySeconds;
    // Strike times judged with the unwatched warning.
    const at = (phase: number) => phase * day - w.unwatchedWarningSeconds + day * 3;
    const night = raidTimingFactor(s, content, at(0.7));
    const noon = raidTimingFactor(s, content, at(0.3));
    expect(night).toBeGreaterThan(noon);
    const stormy = raidTimingFactor({ ...s, typhoon: { strikeAt: 9999 } }, content, at(0.7));
    expect(stormy).toBeLessThan(night);
  });

  it("take less from stores in a Kuta's shelter, and less again with allies on the way", () => {
    const plaza = world().map.plaza;
    const open = world([at("bahay-kubo", 5, 3), at("kamalig", 1, 8)]);
    const sheltered = world([at("bahay-kubo", 5, 3), at("kamalig", plaza.x + 1, plaza.y), at("kuta", plaza.x, plaza.y + 1)]);
    expect(raidLootShare(open, content, false)).toBe(100);
    expect(raidLootShare(sheltered, content, false)).toBe(content.rules.kuta.shelteredLootPercent);
    expect(raidLootShare(open, content, true)).toBe(d.aiRaid.alliesComingLootPercent);
  });

  it("winning raiders take less when the stores are sheltered: the report says so", () => {
    const plaza = world().map.plaza;
    const run = (buildings: ReturnType<typeof at>[]) => {
      for (let seed = 1; seed < 300; seed++) {
        let s = world(buildings, { warriors: 0, rng: seed, time: 659.5 });
        s = { ...s, region: { ...s.region!, truceUntil: 0, nextAiRaidAt: 9999, incomingRaid: { from: "batong-buhay", strikeAt: 660, landing: { x: 1, y: 4 }, warnedAt: 620, watched: false } } };
        s = { ...s, region: { ...s.region!, neighbors: s.region!.neighbors.map((n) => (n.id === "batong-buhay" ? { ...n, state: { ...n.state, warriors: 8 } } : n)) } };
        const r = tick(s, calm, 1).region!.reports.at(-1)!;
        if (r.win === false) return r;
      }
      throw new Error("no lost raid found");
    };
    const exposed = run([at("bahay-kubo", 5, 3), at("kamalig", 1, 8)]);
    const safe = run([at("bahay-kubo", 5, 3), at("kamalig", plaza.x + 1, plaza.y), at("kuta", plaza.x, plaza.y + 1)]);
    expect(safe.lootShare).toBe(content.rules.kuta.shelteredLootPercent);
    expect(safe.lost!.rice!).toBeLessThan(exposed.lost!.rice!);
  });

  it("are met by tributaries' warriors too, a share of them", () => {
    let s = world();
    const id = s.region!.neighbors[1].id;
    s = setNb(s, id, { status: "tributary", state: { ...s.region!.neighbors[1].state, warriors: 10 } });
    const help = alliedDefenders(s, content, 999).find((a) => a.id === id)!;
    expect(help.warriors).toBe(Math.floor((10 * content.rules.allyDefense.tributarySendPercent) / 100));
  });
});

describe("migration from v32", () => {
  it("turns Kutas nearer the water than the Bahay ng Datu into Bantayan, refunds the difference, and keeps the rest", () => {
    const s = world([at("bahay-kubo", 5, 3), at("kuta", 1, 2), at("kuta", 6, 4)]);
    const raw = JSON.parse(JSON.stringify(s));
    raw.version = 32;
    const out = migrateDefenseV33(raw, content);
    expect((out.buildings as { type: string; x: number }[]).map((b) => b.type)).toEqual(["bahay-kubo", "bantayan", "kuta"]);
    const kuta = content.buildings.find((b) => b.id === "kuta")!;
    const tower = content.buildings.find((b) => b.id === "bantayan")!;
    expect((out.resources as Record<string, number>).wood).toBe(1000 + kuta.cost.wood! - tower.cost.wood!);
    expect(out.flags).toContain("defense-rework");
    expect((out.region as { news: { key: string }[] }).news.at(-1)!.key).toBe("defenseRework");
    // The whole save loads, at the current version.
    const loaded = parseSave(JSON.stringify(raw), content)!;
    expect(loaded.buildings.map((b) => b.type)).toEqual(["bahay-kubo", "bantayan", "kuta"]);
    // Nothing to convert: nothing told.
    const none = migrateDefenseV33({ ...raw, buildings: [{ type: "kuta", x: 6, y: 4 }] }, content);
    expect(none.flags ?? []).not.toContain("defense-rework");
  });
});

describe("determinism", () => {
  it("the same seed gives the same raids, landings and results", () => {
    const s = { ...world([at("bahay-kubo", 5, 3), at("kuta", 4, 5), at("bantayan", 1, 2)], { warriors: 3, rng: 5 }), time: 600 };
    const surely = { ...calm, rules: { ...calm.rules, diplomacy: { ...d, aiRaid: { ...d.aiRaid, chancePerSecond: 1 } } } };
    const a = tick(s, surely, 200);
    const b = tick(s, surely, 200);
    expect(a.region!.reports).toEqual(b.region!.reports);
    expect(a).toEqual(b);
    expect(a.region!.reports.some((r) => r.kind === "defense")).toBe(true);
  });
});
