// Where the sick stay: inside healers' huts up to their capacity, named villagers first; the rest at home.
import { describe, expect, it } from "vitest";
import { healerStays, sickPlaces } from "./healing";
import type { NamedVillager } from "./people";
import { at, content, withState } from "./testUtils";

const cap = content.rules.healing.hutCapacity;
const named = (id: number, sick = true): NamedVillager => ({ id, name: `V${id}`, story: "singer", role: "villager", since: 0, sick });
const sickness = (n: number) => Array.from({ length: n }, () => 60);

describe("sick villagers in the healer's hut", () => {
  it("rest inside, up to the hut's capacity; the rest wait at home", () => {
    const s = withState({ villagers: 20, sick: sickness(cap + 3), buildings: [at("bahay-kubo", 2, 2), at("babaylan-hut", 7, 6)] });
    const stays = healerStays(s, content);
    expect(stays).toHaveLength(1);
    expect(stays[0].count).toBe(cap);
    expect(sickPlaces(s, content)).toEqual({ inside: cap, home: 3 });
  });

  it("fill a second hut before anyone waits at home", () => {
    const s = withState({ villagers: 30, sick: sickness(cap + 2), buildings: [at("babaylan-hut", 2, 2), at("babaylan-hut", 7, 6)] });
    expect(healerStays(s, content).map((h) => h.count)).toEqual([cap, 2]);
    expect(sickPlaces(s, content).home).toBe(0);
  });

  it("list named villagers first", () => {
    const s = withState({ villagers: 20, sick: sickness(4), named: [named(1), named(2, false), named(3)], buildings: [at("babaylan-hut", 7, 6)] });
    const [hut] = healerStays(s, content);
    expect(hut.count).toBe(4);
    expect(hut.named.map((v) => v.name)).toEqual(["V1", "V3"]);
  });

  it("a damaged hut takes no one; with no hut everyone rests at home", () => {
    const burnt = withState({ villagers: 10, sick: sickness(3), buildings: [{ ...at("babaylan-hut", 7, 6), damaged: true }] });
    expect(healerStays(burnt, content)).toEqual([]);
    expect(sickPlaces(burnt, content)).toEqual({ inside: 0, home: 3 });
  });
});
