// The renown curve's pace (rules.kabantugan): five hours of non-stop active play with the
// balance simulation's bot (simulate.ts) can't reach barangay level 10, nor ten minutes level 3.
// The full curve, with time away, is printed by `npm run simulate -- --sessions=3`.
import { describe, expect, it } from "vitest";
import { simulate } from "./simulate";
import { content } from "./testUtils";

const HOURS = 5;
const run = simulate(content, (HOURS * 3600) / content.rules.dayNight.daySeconds, 12345);

describe("barangay level pace", () => {
  it("a new game can't reach level 3 in under 10 minutes", () => {
    // levelTimes[n - 1] is when level n came (undefined if it didn't in the run).
    expect(run.levelTimes[2] ?? Infinity).toBeGreaterThanOrEqual(10 * 60);
  });

  it("a new game can't reach level 10 in under 5 hours of active play", () => {
    expect(run.levelTimes[9] ?? Infinity).toBeGreaterThanOrEqual(HOURS * 3600);
    // ...but does get somewhere: level 5 within those hours.
    expect(run.levelTimes[4] ?? Infinity).toBeLessThan(HOURS * 3600);
  });
}, 600_000);
