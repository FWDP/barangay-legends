import { describe, expect, it } from "vitest";
import { buildContent, type Content } from "./content";
import { apply, rates, tick } from "./game";
import { groveBonusAt, grovesNear, tileAt } from "./map";
import { at, calm, content, mapFrom, withState } from "./testUtils";

const def = (id: string) => content.buildings.find((b) => b.id === id)!;
const camp = def("woodcutter-camp");
const grove = content.groves[0];
const fed = { rice: 1000, wood: 0 };

// One balete at (5, 3); everything else cleared. Plaza tucked in a corner.
const meadow = mapFrom([
  "...........",
  "...........",
  "...........",
  ".....B.....",
  "...........",
  "...........",
  "P..........",
]);
const bonus = (x: number, y: number, map = meadow, c: Content = content) => groveBonusAt(map, c, c.buildings.find((b) => b.id === "woodcutter-camp")!, x, y, "wood");

describe("the Anito ng Balete's grove", () => {
  it("is defined in content: +25% wood for woodcutter camps within 3 tiles of a balete", () => {
    expect(grove).toMatchObject({ tile: "balete", radius: 3, affects: "woodcutter-camp", resource: "wood", percent: 25 });
    expect(grove.tradition).toBe("Tagalog and other lowland belief");
    expect(content.lore["anito-ng-balete"].tradition).toBe("Tagalog and other lowland belief");
  });

  it("reaches 3 tiles in a straight line, and no further", () => {
    expect(bonus(8, 3)).toBeCloseTo(0.25); // 3 tiles east
    expect(bonus(5, 6)).toBeCloseTo(0.25); // 3 tiles south
    expect(bonus(7, 5)).toBeCloseTo(0.25); // diagonal, about 2.8 tiles
    expect(bonus(9, 3)).toBe(0); // 4 tiles
    expect(bonus(8, 5)).toBe(0); // about 3.6 tiles
    expect(bonus(8, 4)).toBe(0); // about 3.2 tiles
  });

  it("only helps woodcutter camps, and only their wood", () => {
    expect(groveBonusAt(meadow, content, def("palayan"), 6, 3, "rice")).toBe(0);
    expect(groveBonusAt(meadow, content, def("bahay-kubo"), 6, 3, "wood")).toBe(0);
    expect(groveBonusAt(meadow, content, camp, 6, 3, "rice")).toBe(0);
  });

  it("doesn't stack when a camp is near several balete trees", () => {
    const twoTrees = mapFrom([
      "...........",
      "...B...B...",
      "P..........",
    ]);
    expect(grovesNear(twoTrees, grove, 5, 1)).toHaveLength(2);
    expect(bonus(5, 1, twoTrees)).toBeCloseTo(0.25);
    const s = withState({ map: twoTrees, buildings: [at("woodcutter-camp", 5, 1)], villagers: 2, resources: fed });
    expect(rates(s, calm).produced.wood).toBeCloseTo(0.8 * 1.25);
  });

  it("raises a camp's wood output by 25%", () => {
    const s = withState({ map: meadow, buildings: [at("woodcutter-camp", 8, 3)], villagers: 2, resources: fed });
    expect(rates(s, calm).produced.wood).toBeCloseTo(1.0); // 2 workers × 0.4 × 1.25
    const far = withState({ map: meadow, buildings: [at("woodcutter-camp", 10, 3)], villagers: 2, resources: fed });
    expect(rates(far, calm).produced.wood).toBeCloseTo(0.8);
  });

  it("adds to the forest-edge bonus for a camp right next to the balete", () => {
    // A balete counts as forest, so this camp gets +10% (forest edge) and +25% (grove).
    const s = withState({ map: meadow, buildings: [at("woodcutter-camp", 6, 3)], villagers: 2, resources: fed });
    expect(rates(s, calm).produced.wood).toBeCloseTo(0.8 * 1.35);
  });

  it("is lost for good when the balete is cleared", () => {
    // The balete sits on the forest edge, next to cleared land, so it can be felled.
    const edge = mapFrom([
      "TTTTTBTTTTT",
      "...........",
      "...........",
      "P..........",
    ]);
    let s = withState({ map: edge, buildings: [at("woodcutter-camp", 5, 3)], villagers: 4, resources: fed });
    expect(rates(s, calm).produced.wood).toBeCloseTo(0.8 * 1.25);
    s = apply(s, calm, { type: "clear", x: 5, y: 0, confirmBalete: true });
    s = tick(s, calm, 10);
    expect(tileAt(s.map, 5, 0)).toBe("cleared");
    expect(groveBonusAt(s.map, calm, camp, 5, 3, "wood")).toBe(0);
    expect(rates(s, calm).produced.wood).toBeCloseTo(0.8);
  });

  it("reads its numbers from content", () => {
    const tweaked: Content = { ...content, groves: [{ ...grove, radius: 5, percent: 50 }] };
    expect(bonus(10, 3, meadow, tweaked)).toBeCloseTo(0.5);
    expect(bonus(10, 3)).toBe(0);
  });

  it("rejects broken grove files", () => {
    const { rules, lore, events } = content;
    const files = Object.fromEntries(content.buildings.map((b) => [b.id, b]));
    const make = (g: object) => () => buildContent(files, rules, events as Record<string, unknown>, lore, { "g.json": g });
    expect(make({ ...grove, radius: 0 })).toThrow(/radius/);
    expect(make({ ...grove, affects: "castle" })).toThrow(/unknown building/);
    expect(make({ ...grove, sources: [] })).toThrow(/source/);
    expect(make({ ...grove, lore: "nobody" })).toThrow(/lore/);
  });
});

describe("balete lore", () => {
  it("names what clearing loses", () => {
    expect(content.lore.balete.clearWarning).toBe(
      "This removes the Anito ng Balete's grove: nearby woodcutters lose +{percent}% wood. This can't be undone.",
    );
  });
});
