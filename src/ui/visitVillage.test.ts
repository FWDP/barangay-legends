import { describe, expect, it } from "vitest";
import { tick, type GameState, type PlacedBuilding } from "../engine/game";
import { createRegion, neighborDef, type NeighborState } from "../engine/region";
import { generateVillage, villageBuildingCount, villageLevel, villagePlan } from "../engine/village";
import { levelForRenown } from "../engine/kabantugan";
import { solidTiles } from "../engine/doors";
import { tileAt } from "../engine/map";
import { acquainted, calm, withState } from "../engine/testUtils";
import { goal, planVillagers } from "./villagers";

const built = (counts: Record<string, number>): PlacedBuilding[] => Object.entries(counts).flatMap(([type, k]) => Array.from({ length: k }, (_, i) => ({ type, x: i, y: 0 })));
const renownFor = (level: number) => (level <= 1 ? 0 : calm.rules.kabantugan.levelAt[level - 2]);

/** A world played for a while, so the AI barangays have grown. */
const grown = (() => {
  let s = withState({ resources: { rice: 2000, wood: 2000, gold: 0 }, villagers: 20, buildings: [] });
  s = { ...s, region: acquainted(createRegion(calm, 0, 3)) };
  return tick(s, calm, 1800);
})();

/** A big barangay: 48 buildings of its own at level 14. */
function bigTown(): { n: NeighborState; def: NonNullable<ReturnType<typeof neighborDef>> } {
  const n0 = grown.region!.neighbors[0];
  const counts = { "bahay-kubo": 26, palayan: 12, "woodcutter-camp": 6, kuta: 4 };
  const n = { ...n0, fame: { ...n0.fame, renown: renownFor(14) }, state: { ...n0.state, villagers: 55, warriors: 12, buildings: built(counts) } };
  return { n, def: neighborDef(calm, n.id)! };
}

describe("visited villages", () => {
  it("show every building the panel counts: their own and their level's civic ones", () => {
    for (const n of grown.region!.neighbors) {
      const def = neighborDef(calm, n.id)!;
      const v = generateVillage(calm, n, def, 0);
      const plan = villagePlan(calm, n, def, villageLevel(calm, n));
      expect(v.buildings.length).toBe(Object.values(plan).reduce((a, b) => a + b, 0));
      expect(villageBuildingCount(calm, n, def)).toBe(v.buildings.length);
      // Every building they really have is there.
      for (const b of n.state.buildings) expect(v.buildings.filter((x) => x.type === b.type).length).toBeGreaterThanOrEqual(n.state.buildings.filter((x) => x.type === b.type).length);
    }
    const { n, def } = bigTown();
    const v = generateVillage(calm, n, def, 0);
    expect(villageLevel(calm, n)).toBe(14);
    expect(v.buildings.filter((b) => b.type === "bahay-kubo")).toHaveLength(26);
    expect(v.buildings.length).toBeGreaterThanOrEqual(48);
    expect(villageBuildingCount(calm, n, def)).toBe(v.buildings.length);
  });

  it("are packed: cleared land mostly built on, Daan only joining buildings (no road grids)", () => {
    const { n, def } = bigTown();
    const v = generateVillage(calm, n, def, 0);
    const { width: W, height: H } = v.map;
    let open = 0;
    let daan = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const t = tileAt(v.map, x, y);
        if (t === "cleared" && !v.buildings.some((b) => b.x === x && b.y === y)) open++;
        if (t === "daan") daan++;
      }
    }
    const used = v.buildings.length + daan;
    expect(used / (used + open)).toBeGreaterThan(0.55);
    // No 2 × 2 block of Daan anywhere: paths, not paved squares.
    for (let y = 0; y < H - 1; y++) {
      for (let x = 0; x < W - 1; x++) {
        const all = [tileAt(v.map, x, y), tileAt(v.map, x + 1, y), tileAt(v.map, x, y + 1), tileAt(v.map, x + 1, y + 1)].every((t) => t === "daan");
        expect(all).toBe(false);
      }
    }
    // A little open space around the plaza.
    const p = v.map.plaza;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) expect(v.buildings.some((b) => b.x === p.x + dx && b.y === p.y + dy)).toBe(false);
  });

  it("grow with the level: a level-14 town clears more and builds more than a level-3 hamlet", () => {
    const { n, def } = bigTown();
    const town = generateVillage(calm, n, def, 0);
    const hamlet = generateVillage(calm, { ...n, fame: { ...n.fame, renown: renownFor(3) }, state: { ...n.state, villagers: 8, buildings: built({ "bahay-kubo": 3, palayan: 2, "woodcutter-camp": 1 }) } }, def, 0);
    const land = (s: GameState) => [...s.map.tiles].filter((c) => c === "c" || c === "d").length;
    // Both start from the same cleared square (7 × 7 and a row behind), so the hamlet already has some land.
    expect(land(town)).toBeGreaterThan(land(hamlet) * 1.8);
    expect(town.buildings.some((b) => b.type.endsWith("dock"))).toBe(true);
    expect(town.datuLevel).toBeGreaterThan(hamlet.datuLevel);
  });

  it("are the same for the same seed", () => {
    const { n, def } = bigTown();
    expect(generateVillage(calm, n, def, 0)).toEqual(generateVillage(calm, n, def, 0));
  });

  it("never put villagers on top of buildings, day or night; most work by day and are inside by night", () => {
    const { n, def } = bigTown();
    const v = generateVillage(calm, n, def, 0);
    const solid = solidTiles(v, calm);
    const plans = planVillagers(v, calm);
    expect(plans.length).toBeGreaterThan(20);
    const p = v.map.plaza;
    const nearPlaza = (q: { x: number; y: number }) => Math.abs(q.x - p.x - 0.5) <= 1.45 && Math.abs(q.y - p.y - 0.5) <= 1.45;
    for (const night of [false, true]) {
      let atPlaza = 0;
      let inside = 0;
      for (const t of [0, 25, 50, 75]) {
        for (const plan of plans) {
          const g = goal(plan, t, night, p, false);
          const x = Math.floor(g.p.x);
          const y = Math.floor(g.p.y);
          expect(solid[y * v.map.width + x]).toBe(0);
          if (nearPlaza(g.p)) atPlaza++;
          if (g.inside) inside++;
        }
      }
      const total = plans.length * 4;
      if (!night) {
        expect(plans.filter((x) => x.role === "work").length / plans.length).toBeGreaterThan(0.5);
        expect(atPlaza / total).toBeLessThan(0.35);
      } else expect(inside / total).toBeGreaterThan(0.6);
    }
  });

  it("are drawn at the level their renown gives, on the player's thresholds", () => {
    for (const n of grown.region!.neighbors) expect(villageLevel(calm, n)).toBe(levelForRenown(calm, n.fame.renown));
  });
});
