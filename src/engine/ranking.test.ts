import { describe, expect, it } from "vitest";
import { STATE_VERSION, tick, type GameState } from "./game";
import { aiScore, rankEntries, renownRank, toPass, trackRanking, type RankEntry } from "./ranking";
import { addNews, createRegion, type NeighborState, type Report } from "./region";
import { parseSave } from "./save";
import { calm, content, withState } from "./testUtils";

const k = content.rules.kabantugan;
const entry = (id: string, patch: Partial<RankEntry> = {}): RankEntry => ({
  id,
  name: id,
  datu: `Datu ${id}`,
  level: 1,
  island: "",
  bloc: null,
  you: false,
  renown: 0,
  renownAt: 0,
  defended: 0,
  defendedAt: 0,
  aklat: null,
  aklatAt: 0,
  ...patch,
});
const ids = (es: RankEntry[]) => es.map((e) => e.id);

const world = (patch: Partial<GameState> = {}): GameState => {
  const s = withState({ villagers: 20, ...patch });
  return { ...s, region: createRegion(calm, 0, 7, s.barangay.id) };
};
const setNb = (s: GameState, id: string, patch: (n: NeighborState) => Partial<NeighborState>): GameState => ({
  ...s,
  region: { ...s.region!, neighbors: s.region!.neighbors.map((n) => (n.id === id ? { ...n, ...patch(n) } : n)) },
});
const nb = (s: GameState, id: string) => s.region!.neighbors.find((n) => n.id === id)!;
/** Every AI barangay's renown set to `renown`, gained at `at`. */
const allAt = (s: GameState, renown: number, at = 0): GameState => ({
  ...s,
  region: { ...s.region!, neighbors: s.region!.neighbors.map((n) => ({ ...n, fame: { ...n.fame, renown, renownAt: at } })) },
});
const report = (s: GameState, r: Omit<Report, "id" | "time">): GameState => ({
  ...s,
  region: { ...s.region!, reports: [...s.region!.reports, { id: s.region!.nextReportId, time: s.time, ...r } as Report], nextReportId: s.region!.nextReportId + 1 },
});

describe("ranking order", () => {
  it("highest first in each tab, unknown stats last", () => {
    const es = [entry("a", { renown: 10, defended: 5, aklat: null }), entry("b", { renown: 30, defended: 1, aklat: null }), entry("me", { you: true, renown: 20, defended: 3, aklat: 4 })];
    expect(ids(rankEntries(es, "renown"))).toEqual(["b", "me", "a"]);
    expect(ids(rankEntries(es, "defended"))).toEqual(["a", "me", "b"]);
    expect(ids(rankEntries(es, "aklat"))).toEqual(["me", "a", "b"]);
  });

  it("a tie goes to whoever got there first, then the player, then the order given", () => {
    const es = [entry("late", { renown: 50, renownAt: 300 }), entry("early", { renown: 50, renownAt: 100 }), entry("me", { you: true, renown: 50, renownAt: 200 })];
    expect(ids(rankEntries(es, "renown"))).toEqual(["early", "me", "late"]);
    const same = [entry("x", { renown: 5, renownAt: 9 }), entry("me", { you: true, renown: 5, renownAt: 9 }), entry("y", { renown: 5, renownAt: 9 })];
    expect(ids(rankEntries(same, "renown"))).toEqual(["me", "x", "y"]);
  });

  it("says how much more passes the barangay just above", () => {
    const ranked = rankEntries([entry("a", { renown: 80 }), entry("me", { you: true, renown: 65 }), entry("b", { renown: 10 })], "renown");
    expect(toPass(ranked, "renown")).toMatchObject({ above: { id: "a" }, need: 16 });
    expect(toPass(rankEntries([entry("me", { you: true, renown: 99 }), entry("a", { renown: 1 })], "renown"), "renown")).toBeNull();
  });
});

describe("AI fame", () => {
  it("starts at their size and strength, grows with a new peak, and is never lost", () => {
    const s = world();
    const n = nb(s, "malinaw");
    expect(n.fame.renown).toBe(aiScore(content, n.state));
    const grown = setNb({ ...s, time: 50 }, "malinaw", (x) => ({ state: { ...x.state, villagers: x.state.villagers + 5 } }));
    const after = trackRanking(s, grown, content);
    expect(nb(after, "malinaw").fame.renown).toBe(n.fame.renown + 5 * k.aiPerVillager);
    expect(nb(after, "malinaw").fame.renownAt).toBe(50);
    const shrunk = setNb({ ...after, time: 60 }, "malinaw", (x) => ({ state: { ...x.state, villagers: 1 } }));
    expect(nb(trackRanking(after, shrunk, content), "malinaw").fame.renown).toBe(nb(after, "malinaw").fame.renown);
  });

  it("counts raids they beat off and battles they win", () => {
    const s = { ...world(), time: 40 };
    const beaten = trackRanking(s, report(s, { kind: "raid", neighbor: "malinaw", win: false } as Omit<Report, "id" | "time">), content);
    expect(nb(beaten, "malinaw").fame).toMatchObject({ defended: 1, defendedAt: 40, renown: nb(s, "malinaw").fame.renown + k.perDefenseWon });
    const won = trackRanking(s, report(s, { kind: "defense", neighbor: "pulang-lupa", win: false } as Omit<Report, "id" | "time">), content);
    expect(nb(won, "pulang-lupa").fame.renown).toBe(nb(s, "pulang-lupa").fame.renown + k.perRaidWon);
    const ally = trackRanking(s, { ...s, region: addNews(s.region!, { time: 40, key: "ally-defended", barangay: "malinaw", other: "batong-buhay" }) }, content);
    expect(nb(ally, "malinaw").fame.defended).toBe(1);
  });
});

describe("the player's ranked stats", () => {
  it("note when they last grew", () => {
    const s = world({ time: 10 });
    const later = { ...s, time: 70, kabantugan: s.kabantugan + 5, stats: { ...s.stats, raidsDefended: 1 }, aklat: ["anito-ng-balete"] };
    expect(trackRanking(s, later, content).achievedAt).toEqual({ renown: 70, defended: 70, aklat: 70 });
  });
});

describe("rank changes", () => {
  it("are worked out silently the first time", () => {
    const s = allAt(world({ kabantugan: 0 }), 100);
    const first = trackRanking(s, { ...s, time: 1 }, content);
    expect(first.renownRank).toBe(renownRank(first));
    expect(first.history).toEqual(s.history);
    expect(first.region!.news).toEqual(s.region!.news);
  });

  it("moving up is celebrated in the history and the Balita", () => {
    let s = allAt(world({ kabantugan: 0 }), 100);
    s = trackRanking(s, { ...s, time: 1 }, content);
    const n = s.region!.neighbors.length;
    expect(s.renownRank).toBe(n + 1);
    const up = trackRanking(s, { ...s, time: 2, kabantugan: 150 }, content);
    expect(up.renownRank).toBe(1);
    expect(up.history.at(-1)).toMatchObject({ kind: "rank", level: 1, at: 2 });
    expect(up.region!.news.at(-1)).toMatchObject({ key: "rank-up", barangay: s.barangay.id });
  });

  it("an AI barangay passing the player is in the Balita", () => {
    let s = allAt(world({ kabantugan: 200, achievedAt: { renown: 0, defended: 0, aklat: 0 } }), 100);
    s = trackRanking(s, { ...s, time: 1 }, content);
    expect(s.renownRank).toBe(1);
    const passed = setNb({ ...s, time: 5 }, "malinaw", (x) => ({ fame: { ...x.fame, renown: 250, renownAt: 5 } }));
    const after = trackRanking(s, passed, content);
    expect(after.renownRank).toBe(2);
    expect(after.region!.news.at(-1)).toMatchObject({ key: "overtook", barangay: "malinaw", other: s.barangay.id });
    expect(after.history).toEqual(s.history);
  });

  it("an equal score doesn't pass whoever got there first", () => {
    let s = allAt(world({ kabantugan: 200, achievedAt: { renown: 3, defended: 0, aklat: 0 } }), 100);
    s = trackRanking(s, { ...s, time: 4 }, content);
    const tied = setNb({ ...s, time: 5 }, "malinaw", (x) => ({ fame: { ...x.fame, renown: 200, renownAt: 5 } }));
    expect(trackRanking(s, tied, content).renownRank).toBe(1);
  });

  it("happen while the game runs", () => {
    const s = allAt(world(), 0);
    const after = tick(s, calm, 30);
    expect(after.renownRank).toBeGreaterThan(0);
  });
});

describe("save migration v21 → v22", () => {
  it("gives AI barangays renown from their size and strength, and works out the rank silently", () => {
    const s = world({ time: 500, kabantugan: 40 });
    const raw = JSON.parse(JSON.stringify({ ...s, version: 21 }));
    delete raw.achievedAt;
    delete raw.renownRank;
    for (const n of raw.region.neighbors) delete n.fame;
    const back = parseSave(JSON.stringify(raw), content)!;
    expect(back.version).toBe(STATE_VERSION);
    expect(back.achievedAt).toEqual({ renown: 500, defended: 500, aklat: 500 });
    expect(back.renownRank).toBe(0);
    for (const n of back.region!.neighbors) expect(n.fame).toMatchObject({ renown: aiScore(content, n.state), renownAt: 500, defended: 0 });
    // Ranked stats survive a save round trip.
    const ranked = trackRanking(back, { ...back, time: 501 }, content);
    expect(parseSave(JSON.stringify(ranked), content)!.region!.neighbors.map((n) => n.fame)).toEqual(ranked.region!.neighbors.map((n) => n.fame));
    expect(parseSave(JSON.stringify(ranked), content)!.renownRank).toBe(ranked.renownRank);
  });
});
