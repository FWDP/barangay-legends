import { describe, expect, it } from "vitest";
import { apply, STATE_VERSION, type GameState } from "./game";
import { tileAt } from "./map";
import { findPath } from "./paths";
import { parseSave } from "./save";
import { at, calm, content, mapFrom, withState } from "./testUtils";

const tulay = content.buildings.find((b) => b.id === "tulay")!;

/** A save as an older version wrote it. */
function v14(state: GameState): string {
  const raw = { ...state, version: 14 } as Record<string, unknown>;
  delete raw.notices;
  return JSON.stringify(raw);
}

describe("migrating old bridges (v14 → v15)", () => {
  it("turns a bridge laid along the river so it crosses it", () => {
    // The river runs down columns 4–5; an old bridge ran down column 4 instead of across.
    const map = mapFrom([
      "T...~~TT",
      "T.P.=~TT",
      "T...=~TT",
      "T...~~TT",
    ]);
    const old = withState({ map, buildings: [{ ...at("tulay", 4, 1), span: [{ x: 4, y: 1 }, { x: 4, y: 2 }] }], villagers: 20 });
    const s = parseSave(v14(old), content)!;
    expect(s.version).toBe(STATE_VERSION);
    expect(s.buildings[0].span).toEqual([{ x: 4, y: 1 }, { x: 5, y: 1 }]);
    expect(tileAt(s.map, 4, 1)).toBe("bridge");
    expect(tileAt(s.map, 5, 1)).toBe("bridge");
    expect(tileAt(s.map, 4, 2)).toBe("river");
    expect(s.notices).toEqual([]);
  });

  it("leaves a bridge that already crosses as it is", () => {
    const map = mapFrom([
      "T...~~TT",
      "T.P.==TT",
      "T...~~TT",
    ]);
    const old = withState({ map, buildings: [{ ...at("tulay", 4, 1), span: [{ x: 4, y: 1 }, { x: 5, y: 1 }] }], villagers: 20 });
    const s = parseSave(v14(old), content)!;
    expect(s.buildings[0]).toMatchObject({ x: 4, y: 1, span: [{ x: 4, y: 1 }, { x: 5, y: 1 }] });
    expect(s.map.tiles).toBe(map.tiles);
  });

  it("works out old bridges saved without a span", () => {
    const map = mapFrom([
      "T...~~TT",
      "T.P.==TT",
      "T...~~TT",
    ]);
    const s = parseSave(v14(withState({ map, buildings: [at("tulay", 5, 1)], villagers: 20 })), content)!;
    expect(s.buildings[0].span).toEqual([{ x: 4, y: 1 }, { x: 5, y: 1 }]);
  });

  it("removes a bridge that can't cross, refunds it, and says so once", () => {
    // A river four wide: more than a Tulay can span.
    const map = mapFrom([
      "T.P===~TT",
      "T...~~~~T",
    ]);
    const old = withState({ map, buildings: [{ ...at("tulay", 3, 0), span: [{ x: 3, y: 0 }, { x: 4, y: 0 }, { x: 5, y: 0 }] }], villagers: 20, resources: { rice: 0, wood: 5 } });
    const s = parseSave(v14(old), content)!;
    expect(s.buildings).toEqual([]);
    expect([3, 4, 5].every((x) => tileAt(s.map, x, 0) === "river")).toBe(true);
    expect(s.resources.wood).toBe(5 + tulay.cost.wood!);
    expect(s.notices).toHaveLength(1);
    expect(s.notices[0]).toMatch(/taken down/);
    const dismissed = apply(s, calm, { type: "dismissNotice" });
    expect(dismissed.notices).toEqual([]);
    expect(apply(dismissed, calm, { type: "dismissNotice" })).toBe(dismissed);
    // Saved again, the notice doesn't come back.
    expect(parseSave(JSON.stringify(dismissed), content)!.notices).toEqual([]);
  });
});

describe("bridges, paths and boats", () => {
  it("walkers cross on the new bridge tiles", () => {
    const map = mapFrom([
      "T...~~TT",
      "T.P.~~..",
      "T...~~TT",
    ]);
    const s = apply(withState({ map, buildings: [], villagers: 20, resources: { rice: 100, wood: 500 } }), calm, { type: "build", building: "tulay", x: 5, y: 1 });
    expect(s.buildings[0].span).toEqual([{ x: 4, y: 1 }, { x: 5, y: 1 }]);
    const path = findPath(s.map, { x: 2, y: 1 }, { x: 7, y: 1 })!;
    expect(path.map((p) => tileAt(s.map, p.x, p.y))).not.toContain("river");
    expect(path.some((p) => tileAt(s.map, p.x, p.y) === "bridge")).toBe(true);
  });
});
