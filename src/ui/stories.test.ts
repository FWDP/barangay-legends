import { describe, expect, it } from "vitest";
import { tick, type GameState } from "../engine/game";
import { checkTasks } from "../engine/gawain";
import type { NamedVillager } from "../engine/people";
import type { Report } from "../engine/region";
import { at, calm, content, withState } from "../engine/testUtils";
import { advise, newModel, NEW_MEMORY, newEntries, NEWS_SECONDS, TIP_GAP_SECONDS } from "./advisor";
import { awayPeopleLines, battleNames, datuWithTitle, historyLine, rewardText, taskNews, villagerCard } from "./stories";
import { shareBounds, shareFileName, shareLines, SHARE_URL } from "./share";
import { loadUiContent, validateGameText } from "./uiContent";
import { namedSprites, planVillagers } from "./villagers";

const ui = loadUiContent(content);
const game = ui.game;
const quest = (id: string) => content.quests.find((q) => q.id === id)!;
const fresh = (patch: Partial<GameState> = {}) => withState({ gawainDone: [], ...patch } as Partial<GameState>);
const named = (id: number, patch: Partial<NamedVillager> = {}): NamedVillager => ({ id, name: `N${id}`, story: "singer", role: "villager", since: 0, ...patch });

describe("ui.json", () => {
  it("has every label in English and Filipino", () => {
    expect(game.gawain.moreSoon.en).toBe("More tasks coming soon.");
    expect(game.share.button.en).toBe("Share my barangay");
  });

  it("rejects missing text and unknown placeholders", () => {
    const raw = JSON.parse(JSON.stringify(game));
    delete raw.gawain.title.fil;
    expect(() => validateGameText(raw)).toThrow(/gawain.title/);
    const bad = JSON.parse(JSON.stringify(game));
    bad.history.fell.en = "{who} fell";
    expect(() => validateGameText(bad)).toThrow(/\{who\}/);
  });
});

describe("task text", () => {
  it("describes rewards: resources, a title, or both", () => {
    expect(rewardText(quest("first-palayan"), game, "en")).toBe("🪵 10");
    expect(rewardText(quest("first-dock"), game, "en")).toBe("the title Datu ng Ilog");
    expect(rewardText(quest("tag-araw"), game, "fil")).toContain("Datu ng Tag-araw");
  });

  it("announces a task done, its reward and the next task", () => {
    const done = checkTasks(fresh({ buildings: [at("palayan", 1, 1)] }), content);
    const text = taskNews("first-palayan", done, content, game, "en");
    expect(text).toContain("Task done: Build your first Palayan!");
    expect(text).toContain("Reward: 🪵 10");
    expect(text).toContain(`Next: ${quest("first-camp").text.en}.`);
    expect(taskNews("first-palayan", done, content, game, "fil")).toContain(quest("first-camp").text.fil);
  });

  it("says when the chain is over", () => {
    const all = fresh({ gawainDone: content.quests.map((q) => q.id) });
    const last = content.quests.at(-1)!;
    expect(taskNews(last.id, all, content, game, "en")).toContain("More tasks coming soon.");
    expect(taskNews(last.id, all, content, game, "en")).toContain(`The people now call you ${last.reward.title!.en}.`);
  });

  it("puts the latest title after the datu's name", () => {
    expect(datuWithTitle(fresh({ barangay: { ...fresh().barangay, datu: "Lakas" } }), content, "en")).toBe("Datu Lakas");
    const s = fresh({ barangay: { ...fresh().barangay, datu: "Lakas" }, gawainDone: ["first-dock"] });
    expect(datuWithTitle(s, content, "en")).toBe("Datu Lakas, Datu ng Ilog");
  });
});

describe("history lines", () => {
  it("tells each kind of entry", () => {
    expect(historyLine({ at: 1, kind: "task", task: "first-palayan" }, content, game, "en")).toBe("Task done: Build your first Palayan.");
    expect(historyLine({ at: 1, kind: "named", name: "Diwa", story: "first-child" }, content, game, "en")).toBe("Diwa, the first child born in your barangay joined the barangay.");
    expect(historyLine({ at: 1, kind: "left", name: "Diwa", cause: "hunger" }, content, game, "en")).toBe("Diwa left: there was not enough rice.");
    expect(historyLine({ at: 1, kind: "left", name: "Diwa", cause: "crowded" }, content, game, "en")).toContain("no house");
    expect(historyLine({ at: 1, kind: "left", name: "Diwa" }, content, game, "en")).toBe("Diwa left the barangay.");
    expect(historyLine({ at: 1, kind: "fell", name: "Malakas" }, content, game, "fil")).toContain("Malakas");
  });

  it("makes a villager's card", () => {
    const card = villagerCard(named(1, { name: "Malakas", story: "bravest", role: "warrior", sick: true }), content, game, "en");
    expect(card).toEqual({ name: "Malakas", role: "Mandirigma", story: "Malakas, your bravest warrior", sick: game.villager.sick.en });
  });

  it("lists tasks and named villagers in the away story", () => {
    const before = fresh({ time: 100 });
    const after = {
      ...before,
      time: 400,
      gawainDone: ["first-palayan"],
      history: [
        { at: 50, kind: "named" as const, name: "Old", story: "singer" },
        { at: 200, kind: "named" as const, name: "Diwa", story: "first-child" },
        { at: 300, kind: "left" as const, name: "Ulan", cause: "hunger" as const },
      ],
    };
    const lines = awayPeopleLines(before, after, content, game, "en");
    expect(lines[0]).toBe("Task done: Build your first Palayan. Reward: 🪵 10");
    expect(lines.slice(1)).toEqual(["Diwa, the first child born in your barangay joined the barangay.", "Ulan left: there was not enough rice."]);
  });

  it("names warriors in battle reports", () => {
    const report: Report = { id: 3, time: 50, kind: "defense", neighbor: "malinaw", win: true };
    const s = fresh({ villagers: 10, warriors: 2, named: [named(1, { name: "Malakas", role: "warrior", story: "bravest", since: 10 })] });
    expect(battleNames(report, s, game, "en")).toEqual(["Malakas led the defense."]);
    const fell = { ...s, named: [], history: [{ at: 50, kind: "fell" as const, name: "Malakas" }] };
    expect(battleNames({ ...report, win: false }, fell, game, "en")).toEqual(["Malakas fell defending the barangay."]);
    expect(battleNames({ ...report, kind: "alliance" }, s, game, "en")).toEqual([]);
  });
});

describe("the adviser's news", () => {
  const model = (s: GameState) => newModel({ ...NEW_MEMORY, tutorial: "done" }, s, content);
  const input = (state: GameState) => ({ state, content, advisor: ui.advisor, lang: "en" as const, tipsOn: true, blocked: false, game });

  it("finds history entries added since a mark", () => {
    const h = [
      { at: 1, kind: "task" as const, task: "a" },
      { at: 2, kind: "task" as const, task: "b" },
      { at: 2, kind: "task" as const, task: "c" },
    ];
    expect(newEntries(h, { at: 2, count: 1 }).map((e) => e.task)).toEqual(["c"]);
    expect(newEntries(h, { at: -1, count: 0 })).toHaveLength(3);
  });

  it("announces a finished task right away, even inside the tip gap", () => {
    const s = fresh({ time: 10, resources: { rice: 1000, wood: 0, gold: 0 }, villagers: 2 });
    let m = advise(model(s), input(s));
    m = { ...m, session: { ...m.session, lastShownAt: s.time } };
    const done = tick({ ...s, buildings: [...s.buildings, at("palayan", 1, 1)] }, calm, 1);
    expect(done.gawainDone).toContain("first-palayan");
    m = advise(m, input(done));
    expect(m.message).toMatchObject({ kind: "news" });
    expect(m.message?.text).toContain("Build your first Palayan");
    expect(done.time - (m.session.lastShownAt ?? 0)).toBeLessThan(TIP_GAP_SECONDS);
    // It stays up for NEWS_SECONDS, then goes.
    m = advise(m, input({ ...done, time: done.time + NEWS_SECONDS - 1 }));
    expect(m.message?.kind).toBe("news");
    m = advise(m, input({ ...done, time: done.time + NEWS_SECONDS + 1 }));
    expect(m.message?.kind).not.toBe("news");
  });

  it("mentions a named villager leaving", () => {
    const s = fresh({ time: 10, resources: { rice: 1000, wood: 0, gold: 0 }, villagers: 2 });
    let m = advise(model(s), input(s));
    const left = { ...s, history: [{ at: 11, kind: "left" as const, name: "Diwa", cause: "hunger" as const }], time: 11 };
    m = advise(m, input(left));
    expect(m.message).toMatchObject({ kind: "news", text: "Diwa left: there was not enough rice." });
  });

  it("doesn't repeat what was already in the history when the game loaded", () => {
    const s = fresh({ time: 10, history: [{ at: 5, kind: "left", name: "Old" }], resources: { rice: 1000, wood: 0, gold: 0 }, villagers: 2 });
    const m = advise(model(s), input(s));
    expect(m.message?.kind).not.toBe("news");
  });

  it("tells no news with tips off", () => {
    const s = fresh({ time: 10, resources: { rice: 1000, wood: 0, gold: 0 }, villagers: 2 });
    let m = advise(model(s), { ...input(s), tipsOn: false });
    const left = { ...s, history: [{ at: 11, kind: "fell" as const, name: "Malakas" }], time: 11 };
    m = advise(m, { ...input(left), tipsOn: false });
    expect(m.message).toBeNull();
    expect(m.session.news).toEqual([]);
  });
});

describe("named villagers on the map", () => {
  it("gives each named villager a sprite, preferring one at their kind of work", () => {
    const s = withState({
      villagers: 6,
      resources: { rice: 500, wood: 0, gold: 0 },
      buildings: [at("palayan", 1, 1), at("woodcutter-camp", 8, 1), at("bahay-kubo", 5, 3), at("bahay-kubo", 4, 3)],
      named: [named(1, { role: "farmer", story: "rain-smell" }), named(2, { role: "woodcutter", story: "bamboo" }), named(3)],
    });
    const plans = planVillagers(s, content);
    const map = namedSprites(plans, s, content);
    expect(map.size).toBe(3);
    const planOf = (id: number) => plans.find((p) => map.get(p.id)?.id === id)!;
    expect(planOf(1).place).toMatchObject({ x: 1, y: 1 });
    expect(planOf(2).place).toMatchObject({ x: 8, y: 1 });
    expect(new Set(map.keys()).size).toBe(3);
  });

  it("puts a sick named villager on a sick sprite", () => {
    const s = withState({ villagers: 4, sick: [30], named: [named(1, { sick: true })] });
    const plans = planVillagers(s, content);
    const id = [...namedSprites(plans, s, content).keys()][0];
    expect(plans.find((p) => p.id === id)?.role).toBe("sick");
  });
});

describe("share card", () => {
  it("frames the cleared land and buildings, square and inside the map", () => {
    const s = withState({});
    const b = shareBounds(s);
    expect(b.size).toBeGreaterThan(0);
    expect(b.x0).toBeGreaterThanOrEqual(0);
    expect(b.y0).toBeGreaterThanOrEqual(0);
    expect(b.x0 + b.size).toBeLessThanOrEqual(Math.max(s.map.width, s.map.height));
  });

  it("says who and where, and only that", () => {
    const s = fresh({ villagers: 12, barangay: { ...fresh().barangay, name: "Sapang Bato", datu: "Lakas" }, gawainDone: ["first-dock"] });
    expect(shareLines(s, content, game, "en")).toEqual({ name: "Sapang Bato", datu: "Datu Lakas, Datu ng Ilog", villagers: "12 villagers", level: "Barangay level 1", day: "Araw 1", url: SHARE_URL });
    expect(SHARE_URL).toBe("barangaylegends.fwdp.org");
    expect(shareFileName(s)).toBe("sapang-bato.png");
    expect(shareFileName(fresh({ barangay: { ...fresh().barangay, name: "" } }))).toBe("barangay.png");
  });
});

describe("stale news", () => {
  it("drops news from long ago (told in the away story instead)", () => {
    const s = fresh({ time: 1000, resources: { rice: 1000, wood: 0, gold: 0 }, villagers: 2 });
    let m = advise(newModel({ ...NEW_MEMORY, tutorial: "done" }, s, content), { state: s, content, advisor: ui.advisor, lang: "en", tipsOn: true, blocked: false, game });
    const back = { ...s, history: [{ at: 10, kind: "task" as const, task: "first-palayan" }] };
    m = advise(m, { state: back, content, advisor: ui.advisor, lang: "en", tipsOn: true, blocked: false, game });
    expect(m.message?.kind).not.toBe("news");
  });
});

describe("worship and the spirits in words", () => {
  it("tells the spirits' message, Aklat finds and events", () => {
    const tagalog = fresh({ tradition: "tagalog" });
    const spirit = content.traditions.find((t) => t.id === "tagalog")!.forestSpirit;
    expect(historyLine({ at: 1, kind: "spirits", stage: 1 }, content, game, "en", tagalog)).toContain(spirit.stage1.en);
    expect(historyLine({ at: 1, kind: "spirits", stage: 2 }, content, game, "en", tagalog)).toContain(`−${content.rules.forest.riceWithheldPercent}%`);
    expect(historyLine({ at: 1, kind: "aklat", entry: "kapre" }, content, game, "en")).toBe("New in the Aklat ng Alamat: Kapre");
    expect(historyLine({ at: 1, kind: "event", event: "eclipseWon", favor: 15, amounts: { gold: 10 } }, content, game, "en")).toContain("+15 Favor, +10 gold");
    expect(historyLine({ at: 1, kind: "event", event: "sarimanok", amounts: { gold: 7 } }, content, game, "en")).toContain("🪙 7");
  });

  it("announces Aklat finds and the spirits' anger as news", () => {
    const s = fresh({ time: 10, resources: { rice: 1000, wood: 0, gold: 0 }, villagers: 2 });
    const input = (state: GameState) => ({ state, content, advisor: ui.advisor, lang: "en" as const, tipsOn: true, blocked: false, game });
    let m = advise(newModel({ ...NEW_MEMORY, tutorial: "done" }, s, content), input(s));
    m = advise(m, input({ ...s, time: 11, history: [{ at: 11, kind: "aklat", entry: "babaylan" }] }));
    expect(m.message).toMatchObject({ kind: "news", text: "New in the Aklat ng Alamat: Babaylan" });
  });
});

describe("deaths and the Bahay ng Datu in words", () => {
  it("tells deaths gently, frailty as a warning, and each new level with its unlock", () => {
    expect(historyLine({ at: 1, kind: "died", cause: "age", name: "Diwa" }, content, game, "en")).toBe("Diwa died of old age. The barangay remembers them.");
    expect(historyLine({ at: 1, kind: "died", cause: "hunger" }, content, game, "en")).toBe("One of our people died of hunger.");
    expect(historyLine({ at: 1, kind: "died", cause: "raid", count: 2 }, content, game, "en")).toBe("2 of our warriors fell in battle.");
    expect(historyLine({ at: 1, kind: "frail", name: "Diwa" }, content, game, "en")).toBe("Diwa has grown old and frail.");
    expect(historyLine({ at: 1, kind: "datu", level: 3 }, content, game, "en")).toContain("Balangay dock (coming soon)");
    expect(historyLine({ at: 1, kind: "datu", level: 5 }, content, game, "en")).toBe("The Bahay ng Datu now stands at level 5.");
  });

  it("lists the dead by name in the away story", () => {
    const before = fresh({ time: 100 });
    const after = { ...before, time: 300, history: [{ at: 200, kind: "died" as const, cause: "sickness" as const, name: "Ulan" }] };
    expect(awayPeopleLines(before, after, content, game, "en")).toEqual(["Ulan died of a long sickness. The barangay remembers them."]);
  });
});
