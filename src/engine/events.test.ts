import { describe, expect, it } from "vitest";
import { apply, availableWorkers, housing, newGame, rates, tick, type GameState } from "./game";
import { adjacentPairs, healRate, nextRandom, seasonAt, secondsUntilLeaving, spreadChance } from "./events";
import { at, calm, content, withEvents, withState } from "./testUtils";

const run = (s: GameState, seconds: number, c = calm) => tick(s, c, seconds);
const burning = (s: GameState) => s.buildings.filter((b) => b.burningSince !== undefined);
const damaged = (s: GameState) => s.buildings.filter((b) => b.damaged);

// Plain tiles (no adjacency bonus) for production checks.
const fields = [at("palayan", 3, 6), at("woodcutter-camp", 3, 2)];

describe("seeded RNG", () => {
  it("is deterministic and stays in [0, 1)", () => {
    let seed = 123;
    const values: number[] = [];
    for (let i = 0; i < 1000; i++) {
      const [v, next] = nextRandom(seed);
      values.push(v);
      seed = next;
    }
    expect(values.every((v) => v >= 0 && v < 1)).toBe(true);
    expect(nextRandom(123)).toEqual(nextRandom(123));
    expect(nextRandom(123)[0]).not.toBe(nextRandom(124)[0]);
  });

  it("is never replaced by unseeded randomness or the wall clock in engine code", () => {
    const sources = import.meta.glob<string>("./*.ts", { query: "?raw", import: "default", eager: true });
    for (const [file, code] of Object.entries(sources)) {
      if (file.endsWith(".test.ts")) continue;
      const withoutComments = code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(withoutComments, file).not.toMatch(/Math\.random\s*\(|Date\.now\s*\(|performance\.now\s*\(/);
    }
  });
});

describe("Gutom (hunger)", () => {
  const hungry = withState({ resources: { rice: 0, wood: 0, gold: 0 }, villagers: 5, buildings: [...fields, at("bahay-kubo", 5, 3)] });

  it("stops all work at 0 rice", () => {
    expect(availableWorkers(hungry)).toBe(0);
    expect(rates(hungry, calm).produced).toEqual({ rice: 0, wood: 0, gold: 0 });
  });

  it("lets nobody leave for the first 30 seconds", () => {
    const s = run(hungry, 39.5);
    expect(s.villagers).toBe(5);
    expect(s.hunger).toBeCloseTo(39.5);
  });

  it("then sends one villager away every 10 seconds", () => {
    expect(run(hungry, 41).villagers).toBe(4); // 30s grace + 10s
    expect(run(hungry, 61).villagers).toBe(2); // left at 40, 50 and 60
  });

  it("counts down to the first departure", () => {
    expect(secondsUntilLeaving(hungry, calm)).toBe(30);
    expect(secondsUntilLeaving(run(hungry, 12), calm)).toBeCloseTo(18);
    expect(secondsUntilLeaving(withState({}), calm)).toBeNull();
  });

  it("is recoverable: gathering rice puts villagers back to work and resets hunger", () => {
    let s = run(hungry, 41);
    s = apply(s, calm, { type: "gather", resource: "rice" });
    expect(availableWorkers(s)).toBe(4);
    s = run(s, 0.5);
    expect(s.hunger).toBe(0);
    expect(rates(s, calm).produced.rice).toBeGreaterThan(0);
  });
});

describe("Seasons", () => {
  it("alternate tag-ulan and tag-araw every 5 minutes", () => {
    expect(seasonAt(content, 0)?.season.id).toBe("tag-ulan");
    expect(seasonAt(content, 299)?.season.id).toBe("tag-ulan");
    expect(seasonAt(content, 300)?.season.id).toBe("tag-araw");
    expect(seasonAt(content, 599)?.season.id).toBe("tag-araw");
    expect(seasonAt(content, 600)?.season.id).toBe("tag-ulan");
    expect(seasonAt(content, 450)?.remaining).toBe(150);
  });

  it("halve rice output in tag-araw, and leave wood alone", () => {
    const ulan = withState({ villagers: 4, buildings: fields, time: 10 });
    const araw = { ...ulan, time: 310 };
    expect(rates(ulan, calm).produced.rice).toBeCloseTo(1);
    expect(rates(araw, calm).produced.rice).toBeCloseTo(0.5);
    expect(rates(araw, calm).produced.wood).toBeCloseTo(rates(ulan, calm).produced.wood);
  });

  it("advance with game time", () => {
    const s = run(withState({ resources: { rice: 1000, wood: 0, gold: 0 } }), 305);
    expect(s.time).toBeCloseTo(305);
    expect(seasonAt(content, s.time)?.season.id).toBe("tag-araw");
  });
});

describe("Sakit (sickness)", () => {
  const fed = { rice: 1000, wood: 0 };

  it("keeps sick villagers from working", () => {
    const s = withState({ resources: fed, villagers: 4, buildings: fields, sick: [60, 60] });
    expect(availableWorkers(s)).toBe(2);
    expect(rates(s, calm).produced.rice + rates(s, calm).produced.wood).toBeCloseTo(0.9); // 1 farmer + 1 woodcutter
  });

  it("wears off after 60 seconds", () => {
    const s = withState({ resources: fed, sick: [60] });
    expect(run(s, 59).sick).toHaveLength(1);
    expect(run(s, 60.5).sick).toHaveLength(0);
  });

  it("heals twice as fast with a Babaylan's Hut, but not a damaged one", () => {
    const hut = withState({ resources: fed, sick: [60], buildings: [at("babaylan-hut", 2, 6)] });
    expect(healRate(hut, calm)).toBe(2);
    expect(run(hut, 30.5).sick).toHaveLength(0);
    const broken = { ...hut, buildings: [{ ...at("babaylan-hut", 2, 6), damaged: true }] };
    expect(healRate(broken, calm)).toBe(1);
  });

  it("never starts in the first 5 minutes, then can", () => {
    const always = withEvents({ sickness: { chancePerSecond: 1, spreadChancePerSecond: 0 } }, calm);
    const s = withState({ resources: fed, villagers: 5 });
    expect(run(s, 299, always).sick).toHaveLength(0);
    expect(run(s, 301, always).sick).toHaveLength(1);
  });

  it("spreads faster when many bahay kubo share walls", () => {
    const apart = [at("bahay-kubo", 1, 1), at("bahay-kubo", 3, 1), at("bahay-kubo", 7, 1)];
    const crowded = [at("bahay-kubo", 2, 3), at("bahay-kubo", 3, 3), at("bahay-kubo", 2, 2), at("bahay-kubo", 3, 2)];
    expect(adjacentPairs(withState({ buildings: apart }), "bahay-kubo")).toBe(0);
    expect(adjacentPairs(withState({ buildings: crowded }), "bahay-kubo")).toBe(4);
    const ev = content.events.sickness!;
    const healthy = 7 / 8;
    const chance = (buildings: typeof apart) => spreadChance(withState({ villagers: 8, sick: [60], buildings }), content);
    expect(chance(apart)).toBeCloseTo(ev.spreadChancePerSecond * healthy);
    // Four shared walls: 4 × 50%, up to the crowding cap.
    const crowding = Math.min(4 * ev.crowding.percentPerAdjacentPair, ev.crowding.maxPercent ?? Infinity) / 100;
    expect(chance(crowded)).toBeCloseTo(ev.spreadChancePerSecond * (1 + crowding) * healthy);
  });

  it("burns out instead of holding most of the barangay sick for good", () => {
    const ev = content.events.sickness!;
    const crowded = [at("bahay-kubo", 2, 3), at("bahay-kubo", 3, 3), at("bahay-kubo", 2, 2), at("bahay-kubo", 3, 2)];
    // With most villagers already sick, the few healthy ones are caught slowly...
    const most = spreadChance(withState({ villagers: 30, sick: Array(26).fill(60), buildings: crowded }), content);
    const few = spreadChance(withState({ villagers: 30, sick: Array(4).fill(60), buildings: crowded }), content);
    expect(most / 26).toBeLessThan(few / 4);
    // ...so each sick villager passes it on to fewer than one other before recovering.
    const perSick = most / 26;
    expect(perSick * ev.sickSeconds).toBeLessThan(1);
  });

  it("spreads to one more villager when the roll succeeds, and never past the population", () => {
    const sure = withEvents({ sickness: { spreadChancePerSecond: 1 } }, calm);
    // No houses: housing is the base 3, so nobody new arrives during the test.
    const s = withState({ resources: fed, villagers: 3, sick: [60], buildings: [] });
    expect(run(s, 1, sure).sick).toHaveLength(2);
    const later = run(s, 10, sure);
    expect(later.villagers).toBe(3);
    expect(later.sick).toHaveLength(3);
  });
});

describe("Sunog (fire)", () => {
  const sunog = content.events.fire!;
  const fed = { rice: 1000, wood: 50 };
  const row = (burningSince?: number) =>
    withState({
      resources: fed,
      time: 400,
      buildings: [
        { ...at("bahay-kubo", 2, 6), burningSince },
        at("bahay-kubo", 3, 6), // next door
        at("palayan", 2, 7), // next door, but not a house
        at("bahay-kubo", 6, 6), // far away
      ],
    });

  it("never starts in the first 5 minutes, then lights a bahay kubo", () => {
    const always = withEvents({ fire: { chancePerSecond: 1 } }, calm);
    const s = withState({ resources: fed, buildings: [at("bahay-kubo", 5, 3), at("palayan", 2, 6)] });
    expect(burning(run(s, 299, always))).toHaveLength(0);
    expect(burning(run(s, 300.5, always))).toMatchObject([{ ...at("bahay-kubo", 5, 3), burningSince: 300 }]);
  });

  it("spreads to adjacent bahay kubo after a while, and only to them", () => {
    const s = run(row(400), sunog.spreadAfterSeconds + 0.5);
    const lit = burning(s).map((b) => `${b.x},${b.y}`);
    expect(lit).toEqual(["2,6", "3,6"]);
  });

  it("burns a house down into a damaged one that shelters nobody", () => {
    const start = row(400);
    const s = run(start, sunog.burnDownSeconds + 0.5);
    expect(damaged(s).map((b) => `${b.x},${b.y}`)).toContain("2,6");
    expect(housing(s, calm)).toBeLessThan(housing(start, calm));
  });

  it("goes out when tapped, before it can spread", () => {
    let s = run(row(400), 5);
    s = apply(s, calm, { type: "extinguish", x: 2, y: 6 });
    expect(burning(s)).toHaveLength(0);
    s = run(s, 60);
    expect(burning(s)).toHaveLength(0);
    expect(damaged(s)).toHaveLength(0);
  });

  it("ignores taps on buildings that aren't burning", () => {
    const s = row(undefined);
    expect(apply(s, calm, { type: "extinguish", x: 3, y: 6 })).toBe(s);
  });
});

describe("Bagyo (typhoon)", () => {
  const bagyo = content.events.typhoon!;
  const always = withEvents({ typhoon: { chancePerSecond: 1 } }, calm);
  const village = withState({
    resources: { rice: 1000, wood: 0, gold: 0 },
    buildings: [at("bahay-kubo", 5, 3), at("bahay-kubo", 4, 3), at("palayan", 1, 4), at("woodcutter-camp", 8, 4), at("palayan", 1, 5)],
  });

  it("never comes in the first 5 minutes", () => {
    expect(run(village, 299, always).typhoon).toBeNull();
  });

  it("gives a 60-second warning before anything is damaged", () => {
    const warned = run(village, 300.5, always);
    expect(warned.typhoon).toEqual({ strikeAt: 300 + bagyo.warningSeconds });
    expect(damaged(warned)).toHaveLength(0);
    expect(damaged(run(warned, 59, always))).toHaveLength(0);
  });

  it("then damages a few buildings and goes quiet for its cooldown", () => {
    const after = run(village, 361, always);
    expect(after.typhoon).toBeNull();
    expect(damaged(after).length).toBeGreaterThanOrEqual(bagyo.damagedBuildings.min);
    expect(damaged(after).length).toBeLessThanOrEqual(bagyo.damagedBuildings.max);
    expect(after.nextEventAt[bagyo.id]).toBe(360 + bagyo.cooldownSeconds);
  });

  it("damaged buildings produce nothing until repaired with wood", () => {
    const s = withState({ villagers: 2, resources: { rice: 100, wood: 0, gold: 0 }, buildings: [{ ...at("palayan", 3, 6), damaged: true }] });
    expect(rates(s, calm).produced.rice).toBe(0);
    expect(apply(s, calm, { type: "repair", x: 3, y: 6 })).toBe(s); // can't afford 8 wood yet
    const rich = { ...s, resources: { rice: 100, wood: 10, gold: 0 } };
    const fixed = apply(rich, calm, { type: "repair", x: 3, y: 6 });
    expect(fixed.resources.wood).toBe(2);
    expect(damaged(fixed)).toHaveLength(0);
    expect(rates(fixed, calm).produced.rice).toBeCloseTo(1);
  });
});

describe("every loss is recoverable", () => {
  it("brings a battered barangay back: repair everything, feed it, and villagers return", () => {
    let s = withState({
      resources: { rice: 0, wood: 100, gold: 0 },
      villagers: 2,
      buildings: [
        { ...at("bahay-kubo", 5, 3), damaged: true },
        { ...at("bahay-kubo", 4, 3), damaged: true },
        { ...at("palayan", 1, 4), damaged: true },
      ],
    });
    for (const b of [...s.buildings]) s = apply(s, calm, { type: "repair", x: b.x, y: b.y });
    expect(damaged(s)).toHaveLength(0);
    for (let i = 0; i < 20; i++) s = apply(s, calm, { type: "gather", resource: "rice" });
    s = run(s, 120);
    expect(s.villagers).toBe(housing(s, calm));
    expect(s.villagers).toBeGreaterThan(2);
  });
});

describe("determinism", () => {
  const busy = withEvents({
    sickness: { chancePerSecond: 0.05, startsAfterSeconds: 0 },
    fire: { chancePerSecond: 0.05, startsAfterSeconds: 0 },
    typhoon: { chancePerSecond: 0.05, startsAfterSeconds: 0, warningSeconds: 20 },
  });
  const start = (seed: number) => ({
    ...newGame(busy, seed),
    resources: { rice: 5000, wood: 0, gold: 0 },
    buildings: [
      at("bahay-kubo", 5, 3),
      at("bahay-kubo", 4, 3),
      at("bahay-kubo", 6, 3),
      at("bahay-kubo", 5, 5),
      at("palayan", 1, 4),
      at("woodcutter-camp", 8, 4),
    ],
  });
  const summary = (s: GameState) => ({
    villagers: s.villagers,
    sick: s.sick.length,
    typhoon: s.typhoon,
    buildings: s.buildings,
    rng: s.rng,
    nextEventAt: s.nextEventAt,
  });

  it("gives the same events for the same seed", () => {
    expect(summary(tick(start(7), busy, 400))).toEqual(summary(tick(start(7), busy, 400)));
  });

  it("gives different events for a different seed", () => {
    expect(summary(tick(start(7), busy, 400))).not.toEqual(summary(tick(start(8), busy, 400)));
  });

  it("does not depend on frame rate: one long tick equals many short ones", () => {
    let small = start(11);
    for (let i = 0; i < 4000; i++) small = tick(small, busy, 0.1);
    expect(summary(small)).toEqual(summary(tick(start(11), busy, 400)));
  });
});
