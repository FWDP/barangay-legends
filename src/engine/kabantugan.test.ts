import { describe, expect, it } from "vitest";
import { datuLevelNeeded } from "./datu";
import { apply, STATE_VERSION, tick, type GameState } from "./game";
import { aiLevel, applyRenown, barangayLevel, levelForRenown, levelTitle, maxLevel, renownBetween, renownForLevel } from "./kabantugan";
import { closestLandings } from "./border";
import { offlineProgress } from "./offline";
import { createRegion, type NeighborState } from "./region";
import { parseSave, parseSnapshot } from "./save";
import { at, calm, content, withState } from "./testUtils";
import { generateVillage, raidPreview, villageKey, villagePlan, villageSnapshot } from "./village";
import { tileAt, NEIGHBOURS } from "./map";
import { unreachableWorkplaces, warriorCap } from "./game";
import { sameIsland } from "./archipelago";

const k = content.rules.kabantugan;
/** A barangay whose level rewards are live (the test helper turns them off). */
const live = (patch: Partial<GameState> = {}) => withState({ levelRewarded: 1, kabantugan: 0, ...patch });
const world = (patch: Partial<GameState> = {}): GameState => {
  const s = live({ resources: { rice: 5000, wood: 5000, gold: 500 }, villagers: 20, ...patch });
  return { ...s, region: createRegion(calm, 0, 7, s.barangay.id) };
};
const nb = (s: GameState, id: string) => s.region!.neighbors.find((n) => n.id === id)!;
const setNb = (s: GameState, id: string, patch: Partial<NeighborState>): GameState => ({
  ...s,
  region: { ...s.region!, neighbors: s.region!.neighbors.map((n) => (n.id === id ? { ...n, ...patch } : n)) },
});

describe("barangay level from Kabantugan", () => {
  it("rises through 20 levels on rising thresholds", () => {
    expect(maxLevel(content)).toBe(20);
    for (let i = 1; i < k.levelAt.length; i++) expect(k.levelAt[i] - k.levelAt[i - 1]).toBeGreaterThanOrEqual(k.levelAt[i - 1] - (k.levelAt[i - 2] ?? 0));
    expect(levelForRenown(content, 0)).toBe(1);
    expect(levelForRenown(content, k.levelAt[0] - 1)).toBe(1);
    expect(levelForRenown(content, k.levelAt[0])).toBe(2);
    expect(levelForRenown(content, 1e9)).toBe(20);
    expect(renownForLevel(content, 3)).toBe(k.levelAt[1]);
    expect(renownForLevel(content, 21)).toBeNull();
  });
});

describe("renown sources", () => {
  it("every 10 villagers, once", () => {
    const s = live({ villagers: 9 });
    const ten = { ...s, villagers: 10 };
    expect(renownBetween(s, ten, content)).toBe(k.perTenVillagers);
    const after = applyRenown(s, ten, content);
    expect(after.kabantugan).toBe(k.perTenVillagers);
    // Losing villagers and growing back to 10 earns nothing more.
    expect(applyRenown(after, { ...after, villagers: 10 }, content).kabantugan).toBe(k.perTenVillagers);
  });

  it("tasks, trades, the Bahay ng Datu and the Aklat", () => {
    const s = live({ gawainDone: [] });
    expect(renownBetween(s, { ...s, gawainDone: ["first-palayan"] }, content)).toBe(k.perTask);
    expect(renownBetween(s, { ...s, stats: { ...s.stats, trades: 2 } }, content)).toBe(2 * k.perTrade);
    expect(renownBetween(s, { ...s, datuLevel: 2 }, content)).toBe(k.perDatuLevel);
    expect(renownBetween(s, { ...s, aklat: ["kapre", "balete"] }, content)).toBe(2 * k.perAklat);
  });

  it("raids won attacking or defending, and a tributary or ally gained", () => {
    const s = world();
    const report = (id: number, kind: "raid" | "defense", win: boolean) => ({ id, time: 1, kind, neighbor: "malinaw", win });
    const won = { ...s, region: { ...s.region!, reports: [report(1, "raid", true), report(2, "defense", true), report(3, "raid", false)] } };
    expect(renownBetween(s, won, content)).toBe(k.perRaidWon + k.perDefenseWon);
    expect(renownBetween(s, setNb(s, "malinaw", { status: "tributary" }), content)).toBe(k.perTributary);
    expect(renownBetween(s, setNb(s, "malinaw", { status: "ally" }), content)).toBe(k.perAlly);
  });

  it("a real trade earns it, and renown is never lost", () => {
    let s = world();
    s = setNb(s, "pulang-lupa", { trust: 90, grudge: 0 });
    const traded = apply(s, calm, { type: "trade", neighbor: "pulang-lupa", give: "rice" });
    expect(traded.stats.trades).toBe(1);
    expect(traded.kabantugan).toBe(s.kabantugan + k.perTrade);
    // Hard times don't take it away.
    const hungry = tick({ ...traded, resources: { rice: 0, wood: 0, gold: 0 } }, calm, 120);
    expect(hungry.kabantugan).toBeGreaterThanOrEqual(traded.kabantugan);
  });

  it("each level reached pays its reward once, noted for the celebration", () => {
    const s = live({ villagers: 9 });
    const reached = applyRenown(s, { ...s, kabantugan: k.levelAt[0] }, content);
    expect(barangayLevel(reached, content)).toBe(2);
    expect(reached.levelRewarded).toBe(2);
    const reward = content.levels.find((l) => l.level === 2)!.reward.resources!;
    expect(reached.resources.rice).toBe(s.resources.rice + (reward.rice ?? 0));
    expect(reached.history.at(-1)).toMatchObject({ kind: "level", level: 2 });
    expect(applyRenown(reached, reached, content)).toBe(reached);
    // A title at level 5.
    const five = applyRenown(s, { ...s, kabantugan: k.levelAt[3] }, content);
    expect(levelTitle(five, content)?.en).toBe("Datu of Renown");
  });

  it("is credited for what is achieved while away", () => {
    const s = live({ villagers: 9, resources: { rice: 500, wood: 0, gold: 0 }, buildings: [at("palayan", 1, 1), at("bahay-kubo", 5, 3), at("bahay-kubo", 4, 3), at("bahay-kubo", 6, 3), at("bahay-kubo", 4, 5)] });
    const { state } = offlineProgress(s, calm, 600);
    expect(state.villagers).toBeGreaterThanOrEqual(10);
    expect(state.kabantugan).toBeGreaterThanOrEqual(k.perTenVillagers);
  });
});

describe("Bahay ng Datu upgrades need a barangay level", () => {
  it("level 2 needs barangay level 3; 3 → 6; 4 → 9; 5 → 12", () => {
    const mins = content.datuHouse!.datuHouse.levels.map((l) => l.minBarangayLevel ?? 1);
    expect(mins).toEqual([1, 3, 6, 9, 12]);
    const s = live({ resources: { rice: 9000, wood: 9000, gold: 9000 } });
    expect(datuLevelNeeded(s, content)).toBe(3);
    expect(apply(s, calm, { type: "upgradeDatu" })).toBe(s);
    const known = { ...s, kabantugan: k.levelAt[1] };
    expect(datuLevelNeeded(known, content)).toBeNull();
    expect(apply(known, calm, { type: "upgradeDatu" }).datuLevel).toBe(2);
  });

  it("existing saves keep the levels they already have", () => {
    const s = live({ datuLevel: 4, kabantugan: 0 });
    const back = parseSave(JSON.stringify(s), content)!;
    expect(back.datuLevel).toBe(4);
  });
});

describe("AI levels", () => {
  it("come from size and strength on the same thresholds, and change as they do", () => {
    const s = world();
    const n = nb(s, "batong-buhay");
    const lvl = aiLevel(content, n.state);
    expect(lvl).toBeGreaterThanOrEqual(1);
    expect(aiLevel(content, { ...n.state, villagers: 60, warriors: 30 })).toBeGreaterThan(lvl);
  });
});

describe("save migration v20 → v21", () => {
  it("works out renown from what the save had already achieved, without paying old rewards", () => {
    let s = world({ villagers: 25, datuLevel: 3, aklat: ["kapre", "balete"], gawainDone: ["first-palayan", "first-camp"] });
    s = setNb(s, "malinaw", { status: "tributary" });
    const raw = { ...s, version: 20, region: { ...s.region!, renown: 30, paths: ["trade"] }, stats: { ...s.stats } } as Record<string, unknown>;
    delete raw.kabantugan;
    delete raw.levelRewarded;
    delete (raw.stats as Record<string, unknown>).trades;
    delete (raw.stats as Record<string, unknown>).bestTens;
    const back = parseSave(JSON.stringify(raw), content)!;
    expect(back.version).toBe(STATE_VERSION);
    const expected = 2 * k.perTenVillagers + 2 * k.perTask + 30 + k.perTrade + k.perTributary + 2 * k.perDatuLevel + 2 * k.perAklat;
    expect(back.kabantugan).toBe(expected);
    expect(back.levelRewarded).toBe(levelForRenown(content, expected));
    expect(back.stats.bestTens).toBe(2);
    expect(back.resources).toEqual(s.resources);
  });
});

describe("generated villages for AI barangays", () => {
  const s = world();
  const pick = (trait: string) => {
    const def = content.neighbors.find((d) => d.trait === trait)!;
    return { def, n: nb(s, def.id) };
  };

  it("are the same for the same seed, size and strength", () => {
    const t = pick("trader");
    const def = t.def;
    // Sizes are bucketed, so start in the middle of a bucket.
    const n = { ...t.n, state: { ...t.n.state, villagers: 3 * Math.round(t.n.state.villagers / 3) } };
    expect(generateVillage(content, n, def, 0)).toEqual(generateVillage(content, n, def, 0));
    expect(villageSnapshot(content, n, def, 50)).toBe(villageSnapshot(content, n, def, 50));
    // A noticeable change makes a new one; a tiny one doesn't.
    const grown = { ...n, state: { ...n.state, villagers: n.state.villagers + 9 } };
    expect(villageKey(content, grown)).not.toBe(villageKey(content, n));
    expect(villageKey(content, { ...n, state: { ...n.state, villagers: n.state.villagers + 1 } })).toBe(villageKey(content, n));
  });

  it("follow the trait: traders more fields and docks, aggressive more Kuta", () => {
    const t = pick("trader");
    const a = pick("aggressive");
    const p = pick("peaceful");
    const tp = villagePlan(content, t.n, t.def, 5);
    const ap = villagePlan(content, a.n, a.def, 5);
    const pp = villagePlan(content, p.n, p.def, 5);
    expect(tp["fishing-dock"]).toBeGreaterThan(pp["fishing-dock"]);
    expect(tp["balangay-dock"]).toBe(1);
    expect(ap.kuta).toBeGreaterThan(pp.kuta);
  });

  it("follow the player's rules: a coast, docks by the water, warriors within the Kuta cap, a Bahay ng Datu and tradition", () => {
    for (const def of content.neighbors) {
      const n = nb(s, def.id);
      const v = generateVillage(content, n, def, 0);
      expect(v.map.tiles).toContain("s");
      for (const b of v.buildings.filter((x) => x.type.endsWith("dock"))) {
        expect(NEIGHBOURS.some(([dx, dy]) => ["river", "sea"].includes(tileAt(v.map, b.x + dx, b.y + dy) ?? ""))).toBe(true);
      }
      expect(v.warriors).toBeLessThanOrEqual(warriorCap(v, content));
      expect(v.warriors).toBeLessThanOrEqual(v.villagers);
      expect(unreachableWorkplaces(v, content)).toEqual([]);
      expect(v.tradition).toBe(n.tradition);
      expect(v.datuLevel).toBeGreaterThanOrEqual(1);
      expect(v.region).toBeNull();
      expect(closestLandings(v.map, 1).length).toBe(1);
    }
  });

  it("are a snapshot in the save format, read back like a player's barangay", () => {
    const { def, n } = pick("proud");
    const json = villageSnapshot(content, n, def, 123);
    const v = parseSnapshot(json, content)!;
    expect(v).not.toBeNull();
    expect(v.time).toBe(123);
    expect(v.region).toBeNull();
    expect(v.buildings.length).toBeGreaterThan(3);
    expect(v.tradition).toBe(n.tradition);
  });

  it("show the likely landing and the Kuta that cover it", () => {
    const { def, n } = pick("aggressive");
    const v = generateVillage(content, n, def, 0);
    const p = raidPreview(v, content);
    expect(p.landing).not.toBeNull();
    for (const k2 of p.covering) expect(v.buildings).toContain(k2);
  });
});

describe("visiting is read-only", () => {
  it("making and reading a snapshot changes neither the player nor the visited barangay", () => {
    const s = world();
    const before = JSON.stringify(s);
    for (const def of content.neighbors) {
      const n = nb(s, def.id);
      parseSnapshot(villageSnapshot(content, n, def, s.time), content);
      if (!sameIsland(s.region!.places, s.barangay.id, def.id)) continue;
    }
    expect(JSON.stringify(s)).toBe(before);
  });

  it("a snapshot of the player's own barangay reads back to the same village", () => {
    const s = live({ datuLevel: 2, tradition: "visayan" });
    const v = parseSnapshot(JSON.stringify(s), content)!;
    expect(v.map).toEqual(s.map);
    expect(v.buildings).toEqual(s.buildings);
    expect(v.datuLevel).toBe(2);
  });
});
