// Teaching Kuta placement: the shore's landing points, what a Kuta covers (the same rules as the
// battle), the raid warning, the report's one-line reason, and the shoreline task.
import { describe, expect, it } from "vitest";
import { borderDefense, chooseLanding, closestLandings, kutaCovers } from "./border";
import { landedUncovered, landingPoints, raidReason, raidWarning, shoreCoverage, shoreCovered } from "./defense";
import { newGame } from "./game";
import { taskMet, taskProgress } from "./gawain";
import { at, content, withState } from "./testUtils";

const radius = content.rules.military.kutaRadius;
const warning = content.rules.diplomacy.aiRaid.warningSeconds;
// The test map: river in column 0, so the landing points are on the bank at x = 1.
const base = () => withState({ buildings: [at("bahay-kubo", 5, 3)] });

describe("landing points and Kuta coverage", () => {
  it("are the landing spots a raid picks from", () => {
    const s = base();
    const points = landingPoints(s, content);
    expect(points).toEqual(closestLandings(s.map, content.rules.diplomacy.aiRaid.landingChoices));
    expect(points.length).toBeGreaterThan(0);
    // Every raid lands on one of them.
    for (let second = 0; second < 40; second++) expect(points).toContainEqual(chooseLanding(s, content, second));
  });

  it("the placement preview matches the battle: a point counts as covered exactly when the muster says so", () => {
    const s = base();
    for (const kx of [1, 3, 5, 7, 8]) {
      for (const ky of [0, 4, 8]) {
        // Placing a Kuta at (kx, ky): the preview...
        const preview = shoreCoverage(s, content, { x: kx, y: ky });
        // ...and the battle once it stands.
        const built = withState({ buildings: [at("bahay-kubo", 5, 3), at("kuta", kx, ky)] });
        for (const point of preview) {
          const fight = borderDefense(built, content, point.p, warning).muster;
          expect(point.byNew).toBe(fight.covered);
          expect(point.byNew).toBe(Math.hypot(point.p.x - kx, point.p.y - ky) <= radius);
          expect(shoreCoverage(built, content).find((q) => q.p.x === point.p.x && q.p.y === point.p.y)!.covered).toBe(fight.covered);
        }
      }
    }
  });

  it("shows which landing points stay uncovered", () => {
    // A Kuta far from the river (x = 8) reaches some points only.
    const far = withState({ buildings: [at("bahay-kubo", 5, 3), at("kuta", 8, 8)] });
    const cover = shoreCoverage(far, content);
    expect(cover.some((c) => !c.covered)).toBe(true);
    expect(shoreCovered(far, content).total).toBe(cover.length);
    expect(shoreCovered(far, content).covered).toBe(cover.filter((c) => c.covered).length);
    // A damaged Kuta covers nothing, as in the battle.
    const damaged = withState({ buildings: [at("bahay-kubo", 5, 3), { ...at("kuta", 1, 4), damaged: true }] });
    expect(shoreCovered(damaged, content).covered).toBe(0);
  });
});

describe("the raid warning", () => {
  const raidAt = (landing: { x: number; y: number }, buildings = [at("bahay-kubo", 5, 3)]) => {
    const s = withState({ buildings });
    return { ...s, region: { ...newGame(content, 2).region!, incomingRaid: { from: "batong-buhay", strikeAt: 200, landing } } };
  };

  it("names the landing and whether a Kuta covers it", () => {
    expect(raidWarning(raidAt({ x: 1, y: 4 }), content)).toEqual({ landing: { x: 1, y: 4 }, covered: false });
    const guarded = raidAt({ x: 1, y: 4 }, [at("bahay-kubo", 5, 3), at("kuta", 2, 4)]);
    expect(raidWarning(guarded, content)).toEqual({ landing: { x: 1, y: 4 }, covered: true });
    expect(kutaCovers(content, { x: 2, y: 4 }, { x: 1, y: 4 })).toBe(true);
    expect(raidWarning(base(), content)).toBeNull();
  });
});

describe("raid report reasons", () => {
  it("explain the result in one line", () => {
    expect(raidReason({ win: true, covered: true, late: 0 })).toBe("wonCovered");
    expect(raidReason({ win: true, covered: false, late: 2 })).toBe("won");
    expect(raidReason({ win: false, covered: false, late: 3 })).toBe("lateUncovered");
    expect(raidReason({ win: false, covered: false, late: 0 })).toBe("uncovered");
    expect(raidReason({ win: false, covered: true, late: 2 })).toBe("late");
    expect(raidReason({ win: false, covered: true, late: 0 })).toBe("lostCovered");
    // Older reports without the landing details.
    expect(raidReason({ win: false })).toBe("outnumbered");
  });

  it("every reason has words in English and Filipino", async () => {
    const ui = (await import("../../content/ui.json")).default as unknown as { defense: Record<string, { en: string; fil: string }> };
    for (const r of ["wonCovered", "won", "lateUncovered", "uncovered_", "late", "lostCovered", "outnumbered"]) {
      expect(ui.defense[r].en).toBeTruthy();
      expect(ui.defense[r].fil).toBeTruthy();
    }
    expect(ui.defense.warnUncovered.fil).toBe("⚠️ Walang Kuta sa dalampasigan!");
  });

  it("only a raid that landed uncovered offers to show the shore", () => {
    expect(landedUncovered({ kind: "defense", covered: false })).toBe(true);
    expect(landedUncovered({ kind: "defense", covered: true })).toBe(false);
    expect(landedUncovered({ kind: "raid", covered: false })).toBe(false);
  });
});

describe("Mga Gawain: cover your shoreline", () => {
  const task = content.quests.find((q) => q.id === "cover-shoreline")!;

  it("comes right after building the first Kuta", () => {
    expect(content.quests.find((q) => q.id === "first-kuta")!.next).toBe("cover-shoreline");
    expect(task.text.en).toMatch(/Cover your shoreline/);
  });

  it("is met once a standing Kuta reaches a landing point", () => {
    const far = withState({ buildings: [at("bahay-kubo", 5, 3), at("kuta", 8, 0)] });
    const near = withState({ buildings: [at("bahay-kubo", 5, 3), at("kuta", 2, 4)] });
    expect(taskProgress(base(), content, task)).toEqual({ have: 0, need: 1 });
    expect(taskMet(near, content, task)).toBe(true);
    expect(taskProgress(far, content, task).have).toBe(shoreCovered(far, content).covered);
  });
});
