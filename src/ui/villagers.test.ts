import { describe, expect, it } from "vitest";
import { at, content, withState } from "../engine/testUtils";
import { dayPhase, destination, exitPoint, isNight, MAX_SPRITES, planVillagers, SPEED, walk } from "./villagers";

const fed = { resources: { rice: 100, wood: 0 } };

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
    const roles = planVillagers(s, content).map((p) => p.role);
    expect(roles.filter((r) => r === "work")).toHaveLength(2);
    expect(roles.filter((r) => r === "sick")).toHaveLength(1);
    expect(roles.filter((r) => r === "warrior")).toHaveLength(1);
    expect(roles.filter((r) => r === "idle")).toHaveLength(3);
    const warrior = planVillagers(s, content).find((p) => p.role === "warrior")!;
    expect(warrior.place).toMatchObject({ x: 2, y: 2 });
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
    expect(isNight(dayPhase(0))).toBe(false);
    expect(isNight(dayPhase(240_000 * 0.7))).toBe(true);
    expect(isNight(dayPhase(240_000 * 3.95))).toBe(false);
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
