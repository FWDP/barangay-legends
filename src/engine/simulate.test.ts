// The balance simulation (simulate.ts, `npm run simulate`) for a short stretch, checking the
// balance targets: wood and gold don't run away, rice isn't stuck at 0, the early game moves
// quickly, and the AI barangays keep growing.
import { describe, expect, it } from "vitest";
import { simulate } from "./simulate";
import { content } from "./testUtils";

const DAYS = 8;
const run = simulate(content, DAYS, 12345);

describe("balance simulation", () => {
  it("plays every day it is asked to", () => {
    expect(run.rows).toHaveLength(DAYS);
  });

  it("the first automated income comes within about two minutes", () => {
    expect(run.firstIncomeAt).not.toBeNull();
    expect(run.firstIncomeAt!).toBeLessThanOrEqual(120);
  });

  it("something new comes every few minutes in the first 30 minutes", () => {
    // Buildings unlocked, barangay levels and Bahay ng Datu levels.
    const times = [0, ...run.milestones.filter((m) => m.t <= 30 * 60).map((m) => m.t), 30 * 60];
    expect(times.length).toBeGreaterThanOrEqual(12);
    for (let i = 1; i < times.length; i++) expect(times[i] - times[i - 1]).toBeLessThanOrEqual(8 * 60);
  });

  it("wood and gold don't run away: at most a little over the stockpile's soft cap", () => {
    for (const r of run.rows) {
      // Work stops at stopMultiple × the cap; quest rewards and trades can add a little more.
      expect(r.wood).toBeLessThanOrEqual(r.woodCap * content.rules.stockpile.stopMultiple * 1.2);
      expect(r.gold).toBeLessThanOrEqual(r.goldCap * content.rules.stockpile.stopMultiple * 1.2);
    }
  });

  it("rice isn't stuck at 0 for long", () => {
    for (const r of run.rows) expect(r.hungrySeconds).toBeLessThan(content.rules.dayNight.daySeconds * 0.25);
  });

  it("late building stays affordable: the next house costs hundreds of wood, not thousands", () => {
    expect(run.rows.at(-1)!.kuboCost).toBeLessThan(1000);
  });

  it("the AI barangays keep growing", () => {
    const first = run.rows[0];
    const last = run.rows.at(-1)!;
    expect(last.aiAvgBuildings).toBeGreaterThan(first.aiAvgBuildings);
    expect(last.aiBuildings).toBeGreaterThan(first.aiBuildings);
  });

  it("is deterministic", () => {
    expect(simulate(content, 1, 12345).rows[0]).toEqual(run.rows[0]);
  });
}, 120_000);
