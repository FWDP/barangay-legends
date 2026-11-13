import { describe, expect, it } from "vitest";
import { apply, availableWorkers, build, newGame, owned, tick, type GameState } from "./game";
import {
  autoPlaceTile,
  bonusAt,
  bridgeDir,
  bridgeSpan,
  crossingAt,
  canPlace,
  clearBlocker,
  clearSeconds,
  countTiles,
  generateMap,
  isClearable,
  isUnlocked,
  NEIGHBOURS,
  tileAt,
  type MapState,
} from "./map";
import { at, calm, content, mapFrom, withState } from "./testUtils";

const def = (id: string) => content.buildings.find((b) => b.id === id)!;
const run = (s: GameState, seconds: number) => tick(s, calm, seconds);
const fed = { rice: 1000, wood: 0 };

describe("map generation", () => {
  const seeds = Array.from({ length: 40 }, (_, i) => i * 7919 + 1);
  const { width, height, startClearRadius: R, baleteTrees, baleteMinDistance } = content.rules.map;

  it("is the same for the same seed and different for another", () => {
    expect(generateMap(content, 42)).toEqual(generateMap(content, 42));
    expect(generateMap(content, 42).tiles).not.toBe(generateMap(content, 43).tiles);
  });

  it("is much larger than the screen", () => {
    const map = generateMap(content, 1);
    expect([map.width, map.height]).toEqual([width, height]);
    expect(map.tiles).toHaveLength(width * height);
  });

  it.each(seeds)("seed %i: a river winds from the top edge to the bottom edge", (seed) => {
    const map = generateMap(content, seed);
    const river = (x: number, y: number) => tileAt(map, x, y) === "river";
    // Flood-fill the river from the top row; it must reach the bottom row.
    const seen = new Set<string>();
    const queue: [number, number][] = [];
    for (let x = 0; x < width; x++) if (river(x, 0)) queue.push([x, 0]);
    while (queue.length) {
      const [x, y] = queue.pop()!;
      const key = `${x},${y}`;
      if (seen.has(key) || !river(x, y)) continue;
      seen.add(key);
      for (const [dx, dy] of NEIGHBOURS) queue.push([x + dx, y + dy]);
    }
    expect([...seen].some((k) => k.endsWith(`,${height - 1}`))).toBe(true);
  });

  it.each(seeds)("seed %i: forest grows on both banks", (seed) => {
    const map = generateMap(content, seed);
    for (let y = 0; y < height; y++) {
      const row = Array.from({ length: width }, (_, x) => tileAt(map, x, y));
      const first = row.indexOf("river");
      const last = row.lastIndexOf("river");
      expect(row.slice(0, first)).toContain("forest");
      expect(row.slice(last + 1)).toContain("forest");
    }
  });

  it.each(seeds)("seed %i: the start is a cleared 7 × 7 around the plaza, touching the river", (seed) => {
    const map = generateMap(content, seed);
    const { plaza } = map;
    let touchesRiver = false;
    for (let y = plaza.y - R; y <= plaza.y + R; y++) {
      for (let x = plaza.x - R; x <= plaza.x + R; x++) {
        expect(tileAt(map, x, y)).toBe("cleared");
        if (NEIGHBOURS.some(([dx, dy]) => tileAt(map, x + dx, y + dy) === "river")) touchesRiver = true;
      }
    }
    expect(touchesRiver).toBe(true);
    expect(countTiles(map, "cleared")).toBe((2 * R + 1) ** 2);
  });

  it.each(seeds)("seed %i: a few old balete trees grow in the forest, away from the plaza", (seed) => {
    const map = generateMap(content, seed);
    expect(countTiles(map, "balete")).toBe(baleteTrees);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (tileAt(map, x, y) !== "balete") continue;
        expect(Math.max(Math.abs(x - map.plaza.x), Math.abs(y - map.plaza.y))).toBeGreaterThanOrEqual(baleteMinDistance);
      }
    }
  });

  it("is what a new game starts on, with the starting house on cleared land by the plaza", () => {
    const s = newGame(content, 99);
    expect(s.map).toEqual(generateMap(content, 99));
    expect(tileAt(s.map, s.buildings[0].x, s.buildings[0].y)).toBe("cleared");
  });
});

describe("clearing land", () => {
  // Plaza at (3, 2); a balete at (3, 4).
  const small = mapFrom([
    "TTTTTTT",
    "T.....T",
    "T..P..T",
    "T.....T",
    "TTTBTTT",
  ]);
  const start = () => withState({ map: small, buildings: [], resources: { ...fed }, villagers: 5 });

  it("works on forest that shares an edge with cleared land", () => {
    expect(isClearable(small, 0, 2)).toBe(true);
    expect(isClearable(small, 0, 0)).toBe(false); // only touches cleared land at a corner
    expect(isClearable(small, 2, 2)).toBe(false); // already cleared
  });

  it("takes villagers' time, then turns the tile into cleared land and gives wood", () => {
    let s = apply(start(), calm, { type: "clear", x: 0, y: 2 });
    expect(s.clearing).toEqual([{ x: 0, y: 2, progress: 0, seconds: 6, paid: { rice: content.rules.clearing.cost.rice, wood: 0 } }]);
    // Buildings come first; clearing uses villagers who aren't working anywhere.
    expect(availableWorkers(s, calm)).toBe(5);
    s = run(s, 5);
    expect(tileAt(s.map, 0, 2)).toBe("forest");
    s = run(s, 1.5);
    expect(tileAt(s.map, 0, 2)).toBe("cleared");
    expect(s.resources.wood).toBe(content.rules.clearing.wood);
    expect(s.tilesCleared).toBe(1);
    expect(s.clearing).toEqual([]);
  });

  it("gets slower with every tile cleared", () => {
    const { baseSeconds, secondsGrowth } = content.rules.clearing;
    expect(clearSeconds(start(), content)).toBe(baseSeconds);
    expect(clearSeconds({ ...start(), tilesCleared: 10 }, content)).toBeCloseTo(baseSeconds * secondsGrowth ** 10);
    expect(clearSeconds({ ...start(), tilesCleared: 10 }, content)).toBeGreaterThan(baseSeconds);
  });

  it("queues more tiles, but never the same tile twice", () => {
    const s = apply(start(), calm, { type: "clear", x: 0, y: 2 });
    expect(apply(s, calm, { type: "clear", x: 6, y: 2 }).clearing).toHaveLength(2);
    expect(apply(s, calm, { type: "clear", x: 0, y: 2 })).toBe(s);
    expect(clearBlocker(s, content, 0, 2)).toBe("queued");
  });

  it.each([
    ["a tile away from cleared land", 0, 0, "not-adjacent"],
    ["cleared land", 2, 2, "not-forest"],
    ["off the map", 9, 9, "not-forest"],
  ] as const)("refuses %s", (_label, x, y, reason) => {
    const s = start();
    expect(apply(s, calm, { type: "clear", x, y })).toBe(s);
    expect(clearBlocker(s, content, x, y)).toBe(reason);
  });

  it("costs rice upfront, and waits for a free, healthy villager", () => {
    const broke = { ...start(), resources: { rice: 0, wood: 0 } };
    expect(clearBlocker(broke, content, 0, 2)).toBe("cost");
    expect(apply(broke, calm, { type: "clear", x: 0, y: 2 })).toBe(broke);
    // Everyone sick: the job is queued but nobody works on it.
    const allSick = { ...start(), villagers: 1, sick: [60] };
    const s = run(apply(allSick, calm, { type: "clear", x: 0, y: 2 }), 9); // before a newcomer arrives
    expect(s.clearing[0].progress).toBe(0);
  });

  it("pauses while the barangay is hungry", () => {
    let s = apply(start(), calm, { type: "clear", x: 0, y: 2 });
    s = run({ ...s, resources: { rice: 0, wood: 0 } }, 10);
    expect(s.clearing[0].progress).toBe(0);
    expect(tileAt(s.map, 0, 2)).toBe("forest");
  });

  it("only lets buildings go on cleared land", () => {
    let s = start();
    expect(canPlace(s, content, def("bahay-kubo"), 0, 2)).toBe(false);
    s = run(apply(s, calm, { type: "clear", x: 0, y: 2 }), 7);
    expect(canPlace(s, content, def("bahay-kubo"), 0, 2)).toBe(true);
    expect(canPlace(s, content, def("bahay-kubo"), 3, 2)).toBe(false); // the plaza
  });
});

describe("balete trees", () => {
  const map = mapFrom([
    "TTTTTTT",
    "T.....T",
    "T..P..T",
    "T.....T",
    "TTTBTTT",
  ]);
  const s = withState({ map, buildings: [], resources: { ...fed } });

  it("can only be felled with explicit confirmation", () => {
    expect(clearBlocker(s, content, 3, 4)).toBe("balete");
    expect(apply(s, calm, { type: "clear", x: 3, y: 4 })).toBe(s);
  });

  it("are gone for good once felled", () => {
    const felled = run(apply(s, calm, { type: "clear", x: 3, y: 4, confirmBalete: true }), 7);
    expect(tileAt(felled.map, 3, 4)).toBe("cleared");
    expect(countTiles(felled.map, "balete")).toBe(0);
    // Nothing turns cleared land back into a balete.
    expect(countTiles(run(felled, 600).map, "balete")).toBe(0);
  });
});

describe("Tulay (bridge)", () => {
  // Plaza at (2, 2). A river two tiles wide, forest on the far bank.
  const riverside = mapFrom([
    "TTTTTTTTT",
    "T...~~TTT",
    "T.P.~~TTT",
    "T...~~TTT",
    "TTTTTTTTT",
  ]);
  const tulay = def("tulay");
  const town = (villagers: number) =>
    withState({ map: riverside, buildings: [], villagers, resources: { rice: 1000, wood: 500 } });

  it("unlocks at 20 villagers", () => {
    expect(isUnlocked(town(19), tulay)).toBe(false);
    expect(isUnlocked(town(20), tulay)).toBe(true);
    expect(build(town(19), content, "tulay", 4, 2)).toEqual(town(19));
  });

  it("goes on a river tile next to cleared land, and spans to the far bank", () => {
    expect(bridgeSpan(riverside, tulay, 4, 2)).toEqual([
      { x: 4, y: 2 },
      { x: 5, y: 2 },
    ]);
    expect(canPlace(town(20), content, tulay, 4, 2)).toBe(true);
    // Any tile of the crossing gives the same bridge.
    expect(bridgeSpan(riverside, tulay, 5, 2)).toEqual(bridgeSpan(riverside, tulay, 4, 2));
    expect(canPlace(town(20), content, tulay, 2, 1)).toBe(false); // not on the river
  });

  it("a one-tile river gets a one-tile bridge, across the flow", () => {
    const down = mapFrom([
      "T.~TT",
      ".P~TT",
      "..~TT",
    ]);
    expect(crossingAt(down, tulay, 2, 1)).toEqual({ span: [{ x: 2, y: 1 }], dir: "h" });
    const across = mapFrom([
      "TTTTT",
      "~~~~~",
      "..P..",
    ]);
    expect(crossingAt(across, tulay, 2, 1)).toEqual({ span: [{ x: 2, y: 1 }], dir: "v" });
    expect(bridgeDir(across, [{ x: 2, y: 1 }])).toBe("v");
    expect(bridgeDir(down, [{ x: 2, y: 1 }])).toBe("h");
  });

  it("spans the river's full width, never along its length", () => {
    const wide = mapFrom([
      "T..~~~TT",
      "T.P~~~TT",
      "T..~~~TT",
    ]);
    for (const x of [3, 4, 5]) {
      expect(crossingAt(wide, tulay, x, 1)).toEqual({ span: [{ x: 3, y: 1 }, { x: 4, y: 1 }, { x: 5, y: 1 }], dir: "h" });
    }
    // At a bend the way across is still the short way, perpendicular to the flow.
    const bend = mapFrom([
      "..~TTT",
      "..~~~T",
      ".P..~T",
      "....~T",
    ]);
    const c = crossingAt(bend, tulay, 3, 1)!;
    expect(c.dir).toBe("v");
    expect(c.span).toEqual([{ x: 3, y: 1 }]);
  });

  it("rejects spots without land at both ends, or too wide, or cut off", () => {
    // Water beyond the river's end (a pond with no far bank in reach).
    expect(crossingAt(mapFrom(["P.~~~~", "..~~~~"]), tulay, 2, 0)).toBeNull();
    // Land on both ends, but both on the far side of the water from the barangay.
    expect(crossingAt(mapFrom(["P.~TT~T", "..~TT~T"]), tulay, 5, 0)).toBeNull();
    expect(crossingAt(riverside, tulay, 2, 2)).toBeNull(); // not river
    expect(crossingAt(riverside, def("palayan"), 4, 2)).toBeNull(); // not a bridge
  });

  it("can't cross a river wider than its span", () => {
    const wide = mapFrom(["T.P~~~~TT"]);
    expect(bridgeSpan(wide, tulay, 3, 0)).toBeNull();
  });

  it("opens the other bank for clearing", () => {
    const before = town(20);
    expect(isClearable(before.map, 6, 2)).toBe(false);
    const after = build(before, content, "tulay", 4, 2);
    expect(owned(after, "tulay")).toBe(1);
    expect(tileAt(after.map, 4, 2)).toBe("bridge");
    expect(tileAt(after.map, 5, 2)).toBe("bridge");
    expect(isClearable(after.map, 6, 2)).toBe(true);
    const cleared = run(apply(after, calm, { type: "clear", x: 6, y: 2 }), 7);
    expect(tileAt(cleared.map, 6, 2)).toBe("cleared");
    expect(canPlace(cleared, content, def("palayan"), 6, 2)).toBe(true);
  });

  it("costs what its JSON says", () => {
    const after = build(town(20), content, "tulay", 4, 2);
    expect(after.resources.wood).toBe(500 - (tulay.cost.wood ?? 0));
  });
});

describe("adjacency bonuses on the generated map", () => {
  const map = mapFrom([
    "TTTTTT",
    "~....T",
    "~.P..T",
    "~....T",
    "TTTTTT",
  ]);
  const s = withState({ map, buildings: [], resources: { ...fed } });

  it("gives a palayan +10% next to the river or another palayan", () => {
    expect(bonusAt(s, def("palayan"), 1, 2)).toBeCloseTo(0.1);
    expect(bonusAt(s, def("palayan"), 3, 2)).toBe(0);
    expect(bonusAt({ ...s, buildings: [at("palayan", 4, 2)] }, def("palayan"), 3, 2)).toBeCloseTo(0.1);
  });

  it("gives a woodcutter camp +10% on the current forest edge, which moves as land is cleared", () => {
    expect(bonusAt(s, def("woodcutter-camp"), 4, 2)).toBeCloseTo(0.1); // forest at (5, 2)
    expect(bonusAt(s, def("woodcutter-camp"), 3, 2)).toBe(0);
    let cleared = run(apply(s, calm, { type: "clear", x: 5, y: 2 }), 7);
    expect(bonusAt(cleared, def("woodcutter-camp"), 4, 2)).toBe(0); // no forest next to it any more
    cleared = { ...cleared, buildings: [] };
    expect(bonusAt(cleared, def("woodcutter-camp"), 5, 2)).toBeCloseTo(0.1); // the new edge
  });

  it("counts a balete as forest", () => {
    const withBalete = mapFrom(["TTT", ".PB", "..."]);
    expect(bonusAt(withState({ map: withBalete, buildings: [] }), def("woodcutter-camp"), 1, 2)).toBe(0);
    expect(bonusAt(withState({ map: withBalete, buildings: [] }), def("woodcutter-camp"), 2, 2)).toBeCloseTo(0.1);
  });
});

describe("auto-placement", () => {
  it("puts houses by the plaza and fields by the river", () => {
    const map: MapState = mapFrom(["~.....", "~..P..", "~....."]);
    const s = withState({ map, buildings: [] });
    expect(autoPlaceTile(s, content, def("bahay-kubo"))).toEqual({ x: 3, y: 0 });
    expect(autoPlaceTile(s, content, def("palayan"))).toEqual({ x: 1, y: 1 });
  });

  it("returns null when no cleared land is free", () => {
    const s = withState({ map: mapFrom(["TPT"]), buildings: [] });
    expect(autoPlaceTile(s, content, def("bahay-kubo"))).toBeNull();
  });
});
