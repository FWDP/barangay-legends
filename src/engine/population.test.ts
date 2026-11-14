// Where villagers come from (population.ts): births and newcomers, growing up, and who works.
import { describe, expect, it } from "vitest";
import { availableWorkers, newGame, tick, type GameState } from "./game";
import { ageResidents, arrival, birth, canHaveChild, familyOf, growPopulation, lifeSpans, notWorking, riceEaters } from "./population";
import type { Resident } from "./residents";
import { parseSave } from "./save";
import { at, content, withState } from "./testUtils";

const p = content.rules.population;
const day = content.rules.dayNight.daySeconds;
const adult = (id: number, gender: Resident["gender"], extra: Partial<Resident> = {}): Resident => ({ id, gender, age: "adult", cls: "commoner", since: 0, ...extra });
const kubo = [at("bahay-kubo", 2, 2), at("bahay-kubo", 3, 2), at("bahay-kubo", 2, 6), at("bahay-kubo", 3, 6)];
/** A fed, happy barangay of four adults (two women, two men) with room for more. */
const town = (patch: Partial<GameState> = {}): GameState =>
  withState({
    villagers: 4,
    residents: [adult(1, "woman"), adult(2, "man"), adult(3, "woman"), adult(4, "man")],
    residentsNext: 5,
    buildings: kubo,
    resources: { rice: 500, wood: 0, gold: 0 },
    happiness: 70,
    ...patch,
  });

describe("births", () => {
  it("need food, housing room, happiness and a Bahay Kubo", () => {
    expect(canHaveChild(town(), content)).toBe(true);
    expect(canHaveChild(town({ resources: { rice: 0, wood: 0, gold: 0 } }), content)).toBe(false);
    expect(canHaveChild(town({ hunger: 5 }), content)).toBe(false);
    expect(canHaveChild(town({ happiness: p.birthMinHappiness - 1 }), content)).toBe(false);
    expect(canHaveChild(town({ buildings: [] }), content)).toBe(false);
    // No room: as many villagers as the houses hold.
    const full = town({ buildings: [at("bahay-kubo", 2, 2)] });
    expect(canHaveChild({ ...full, villagers: 99 }, content)).toBe(false);
    // Nobody to be parents: only women.
    expect(canHaveChild(town({ residents: [adult(1, "woman"), adult(3, "woman")], villagers: 2 }), content)).toBe(false);
  });

  it("give a couple a child: a new resident, their parents linked, the parents married", () => {
    const s = birth(town(), content);
    expect(s.villagers).toBe(5);
    const child = s.residents.at(-1)!;
    expect(child).toMatchObject({ age: "child", came: "born", since: s.time });
    const [mother, father] = child.parents!.map((id) => s.residents.find((r) => r.id === id)!);
    expect(mother.gender).toBe("woman");
    expect(father.gender).toBe("man");
    expect(mother.spouse).toBe(father.id);
    expect(father.spouse).toBe(mother.id);
    expect(familyOf(s, mother.id).children).toEqual([child.id]);
    expect(familyOf(s, child.id).parents).toEqual([mother.id, father.id]);
  });

  it("are told gently in the Balita, with the parents' names", () => {
    const s0 = town({ region: newGame(content, 3).region });
    const s = birth(s0, content);
    const news = s.region!.news.at(-1)!;
    expect(news.key).toBe("birth");
    expect(news.people).toHaveLength(3);
  });

  it("come about every secondsPerBirth while the barangay can have children", () => {
    // Plenty of houses, so there is room all along.
    const roomy = [...kubo, ...[0, 1, 2, 3, 4, 5].flatMap((x) => [at("bahay-kubo", 5 + (x % 3), 6 + Math.floor(x / 3)), at("bahay-kubo", 1 + x, 8)])];
    const s = tick(town({ buildings: roomy, resources: { rice: 5000, wood: 0, gold: 0 } }), content, p.secondsPerBirth * 2.5);
    expect(s.residents.filter((r) => r.came === "born").length).toBeGreaterThanOrEqual(2);
    // Too unhappy: no births (newcomers still come).
    const sad = growPopulation(town({ happiness: 10, buildings: roomy }), content, p.secondsPerBirth * 3);
    expect(sad.residents.some((r) => r.came === "born")).toBe(false);
  });
});

describe("growing up", () => {
  it("children become adults after childDays Araw, adults elders after elderAfterDays", () => {
    const span = lifeSpans(content);
    expect(span.child).toBe(p.childDays * day);
    const s = town({ residents: [adult(1, "woman"), { id: 2, gender: "man", age: "child", cls: "commoner", since: 0 }], villagers: 2, time: span.child - 1 });
    expect(ageResidents(s, content)).toBe(s);
    const grown = ageResidents({ ...s, time: span.child }, content);
    expect(grown.residents[1]).toMatchObject({ age: "adult", since: span.child });
    const old = ageResidents({ ...s, time: span.adult }, content);
    expect(old.residents[0]).toMatchObject({ age: "elder", since: span.adult });
  });
});

describe("who works and eats", () => {
  it("children don't work and eat less; elders work part of a share", () => {
    const s = town({
      villagers: 6,
      residents: [adult(1, "woman"), adult(2, "man"), { id: 3, gender: "man", age: "child", cls: "commoner", since: 0 }, { id: 4, gender: "woman", age: "child", cls: "commoner", since: 0 }, adult(5, "woman", { age: "elder" }), adult(6, "man", { age: "elder" })],
    });
    expect(notWorking(s, content)).toBe(2 + Math.floor((2 * (100 - p.elderWorkPercent)) / 100));
    expect(availableWorkers(s, content)).toBe(6 - notWorking(s, content));
    expect(riceEaters(s, content)).toBeCloseTo(6 - (2 * (100 - p.childRicePercent)) / 100);
    // AI barangays (no residents stored) count everyone the same.
    expect(notWorking({ ...s, residents: [] }, content)).toBe(0);
  });
});

describe("newcomers", () => {
  it("arrive with a reason from content, told in the Balita and remembered on the resident", () => {
    const s0 = town({ region: newGame(content, 3).region });
    const s = arrival(s0, content);
    expect(s.villagers).toBeGreaterThan(4);
    const came = s.residents.slice(4);
    for (const r of came) {
      expect(r.came).toBe("arrived");
      expect(content.arrivals.reasons.map((x) => x.id)).toContain(r.why);
    }
    const news = s.region!.news.at(-1)!;
    expect(news.key).toBe("arrival");
    expect(news.reason).toBe(came[0].why);
    expect(news.people!.length).toBeGreaterThanOrEqual(1);
  });

  it("come for reasons that fit: kin from a raided ally, a spouse after a marriage alliance", () => {
    const region = newGame(content, 3).region!;
    const ally = region.neighbors[0].id;
    const raided = town({ region: { ...region, news: [{ id: 1, time: 0, key: "ally-lost", barangay: ally, other: region.neighbors[1].id }], nextNewsId: 2 } });
    const reasons = new Set<string>();
    let s = raided;
    for (let i = 0; i < 12; i++) s = arrival({ ...s, villagers: 4, residents: s.residents.slice(0, 4) }, content);
    for (const n of s.region!.news.filter((x) => x.key === "arrival")) reasons.add(n.reason!);
    expect(reasons.has("ally-kin")).toBe(true);
    // Without that, nobody comes as kin of a raided ally.
    let calm = town({ region });
    for (let i = 0; i < 12; i++) calm = arrival({ ...calm, villagers: 4, residents: calm.residents.slice(0, 4) }, content);
    expect(calm.region!.news.some((x) => x.reason === "ally-kin")).toBe(false);
  });

  it("never come without room", () => {
    const full = town({ buildings: [], villagers: 4 });
    expect(arrival({ ...full, villagers: 999 }, content).villagers).toBe(999);
  });

  it("keep the Balita for politics too: at most balitaMax birth and arrival lines", () => {
    let s = town({ region: newGame(content, 3).region, buildings: [...kubo, at("bahay-kubo", 6, 6), at("bahay-kubo", 7, 6), at("bahay-kubo", 6, 7)] });
    s = { ...s, region: { ...s.region!, news: [{ id: 1, time: 0, key: "formed", barangay: "x" }], nextNewsId: 2 } };
    for (let i = 0; i < p.balitaMax + 4; i++) s = birth(s, content);
    const local = s.region!.news.filter((n) => n.key === "birth" || n.key === "arrival");
    expect(local).toHaveLength(p.balitaMax);
    expect(s.region!.news.some((n) => n.key === "formed")).toBe(true);
  });
});

describe("determinism and old saves", () => {
  it("the same game grows the same way", () => {
    const a = tick(town(), content, 300);
    const b = tick(town(), content, 300);
    expect(a.residents).toEqual(b.residents);
    expect(a.villagers).toBe(b.villagers);
  });

  it("a v29 save loads: everyone keeps their age group and gets when it began; growth carries on", () => {
    const s = withState({ villagers: 6, time: 5000 });
    const old = { ...s, version: 29, residents: s.residents.map(({ since: _a, came: _b, ...r }) => r) } as Record<string, unknown>;
    delete old.births;
    const loaded = parseSave(JSON.stringify(old), content)!;
    expect(loaded.residents.map((r) => r.age)).toEqual(s.residents.map((r) => r.age));
    for (const r of loaded.residents) {
      expect(r.since).toBeLessThanOrEqual(5000);
      if (r.age === "child") expect(r.since).toBeGreaterThan(5000 - lifeSpans(content).child);
    }
    expect(loaded.births).toBe(0);
    expect(parseSave(JSON.stringify(loaded), content)).toEqual(loaded);
  });
});
