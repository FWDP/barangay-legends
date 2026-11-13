import { describe, expect, it } from "vitest";
import { buildContent, loadContent, questChain, validateQuest, type QuestDef } from "./content";
import { apply, tick, type GameState } from "./game";
import { checkTasks, currentTask, datuTitle, earnedTitles, firstSeasonEnd, taskMet, taskProgress } from "./gawain";
import { offlineProgress } from "./offline";
import { createRegion } from "./region";
import { at, calm, content, mapFrom, withState } from "./testUtils";

const quest = (id: string) => content.quests.find((q) => q.id === id)!;
/** A state with the given tasks done (none by default), so the chain is live. */
const fresh = (patch: Partial<GameState> = {}, done: string[] = []) => withState({ gawainDone: done, ...patch } as Partial<GameState>);
const upTo = (id: string) => content.quests.slice(0, content.quests.findIndex((q) => q.id === id)).map((q) => q.id);

describe("the task chain (content/quests)", () => {
  it("has about 15 tasks in teaching order, starting with the first Palayan", () => {
    expect(content.quests.length).toBeGreaterThanOrEqual(12);
    expect(content.quests.length).toBeLessThanOrEqual(20);
    const ids = content.quests.map((q) => q.id);
    expect(ids[0]).toBe("first-palayan");
    // The tasks the design asks for, in this order.
    const wanted = ["first-palayan", "ten-villagers", "clear-five", "daan-three", "first-kamalig", "tag-araw", "first-dock", "first-trade", "three-warriors", "defend-raid", "first-tributary"];
    const positions = wanted.map((id) => ids.indexOf(id));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(ids).toContain("first-tulay");
  });

  it("gives every task text in English and Filipino, and a reward", () => {
    for (const q of content.quests) {
      expect(q.text.en).not.toBe("");
      expect(q.text.fil).not.toBe("");
      expect(q.reward.resources ?? q.reward.title).toBeDefined();
    }
    expect(quest("first-dock").reward.title?.fil).toBe("Datu ng Ilog");
  });

  it("rejects broken task files", () => {
    const good = { id: "x", first: true, text: { en: "a", fil: "b" }, condition: { type: "villagers", count: 3 }, reward: { resources: { rice: 1 } }, next: null };
    expect(() => validateQuest({ ...good, condition: { type: "fly" } })).toThrow(/condition.type/);
    expect(() => validateQuest({ ...good, text: { en: "a" } })).toThrow(/text/);
    expect(() => validateQuest({ ...good, reward: {} })).toThrow(/reward/);
    expect(() => validateQuest({ ...good, condition: { type: "villagers", count: 0 } })).toThrow(/count/);
    const a = validateQuest(good) as QuestDef;
    expect(() => questChain([a, { ...a, id: "y", first: false }], new Set(), [])).toThrow(/not in the chain/);
    expect(() => questChain([{ ...a, next: "nope" }], new Set(), [])).toThrow(/unknown task/);
    expect(() => questChain([{ ...a, next: "x" }], new Set(), [])).toThrow(/loops/);
    expect(() => questChain([{ ...a, condition: { type: "built", building: "castle", count: 1 } }], new Set(["palayan"]), [])).toThrow(/castle/);
  });

  it("is optional: content without quests has none", () => {
    const real = loadContent();
    const bare = buildContent({ "kubo.json": real.buildings[0] }, { ...real.rules, start: { ...real.rules.start, buildings: {} }, clearing: { ...real.rules.clearing, borrow: { ...real.rules.clearing.borrow, order: [], protect: [] } } });
    expect(bare.quests).toEqual([]);
    expect(currentTask(withState({ gawainDone: [] }), bare)).toBeNull();
  });
});

describe("task conditions", () => {
  it("built: owns that many of the building", () => {
    const q = quest("first-palayan");
    expect(taskMet(fresh({ buildings: [] }), content, q)).toBe(false);
    expect(taskMet(fresh({ buildings: [at("palayan", 1, 1)] }), content, q)).toBe(true);
  });

  it("villagers, tiles cleared and Mandirigma", () => {
    expect(taskProgress(fresh({ villagers: 7 }), content, quest("ten-villagers"))).toEqual({ have: 7, need: 10 });
    expect(taskMet(fresh({ villagers: 10 }), content, quest("ten-villagers"))).toBe(true);
    expect(taskMet(fresh({ tilesCleared: 5 }), content, quest("clear-five"))).toBe(true);
    expect(taskMet(fresh({ villagers: 10, warriors: 3 }), content, quest("three-warriors"))).toBe(true);
    expect(taskMet(fresh({ villagers: 10, warriors: 2 }), content, quest("three-warriors"))).toBe(false);
  });

  it("connected: buildings joined to the plaza by a Daan", () => {
    // Plaza at (3, 1); a Daan runs from it along row 1.
    const map = mapFrom([
      "........",
      "...P###.",
      "........",
    ]);
    const s = fresh({ map, buildings: [at("palayan", 4, 0), at("palayan", 5, 2), at("woodcutter-camp", 7, 1), at("bahay-kubo", 0, 0)] });
    expect(taskProgress(s, content, quest("daan-three"))).toEqual({ have: 3, need: 3 });
  });

  it("survived a season: the first Tag-araw is over and the barangay still stands", () => {
    const end = firstSeasonEnd(content, "tag-araw")!;
    expect(end).toBeGreaterThan(0);
    expect(taskMet(fresh({ time: end - 1 }), content, quest("tag-araw"))).toBe(false);
    expect(taskMet(fresh({ time: end }), content, quest("tag-araw"))).toBe(true);
    expect(taskMet(fresh({ time: end, villagers: 0 }), content, quest("tag-araw"))).toBe(false);
  });

  it("traded, raids defended and tributaries come from the region", () => {
    const s = fresh({ region: createRegion(calm, 0, 7) });
    expect(taskMet(s, content, quest("first-trade"))).toBe(false);
    expect(taskMet({ ...s, region: { ...s.region!, paths: ["trade"] } }, content, quest("first-trade"))).toBe(true);
    expect(taskMet({ ...s, stats: { ...s.stats, raidsDefended: 1 } }, content, quest("defend-raid"))).toBe(true);
    const tributary = { ...s, region: { ...s.region!, neighbors: s.region!.neighbors.map((n, i) => (i === 0 ? { ...n, status: "tributary" as const } : n)) } };
    expect(taskMet(tributary, content, quest("first-tributary"))).toBe(true);
  });

  it("counts a raid beaten off", () => {
    // Plenty of defense: any raid that lands is beaten.
    const s = fresh({ villagers: 30, warriors: 20, buildings: [at("kuta", 2, 2), at("kuta", 6, 6)], region: createRegion(calm, 0, 3) });
    const from = s.region!.neighbors[0];
    const raidState: GameState = {
      ...s,
      region: {
        ...s.region!,
        truceUntil: 0,
        incomingRaid: { from: from.id, strikeAt: 1 },
        neighbors: s.region!.neighbors.map((n) => (n.id === from.id ? { ...n, state: { ...n.state, warriors: 1 } } : n)),
      },
    };
    const after = tick(raidState, calm, 2);
    expect(after.region!.reports.at(-1)).toMatchObject({ kind: "defense", win: true });
    expect(after.stats.raidsDefended).toBe(1);
  });
});

describe("finishing tasks", () => {
  it("only the current task can finish; the next one follows", () => {
    const s = fresh({ buildings: [at("woodcutter-camp", 2, 2)] });
    expect(currentTask(s, content)?.id).toBe("first-palayan");
    // The camp is built, but the Palayan comes first.
    expect(checkTasks(s, content)).toBe(s);
    const both = checkTasks({ ...s, buildings: [...s.buildings, at("palayan", 1, 1)] }, content);
    expect(both.gawainDone).toEqual(["first-palayan", "first-camp"]);
    expect(currentTask(both, content)?.id).toBe("ten-villagers");
  });

  it("pays resource rewards and notes each task in the history", () => {
    const s = fresh({ resources: { rice: 0, wood: 0, gold: 0 }, buildings: [at("palayan", 1, 1)] });
    const done = checkTasks(s, content);
    expect(done.gawainDone).toEqual(["first-palayan"]);
    expect(done.resources.wood).toBe(quest("first-palayan").reward.resources!.wood);
    expect(done.history.at(-1)).toMatchObject({ kind: "task", task: "first-palayan" });
  });

  it("gives the datu a title: the latest one earned", () => {
    expect(datuTitle(fresh(), content)).toBeNull();
    const s = fresh({ time: firstSeasonEnd(content, "tag-araw")! }, upTo("tag-araw"));
    const done = checkTasks(s, content);
    expect(datuTitle(done, content)).toEqual(quest("tag-araw").reward.title);
    const later = { ...done, gawainDone: [...done.gawainDone, ...upTo("first-dock").filter((id) => !done.gawainDone.includes(id)), "first-dock"] };
    expect(datuTitle(later, content)?.en).toBe("Datu ng Ilog");
    expect(earnedTitles(later, content).map((t) => t.en)).toContain("Datu of the Dry Season");
    expect(earnedTitles(later, content).at(-1)?.en).toBe("Datu ng Ilog");
  });

  it("is checked every engine step", () => {
    const s = fresh({ villagers: 5, resources: { rice: 100, wood: 100, gold: 0 } });
    const built = apply(s, calm, { type: "build", building: "palayan", x: 1, y: 1 });
    // A command doesn't finish tasks by itself (refused commands stay the same object)...
    expect(built.gawainDone).toEqual([]);
    // ...the next step does.
    expect(tick(built, calm, 1).gawainDone).toContain("first-palayan");
  });

  it("ends with no current task once the chain is done", () => {
    const all = fresh({}, content.quests.map((q) => q.id));
    expect(currentTask(all, content)).toBeNull();
    expect(checkTasks(all, content)).toBe(all);
  });

  it("credits tasks finished while the game was closed", () => {
    // Fields and room to grow: newcomers arrive offline, so "Reach 10 villagers" is met.
    const houses = [at("bahay-kubo", 5, 3), at("bahay-kubo", 4, 3), at("bahay-kubo", 6, 3), at("bahay-kubo", 4, 5)];
    const s = fresh({ villagers: 6, resources: { rice: 150, wood: 0, gold: 0 }, buildings: [at("palayan", 1, 1), at("palayan", 1, 3), at("woodcutter-camp", 8, 1), ...houses] }, ["first-palayan", "first-camp"]);
    const { state, report } = offlineProgress(s, calm, 600);
    expect(state.villagers).toBeGreaterThanOrEqual(10);
    expect(report.tasks).toContain("ten-villagers");
    expect(state.gawainDone).toContain("ten-villagers");
  });
});

describe("worship and forest tasks", () => {
  it("asks for the Dambana, 5 Aklat entries, permission before clearing and 5 replanted tiles", () => {
    expect(taskMet(fresh({ buildings: [at("babaylan-hut", 2, 2), at("dambana", 2, 3)] }), content, quest("first-dambana"))).toBe(true);
    expect(taskProgress(fresh({ aklat: ["kapre", "balete", "babaylan"] }), content, quest("aklat-five"))).toEqual({ have: 3, need: 5 });
    const s = fresh();
    expect(taskMet({ ...s, stats: { ...s.stats, permittedClears: 1 } }, content, quest("ask-permission"))).toBe(true);
    expect(taskMet({ ...s, stats: { ...s.stats, replanted: 5 } }, content, quest("replant-five"))).toBe(true);
    expect(quest("replant-five").reward.title?.en).toBe("Friend of the Forest");
  });
});
