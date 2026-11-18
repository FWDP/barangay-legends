import { describe, expect, it } from "vitest";
import { datuLevelNeeded } from "./datu";
import { apply, STATE_VERSION, tick, type GameState } from "./game";
import { applyRenown, barangayLevel, levelForRenown, levelTitle, maxLevel, rampedRenown, rampedTotal, renownBetween, renownForLevel } from "./kabantugan";
import { closestLandings } from "./border";
import { offlineProgress } from "./offline";
import { createRegion, type NeighborState } from "./region";
import { parseSave, parseSnapshot } from "./save";
import { at, calm, content, withState } from "./testUtils";
import { generateVillage, raidPreview, villageKey, villageLevel, villagePlan, villageSnapshot } from "./village";
import { tileAt, NEIGHBOURS } from "./map";
import { unreachableWorkplaces, warriorCap } from "./game";
import { sameIsland } from "./archipelago";
import { dailyCap, earnRenown, renownLeftToday } from "./renown";
import { holdPista } from "./food";
import { validateRules } from "./content";
import rulesJson from "../../content/rules.json";

const k = content.rules.kabantugan;
/** A barangay whose level rewards are live (the test helper turns them off). */
const live = (patch: Partial<GameState> = {}) => withState({ levelRewarded: 1, kabantugan: 0, ...patch });
const world = (patch: Partial<GameState> = {}): GameState => {
  const s = live({ resources: { rice: 5000, wood: 5000, gold: 500, food: 5000, salt: 0, wine: 0 }, villagers: 20, ...patch });
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
    for (let i = 1; i < k.levelAt.length; i++) expect(k.levelAt[i]).toBeGreaterThan(k.levelAt[i - 1]);
    // Each level clearly harder than the last: every step larger than the one before.
    for (let i = 1; i < k.levelAt.length; i++) expect(k.levelAt[i] - k.levelAt[i - 1]).toBeGreaterThan(i === 1 ? k.levelAt[0] : k.levelAt[i - 1] - k.levelAt[i - 2]);
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
    expect(renownBetween(s, { ...s, gawainDone: ["first-palayan"] }, content)).toBe(rampedRenown(k.taskRamp, k.perTask, 0));
    expect(renownBetween(s, { ...s, stats: { ...s.stats, trades: 2 } }, content)).toBe(2 * k.perTrade);
    expect(renownBetween(s, { ...s, datuLevel: 2 }, content)).toBe(k.perDatuLevel);
    expect(renownBetween(s, { ...s, aklat: ["anito-ng-balete", "balete"] }, content)).toBe(rampedTotal(k.aklatRamp, k.perAklat, 0, 2));
  });

  it("the first tasks and Aklat entries give little, later ones the full amount", () => {
    expect(rampedRenown(k.taskRamp, k.perTask, 0)).toBeLessThan(k.perTask / 3);
    expect(rampedRenown(k.aklatRamp, k.perAklat, 0)).toBeLessThan(k.perAklat);
    expect(rampedRenown(k.taskRamp, k.perTask, 1000)).toBe(k.perTask);
    expect(rampedRenown(k.aklatRamp, k.perAklat, 1000)).toBe(k.perAklat);
    // Small amounts: fractions add up, so ten early Aklat entries give a little, not nothing.
    expect(rampedTotal(k.aklatRamp, k.perAklat, 0, 10)).toBeGreaterThan(0);
    expect(rampedTotal(k.aklatRamp, k.perAklat, 0, 10)).toBeLessThan(10);
    // Each ten give at least as much as the ten before, and the totals add up exactly.
    for (let n = 10; n < 60; n += 10) expect(rampedTotal(k.taskRamp, k.perTask, n, n + 10)).toBeGreaterThanOrEqual(rampedTotal(k.taskRamp, k.perTask, n - 10, n));
    expect(rampedTotal(k.taskRamp, k.perTask, 0, 7) + rampedTotal(k.taskRamp, k.perTask, 7, 30)).toBe(rampedTotal(k.taskRamp, k.perTask, 0, 30));
    // The fifth task counts as the fifth, whatever came before it in the same step.
    const four = live({ gawainDone: ["a", "b", "c", "d"] });
    expect(renownBetween(four, { ...four, gawainDone: [...four.gawainDone, "e"] }, content)).toBe(rampedRenown(k.taskRamp, k.perTask, 4));
    // The first five tasks and five Aklat entries can't reach level 3 by themselves.
    expect(rampedTotal(k.taskRamp, k.perTask, 0, 5) + rampedTotal(k.aklatRamp, k.perAklat, 0, 5)).toBeLessThan(k.levelAt[1]);
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
    // High enough that one trade is within the day's cap.
    let s = world({ kabantugan: k.levelAt[8] });
    s = setNb(s, "pulang-lupa", { trust: 90, grudge: 0 });
    const traded = apply(s, calm, { type: "trade", neighbor: "pulang-lupa", give: "rice" });
    expect(traded.stats.trades).toBe(1);
    expect(traded.kabantugan).toBe(s.kabantugan + k.perTrade);
    // Hard times don't take it away.
    const hungry = tick({ ...traded, resources: { rice: 0, wood: 0, gold: 0, food: 0, salt: 0, wine: 0 } }, calm, 120);
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
    const s = live({ villagers: 9, resources: { rice: 500, wood: 0, gold: 0, food: 500, salt: 0, wine: 0 }, buildings: [at("palayan", 1, 1), at("bahay-kubo", 5, 3), at("bahay-kubo", 4, 3), at("bahay-kubo", 6, 3), at("bahay-kubo", 4, 5)] });
    const { state } = offlineProgress(s, calm, 600);
    expect(state.villagers).toBeGreaterThanOrEqual(10);
    expect(state.kabantugan).toBeGreaterThanOrEqual(k.perTenVillagers);
  });
});

describe("daily caps on repeatable renown", () => {
  const caps = k.dailyCaps;
  // At the top level, so the renown earned here doesn't change the level (and so the caps).
  const TOP = maxLevel(content);
  const top = () => live({ kabantugan: k.levelAt.at(-1)! });
  const cap = (c: keyof typeof caps.perLevel) => caps.perLevel[c] * TOP;

  it("trades, feasts and fighting give at most their cap per renown day, then again the next day", () => {
    const start = top();
    let s = start;
    for (let i = 0; i < 1000; i++) s = earnRenown(s, content, "trades", k.perTrade);
    expect(s.kabantugan - start.kabantugan).toBe(cap("trades"));
    expect(renownLeftToday(s, content, "trades")).toBe(0);
    // Raids, defenses, honor and ally calls share the war cap.
    for (const src of ["raids", "defenses", "honor", "allyCalls"] as const) for (let i = 0; i < 100; i++) s = earnRenown(s, content, src, 10);
    expect(s.kabantugan - start.kabantugan).toBe(cap("trades") + cap("war"));
    for (let i = 0; i < 100; i++) s = earnRenown(s, content, "pista", 10);
    expect(s.kabantugan - start.kabantugan).toBe(cap("trades") + cap("war") + cap("pista"));
    // Nothing more today...
    expect(earnRenown(s, content, "raids", 10)).toBe(s);
    // ...and the full cap again the next renown day.
    const tomorrow = { ...s, time: s.foundedAt + caps.windowSeconds };
    expect(earnRenown(tomorrow, content, "trades", 1e6).kabantugan).toBe(s.kabantugan + cap("trades"));
    expect(s.renownTally.total).toMatchObject({ trades: cap("trades"), pista: cap("pista") });
  });

  it("the caps grow with the barangay level", () => {
    expect(dailyCap(live(), content, "war")).toBe(caps.perLevel.war);
    expect(dailyCap(live({ kabantugan: k.levelAt[8] }), content, "war")).toBe(10 * caps.perLevel.war);
  });

  it("a tributary or ally gives renown once: won back after a rebellion, none again", () => {
    const s = world();
    const won = applyRenown(s, setNb(s, "malinaw", { status: "tributary" }), content);
    expect(won.kabantugan).toBe(s.kabantugan + k.perTributary);
    const rebelled = applyRenown(won, setNb(won, "malinaw", { status: "independent" }), content);
    const again = applyRenown(rebelled, setNb(rebelled, "malinaw", { status: "tributary" }), content);
    expect(again.kabantugan).toBe(won.kabantugan);
    // Becoming an ally is a separate achievement, also once.
    const ally = applyRenown(again, setNb(again, "malinaw", { status: "ally" }), content);
    expect(ally.kabantugan).toBe(won.kabantugan + k.perAlly);
  });

  it("once-only achievements are never capped", () => {
    let s = live();
    for (let i = 0; i < 50; i++) s = earnRenown(s, content, "tributaries", k.perTributary);
    expect(s.kabantugan).toBe(50 * k.perTributary);
    expect(renownLeftToday(s, content, "aklat")).toBe(Infinity);
  });

  it("applies to trades counted between steps and to feasts", () => {
    const s = top();
    const traded = applyRenown(s, { ...s, stats: { ...s.stats, trades: 1000 } }, content);
    expect(traded.kabantugan - s.kabantugan).toBe(cap("trades"));
    let f = live({ kabantugan: k.levelAt.at(-1)!, resources: { rice: 9000, wood: 0, gold: 0, food: 9000, salt: 0, wine: 900 }, datuLevel: 2 });
    let renown = 0;
    for (let i = 0; i < 10; i++) {
      const next = holdPista({ ...f, lastPistaAt: null }, content, "harvest");
      if (next === f) break;
      renown = next.kabantugan;
      f = next;
    }
    expect(f.stats.pistas).toBeGreaterThan(1);
    expect(renown - k.levelAt.at(-1)!).toBeLessThanOrEqual(cap("pista"));
  });

  it("level thresholds must rise by more each level (the rules are checked)", () => {
    const rules = JSON.parse(JSON.stringify(rulesJson));
    expect(() => validateRules(rules)).not.toThrow();
    rules.kabantugan.levelAt = [10, 20, 30];
    expect(() => validateRules(rules)).toThrow(/each step larger/);
  });
});

describe("save migration v38 → v39 (the renown curve retuned)", () => {
  it("an existing save keeps its level; the next one takes the new thresholds", () => {
    const s = world({ kabantugan: 300, levelRewarded: 10 });
    const raw = { ...s, version: 38 } as Record<string, unknown>;
    delete raw.renownTally;
    const back = parseSave(JSON.stringify(raw), content)!;
    expect(back.version).toBe(STATE_VERSION);
    expect(barangayLevel(back, content)).toBe(10);
    expect(back.levelRewarded).toBe(10);
    expect(back.kabantugan).toBe(Math.max(300, renownForLevel(content, 10)!));
    expect(renownForLevel(content, 11)).toBe(k.levelAt[9]);
    expect(back.renownTally).toEqual({ day: 0, today: {}, total: {}, tributaries: [], allies: [] });
    // Tributaries and allies the save already had gave their renown: none again.
    const vassal = setNb(s, "malinaw", { status: "tributary" });
    const v = parseSave(JSON.stringify({ ...vassal, version: 38, renownTally: undefined }), content)!;
    expect(v.renownTally.tributaries).toEqual(["malinaw"]);
    // A save already past its level's new threshold keeps its renown.
    const rich = parseSave(JSON.stringify({ ...raw, kabantugan: 1e6, levelRewarded: 3 }), content)!;
    expect(rich.kabantugan).toBe(1e6);
    // A level is never lost: barangay level 1 saves stay at 0 renown.
    expect(parseSave(JSON.stringify({ ...raw, kabantugan: 0, levelRewarded: 1 }), content)!.kabantugan).toBe(0);
  });

  it("AI barangays' renown is worked out again on the new scale, keeping raids defended", () => {
    const s = world();
    const n = s.region!.neighbors[0];
    const old = setNb(s, n.id, { fame: { ...n.fame, renown: 7, peak: 7, defended: 3 } });
    const back = parseSave(JSON.stringify({ ...old, version: 38 }), content)!;
    const f = back.region!.neighbors.find((x) => x.id === n.id)!.fame;
    expect(f.defended).toBe(3);
    expect(f.renown).toBe(n.fame.renown);
  });
});

describe("Bahay ng Datu upgrades need a barangay level", () => {
  it("level 2 needs barangay level 3; 3 → 6; 4 → 9; 5 → 12", () => {
    const mins = content.datuHouse!.datuHouse.levels.map((l) => l.minBarangayLevel ?? 1);
    expect(mins).toEqual([1, 3, 6, 9, 12]);
    const s = live({ resources: { rice: 9000, wood: 9000, gold: 9000, food: 9000, salt: 0, wine: 0 } });
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
  it("come from their tracked renown on the player's thresholds, not from size", () => {
    const s = world();
    const n = nb(s, "batong-buhay");
    for (const renown of [0, 50, 400, 5000, 100000]) {
      const at = { ...n, fame: { ...n.fame, renown } };
      expect(villageLevel(content, at)).toBe(levelForRenown(content, renown));
      // The player with the same renown is the same level.
      expect(barangayLevel({ ...s, kabantugan: renown }, content)).toBe(levelForRenown(content, renown));
    }
    // A bigger barangay with the same renown is the same level.
    const big = { ...n, state: { ...n.state, villagers: 200, warriors: 60 } };
    expect(villageLevel(content, big)).toBe(villageLevel(content, n));
  });
});

describe("save migration v20 → v21", () => {
  it("works out renown from what the save had already achieved, without paying old rewards", () => {
    let s = world({ villagers: 25, datuLevel: 3, aklat: ["anito-ng-balete", "balete"], gawainDone: ["first-palayan", "first-camp"] });
    s = setNb(s, "malinaw", { status: "tributary" });
    const raw = { ...s, version: 20, region: { ...s.region!, renown: 30, paths: ["trade"] }, stats: { ...s.stats } } as Record<string, unknown>;
    delete raw.kabantugan;
    delete raw.levelRewarded;
    delete (raw.stats as Record<string, unknown>).trades;
    delete (raw.stats as Record<string, unknown>).bestTens;
    const back = parseSave(JSON.stringify(raw), content)!;
    expect(back.version).toBe(STATE_VERSION);
    const expected =
      2 * k.perTenVillagers + rampedTotal(k.taskRamp, k.perTask, 0, 2) + 30 + k.perTrade + k.perTributary + 2 * k.perDatuLevel + rampedTotal(k.aklatRamp, k.perAklat, 0, 2);
    expect(back.kabantugan).toBe(expected);
    expect(back.levelRewarded).toBe(levelForRenown(content, expected));
    expect(back.stats.bestTens).toBe(2);
    // The v34 food migration splits the old rice into Pagkain and Palay.
    const share = Math.floor((s.resources.rice * content.rules.food.migration.foodSharePercent) / 100);
    expect(back.resources).toEqual({ ...s.resources, rice: s.resources.rice - share, food: share });
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
    const n = t.n;
    expect(generateVillage(content, n, def, 0)).toEqual(generateVillage(content, n, def, 0));
    expect(villageSnapshot(content, n, def, 50)).toBe(villageSnapshot(content, n, def, 50));
    // Any change to their people or buildings makes a new one; their goods don't.
    expect(villageKey(content, { ...n, state: { ...n.state, villagers: n.state.villagers + 1 } })).not.toBe(villageKey(content, n));
    expect(villageKey(content, { ...n, state: { ...n.state, buildings: [...n.state.buildings, { type: "palayan", x: 0, y: 0 }] } })).not.toBe(villageKey(content, n));
    expect(villageKey(content, { ...n, state: { ...n.state, resources: { rice: 1, wood: 2, gold: 3, food: 1, salt: 0, wine: 0 } } })).toBe(villageKey(content, n));
  });

  it("follow the trait: traders more fields and docks, aggressive more Kuta", () => {
    const t = pick("trader");
    const a = pick("aggressive");
    const p = pick("peaceful");
    const tp = villagePlan(content, t.n, t.def, 8);
    const ap = villagePlan(content, a.n, a.def, 8);
    const pp = villagePlan(content, p.n, p.def, 8);
    expect(tp["fishing-dock"]).toBeGreaterThan(pp["fishing-dock"]);
    expect(tp["balangay-dock"]).toBe(1);
    // Kuta are only the ones they really built (the battle counts those).
    expect(ap.kuta ?? 0).toBe(a.n.state.buildings.filter((b) => b.type === "kuta").length);
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

  it("show the likely landing and the Bantayan that watch it; Bantayan at the shore, Kuta near the datu's house", () => {
    const { def, n } = pick("aggressive");
    const v = generateVillage(content, n, def, 0);
    const p = raidPreview(v, content, 1);
    expect(p.landing).not.toBeNull();
    for (const t of p.watching) expect(v.buildings.some((b) => b.type === "bantayan" && b.x === t.x && b.y === t.y)).toBe(true);
    const plaza = v.map.plaza;
    const kutas = v.buildings.filter((b) => b.type === "kuta");
    const towers = v.buildings.filter((b) => b.type === "bantayan");
    if (kutas.length) {
      expect(towers.length).toBeGreaterThan(0);
      // Kutas stand nearer the Bahay ng Datu than the Bantayan do.
      const avg = (list: { x: number; y: number }[]) => list.reduce((sum, b) => sum + Math.hypot(b.x - plaza.x, b.y - plaza.y), 0) / list.length;
      expect(avg(kutas)).toBeLessThan(avg(towers));
    }
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
