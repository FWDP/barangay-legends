// The datu's household and social classes: stored, saved and migrated.
import { describe, expect, it } from "vitest";
import { newGame } from "./game";
import { householdOf, makeHousehold } from "./household";
import { classFor, makeResident } from "./residents";
import { parseSave } from "./save";
import { SOCIAL_CLASSES } from "./content";
import { content, withState } from "./testUtils";

describe("social classes", () => {
  it("every resident has one, from the seed, in the rules' shares", () => {
    const many = Array.from({ length: 4000 }, (_, i) => makeResident(content, 9, i + 1));
    for (const c of SOCIAL_CLASSES) {
      const share = (100 * many.filter((p) => p.cls === c).length) / many.length;
      expect(share).toBeCloseTo(content.rules.residents.classPercent[c], -1);
    }
    expect(classFor(content, 9, 5)).toBe(makeResident(content, 9, 5).cls);
  });

  it("are saved, and v26 residents get theirs from the seed", () => {
    const s = withState({ villagers: 8 });
    expect(parseSave(JSON.stringify(s), content)!.residents).toEqual(s.residents);
    const v26 = { ...s, version: 26, residents: s.residents.map(({ cls: _c, ...rest }) => rest) };
    const loaded = parseSave(JSON.stringify(v26), content)!;
    expect(loaded.residents.map((p) => p.cls)).toEqual(s.residents.map((p) => classFor(content, s.map.seed, p.id)));
  });

  it("each tradition names them, or general terms are used", () => {
    const tagalog = content.traditions.find((t) => t.id === "tagalog")!;
    expect(tagalog.classes!.warrior.name.en).toBe("Maharlika");
    expect(tagalog.classes!.dependent.name.en).toBe("Alipin");
    const visayan = content.traditions.find((t) => t.id === "visayan")!;
    expect(visayan.classes!.nobility.name.en).toBe("Tumao");
    expect(visayan.classes!.dependent.name.en).toBe("Oripun");
  });
});

describe("the datu's household", () => {
  it("has a named spouse, saved with the game", () => {
    const s = newGame(content, 11, true, { name: "Ilaya", datu: "Dakila" });
    expect(s.household).not.toBeNull();
    expect(s.household!.datuGender).toBe("man");
    expect(s.household!.spouse.gender).toBe("woman");
    expect(content.villagers.women).toContain(s.household!.spouse.name);
    const loaded = parseSave(JSON.stringify(s), content)!;
    expect(loaded.household).toEqual(s.household);
  });

  it("a datu with a woman's name has a husband", () => {
    const h = makeHousehold(content, 3, content.villagers.datuWomen[0]);
    expect(h).toMatchObject({ datuGender: "woman", spouse: { gender: "man" } });
    expect(content.villagers.men).toContain(h.spouse.name);
  });

  it("older saves get one from the seed and the datu's name; AI barangays work theirs out", () => {
    const s = withState({ barangay: { id: "b", region: { x: 0, y: 0 }, name: "X", datu: "Dakila" } });
    const old: Record<string, unknown> = { ...s, version: 26 };
    delete old.household;
    expect(parseSave(JSON.stringify(old), content)!.household).toEqual(makeHousehold(content, s.map.seed, "Dakila"));
    expect(householdOf({ ...s, household: null }, content)).toEqual(makeHousehold(content, s.map.seed, "Dakila"));
  });
});

describe("meeting villagers", () => {
  it("tapping one opens the Aklat entries on dress and their class (a command, so it's saved and replayable)", async () => {
    const { apply, tick } = await import("./game");
    let s = withState({ villagers: 6, aklat: [] });
    s = apply(s, content, { type: "meet", cls: "dependent" });
    s = apply(s, content, { type: "meet", cls: "warrior", datu: true });
    s = tick(s, content, 1);
    for (const id of ["precolonial-dress", "alipin", "maharlika", "datu-nobility"]) expect(s.aklat).toContain(id);
    expect(s.aklat).not.toContain("timawa");
    // An unknown class changes nothing.
    expect(apply(s, content, { type: "meet", cls: "royal" as never })).toBe(s);
  });
});
