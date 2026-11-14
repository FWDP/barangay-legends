import { describe, expect, it } from "vitest";
import { applyEffects, choicesBlocked, choiceRoll, choose, CHOICE_KEY, isEligible, optionBlocker, updateChoices } from "./choices";
import { validateChoice, type ChoiceEventDef, type Content } from "./content";
import { apply, newGame, STATE_VERSION, tick, type GameState } from "./game";
import { parseSave } from "./save";
import { at, calm, content, withState } from "./testUtils";

const def = (id: string) => content.choices.find((c) => c.id === id)!;
const seasons = content.events.seasons!.seasons;
/** A game time inside the given season. */
const timeIn = (id: string) => seasons.slice(0, seasons.findIndex((s) => s.id === id)).reduce((t, s) => t + s.durationSeconds, 0) + 1;
/** The player's state with a region, rich enough for any option. */
const rich = (patch: Partial<GameState> = {}): GameState => ({
  ...newGame(calm, 11),
  resources: { rice: 500, wood: 500, gold: 0 },
  villagers: 10,
  ...patch,
});
const withStatus = (s: GameState, status: "ally" | "tributary" | "independent", i = 0): GameState => ({
  ...s,
  region: { ...s.region!, neighbors: s.region!.neighbors.map((n, j) => (j === i ? { ...n, status } : n)) },
});
/** Content with only one choice event, which comes up as soon as it may. */
const only = (id: string, chance = 1): Content => ({ ...calm, choices: [def(id)], rules: { ...calm.rules, choices: { ...calm.rules.choices, chancePerSecond: chance } } });

describe("choice event content", () => {
  it("ships 11 events, each with 2–3 choices and a source", () => {
    expect(content.choices).toHaveLength(11);
    for (const c of content.choices) {
      expect(c.choices.length).toBeGreaterThanOrEqual(2);
      expect(c.choices.length).toBeLessThanOrEqual(3);
      expect(c.sources.length).toBeGreaterThan(0);
    }
  });

  it("rejects broken files", () => {
    const good = JSON.parse(JSON.stringify(def("kaingin")));
    const bad = (patch: object) => () => validateChoice({ ...JSON.parse(JSON.stringify(good)), ...patch });
    expect(bad({ choices: [good.choices[0]] })).toThrow(/2 or 3/);
    expect(bad({ sources: [] })).toThrow(/source/);
    expect(bad({ conditions: { weather: "rain" } })).toThrow(/unknown condition/);
    expect(bad({ choices: [{ ...good.choices[0], effects: { gold: 5 } }, good.choices[1]] })).toThrow(/unknown effect/);
    expect(bad({ choices: [{ ...good.choices[0], effects: { trust: 5 } }, good.choices[1]] })).toThrow(/neighbor/);
    expect(bad({ story: "Hello {datu}" })).toThrow(/neighbor/);
    expect(bad({ choices: [{ ...good.choices[0], effects: { resources: { rice: 1.5 } } }, good.choices[1]] })).toThrow(/whole number/);
  });
});

describe("choice event conditions", () => {
  it("follows the season", () => {
    expect(isEligible(rich({ time: timeIn("tag-araw") }), content, def("kaingin"))).toBe(true);
    expect(isEligible(rich({ time: timeIn("tag-ulan") }), content, def("kaingin"))).toBe(false);
    expect(isEligible(rich({ time: timeIn("tag-ulan") }), content, def("harvest-feast"))).toBe(true);
  });

  it("needs a standing Babaylan's hut for the babaylan's rite", () => {
    const base = rich({ buildings: [at("bahay-kubo", 5, 3)] });
    expect(isEligible(base, content, def("babaylan-ritual"))).toBe(false);
    expect(isEligible({ ...base, buildings: [at("babaylan-hut", 6, 3)] }, content, def("babaylan-ritual"))).toBe(true);
    expect(isEligible({ ...base, buildings: [{ ...at("babaylan-hut", 6, 3), damaged: true }] }, content, def("babaylan-ritual"))).toBe(false);
  });

  it("needs a sandugo ally for the ally's plea, and picks that ally", () => {
    const s = rich({ time: 1000 });
    expect(isEligible(s, content, def("ally-storm-help"))).toBe(false);
    const allied = withStatus(s, "ally", 2);
    expect(isEligible(allied, content, def("ally-storm-help"))).toBe(true);
    const after = updateChoices(allied, only("ally-storm-help"), allied.time, 1);
    expect(after.choice).toMatchObject({ id: "ally-storm-help", neighbor: allied.region!.neighbors[2].id });
  });

  it("needs enough villagers", () => {
    expect(isEligible(rich({ villagers: 3 }), content, def("stranger-sick-child"))).toBe(false);
    expect(isEligible(rich({ villagers: 4 }), content, def("stranger-sick-child"))).toBe(true);
  });

  it("needs an independent neighbor for the trader's gift", () => {
    const s = rich();
    const none = { ...s, region: { ...s.region!, neighbors: s.region!.neighbors.map((n) => ({ ...n, status: "tributary" as const })) } };
    expect(isEligible(s, content, def("foreign-trader"))).toBe(true);
    expect(isEligible(none, content, def("foreign-trader"))).toBe(false);
  });
});

describe("when choice events come up", () => {
  const c = only("envoy-betel");
  const start = c.rules.choices.startsAfterSeconds;

  it("not before startsAfterSeconds, then on a roll", () => {
    const s = rich({ time: 0 });
    expect(updateChoices(s, c, 0, start - 1).choice).toBeNull();
    expect(updateChoices({ ...s, time: start - 1 }, c, start - 1, 1).choice).toMatchObject({ id: "envoy-betel", at: start });
  });

  it("at most once every 4 minutes", () => {
    let s = updateChoices(rich({ time: start }), c, start, 1);
    expect(s.choice).not.toBeNull();
    expect(c.rules.choices.minGapSeconds).toBe(240);
    s = choose(s, c, "simple");
    expect(updateChoices(s, c, s.time + 1, 100).choice).toBeNull();
    expect(updateChoices({ ...s, recentChoices: [] }, c, s.nextEventAt[CHOICE_KEY] - 1, 1).choice).not.toBeNull();
  });

  it("never during a raid, and never while one is waiting", () => {
    const s = rich({ time: start });
    const raid = { ...s, region: { ...s.region!, incomingRaid: { from: s.region!.neighbors[0].id, strikeAt: start + 60 } } };
    expect(choicesBlocked(raid)).toBe(true);
    expect(updateChoices(raid, c, start, 30).choice).toBeNull();
    const waiting = { ...s, choice: { id: "kaingin", neighbor: null, at: 1 } };
    expect(updateChoices(waiting, c, start, 30).choice?.id).toBe("kaingin");
  });

  it("doesn't bring back a story the player just saw", () => {
    const s = rich({ time: start, recentChoices: ["envoy-betel"] });
    expect(updateChoices(s, c, start, 30).choice).toBeNull();
  });

  it("is deterministic and leaves the shared RNG alone", () => {
    const real = { ...content, rules: content.rules };
    const s = rich({ time: start });
    const a = updateChoices(s, real, start, 600);
    expect(updateChoices(s, real, start, 600)).toEqual(a);
    expect(a.rng).toBe(s.rng);
    expect(choiceRoll(1, 2, 3)).toBe(choiceRoll(1, 2, 3));
    expect(choiceRoll(1, 2, 3)).not.toBe(choiceRoll(2, 2, 3));
  });

  it("comes up during normal play through tick", () => {
    let s = rich();
    for (let i = 0; i < 40 && !s.choice; i++) s = { ...tick(s, calm, 60), resources: { rice: 500, wood: 500, gold: 0 } };
    expect(s.choice).not.toBeNull();
  });
});

describe("choice effects", () => {
  const pending = (s: GameState, id: string, neighbor: string | null = null): GameState => ({ ...s, choice: { id, neighbor, at: s.time } });

  it("changes resources, never below zero", () => {
    const s = applyEffects(rich({ resources: { rice: 10, wood: 3, gold: 0 } }), content, { resources: { rice: -4, wood: -10, gold: 0 } }, null);
    expect(s.resources).toEqual({ rice: 6, wood: 0, gold: 0 });
  });

  it("refuses an option the barangay can't pay for", () => {
    const s = pending(rich({ resources: { rice: 10, wood: 0, gold: 0 } }), "babaylan-ritual");
    const rite = def("babaylan-ritual").choices.find((o) => o.id === "full-rite")!;
    expect(optionBlocker(s, rite)).toMatch(/rice/);
    expect(choose(s, content, "full-rite")).toBe(s);
    expect(choose(s, content, "small-offering").choice).toBeNull();
  });

  it("adds newcomers only where there is room, and lets villagers leave", () => {
    const s = withState({ villagers: 4, buildings: [at("bahay-kubo", 5, 3)] });
    expect(applyEffects(s, content, { villagers: 3 }, null).villagers).toBe(5);
    const full = withState({ villagers: 5 });
    expect(applyEffects(full, content, { villagers: 1 }, null).villagers).toBe(5);
    const left = applyEffects(withState({ villagers: 3, warriors: 3, sick: [5, 5, 5] }), content, { villagers: -1 }, null);
    expect(left).toMatchObject({ villagers: 2, warriors: 2 });
    expect(left.sick).toHaveLength(2);
  });

  it("makes villagers sick, or cures the sickest first", () => {
    const sickSeconds = content.events.sickness!.sickSeconds;
    expect(applyEffects(rich({ sick: [] }), content, { sick: 2 }, null).sick).toEqual([sickSeconds, sickSeconds]);
    expect(applyEffects(rich({ villagers: 2, sick: [5] }), content, { sick: 4 }, null).sick).toHaveLength(2);
    expect(applyEffects(rich({ sick: [10, 50, 30] }), content, { sick: -2 }, null).sick).toEqual([10]);
  });

  it("changes trust and influence with the event's neighbor only", () => {
    const s = rich();
    const [first, second] = s.region!.neighbors;
    const after = applyEffects(s, content, { trust: -12, influence: 10 }, first.id);
    expect(after.region!.neighbors[0].trust).toBe(Math.max(0, first.trust - 12));
    expect(after.region!.neighbors[0].influence).toBeGreaterThan(first.influence);
    expect(after.region!.neighbors[1]).toEqual(second);
  });

  it("enough influence makes a tributary, with a report", () => {
    const s = rich();
    const n = s.region!.neighbors[0];
    const close = { ...s, region: { ...s.region!, neighbors: s.region!.neighbors.map((x, i) => (i === 0 ? { ...x, influence: 99.9 } : x)) } };
    const after = applyEffects(close, content, { influence: 50 }, n.id);
    expect(after.region!.neighbors[0].status).toBe("tributary");
    expect(after.region!.reports.at(-1)).toMatchObject({ kind: "tributary", neighbor: n.id });
  });

  it("answering clears the event and remembers it", () => {
    const s = pending(rich(), "kaingin");
    const after = apply(s, content, { type: "choose", option: "burn" });
    expect(after.choice).toBeNull();
    expect(after.recentChoices).toEqual(["kaingin"]);
    expect(after.resources.rice).toBe(s.resources.rice + 20);
    expect(apply(s, content, { type: "choose", option: "nope" })).toBe(s);
    expect(apply(rich(), content, { type: "choose", option: "burn" }).choice).toBeNull();
  });

  it("every option in every event can be applied", () => {
    for (const c of content.choices as ChoiceEventDef[]) {
      for (const o of c.choices) {
        // (Warriors at home, for an ally's call for help.)
        const s = { ...pending(withStatus(rich(), "ally", 0), c.id, rich().region!.neighbors[0].id), warriors: 4 };
        const after = choose(s, content, o.id);
        expect(after.choice, `${c.id}/${o.id}`).toBeNull();
        expect(after.resources.rice).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe("saving choice events", () => {
  it("keeps a waiting event and recent ones", () => {
    const s = { ...rich(), choice: { id: "envoy-betel", neighbor: rich().region!.neighbors[1].id, at: 300 }, recentChoices: ["kaingin"] };
    const loaded = parseSave(JSON.stringify(s), content)!;
    expect(loaded.choice).toEqual(s.choice);
    expect(loaded.recentChoices).toEqual(["kaingin"]);
  });

  it("drops unknown events and migrates v7 saves", () => {
    const s = { ...rich(), choice: { id: "gone", neighbor: null, at: 3 }, recentChoices: ["gone"] };
    expect(parseSave(JSON.stringify(s), content)).toMatchObject({ choice: null, recentChoices: [] });
    const v7 = { ...withState({}), version: 7 } as Record<string, unknown>;
    delete v7.choice;
    delete v7.recentChoices;
    expect(parseSave(JSON.stringify(v7), content)).toMatchObject({ version: STATE_VERSION, choice: null, recentChoices: [] });
  });
});
