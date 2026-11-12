import { describe, expect, it } from "vitest";
import { loadContent } from "../engine/content";
import { newGame, type GameState, type PlacedBuilding } from "../engine/game";
import { fillView, layoutMap } from "./mapLayout";

const content = loadContent();
const at = (type: string, x: number, y: number): PlacedBuilding => ({ type, x, y });
const withBuildings = (buildings: PlacedBuilding[]): GameState => ({ ...newGame(content), buildings });
const cellAt = (cells: { key: string }[], x: number, y: number) => cells.find((c) => c.key === `${y}:${x}`);

describe("map layout", () => {
  it("draws buildings exactly where they were placed", () => {
    const layout = layoutMap(withBuildings([at("palayan", 1, 2), at("bahay-kubo", 4, -1)]), content);
    expect(layout.cols).toBe(11);
    expect(layout.rows).toBe(7);
    const field = layout.cells.find((c) => c.building?.def.id === "palayan")!;
    expect([field.x, field.y]).toEqual([1, 2]);
    expect(field.building!.bonus).toBeCloseTo(0.1); // next to the river
    expect(layout.cells.find((c) => c.building?.def.id === "bahay-kubo")!.building!.bonus).toBe(0);
  });

  it("shows the river on the left, forest on the right, and the plaza in the middle", () => {
    const { cells } = layoutMap(newGame(content), content);
    expect(cellAt(cells, 0, 0)!).toMatchObject({ ground: "river" });
    expect(cellAt(cells, 9, 0)!).toMatchObject({ ground: "forest" });
    expect(cellAt(cells, 5, 0)!).toMatchObject({ ground: "land", plaza: true });
  });

  it("never puts trees on buildable land", () => {
    const { cells } = layoutMap(newGame(content), content);
    for (const c of cells.filter((c) => c.ground === "land")) expect(["tree", "palm"]).not.toContain(c.decor);
  });

  it("is deterministic", () => {
    const s = withBuildings([at("palayan", 1, 2), at("woodcutter-camp", 8, 0)]);
    expect(layoutMap(s, content)).toEqual(layoutMap(structuredClone(s), content));
  });

  it("grows with the map and keeps cells in place", () => {
    const small = layoutMap(withBuildings([at("palayan", 2, 1)]), content);
    const big = layoutMap(withBuildings([at("palayan", 2, 1), at("palayan", 2, 3)]), content);
    expect(big.rows).toBe(9);
    for (const c of small.cells) {
      if (c.building) expect(cellAt(big.cells, c.x, c.y)).toMatchObject({ building: { key: c.building.key } });
    }
  });
});

describe("filling the screen", () => {
  it("surrounds the map with wild land and forest without moving it", () => {
    const layout = layoutMap(withBuildings([at("palayan", 1, 2)]), content);
    const view = fillView(layout, content, 375, 600);
    expect(view.tile).toBe(34); // 375 / 11 columns
    expect(view.cols * view.tile).toBeGreaterThanOrEqual(375);
    expect(view.rows * view.tile).toBeGreaterThanOrEqual(600);
    for (const cell of layout.cells) expect(cellAt(view.cells, cell.x, cell.y)).toBe(cell);
    // Rows beyond the map: the river and forest run on; the land is wild (not buildable yet).
    expect(cellAt(view.cells, 0, 6)).toMatchObject({ ground: "river" });
    expect(cellAt(view.cells, 9, 6)).toMatchObject({ ground: "forest" });
    expect(cellAt(view.cells, 3, 6)).toMatchObject({ ground: "wild", building: null });
  });

  it("caps the tile size on large screens", () => {
    const view = fillView(layoutMap(newGame(content), content), content, 1280, 700, 56);
    expect(view.tile).toBe(56);
    expect(view.cells.some((c) => c.x < 0 && c.ground === "wild")).toBe(true);
    expect(view.cells.some((c) => c.x > 10 && c.ground === "forest")).toBe(true);
  });

  it("keeps room at the top for banners and still covers the whole area", () => {
    const layout = layoutMap(newGame(content), content);
    const view = fillView(layout, content, 1280, 575, 64, 64);
    expect(view.tile * layout.rows).toBeLessThanOrEqual(575 - 64);
    // Shifted down by 32px, the grid must still reach the top and bottom edges.
    expect(view.rows * view.tile).toBeGreaterThanOrEqual(575 + 64);
  });

  it("gives the border the same scenery every time", () => {
    const layout = layoutMap(newGame(content), content);
    expect(fillView(layout, content, 900, 500)).toEqual(fillView(layout, content, 900, 500));
  });
});
