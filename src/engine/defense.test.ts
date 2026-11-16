// Teaching defense: the shore's landing points, what a staffed Bantayan watches (the same rules as
// the raid), the raid warning, when the landing shows, the report's one-line reason, and the tasks.
import { describe, expect, it } from "vitest";
import { chooseLanding, closestLandings } from "./border";
import { landedUnwatched, landingKnown, landingPoints, raidReason, raidWarning, shoreCoverage, shoreWatched } from "./defense";
import { buildingWorkers, newGame, type GameState } from "./game";
import { taskMet, taskProgress } from "./gawain";
import { isWatched, sees, staffedBantayan } from "./watch";
import { at, content, withState } from "./testUtils";

const radius = content.rules.watch.radius;
// The test map: river in column 0, so the landing points are on the bank at x = 1.
const base = (buildings = [at("bahay-kubo", 5, 3)], patch: Partial<GameState> = {}) => withState({ buildings, villagers: 6, resources: { rice: 100 }, ...patch });

describe("landing points and Bantayan watch", () => {
  it("are the landing spots a raid picks from", () => {
    const s = base();
    const points = landingPoints(s, content);
    expect(points).toEqual(closestLandings(s.map, content.rules.diplomacy.aiRaid.landingChoices));
    expect(points.length).toBeGreaterThan(0);
    for (let second = 0; second < 40; second++) expect(points).toContainEqual(chooseLanding(s, content, second));
  });

  it("a Bantayan watches only when staffed and standing", () => {
    const s = base([at("bahay-kubo", 5, 3), at("bantayan", 1, 4)]);
    const i = s.buildings.findIndex((b) => b.type === "bantayan");
    expect(buildingWorkers(s, content)[i]).toBeGreaterThan(0);
    expect(staffedBantayan(s, content)).toHaveLength(1);
    expect(isWatched(s, content, { x: 1, y: 4 })).toBe(true);
    // No one to staff it: it watches nothing.
    expect(staffedBantayan({ ...s, villagers: 0, residents: [] }, content)).toHaveLength(0);
    const broken = base([at("bahay-kubo", 5, 3), { ...at("bantayan", 1, 4), damaged: true }]);
    expect(isWatched(broken, content, { x: 1, y: 4 })).toBe(false);
    // A Kuta watches nothing.
    expect(isWatched(base([at("bahay-kubo", 5, 3), at("kuta", 1, 4)]), content, { x: 1, y: 4 })).toBe(false);
  });

  it("the placement preview matches the raid: a point counts as watched exactly when the raid says so", () => {
    for (const ty of [0, 4, 8]) {
      const preview = shoreCoverage(base(), content, { x: 1, y: ty });
      const built = base([at("bahay-kubo", 5, 3), at("bantayan", 1, ty)]);
      for (const point of preview) {
        expect(point.byNew).toBe(Math.hypot(point.p.x - 1, point.p.y - ty) <= radius);
        expect(point.byNew).toBe(sees(content, { x: 1, y: ty }, point.p));
        expect(shoreCoverage(built, content).find((q) => q.p.x === point.p.x && q.p.y === point.p.y)!.watched).toBe(isWatched(built, content, point.p));
      }
    }
    const s = base([at("bahay-kubo", 5, 3), at("bantayan", 1, 0)]);
    expect(shoreWatched(s, content).watched).toBe(shoreCoverage(s, content).filter((c) => c.watched).length);
  });
});

describe("the raid warning", () => {
  const raidAt = (landing: { x: number; y: number }, buildings = [at("bahay-kubo", 5, 3)], extra: object = {}) => {
    const s = base(buildings);
    return { ...s, time: 150, region: { ...newGame(content, 2).region!, incomingRaid: { from: "batong-buhay", strikeAt: 200, landing, ...extra } } };
  };

  it("names the landing and whether a Bantayan watched it", () => {
    expect(raidWarning(raidAt({ x: 1, y: 4 }), content)).toEqual({ landing: { x: 1, y: 4 }, watched: false });
    const watched = raidAt({ x: 1, y: 4 }, [at("bahay-kubo", 5, 3), at("bantayan", 1, 4)]);
    expect(raidWarning(watched, content)).toEqual({ landing: { x: 1, y: 4 }, watched: true });
    expect(raidWarning(base(), content)).toBeNull();
  });

  it("an unwatched landing shows only as the boats come close; a watched one at once", () => {
    const reveal = content.rules.watch.revealUnwatchedSeconds;
    const unwatched = raidAt({ x: 1, y: 4 }, undefined, { warnedAt: 150, watched: false });
    expect(landingKnown({ ...unwatched, time: 200 - reveal - 1 }, content)).toBe(false);
    expect(landingKnown({ ...unwatched, time: 200 - reveal }, content)).toBe(true);
    expect(landingKnown(raidAt({ x: 1, y: 4 }, undefined, { warnedAt: 150, watched: true }), content)).toBe(true);
  });
});

describe("raid report reasons", () => {
  it("explain the result in one line", () => {
    expect(raidReason({ win: true, watched: true, late: 0 })).toBe("wonWatched");
    expect(raidReason({ win: true, watched: false, late: 2 })).toBe("won");
    expect(raidReason({ win: false, watched: false, late: 3 })).toBe("lateUnwatched");
    expect(raidReason({ win: false, watched: false, late: 0 })).toBe("unwatched");
    expect(raidReason({ win: false, watched: true, late: 2 })).toBe("late");
    expect(raidReason({ win: false, watched: true, late: 0 })).toBe("lostWatched");
    expect(raidReason({ win: false })).toBe("outnumbered");
  });

  it("every reason has words in English and Filipino", async () => {
    const ui = (await import("../../content/ui.json")).default as unknown as { defense: Record<string, { en: string; fil: string }> };
    for (const r of ["wonWatched", "won", "lateUnwatched", "unwatchedReason", "late", "lostWatched", "outnumbered"]) {
      expect(ui.defense[r].en).toBeTruthy();
      expect(ui.defense[r].fil).toBeTruthy();
    }
    expect(ui.defense.lateUnwatched.en).toBe("No Bantayan watched the {direction} bank: your warriors were late.");
  });

  it("only a raid that landed unwatched offers to show the shore", () => {
    expect(landedUnwatched({ kind: "defense", watched: false })).toBe(true);
    expect(landedUnwatched({ kind: "defense", watched: true })).toBe(false);
    expect(landedUnwatched({ kind: "raid", watched: false })).toBe(false);
  });
});

describe("Mga Gawain", () => {
  const kutaTask = content.quests.find((q) => q.id === "first-kuta")!;
  const watchTask = content.quests.find((q) => q.id === "cover-shoreline")!;

  it("build a Kuta near the Bahay ng Datu, then a Bantayan where raiders land", () => {
    expect(kutaTask.next).toBe("cover-shoreline");
    expect(kutaTask.text.en).toBe("Build a Kuta near the Bahay ng Datu");
    expect(watchTask.text.en).toBe("Build a Bantayan where raiders land");
  });

  it("the Kuta task needs one whose shelter reaches the Bahay ng Datu", () => {
    const plaza = base().map.plaza;
    const near = base([at("bahay-kubo", 5, 3), at("kuta", plaza.x + 1, plaza.y + 1)]);
    const far = base([at("bahay-kubo", 5, 3), at("kuta", 9, 0)]);
    expect(taskMet(near, content, kutaTask)).toBe(true);
    expect(taskMet(far, content, kutaTask)).toBe(false);
  });

  it("the Bantayan task is met once a staffed one watches a landing point", () => {
    expect(taskProgress(base(), content, watchTask)).toEqual({ have: 0, need: 1 });
    expect(taskMet(base([at("bahay-kubo", 5, 3), at("bantayan", 1, 4)]), content, watchTask)).toBe(true);
  });
});
