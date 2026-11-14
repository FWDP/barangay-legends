import { describe, expect, it } from "vitest";
import { isNightAt } from "../engine/daynight";
import { newGame } from "../engine/game";
import { tileAt } from "../engine/map";
import { at, content, mapFrom, withState } from "../engine/testUtils";
import { solidTiles } from "../engine/doors";
import { houseFootprint } from "../engine/plaza";
import type { GameState } from "../engine/game";
import { carriesTorch, destination, goal, edgeTile, exitPoint, MAX_SPRITES, newWalker, planVillagers, SPEED, stepWalker, walk } from "./villagers";

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

  it("idles at the plaza instead of working while the barangay is hungry", () => {
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
