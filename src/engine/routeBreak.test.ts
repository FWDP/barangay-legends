import { describe, expect, it } from "vitest";
import { roadBonuses, unreachableWorkplaces } from "./game";
import { routeBreak } from "./routeBreak";
import { at, content, mapFrom, withState } from "./testUtils";

describe("a Daan and a Tulay", () => {
  it("a Daan touching a Tulay's end is connected: workers cross, and a building on the far Daan is Connected", () => {
    const map = mapFrom([
      "TTTTT~~TTTT",
      "...#==##...",
      "..P#~~.....",
      "....~~.....",
    ]);
    const s = withState({ map, buildings: [at("tulay", 4, 1), at("palayan", 7, 2)] });
    expect(unreachableWorkplaces(s, content)).toEqual([]);
    expect(routeBreak(s, content, s.buildings[1])).toBeNull();
    // Beside the far Daan (7, 1): Connected, through the bridge.
    expect(roadBonuses(s, content)[1]).toBeGreaterThan(0);
  });
});

describe("where the route breaks", () => {
  it("a gap of forest between the Tulay's end and the building is found and marked", () => {
    const map = mapFrom([
      "TTTTT~~TTTT",
      "...#==#T...",
      "..P#~~TT...",
      "....~~TTT..",
    ]);
    const s = withState({ map, buildings: [at("tulay", 4, 1), at("palayan", 9, 2)] });
    expect(unreachableWorkplaces(s, content).map((b) => b.type)).toEqual(["palayan"]);
    const br = routeBreak(s, content, s.buildings[1])!;
    // The route stops at the Daan at the bridge's far end; the forest tile beside it is in the way.
    expect(br).toEqual({ at: { x: 7, y: 1 }, from: { x: 6, y: 1 }, kind: "forest" });
  });

  it("no Tulay: the river is the break, at the nearest crossing", () => {
    const map = mapFrom([
      ".....~~....",
      "..P..~~....",
      ".....~~....",
    ]);
    const s = withState({ map, buildings: [at("palayan", 8, 1)] });
    const br = routeBreak(s, content, s.buildings[0])!;
    expect(br.kind).toBe("river");
    expect(br.from.x).toBe(4);
    expect(br.at.x).toBe(5);
  });

  it("a building standing in the way", () => {
    const map = mapFrom([
      "TTTTTTTTTTT",
      "..P....TTTT",
      "TTTTT~.~TTT",
      "TTTTT~.~TTT",
    ]);
    // The only way to (6, 3) runs down column 6, blocked by a house at (6, 2).
    const s = withState({ map, buildings: [at("bahay-kubo", 6, 2), at("palayan", 6, 3)] });
    const br = routeBreak(s, content, s.buildings[1])!;
    expect(br.at).toEqual({ x: 6, y: 2 });
    expect(br.kind).toBe("building");
  });

  it("a reachable building has no break", () => {
    const s = withState({ buildings: [at("palayan", 3, 3)] });
    expect(routeBreak(s, content, s.buildings[0])).toBeNull();
  });
});
