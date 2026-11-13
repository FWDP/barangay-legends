import { describe, expect, it } from "vitest";
import { apply, housing, tick, type GameState } from "./game";
import { offlineProgress } from "./offline";
import { historyBetween, namedSick, reconcilePeople, storyText, type NamedVillager } from "./people";
import { at, calm, content, withState } from "./testUtils";

const vc = content.villagers;
/** Room for many more and plenty of rice: newcomers keep arriving. */
const growing = (patch: Partial<GameState> = {}) =>
  withState({
    villagers: 5,
    resources: { rice: 1000, wood: 0, gold: 0 },
    buildings: [at("palayan", 1, 1), at("woodcutter-camp", 8, 1), ...[2, 3, 4, 5, 6, 7, 8].flatMap((x) => [at("bahay-kubo", x, 6), at("bahay-kubo", x, 7)])],
    ...patch,
  });
const villager = (id: number, patch: Partial<NamedVillager> = {}): NamedVillager => ({ id, name: vc.names[id], story: "singer", role: "villager", since: 0, ...patch });

describe("named villager content", () => {
  it("names about 1 in 5, from names.json and villagers.json", () => {
    expect(vc.chance).toBe(0.2);
    expect(vc.names.length).toBeGreaterThanOrEqual(20);
    expect(vc.stories.find((s) => s.first)?.text.en).toBe("{name}, the first child born in your barangay");
    expect(vc.stories.some((s) => s.role === "warrior" && s.text.en === "{name}, your bravest warrior")).toBe(true);
  });

  it("fills a story with the name, in either language", () => {
    expect(storyText(content, { name: "Diwa", story: "first-child" })).toBe("Diwa, the first child born in your barangay");
    expect(storyText(content, { name: "Diwa", story: "first-child" }, "fil")).toContain("Diwa");
  });
});

describe("naming newcomers", () => {
  it("names about one in five arrivals, the same way every time (seeded)", () => {
    const a = tick(growing(), calm, 300);
    const b = tick(growing(), calm, 300);
    expect(a.villagers).toBe(housing(a, content));
    expect(a.named).toEqual(b.named);
    // 26 arrivals: a handful named (seeded, so a fixed number, but about 1 in 5).
    expect(a.named.length).toBeGreaterThanOrEqual(2);
    expect(a.named.length).toBeLessThanOrEqual(12);
    expect(a.history.filter((h) => h.kind === "named")).toHaveLength(a.named.length);
  });

  it("gives the first named villager the first-child story", () => {
    const s = tick(growing(), calm, 300);
    expect(s.named[0].story).toBe("first-child");
    expect(s.named.filter((v) => v.story === "first-child")).toHaveLength(1);
  });

  it("never repeats a living villager's name or the datu's", () => {
    const s = tick(growing({ barangay: { ...growing().barangay, datu: vc.names[0] } }), calm, 300);
    const names = s.named.map((v) => v.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).not.toContain(vc.names[0]);
  });

  it("doesn't shift the shared RNG that drives events", () => {
    const named = tick(growing(), calm, 120);
    const unnamed = tick(growing(), { ...calm, villagers: { ...vc, chance: 0 } }, 120);
    expect(named.rng).toBe(unnamed.rng);
    expect(unnamed.named).toEqual([]);
  });

  it("only gives a work story when that workplace exists", () => {
    const noDock = tick(growing(), calm, 300);
    expect(noDock.named.some((v) => v.role === "fisher")).toBe(false);
    expect(noDock.named.some((v) => v.role === "warrior")).toBe(false);
  });

  it("may name a new Mandirigma with a warrior's story", () => {
    let s = withState({ villagers: 20, resources: { rice: 5000, wood: 5000, gold: 0 }, buildings: [at("kuta", 2, 2), at("kuta", 3, 2), at("kuta", 4, 2)] });
    for (let i = 0; i < 18; i++) s = apply(s, calm, { type: "train" });
    expect(s.warriors).toBe(18);
    const warriors = s.named.filter((v) => v.role === "warrior");
    expect(warriors.length).toBeGreaterThan(0);
    expect(warriors.every((v) => vc.stories.find((st) => st.id === v.story)?.role === "warrior")).toBe(true);
  });
});

describe("named villagers leaving", () => {
  it("records a named villager who leaves, and why", () => {
    // Nobody but named villagers: whoever leaves is one of them.
    const prev = withState({ villagers: 2, named: [villager(1), villager(2)] });
    const next = reconcilePeople(prev, { ...prev, villagers: 1, hunger: 5 }, content);
    expect(next.named).toHaveLength(1);
    expect(next.history.at(-1)).toMatchObject({ kind: "left", cause: "hunger" });
  });

  it("a fallen warrior is remembered as fallen", () => {
    const prev = withState({ villagers: 10, warriors: 1, named: [villager(1, { role: "warrior", story: "bravest" })] });
    const next = reconcilePeople(prev, { ...prev, villagers: 9, warriors: 0 }, content);
    expect(next.named).toEqual([]);
    expect(next.history.at(-1)).toMatchObject({ kind: "fell", name: vc.names[1], story: "bravest" });
  });

  it("someone unnamed leaving usually leaves the named ones be", () => {
    // 1 named among 100: the seeded roll decides, and it's the same every time.
    const prev = withState({ villagers: 100, named: [villager(1)] });
    const a = reconcilePeople(prev, { ...prev, villagers: 99 }, content);
    const b = reconcilePeople(prev, { ...prev, villagers: 99 }, content);
    expect(a.named).toEqual(b.named);
    expect(a.stats.rolls).toBe(prev.stats.rolls + 1);
  });

  it("returns the same state when nothing about the villagers changed", () => {
    const s = withState({ named: [villager(1)] });
    expect(reconcilePeople(s, { ...s, time: 5 }, content).named).toBe(s.named);
    const refused = withState({});
    expect(apply(refused, calm, { type: "undo" })).toBe(refused);
  });
});

describe("named villagers and sickness", () => {
  it("may mark a named villager sick, and clears it when the sick recover", () => {
    // Only named villagers, so a new case must be one of them.
    const prev = withState({ villagers: 1, named: [villager(1)] });
    const sick = reconcilePeople(prev, { ...prev, sick: [30] }, content);
    expect(namedSick(sick).map((v) => v.id)).toEqual([1]);
    const well = reconcilePeople(sick, { ...sick, sick: [] }, content);
    expect(namedSick(well)).toEqual([]);
    expect(well.named[0]).not.toHaveProperty("sick");
  });
});

describe("history", () => {
  it("lists what happened between two times", () => {
    const s = tick(growing(), calm, 300);
    const all = historyBetween(s, -1, s.time);
    expect(all.length).toBe(s.history.length);
    expect(historyBetween(s, s.time, s.time + 10)).toEqual([]);
  });

  it("names newcomers who arrive while the game is closed", () => {
    const { state } = offlineProgress(growing(), calm, 600);
    expect(state.villagers).toBe(housing(state, content));
    expect(state.named.length).toBeGreaterThan(0);
    expect(state.history.some((h) => h.kind === "named")).toBe(true);
  });
});
