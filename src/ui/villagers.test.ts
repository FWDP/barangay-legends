import { describe, expect, it } from "vitest";
import { isNightAt } from "../engine/daynight";
import { newGame } from "../engine/game";
import { tileAt } from "../engine/map";
import { at, content, mapFrom, withState } from "../engine/testUtils";
import { destination, edgeTile, exitPoint, MAX_SPRITES, newWalker, planVillagers, SPEED, stepWalker, walk } from "./villagers";

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

  it("houses villagers in their Bahay Kubo, the rest by the plaza", () => {
    const s = withState({ ...fed, villagers: 4 });
    const plans = planVillagers(s, content);
    expect(plans[0].home).toMatchObject({ x: 5, y: 3 });
    expect(plans[3].home).toEqual(s.map.plaza);
  });

  it("goes home at night, except warriors on watch", () => {
    const s = withState({ ...fed, villagers: 3, buildings: [at("bahay-kubo", 5, 3), at("palayan", 7, 7)] });
    const worker = planVillagers(s, content)[0];
    const day = destination(worker, 0, false, s.map.plaza, false);
    const night = destination(worker, 0, true, s.map.plaza, false);
    expect(Math.floor(day.x)).toBe(7);
    expect(Math.floor(night.x)).toBe(5);
    const guard = { ...worker, role: "warrior" as const, place: { x: 1, y: 1 } };
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
});
