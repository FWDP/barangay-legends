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
    // Buildings unlocked, barangay levels and Bahay ng Datu levels. (Nine minutes since level 3
    // moved to about 15 minutes: rules.kabantugan.)
    const times = [0, ...run.milestones.filter((m) => m.t <= 30 * 60).map((m) => m.t), 30 * 60];
    expect(times.length).toBeGreaterThanOrEqual(12);
    for (let i = 1; i < times.length; i++) expect(times[i] - times[i - 1]).toBeLessThanOrEqual(9 * 60);
  });

  it("wood and gold don't run away: at most a little over the stockpile's soft cap", () => {
    run.rows.forEach((r, i) => {
      // Work stops at stopMultiple × the cap; quest rewards and trades can add a little more, and
      // gold a little more again: ransoms paid by AI barangays for their warriors (warfare.ts).
      expect(r.wood).toBeLessThanOrEqual(r.woodCap * content.rules.stockpile.stopMultiple * 1.2);
      // The cap itself can drop (the dearest next purchase is bought, e.g. the last Bahay ng Datu
      // level): gold already above it stays, but it must not keep growing.
      const over = r.gold > r.goldCap * content.rules.stockpile.stopMultiple * 1.4;
      if (over) expect(r.gold).toBeLessThanOrEqual((run.rows[i - 1]?.gold ?? 0) * 1.1);
    });
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

  it("a new game can't reach barangay level 3 in under 10 minutes", () => {
    // levelTimes[2] is when level 3 came (undefined if it didn't in the run).
    expect(run.levelTimes[2] ?? Infinity).toBeGreaterThanOrEqual(10 * 60);
    for (const seed of [1, 2, 3]) expect(simulate(content, 3, seed).levelTimes[2] ?? Infinity).toBeGreaterThanOrEqual(10 * 60);
  });

  it("is deterministic", () => {
    expect(simulate(content, 1, 12345).rows[0]).toEqual(run.rows[0]);
  });
}, 120_000);
