import { describe, expect, it } from "vitest";
import { isNightAt } from "../engine/daynight";
import { newGame } from "../engine/game";
import { tileAt } from "../engine/map";
import { at, content, mapFrom, TEST_MAP, withState } from "../engine/testUtils";
import { solidTiles } from "../engine/doors";
import { clearingShape, houseFootprint } from "../engine/plaza";
import type { GameState } from "../engine/game";
import { carriesTorch, destination, goal, edgeTile, keepOnLand, namedSprites, onLand, speedOf, exitPoint, MAX_SPRITES, newWalker, planVillagers, SPEED, stepWalker, walk } from "./villagers";
import { bandAt, dockPoint, riverPath } from "./visitors";

const fed = { resources: { rice: 100, wood: 0, gold: 0 } };

describe("villager sprites", () => {
  it("has one sprite per villager, capped at 60", () => {
    expect(planVillagers(withState({ ...fed, villagers: 4 }), content)).toHaveLength(4);
    const many = planVillagers(withState({ ...fed, villagers: 250 }), content);
    expect(many).toHaveLength(MAX_SPRITES);
    expect(new Set(many.map((p) => p.id)).size).toBe(MAX_SPRITES);
  });

  it("gives roles from the real numbers: workers, sick, warriors, idle", () => {
    const s = withState({
      ...fed,
      villagers: 7,
      warriors: 1,
      sick: [30],
      buildings: [at("bahay-kubo", 5, 3), at("palayan", 6, 3), at("kuta", 2, 2)],
    });
    // Between raids the warrior is just another worker.
    const roles = planVillagers(s, content).map((p) => p.role);
    expect(roles.filter((r) => r === "work")).toHaveLength(2);
    expect(roles.filter((r) => r === "sick")).toHaveLength(1);
    expect(roles.filter((r) => r === "warrior")).toHaveLength(0);
    expect(roles.filter((r) => r === "idle")).toHaveLength(4);
    // Called to arms: the warrior leaves work and goes to the Kuta (or the landing, as rally).
    const raid = { ...s, region: { ...newGame(content, 3).region!, incomingRaid: { from: "batong-buhay", strikeAt: s.time + 60 } } };
    const called = planVillagers(raid, content);
    expect(called.filter((p) => p.role === "warrior")).toHaveLength(1);
    expect(called.find((p) => p.role === "warrior")!.place).toMatchObject({ x: 2, y: 2 });
  });

  it("houses villagers in their Bahay Kubo, the rest about their gathering spot by the house (never on it)", () => {
    const s = withState({ ...fed, villagers: 4 });
    const plans = planVillagers(s, content);
    expect(plans[0].home).toMatchObject({ x: 5, y: 3 });
    const g = plans[3].gather!;
    expect(plans[3].home).toEqual({ x: Math.floor(g.x), y: Math.floor(g.y) });
    expect(plans[3].home).not.toEqual(s.map.plaza);
  });

  it("works at the doorway by day, goes home and inside at night, except warriors on watch", () => {
    const s = withState({ ...fed, villagers: 3, buildings: [at("bahay-kubo", 5, 3), at("palayan", 7, 7)] });
    // Sprite 1 (sprite 0 is one of the few who sit by the plaza fire at night).
    const worker = planVillagers(s, content)[1];
    expect(worker.role).toBe("work");
    const day = goal(worker, 0, false, s.map.plaza, false);
    const night = goal(worker, 0, true, s.map.plaza, false);
    // Beside the field, at its doorway, not on it.
    expect(Math.abs(Math.floor(day.p.x) - 7) + Math.abs(Math.floor(day.p.y) - 7)).toBe(1);
    expect(day.inside).toBe(false);
    // Home by its door, and indoors.
    expect(Math.abs(Math.floor(night.p.x) - 5) + Math.abs(Math.floor(night.p.y) - 3)).toBeLessThanOrEqual(1);
    expect(night.inside).toBe(true);
    const guard = { ...worker, role: "warrior" as const, place: { x: 1, y: 1 }, placeDoor: null };
    expect(Math.floor(destination(guard, 0, true, s.map.plaza, false).x)).toBe(1);
  });

  it("in the evening the elders and children sit by the fire; later they go home, adults go home at once", () => {
    const s = withState({ ...fed, villagers: 3, buildings: [at("bahay-kubo", 5, 3)] });
    const base = planVillagers(s, content)[1];
    const plan = (age: "child" | "adult" | "elder") => ({ ...base, role: "idle" as const, gather: { x: 2.5, y: 2.5 }, look: { gender: "woman" as const, age, malong: false } });
    for (const age of ["child", "elder"] as const) {
      const evening = goal(plan(age), 0, true, s.map.plaza, false, true);
      expect(evening.inside).toBe(false);
      expect({ x: Math.floor(evening.p.x), y: Math.floor(evening.p.y) }).toEqual({ x: 2, y: 2 });
      expect(goal(plan(age), 0, true, s.map.plaza, false, false).inside).toBe(true);
    }
    expect(goal(plan("adult"), 0, true, s.map.plaza, false, true).inside).toBe(true);
  });

  it("idles by the datu's house instead of working while the barangay is hungry", () => {
    const s = withState({ ...fed, villagers: 3, buildings: [at("bahay-kubo", 5, 3), at("palayan", 8, 8)] });
    const worker = planVillagers(s, content)[0];
    const p = destination(worker, 0, false, s.map.plaza, true);
    expect(Math.abs(p.x - (s.map.plaza.x + 0.5))).toBeLessThan(1);
  });

  it("follows the tint: night in the dark part of the cycle", () => {
    const d = content.rules.dayNight.daySeconds;
    expect(isNightAt(content, 0)).toBe(false);
    expect(isNightAt(content, d * 0.7)).toBe(true);
    expect(isNightAt(content, d * 3.95)).toBe(false);
  });

  it("walks along x, then y, at the given speed; the sick walk slower", () => {
    const step = walk({ x: 0, y: 0 }, { x: 2, y: 2 }, 1, 1);
    expect(step).toEqual({ p: { x: 1, y: 0 }, moving: true });
    expect(walk({ x: 0, y: 0 }, { x: 1, y: 1 }, 5, 1)).toEqual({ p: { x: 1, y: 1 }, moving: false });
    expect(SPEED.sick).toBeLessThan(SPEED.work);
  });

  it("leaves by the nearest map edge", () => {
    expect(exitPoint({ x: 2, y: 20 }, { width: 60, height: 40 })).toEqual({ x: -1, y: 20 });
    expect(exitPoint({ x: 30, y: 38 }, { width: 60, height: 40 })).toEqual({ x: 30, y: 41 });
  });

  it("never changes the game state", () => {
    const s = withState({ ...fed, villagers: 5, sick: [3], warriors: 1 });
    const before = JSON.stringify(s);
    for (const p of planVillagers(s, content)) destination(p, 12, false, s.map.plaza, false);
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe("walking along paths", () => {
  // River down column 4, a bridge at row 2, Daan along row 4 on the left bank.
  const map = mapFrom([
    "....~....",
    "....~....",
    ".P..=....",
    "....~....",
    "####~....",
  ]);
  const walkAll = (from: { x: number; y: number }, to: { x: number; y: number }, speed = 1, roadSpeed = 1) => {
    let w = newWalker(from);
    const visited: { x: number; y: number }[] = [];
    for (let i = 0; i < 2000 && (i === 0 || w.moving); i++) {
      w = stepWalker(w, to, map, speed, 0.05, roadSpeed);
      visited.push(w.p);
    }
    return { w, visited };
  };

  it("never steps on the river, and crosses on the bridge", () => {
    const { w, visited } = walkAll({ x: 0.5, y: 0.5 }, { x: 8.5, y: 0.5 });
    expect(w.p).toEqual({ x: 8.5, y: 0.5 });
    expect(visited.every((p) => tileAt(map, Math.floor(p.x), Math.floor(p.y)) !== "river")).toBe(true);
    expect(visited.some((p) => Math.floor(p.x) === 4 && Math.floor(p.y) === 2)).toBe(true);
  });

  it("stays put when there is no way across", () => {
    const cut = mapFrom(["..~..", ".P~.."]);
    const w = stepWalker(newWalker({ x: 0.5, y: 0.5 }), { x: 4.5, y: 0.5 }, cut, 1, 1);
    expect(w.p).toEqual({ x: 0.5, y: 0.5 });
    expect(w.moving).toBe(false);
  });

  it("walks faster on Daan", () => {
    const slow = walkAll({ x: 0.5, y: 4.5 }, { x: 3.5, y: 4.5 }, 1, 1).visited.length;
    const fast = walkAll({ x: 0.5, y: 4.5 }, { x: 3.5, y: 4.5 }, 1, 1.5).visited.length;
    expect(fast).toBeLessThan(slow);
    expect(slow / fast).toBeCloseTo(1.5, 0);
  });

  it("re-plans when the map changes", () => {
    const w = stepWalker(newWalker({ x: 0.5, y: 0.5 }), { x: 8.5, y: 0.5 }, map, 1, 0.01);
    const bridged = { ...map };
    expect(stepWalker(w, { x: 8.5, y: 0.5 }, bridged, 1, 0.01).map).toBe(bridged);
  });

  it("leaves and arrives by a walkable edge tile", () => {
    const e = edgeTile(map, { x: 4.5, y: 0.5 });
    expect(tileAt(map, e.x, e.y)).not.toBe("river");
    expect(e.y === 0 || e.y === map.height - 1 || e.x === 0 || e.x === map.width - 1).toBe(true);
  });

  it("keeps destinations inside their tile, so nobody stands in the river", () => {
    const s = withState({ ...fed, villagers: 3, buildings: [at("bahay-kubo", 1, 3)] });
    for (const plan of planVillagers(s, content)) {
      const d = destination(plan, 0, true, s.map.plaza, false);
      expect(tileAt(s.map, Math.floor(d.x), Math.floor(d.y))).not.toBe("river");
    }
  });

  it("never puts anyone inside a building's or the Bahay ng Datu's footprint: day, night, hungry, called to arms", () => {
    const region = newGame(content, 5).region!;
    const raid = (st: GameState): GameState => ({ ...st, region: { ...region, incomingRaid: { from: "batong-buhay", strikeAt: st.time + 60 } } });
    const houses = [at("bahay-kubo", 2, 2), at("bahay-kubo", 3, 2), at("palayan", 8, 7), at("woodcutter-camp", 1, 6), at("bahay-kubo", 4, 5)];
    const states = [
      // The big house, more villagers than homes (the rest stay by the house), no Kuta (warriors muster at the house).
      withState({ ...fed, datuLevel: 5, villagers: 40, warriors: 4, buildings: houses }),
      raid(withState({ ...fed, datuLevel: 5, villagers: 40, warriors: 4, buildings: houses })),
      // An old save keeping the one-tile house at level 4.
      withState({ ...fed, datuLevel: 4, villagers: 30, buildings: [...houses, at("bahay-kubo", 6, 4)] }),
      withState({ ...fed, datuLevel: 1, villagers: 12, buildings: houses }),
    ];
    for (const s of states) {
      const solid = solidTiles(s, content);
      const fp = houseFootprint(s, content);
      for (const p of fp) expect(solid[p.y * s.map.width + p.x]).toBe(1);
      const plans = planVillagers(s, content);
      expect(plans.length).toBeGreaterThan(10);
      for (const hungry of [false, true]) {
        for (const night of [false, true]) {
          for (let t = 0; t < 160; t += 7) {
            for (const plan of plans) {
              const g = goal(plan, t, night, s.map.plaza, hungry);
              expect(solid[Math.floor(g.p.y) * s.map.width + Math.floor(g.p.x)]).toBe(0);
            }
          }
        }
      }
    }
  });
});

describe("no stacking", () => {
  it("never puts two visible villagers on the same spot: day, night, hungry, a crowd at the datu's house", () => {
    const houses = [at("bahay-kubo", 2, 2), at("bahay-kubo", 3, 2), at("palayan", 8, 7), at("woodcutter-camp", 1, 6), at("bahay-kubo", 4, 5)];
    const map = { ...TEST_MAP, gathering: clearingShape(TEST_MAP, content) };
    const states = [
      withState({ ...fed, datuLevel: 5, villagers: 60, warriors: 4, buildings: houses, map }),
      withState({ ...fed, datuLevel: 1, villagers: 25, buildings: houses }),
    ];
    for (const s of states) {
      const plans = planVillagers(s, content);
      for (const hungry of [false, true]) {
        for (const night of [false, true]) {
          for (let t = 0; t < 160; t += 9) {
            const shown = plans.map((plan) => goal(plan, t, night, s.map.plaza, hungry)).filter((g) => !g.inside).map((g) => g.p);
            for (let i = 0; i < shown.length; i++) {
              for (let j = i + 1; j < shown.length; j++) expect(Math.hypot(shown[i].x - shown[j].x, shown[i].y - shown[j].y)).toBeGreaterThan(0.04);
            }
          }
        }
      }
    }
  });
});

describe("the sick", () => {
  const sick = (n: number) => Array.from({ length: n }, () => 60);
  const base = { resources: { rice: 100, wood: 0, gold: 0 }, buildings: [at("bahay-kubo", 2, 2), at("bahay-kubo", 3, 2), at("bahay-kubo", 2, 6), at("babaylan-hut", 7, 6)] };

  it("walk to the hut and go inside (not drawn there), day and night, and carry no torch", () => {
    const s = withState({ ...base, villagers: 8, sick: sick(3) });
    const plans = planVillagers(s, content).filter((p) => p.role === "sick");
    expect(plans).toHaveLength(3);
    for (const p of plans) {
      expect(p.place).toEqual({ x: 7, y: 6 });
      for (const night of [false, true]) {
        const g = goal(p, 0, night, s.map.plaza, false);
        expect(g.inside).toBe(true);
        // At the hut's doorway, not on the hut.
        expect(Math.hypot(g.p.x - 7.5, g.p.y - 6.5)).toBeLessThan(1.5);
        expect(Math.floor(g.p.x) === 7 && Math.floor(g.p.y) === 6).toBe(false);
      }
      expect(carriesTorch(p)).toBe(false);
    }
  });

  it("beyond the hut's room, wait inside their homes instead of crowding outside", () => {
    const cap = content.rules.healing.hutCapacity;
    const s = withState({ ...base, villagers: 9, sick: sick(cap + 2) });
    const plans = planVillagers(s, content).filter((p) => p.role === "sick");
    expect(plans.filter((p) => p.place).length).toBe(cap);
    const home = plans.filter((p) => !p.place);
    expect(home).toHaveLength(2);
    for (const p of home) expect(goal(p, 0, false, s.map.plaza, false).inside).toBe(!!p.homeDoor);
  });
});

describe("villagers of all kinds", () => {
  const fed2 = { resources: { rice: 500, wood: 0, gold: 0 } };
  const town = () =>
    withState({ ...fed2, villagers: 40, warriors: 4, buildings: [at("bahay-kubo", 2, 2), at("bahay-kubo", 3, 2), at("bahay-kubo", 2, 6), at("palayan", 7, 7), at("palayan", 1, 8), at("woodcutter-camp", 8, 1), at("kuta", 3, 6)] });

  it("every sprite shows a person; Mandirigma are men, children never work", () => {
    const region = newGame(content, 5).region!;
    const s = { ...town(), region: { ...region, incomingRaid: { from: "batong-buhay", strikeAt: 60 } } };
    const plans = planVillagers(s, content);
    for (const p of plans) expect(p.look).toBeDefined();
    for (const p of plans.filter((x) => x.role === "warrior")) expect(p.look).toMatchObject({ gender: "man", age: "adult" });
    for (const p of plans.filter((x) => x.role === "work" || x.role === "clearing")) expect(p.look!.age).not.toBe("child");
    // Women and men both work.
    const workers = plans.filter((x) => x.role === "work").map((x) => x.look!.gender);
    expect(workers).toContain("woman");
    expect(workers).toContain("man");
  });

  it("are the same people every time, and elders walk slower", () => {
    const a = planVillagers(town(), content).map((p) => p.look);
    expect(planVillagers(town(), content).map((p) => p.look)).toEqual(a);
    const elder = planVillagers(town(), content).find((p) => p.look?.age === "elder" && p.role === "idle");
    if (elder) expect(speedOf(elder)).toBeLessThan(SPEED.idle);
  });

  it("wear the malong in a tradition that dresses that way", () => {
    const maranao = content.traditions.find((t) => t.dress === "malong")!;
    expect(planVillagers({ ...town(), tradition: maranao.id }, content).every((p) => p.look!.malong)).toBe(true);
    expect(planVillagers(town(), content).some((p) => p.look!.malong)).toBe(false);
  });

  it("named villagers show on a sprite of their own gender", () => {
    const named = [
      { id: 1, name: content.villagers.women[0], story: "singer", role: "villager" as const, since: 0, gender: "woman" as const },
      { id: 2, name: content.villagers.men[0], story: "singer", role: "villager" as const, since: 0, gender: "man" as const },
    ];
    const s = withState({ ...fed2, villagers: 40, named, buildings: town().buildings });
    const plans = planVillagers(s, content);
    for (const [id, v] of namedSprites(plans, s, content)) expect(plans.find((p) => p.id === id)!.look!.gender).toBe(v.gender);
  });
});

describe("no one walks on water", () => {
  // A river down column 4 and the sea along the bottom row, with a Tulay at row 2.
  const map = mapFrom(["....~....", "....~....", ".P..=....", "....~....", "~~~~~~~~~"]);

  it("onLand: land and a Tulay yes, river no, off the map yes (walking in or out)", () => {
    expect(onLand(map, { x: 0.5, y: 0.5 })).toBe(true);
    expect(onLand(map, { x: 4.5, y: 2.5 })).toBe(true);
    expect(onLand(map, { x: 4.5, y: 0.5 })).toBe(false);
    expect(onLand(map, { x: 2.5, y: 4.5 })).toBe(false);
    expect(onLand(map, { x: -1, y: 2 })).toBe(true);
  });

  it("keepOnLand moves a point off the water to the nearest bank, and leaves land alone", () => {
    expect(keepOnLand(map, { x: 1.3, y: 0.7 })).toEqual({ x: 1.3, y: 0.7 });
    const moved = keepOnLand(map, { x: 4.2, y: 0.5 });
    expect(onLand(map, moved)).toBe(true);
    expect(Math.floor(moved.x)).toBe(3);
    const fromSea = keepOnLand(map, { x: 6.5, y: 4.6 });
    expect(onLand(map, fromSea)).toBe(true);
    expect(Math.floor(fromSea.y)).toBe(3);
  });

  it("every sprite position the plans give is on land, day, evening and night, with routes over land and Tulay only", () => {
    const region = newGame(content, 5).region!;
    const houses = [at("bahay-kubo", 1, 3), at("bahay-kubo", 2, 2), at("palayan", 8, 7), at("woodcutter-camp", 1, 6), at("kuta", 7, 1)];
    const states = [
      withState({ ...fed, villagers: 30, warriors: 4, buildings: houses }),
      { ...withState({ ...fed, villagers: 30, warriors: 4, buildings: houses }), region: { ...region, incomingRaid: { from: "batong-buhay", strikeAt: 60, landing: { x: 1, y: 4 } } } },
    ];
    for (const s of states) {
      const blocked = solidTiles(s, content);
      const plans = planVillagers(s, content);
      for (const night of [false, true]) {
        for (const evening of [false, true]) {
          for (let t = 0; t < 160; t += 11) {
            for (const plan of plans) {
              const g = goal(plan, t, night, s.map.plaza, false, evening);
              expect(onLand(s.map, g.p)).toBe(true);
              // Walking there from the edge (as newcomers do): every step on land.
              const e = edgeTile(s.map, g.p);
              let w = newWalker({ x: e.x + 0.5, y: e.y + 0.5 });
              for (let i = 0; i < 400 && (i === 0 || w.moving); i++) {
                w = stepWalker(w, g.p, s.map, 1.5, 0.1, 1, blocked);
                expect(onLand(s.map, w.p)).toBe(true);
              }
            }
          }
        }
      }
    }
  });

  it("raiders stand as a band on their landing tile, never in the water beside it", () => {
    const s = withState({ ...fed, villagers: 5 });
    for (let n = 1; n <= 8; n++) for (const p of bandAt({ x: 1, y: 4 }, n)) expect(onLand(s.map, p)).toBe(true);
  });

  it("envoys step off the trade bangka onto the bank, not the water", () => {
    const s = withState({ ...fed, villagers: 5 });
    const path = riverPath(s.map);
    const dock = dockPoint(path, s.map.plaza);
    expect(onLand(s.map, keepOnLand(s.map, dock))).toBe(true);
  });
});
