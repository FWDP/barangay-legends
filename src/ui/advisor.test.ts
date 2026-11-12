import { describe, expect, it } from "vitest";
import { apply, newGame, type GameState } from "../engine/game";
import { at, content, withState } from "../engine/testUtils";
import {
  advise,
  dismiss,
  IDLE_SECONDS,
  MAX_REPEATS,
  newModel,
  NEW_MEMORY,
  noteEvent,
  parseMemory,
  skipTutorial,
  TIP_GAP_SECONDS,
  TIP_SECONDS,
  TUTORIAL_SECONDS,
  type AdvisorModel,
} from "./advisor";
import { loadUiContent } from "./uiContent";

const { advisor } = loadUiContent(content);
const input = (state: GameState, extra: { tipsOn?: boolean; blocked?: boolean } = {}) => ({
  state,
  content,
  advisor,
  lang: "en" as const,
  tipsOn: extra.tipsOn ?? true,
  blocked: extra.blocked ?? false,
});
const trigger = (m: AdvisorModel) => (m.message?.kind === "tip" ? m.message.trigger : null);
/** A model past the tutorial, so tips can show. */
const tipsModel = (state: GameState): AdvisorModel => newModel({ ...NEW_MEMORY, tutorial: "done" }, state, content);
/** Plenty of rice and every worker building staffed: nothing to warn about. */
const calmState = (patch: Partial<GameState> = {}) =>
  withState({ resources: { rice: 1000, wood: 0 }, villagers: 2, time: 10, ...patch });

describe("adviser tutorial", () => {
  it("walks through the steps as the player completes them", () => {
    let s = newGame(content, 7);
    let m = advise(newModel(NEW_MEMORY, s, content), input(s));
    expect(m.message).toMatchObject({ kind: "tutorial", stepId: "gather", step: 1, total: advisor.tutorial.length });

    s = apply(s, content, { type: "gather", resource: "wood" });
    m = advise(noteEvent(m, "gather"), input(s));
    expect(m.message).toMatchObject({ stepId: "build-house" });

    // The starting house doesn't count: the player builds one.
    const house = { ...s, buildings: [...s.buildings, at("bahay-kubo", s.map.plaza.x + 1, s.map.plaza.y)] };
    m = advise(m, input(house));
    expect(m.message).toMatchObject({ stepId: "build-field" });

    const field = { ...house, buildings: [...house.buildings, at("palayan", s.map.plaza.x - 1, s.map.plaza.y)] };
    m = advise(noteEvent(noteEvent(m, "menu"), "rehiyon"), input(field));
    expect(m.message).toBeNull();
    expect(m.memory.tutorial).toBe("done");
  });

  it("can be skipped, and the dismiss tap doesn't close a step", () => {
    const s = newGame(content, 7);
    let m = advise(newModel(NEW_MEMORY, s, content), input(s));
    expect(dismiss(m).message).not.toBeNull();
    m = skipTutorial(m, s.time);
    expect(m.memory.tutorial).toBe("skipped");
    expect(advise(m, input(s)).message?.kind).not.toBe("tutorial");
  });

  it("is skipped for barangays older than five minutes", () => {
    const s = { ...newGame(content, 7), time: TUTORIAL_SECONDS + 1 };
    expect(advise(newModel(NEW_MEMORY, s, content), input(s)).memory.tutorial).toBe("done");
  });

  it("stays quiet when tips are off or a battle report is open", () => {
    const s = newGame(content, 7);
    const m = newModel(NEW_MEMORY, s, content);
    expect(advise(m, input(s, { tipsOn: false })).message).toBeNull();
    expect(advise(m, input(s, { blocked: true })).message).toBeNull();
  });
});

describe("adviser tips", () => {
  it("warns when the rice will run out within a minute", () => {
    const s = calmState({ resources: { rice: 5, wood: 0 }, villagers: 5 });
    const m = advise(tipsModel(s), input(s));
    expect(m.message).toMatchObject({ kind: "tip", trigger: "rice-low" });
    expect(m.message!.text).toContain("10 seconds");
  });

  it("says nothing when all is well", () => {
    const s = calmState();
    expect(advise(tipsModel(s), input(s)).message).toBeNull();
  });

  it("speaks at most once every 90 seconds, and not twice about the same thing", () => {
    let s = calmState({ resources: { rice: 5, wood: 0 }, villagers: 5 });
    let m = advise(tipsModel(s), input(s));
    expect(trigger(m)).toBe("rice-low");
    m = dismiss(m);
    // A fire breaks out right after: still within the gap.
    s = { ...s, time: s.time + 5, buildings: [{ ...s.buildings[0], burningSince: s.time }] };
    m = advise(m, input(s));
    expect(m.message).toBeNull();
    s = { ...s, time: s.time + TIP_GAP_SECONDS };
    m = advise(m, input(s));
    expect(trigger(m)).toBe("event-fire");
    // Rice is still low but was already mentioned: it waits until it clears and comes back.
    m = dismiss(m);
    s = { ...s, time: s.time + TIP_GAP_SECONDS, buildings: [at("bahay-kubo", 5, 3)] };
    expect(trigger(advise(m, input(s)))).not.toBe("rice-low");
  });

  it("never repeats a line more than 3 times", () => {
    let s = calmState({ resources: { rice: 5, wood: 0 }, villagers: 5 });
    let m = tipsModel(s);
    const lines = advisor.lines.filter((l) => l.trigger === "rice-low").length;
    let spoken = 0;
    for (let i = 0; i < lines * MAX_REPEATS + 3; i++) {
      m = advise(m, input(s));
      if (trigger(m) === "rice-low") spoken++;
      m = dismiss(m);
      // Clear the condition, then bring it back after the gap.
      m = advise(m, input({ ...s, resources: { rice: 1000, wood: 0 } }));
      s = { ...s, time: s.time + TIP_GAP_SECONDS };
    }
    expect(spoken).toBe(lines * MAX_REPEATS);
    expect(Object.values(m.memory.shown).every((n) => n <= MAX_REPEATS)).toBe(true);
  });

  it("closes a tip after a while, and on a tap", () => {
    const s = calmState({ resources: { rice: 5, wood: 0 }, villagers: 5 });
    const m = advise(tipsModel(s), input(s));
    expect(advise(m, input({ ...s, time: s.time + 1 })).message).toBe(m.message);
    expect(advise(m, input({ ...s, time: s.time + TIP_SECONDS })).message).toBeNull();
    expect(dismiss(m).message).toBeNull();
  });

  it("puts the most urgent trigger first", () => {
    const base = calmState({ resources: { rice: 5, wood: 0 }, villagers: 5 });
    const raid = { ...base, region: { ...newGame(content, 3).region!, incomingRaid: { from: "batong-buhay", strikeAt: base.time + 30 } } };
    const m = advise(tipsModel(raid), input(raid));
    expect(trigger(m)).toBe("raid-warning");
    expect(m.message?.text).toMatch(/30 seconds/);
  });

  it("notices nothing built for two minutes", () => {
    const s = calmState();
    let m = advise(tipsModel(s), input(s));
    m = advise(m, input({ ...s, time: s.time + IDLE_SECONDS - 1 }));
    expect(m.message).toBeNull();
    m = advise(m, input({ ...s, time: s.time + IDLE_SECONDS }));
    expect(trigger(m)).toBe("idle");
  });

  it("announces a building unlocked during play", () => {
    const s = calmState();
    const kuta = content.buildings.find((b) => b.id === "kuta")!;
    let m = advise(tipsModel(s), input(s));
    const grown = { ...s, villagers: kuta.unlock.villagers!, buildings: [...s.buildings, at("bahay-kubo", 6, 3), at("bahay-kubo", 7, 3), at("bahay-kubo", 6, 5)] };
    m = advise(m, input(grown));
    expect(trigger(m)).toBe("unlocked");
    expect(m.message?.text).toContain("Kuta");
  });

  it("mentions an empty field only after it has been empty a while", () => {
    const s = calmState({ villagers: 0, buildings: [at("bahay-kubo", 5, 3), at("palayan", 6, 3)] });
    let m = advise(tipsModel(s), input(s));
    expect(m.message).toBeNull();
    m = advise(m, input({ ...s, time: s.time + 15 }));
    expect(m.message).toMatchObject({ trigger: "unstaffed" });
    expect(m.message!.text).toContain("Palayan");
  });

  it("speaks Filipino when asked", () => {
    const s = newGame(content, 7);
    const m = advise(newModel(NEW_MEMORY, s, content), { ...input(s), lang: "fil" });
    expect(m.message?.text).toBe(advisor.tutorial[0].text.fil);
  });

  it("never changes the game state", () => {
    const s = calmState({ resources: { rice: 5, wood: 0 }, villagers: 5 });
    const before = JSON.stringify(s);
    advise(tipsModel(s), input(s));
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe("adviser memory", () => {
  it("reads stored memory and ignores junk", () => {
    expect(parseMemory(null)).toEqual(NEW_MEMORY);
    expect(parseMemory("{oops")).toEqual(NEW_MEMORY);
    expect(parseMemory(JSON.stringify({ tutorial: "done", events: ["gather", "nope"], shown: { a: 2, b: "x" } }))).toEqual({
      tutorial: "done",
      events: ["gather"],
      shown: { a: 2 },
    });
  });
});
