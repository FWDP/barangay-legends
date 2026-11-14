import { describe, expect, it } from "vitest";
import { aklatProgress, checkAklat, unlockMet } from "./aklat";
import { forestCover, forestStage, recoveryPerSecond, updatePranks } from "./forest";
import { apply, buildingWorkers, rates, STATE_VERSION, tick, type GameState } from "./game";
import { tileAt } from "./map";
import { offlineProgress } from "./offline";
import { aiContent, createRegion } from "./region";
import { parseSave } from "./save";
import { at, calm, content, mapFrom, withState } from "./testUtils";

const f = content.rules.forest;
const p = content.rules.worship.permission;

// Plaza at (3, 2); forest all round, an old balete at (6, 0).
const woods = mapFrom([
  "TTTTTTB",
  "T.....T",
  "T..P..T",
  "T.....T",
  "TTTTTTT",
]);
const base = (patch: Partial<GameState> = {}) =>
  withState({ map: woods, villagers: 4, resources: { rice: 500, wood: 0, gold: 0 }, buildings: [at("bahay-kubo", 2, 2)], ...patch });
const clearTiles = (s: GameState, tiles: [number, number][]) => {
  const q = apply(s, calm, { type: "clearArea", tiles: tiles.map(([x, y]) => ({ x, y })) });
  return tick(q, calm, 60);
};

describe("Forest Balance", () => {
  it("starts at 100", () => {
    expect(base().forest).toEqual({ balance: 100, stage: 0, permission: 0, lastClearAt: null });
  });

  it("falls as forest is cleared, more near an old balete", () => {
    const far = clearTiles(base(), [[0, 2]]);
    expect(tileAt(far.map, 0, 2)).toBe("cleared");
    expect(far.forest.balance).toBeCloseTo(100 - f.perTile);
    const near = clearTiles(base(), [[5, 0]]);
    expect(near.forest.balance).toBeCloseTo(100 - f.perTileNearBalete);
  });

  it("recovers once the axes rest, faster with more forest and balete", () => {
    const s = base({ forest: { balance: 50, stage: 1, permission: 0, lastClearAt: 0 }, time: 0 });
    // Not while clearing is recent.
    expect(tick(s, calm, f.quietSeconds - 5).forest.balance).toBe(50);
    const rested = tick(s, calm, f.quietSeconds + 60);
    expect(rested.forest.balance).toBeGreaterThan(50);
    const bare = mapFrom(["......", "..P...", "......"]);
    expect(recoveryPerSecond(base(), content)).toBeGreaterThan(recoveryPerSecond(base({ map: bare }), content));
    expect(forestCover(woods).balete).toBe(1);
  });

  it("goes through stages: restless below 60, angry below 30", () => {
    expect(forestStage(content, 61)).toBe(0);
    expect(forestStage(content, 59)).toBe(1);
    expect(forestStage(content, 29)).toBe(2);
  });

  it("when angry, the diwata withhold 20% of the rice (and sickness is more likely)", () => {
    const fields = base({ villagers: 4, buildings: [at("bahay-kubo", 2, 2), at("palayan", 1, 1), at("palayan", 1, 3)] });
    const angry = { ...fields, forest: { ...fields.forest, balance: 20, stage: 2 as const } };
    expect(rates(angry, calm).produced.rice).toBeCloseTo(rates(fields, calm).produced.rice * (1 - f.riceWithheldPercent / 100));
    // Never offline.
    expect(rates(angry, calm, { offline: true }).produced.rice).toBeCloseTo(rates(fields, calm).produced.rice);
  });

  it("records the spirits' message once when a stage begins (online)", () => {
    const s = base({ tradition: "tagalog", forest: { balance: 60.2, stage: 0, permission: 0, lastClearAt: null } });
    const after = clearTiles(s, [[0, 2]]);
    expect(after.forest.stage).toBe(1);
    expect(after.history.filter((h) => h.kind === "spirits")).toEqual([expect.objectContaining({ stage: 1 })]);
    expect(after.flags).toContain("forest-spirits");
  });

  it("balete spirit pranks: below 60 a Woodcutter Camp's tools go missing for a minute", () => {
    const eager = { ...calm, rules: { ...calm.rules, forest: { ...f, prankChancePerSecond: 1 } } };
    const s = base({ villagers: 2, buildings: [at("bahay-kubo", 2, 2), at("woodcutter-camp", 4, 1)], forest: { balance: 50, stage: 1, permission: 0, lastClearAt: null } });
    expect(buildingWorkers(s, calm)).toEqual([0, 2]);
    const pranked = updatePranks(s, eager, 0, 1);
    expect(pranked.pranks).toEqual([{ x: 4, y: 1, until: 1 + f.prankSeconds }]);
    expect(buildingWorkers({ ...pranked, time: 1 }, calm)).toEqual([0, 0]);
    expect(buildingWorkers({ ...pranked, time: 1 + f.prankSeconds }, calm)).toEqual([0, 2]);
    // Never while the forest is calm.
    expect(updatePranks({ ...s, forest: { ...s.forest, balance: 90, stage: 0 } }, eager, 0, 10).pranks).toEqual([]);
  });
});

describe("asking permission (Humingi ng pahintulot)", () => {
  const shrine = (patch: Partial<GameState> = {}) =>
    base({ buildings: [at("bahay-kubo", 2, 2), at("babaylan-hut", 1, 1), at("dambana", 1, 2)], tradition: "tagalog", favor: 50, ...patch });

  it("costs Favor at the Dambana and halves the forest's loss for the next tiles", () => {
    const asked = apply(shrine(), calm, { type: "askPermission" });
    expect(asked.favor).toBe(50 - p.favorCost);
    expect(asked.forest.permission).toBe(p.tiles);
    const after = clearTiles(asked, [[0, 3]]);
    expect(after.forest.balance).toBeCloseTo(100 - f.perTile * p.balanceFactor);
    expect(after.forest.permission).toBe(p.tiles - 1);
    expect(after.stats.permittedClears).toBe(1);
  });

  it("needs Favor and a tradition, and can't be asked twice at once", () => {
    const poor = shrine({ favor: 0 });
    expect(apply(poor, calm, { type: "askPermission" })).toBe(poor);
    const asked = apply(shrine(), calm, { type: "askPermission" });
    expect(apply(asked, calm, { type: "askPermission" })).toBe(asked);
  });
});

describe("replanting (Magtanim)", () => {
  it("turns an empty cleared tile back into forest with one villager's work, raising the balance", () => {
    const s = base({ villagers: 2, forest: { balance: 50, stage: 1, permission: 0, lastClearAt: 0 } });
    const started = apply(s, calm, { type: "replant", x: 4, y: 3 });
    expect(started.resources.rice).toBe(500 - f.replant.cost.rice!);
    expect(started.replanting).toEqual([{ x: 4, y: 3, progress: 0, seconds: f.replant.seconds }]);
    // Nothing can be built or laid there meanwhile.
    expect(apply({ ...started, resources: { rice: 500, wood: 500, gold: 0 } }, calm, { type: "build", building: "palayan", x: 4, y: 3 }).buildings).toHaveLength(1);
    const grown = tick(started, calm, f.replant.seconds + 1);
    expect(tileAt(grown.map, 4, 3)).toBe("forest");
    expect(grown.replanting).toEqual([]);
    expect(grown.stats.replanted).toBe(1);
    expect(grown.forest.balance).toBeGreaterThanOrEqual(50 + f.replant.balance);
  });

  it("refuses the plaza, buildings, forest and tiles already growing", () => {
    const s = base();
    expect(apply(s, calm, { type: "replant", x: 3, y: 2 })).toBe(s);
    expect(apply(s, calm, { type: "replant", x: 2, y: 2 })).toBe(s);
    expect(apply(s, calm, { type: "replant", x: 0, y: 0 })).toBe(s);
    const once = apply(s, calm, { type: "replant", x: 4, y: 3 });
    expect(apply(once, calm, { type: "replant", x: 4, y: 3 })).toBe(once);
    // Cancelling gives the rice back.
    expect(apply(once, calm, { type: "cancelReplant", x: 4, y: 3 }).resources.rice).toBe(500);
  });

  it("waits while nobody is free", () => {
    // Five villagers, the houses full, and every one of them working.
    const busy = apply(base({ villagers: 5, buildings: [at("bahay-kubo", 2, 2), at("palayan", 1, 1), at("palayan", 1, 3), at("woodcutter-camp", 5, 1)] }), calm, {
      type: "replant",
      x: 4,
      y: 3,
    });
    expect(tick(busy, calm, 30).replanting[0].progress).toBe(0);
  });
});

describe("offline", () => {
  it("the forest recovers and replanting goes on, but the spirits don't react", () => {
    const s = base({ villagers: 2, tradition: "tagalog", forest: { balance: 40, stage: 1, permission: 0, lastClearAt: 0 } });
    const planted = apply(s, calm, { type: "replant", x: 4, y: 3 });
    const { state } = offlineProgress(planted, calm, 3600);
    expect(state.forest.balance).toBeGreaterThan(40);
    expect(tileAt(state.map, 4, 3)).toBe("forest");
    expect(state.pranks).toEqual([]);
    expect(state.history.filter((h) => h.kind === "spirits")).toEqual([]);
  });

  it("a stage reached offline brings no message", () => {
    // Clearing goes on offline and can lower the balance into a new stage.
    const q = apply(base({ forest: { balance: 61, stage: 0, permission: 0, lastClearAt: null } }), calm, {
      type: "clearArea",
      tiles: [{ x: 0, y: 1 }, { x: 0, y: 2 }, { x: 0, y: 3 }],
    });
    const { state } = offlineProgress(q, calm, 200);
    expect(state.forest.stage).toBe(1);
    expect(state.history.some((h) => h.kind === "spirits")).toBe(false);
  });
});

describe("AI barangays", () => {
  it("don't track Forest Balance", () => {
    const ai = aiContent(content);
    const s = base();
    const after = clearTiles({ ...s }, [[0, 2]]);
    expect(after.forest.balance).toBeLessThan(100);
    const q = apply(s, ai, { type: "clearArea", tiles: [{ x: 0, y: 2 }] });
    expect(tick(q, ai, 60).forest.balance).toBe(100);
  });
});

describe("Aklat ng Alamat", () => {
  it("has its entries in English and Filipino, with a hint and how each appears in the game", () => {
    expect(content.aklat.length).toBeGreaterThanOrEqual(12);
    for (const e of content.aklat) {
      for (const k of ["name", "lore", "inGame", "hint"] as const) {
        expect(e.aklat[k].en).not.toBe("");
        expect(e.aklat[k].fil).not.toBe("");
      }
    }
    const ids = content.aklat.map((e) => e.id);
    for (const id of ["anito-ng-balete", "diwata", "sarimanok", "bakunawa", "tikbalang", "babaylan", "sandugo", "mangayaw", "forest-spirits"]) expect(ids).toContain(id);
  });

  it("unlocks an entry the first time the barangay meets it, and keeps it", () => {
    const s = base({ aklat: [] });
    expect(checkAklat(s, content).aklat).not.toContain("babaylan");
    const hut = checkAklat({ ...s, buildings: [...s.buildings, at("babaylan-hut", 1, 1)] }, content);
    expect(hut.aklat).toContain("babaylan");
    expect(hut.history.filter((h) => h.kind === "aklat").map((h) => h.entry)).toContain("babaylan");
    // Taking the hut down doesn't lock it again.
    expect(checkAklat({ ...hut, buildings: s.buildings }, content).aklat).toContain("babaylan");
  });

  it("checks each kind of condition", () => {
    const s = base();
    expect(unlockMet(s, content, { type: "near", tile: "balete", radius: 2 })).toBe(true);
    expect(unlockMet(s, content, { type: "near", tile: "balete", radius: 1 })).toBe(false);
    expect(unlockMet({ ...s, flags: ["tikbalang"] }, content, { type: "flag", flag: "tikbalang" })).toBe(true);
    expect(unlockMet({ ...s, tradition: "tagalog" }, content, { type: "tradition", tradition: "tagalog" })).toBe(true);
    const region = createRegion(calm, 0, 7);
    expect(unlockMet({ ...s, region: { ...region, paths: ["sandugo"] } }, content, { type: "path", path: "sandugo" })).toBe(true);
    expect(unlockMet(s, content, { type: "any", of: [{ type: "flag", flag: "x" }, { type: "near", tile: "balete", radius: 2 }] })).toBe(true);
  });

  it("counts progress", () => {
    const p0 = aklatProgress(base({ aklat: ["anito-ng-balete", "balete", "not-an-entry"] }), content);
    expect(p0).toEqual({ found: 2, total: content.aklat.length });
  });

  it("is checked every step, and unlocks old saves' encounters after the v17 → v18 migration", () => {
    const s = base({ buildings: [at("bahay-kubo", 2, 2), at("babaylan-hut", 1, 1)], region: { ...createRegion(calm, 0, 7), paths: ["sandugo", "mangayaw"] } });
    const raw = { ...s, version: 17 } as Record<string, unknown>;
    for (const k of ["favor", "tradition", "lastRitualAt", "blessings", "sarimanok", "eclipse", "tikbalang", "pranks", "forest", "replanting", "aklat", "flags"]) delete raw[k];
    raw.stats = { raidsDefended: 1, rolls: 3, named: 0 };
    const loaded = parseSave(JSON.stringify(raw), content)!;
    expect(loaded.version).toBe(STATE_VERSION);
    expect(loaded.aklat).toEqual([]);
    expect(loaded.forest.balance).toBe(100);
    expect(loaded.favor).toBe(0);
    expect(loaded.stats).toMatchObject({ raidsDefended: 1, replanted: 0, permittedClears: 0 });
    const stepped = tick(loaded, calm, 1);
    expect(stepped.aklat).toEqual(expect.arrayContaining(["babaylan", "sandugo", "mangayaw", "balete"]));
  });

  it("round-trips the new state in saves", () => {
    const s = base({
      favor: 42,
      tradition: "visayan",
      lastRitualAt: 3,
      blessings: { "diwata-favor": { readyAt: 900 } },
      forest: { balance: 55.5, stage: 1, permission: 4, lastClearAt: 2 },
      replanting: [{ x: 4, y: 3, progress: 10, seconds: 60 }],
      aklat: ["anito-ng-balete", "babaylan"],
      flags: ["anito-ng-balete"],
      time: 10,
      buildings: [at("bahay-kubo", 2, 2), at("babaylan-hut", 1, 1), at("dambana", 1, 2)],
    });
    const back = parseSave(JSON.stringify(s), content)!;
    expect({ ...back, region: null }).toEqual(s);
  });
});
