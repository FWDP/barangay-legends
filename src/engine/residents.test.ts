// Every villager as a person: gender and age group, deterministic, kept in step and migrated.
import { describe, expect, it } from "vitest";
import { apply, newGame, tick } from "./game";
import { namedGender, reconcilePeople, type NamedVillager } from "./people";
import { makeResident, residentAt, syncResidents } from "./residents";
import { parseSave } from "./save";
import { content, withState } from "./testUtils";

const r = content.rules.residents;

describe("residents", () => {
  it("are assigned from the map's seed and the id: the same every time", () => {
    expect(makeResident(content, 42, 7)).toEqual(makeResident(content, 42, 7));
    const a = Array.from({ length: 50 }, (_, i) => makeResident(content, 42, i + 1));
    const b = Array.from({ length: 50 }, (_, i) => makeResident(content, 43, i + 1));
    expect(a).not.toEqual(b);
    expect(newGame(content, 99).residents).toEqual(newGame(content, 99).residents);
  });

  it("come in the rules' shares of women, children and elders", () => {
    const many = Array.from({ length: 4000 }, (_, i) => makeResident(content, 5, i + 1));
    const share = (f: (p: (typeof many)[number]) => boolean) => (100 * many.filter(f).length) / many.length;
    expect(share((p) => p.gender === "woman")).toBeCloseTo(r.womanPercent, -1);
    expect(share((p) => p.age === "child")).toBeCloseTo(r.childPercent, -1);
    expect(share((p) => p.age === "elder")).toBeCloseTo(r.elderPercent, -1);
  });

  it("stay one per villager: arrivals added, the newest leave first", () => {
    const s = withState({ villagers: 6 });
    expect(s.residents).toHaveLength(6);
    const grown = syncResidents({ ...s, villagers: 9 }, content);
    expect(grown.residents.slice(0, 6)).toEqual(s.residents);
    expect(grown.residents).toHaveLength(9);
    const shrunk = syncResidents({ ...grown, villagers: 4 }, content);
    expect(shrunk.residents).toEqual(s.residents.slice(0, 4));
    // Ids are never reused.
    const again = syncResidents({ ...shrunk, villagers: 5 }, content);
    expect(again.residents[4].id).toBeGreaterThan(Math.max(...grown.residents.map((p) => p.id)));
    expect(syncResidents(s, content)).toBe(s);
  });

  it("follow the game: a played barangay always has one per villager", () => {
    let s = newGame(content, 3);
    for (let i = 0; i < 40; i++) s = apply(tick(s, content, 15), content, { type: "gather", resource: "rice" });
    expect(s.residents).toHaveLength(s.villagers);
  });

  it("round-trip in saves", () => {
    const s = withState({ villagers: 8 });
    expect(parseSave(JSON.stringify(s), content)!.residents).toEqual(s.residents);
  });

  it("are migrated: a v25 save gets one per villager from its seed, the same as new arrivals would", () => {
    const s = withState({ villagers: 7 });
    const old: Record<string, unknown> = { ...s, version: 25 };
    delete old.residents;
    delete old.residentsNext;
    const loaded = parseSave(JSON.stringify(old), content)!;
    expect(loaded.residents).toHaveLength(7);
    expect(loaded.residents).toEqual(Array.from({ length: 7 }, (_, i) => makeResident(content, s.map.seed, i + 1)));
    expect(parseSave(JSON.stringify(old), content)!.residents).toEqual(loaded.residents);
  });

  it("AI barangays store none and are worked out from their seed", () => {
    const s = { ...withState({ villagers: 5 }), residents: [] };
    expect(residentAt(s, content, 2)).toEqual(makeResident(content, s.map.seed, 3));
  });
});

describe("named villagers' genders", () => {
  const v = (id: number, name: string): NamedVillager => ({ id, name, story: "singer", role: "villager", since: 0 });

  it("old saves get theirs from the name's list", () => {
    const woman = content.villagers.women[0];
    const man = content.villagers.men[0];
    const old: Record<string, unknown> = { ...withState({ villagers: 6, named: [] }), version: 25, named: [v(1, woman), v(2, man)] };
    const loaded = parseSave(JSON.stringify(old), content)!;
    expect(loaded.named.map((n) => n.gender)).toEqual(["woman", "man"]);
    // A name in neither list still gets a gender, the same every time.
    expect(namedGender(content, v(3, "Somebody"), 1)).toBe(namedGender(content, v(3, "Somebody"), 1));
  });

  it("new ones get a name from their gender's list; Mandirigma are men", () => {
    const prev = withState({ villagers: 10, warriors: 0, named: [], buildings: [] });
    const always = { ...content, villagers: { ...content.villagers, chance: 1 } };
    const s = reconcilePeople(prev, { ...prev, villagers: 20, warriors: 3 }, always);
    expect(s.named.length).toBeGreaterThan(0);
    for (const n of s.named) {
      expect(n.gender).toBeDefined();
      expect((n.gender === "woman" ? content.villagers.women : content.villagers.men).includes(n.name)).toBe(true);
      if (n.role === "warrior") expect(n.gender).toBe("man");
    }
  });
});
