import { describe, expect, it } from "vitest";
import { loadContent } from "./content";
import { isNightAt } from "./daynight";
import { apply, healthyWorkers, rates, tick, type GameState } from "./game";
import { happinessTarget } from "./happiness";
import { canPlace } from "./map";
import { offlineProgress } from "./offline";
import { aiContent } from "./region";
import { at, calm, content, withState } from "./testUtils";
import { neglectPenalty, offeringFavor, ritualBlocker, sarimanokAt, traditionChangeCost, updateVisitors } from "./worship";

const w = content.rules.worship;
const anito = content.rituals.find((r) => r.id === "anito-blessing")!;
const diwata = content.rituals.find((r) => r.id === "diwata-favor")!;
const dambana = content.buildings.find((b) => b.id === "dambana")!;

/** A barangay with a Babaylan's Hut and a Dambana beside it, a tradition chosen, and plenty to give. */
const shrine = (patch: Partial<GameState> = {}) =>
  withState({
    villagers: 6,
    resources: { rice: 500, wood: 500, gold: 100 },
    buildings: [at("bahay-kubo", 5, 3), at("babaylan-hut", 3, 3), at("dambana", 3, 4), at("palayan", 1, 1), at("palayan", 1, 3)],
    tradition: "tagalog",
    lastRitualAt: 0,
    ...patch,
  });

describe("content for worship", () => {
  it("has the three traditions, the four blessings and the two events, each with a tradition, sources and reviewed: false", () => {
    expect(content.traditions.map((t) => t.id).sort()).toEqual(["maranao", "tagalog", "visayan"]);
    expect(content.rituals.map((r) => r.id).sort()).toEqual(["anito-blessing", "diwata-favor", "mourning-rite"]);
    for (const x of [...content.traditions, ...content.rituals, content.visitor!, content.eclipse!, content.trickery!, ...content.aklat]) {
      expect(x.tradition).not.toBe("");
      expect(x.sources.length).toBeGreaterThan(0);
      expect(x.reviewed).toBe(false);
    }
    // The design doc's numbers.
    expect(anito.productionPercent).toBe(20);
    expect(anito.durationSeconds).toBe(300);
    expect(diwata.cooldownSeconds).toBe(900);
    expect(content.eclipse!.minVillagers).toBe(30);
  });

  it("never offers a supreme deity as a blessing", () => {
    const blessingText = JSON.stringify([content.rituals, content.visitor, content.eclipse, content.trickery]).toLowerCase();
    expect(blessingText).not.toContain("bathala");
  });
});

describe("the Dambana", () => {
  it("must stand near a Babaylan's Hut", () => {
    const s = withState({ villagers: 6, buildings: [at("babaylan-hut", 3, 3)] });
    expect(canPlace(s, content, dambana, 3, 5)).toBe(true);
    expect(canPlace(s, content, dambana, 8, 8)).toBe(false);
    expect(canPlace(withState({ buildings: [] }), content, dambana, 3, 5)).toBe(false);
  });

  it("asks for a tradition on first building: free the first time, then at a cost", () => {
    let s = withState({ villagers: 6, resources: { rice: 0, wood: 0, gold: 100 }, buildings: [at("babaylan-hut", 3, 3), at("dambana", 3, 4)] });
    expect(s.tradition).toBeNull();
    expect(traditionChangeCost(s, content).gold).toBe(0);
    s = apply(s, calm, { type: "chooseTradition", tradition: "visayan" });
    expect(s.tradition).toBe("visayan");
    expect(s.resources.gold).toBe(100);
    const cost = w.changeTraditionCost.gold!;
    s = apply(s, calm, { type: "chooseTradition", tradition: "maranao" });
    expect(s.tradition).toBe("maranao");
    expect(s.resources.gold).toBe(100 - cost);
    // Unknown traditions, or none without a Dambana, are refused.
    expect(apply(s, calm, { type: "chooseTradition", tradition: "atlantean" })).toBe(s);
    const none = withState({});
    expect(apply(none, calm, { type: "chooseTradition", tradition: "tagalog" })).toBe(none);
  });
});

describe("Favor", () => {
  it("grows with offerings of rice, wood and gold", () => {
    const s = shrine();
    const after = apply(s, calm, { type: "offer", gift: { rice: 20, gold: 2 } });
    expect(after.favor).toBeCloseTo(offeringFavor(content, { rice: 20, gold: 2 }));
    expect(after.favor).toBeCloseTo((20 * w.offeringValues.rice! + 2 * w.offeringValues.gold!) * w.favorPerValue);
    expect(after.resources.rice).toBe(480);
    expect(after.resources.gold).toBe(98);
    expect(after.lastRitualAt).toBe(s.time);
  });

  it("needs a standing Dambana, a tradition, and goods the barangay has", () => {
    const s = shrine();
    expect(apply(shrine({ tradition: null }), calm, { type: "offer", gift: { rice: 10 } }).favor).toBe(0);
    const burnt = shrine({ buildings: [at("babaylan-hut", 3, 3), { ...at("dambana", 3, 4), damaged: true }] });
    expect(apply(burnt, calm, { type: "offer", gift: { rice: 10 } })).toBe(burnt);
    expect(apply(s, calm, { type: "offer", gift: { rice: 5000 } })).toBe(s);
    expect(apply(s, calm, { type: "offer", gift: { rice: -5 } })).toBe(s);
  });

  it("stops at maxFavor", () => {
    const s = apply(shrine({ favor: w.maxFavor - 1 }), calm, { type: "offer", gift: { gold: 50 } });
    expect(s.favor).toBe(w.maxFavor);
  });
});

describe("blessings", () => {
  it("Anito blessing: +20% production for 5 minutes, paid in Favor", () => {
    const s = shrine({ favor: 100 });
    const before = rates(s, calm).produced.rice;
    const blessed = apply(s, calm, { type: "ritual", ritual: "anito-blessing" });
    expect(blessed.favor).toBe(100 - anito.favorCost);
    expect(rates(blessed, calm).produced.rice).toBeCloseTo(before * 1.2);
    expect(ritualBlocker(blessed, content, "anito-blessing")).toBe("active");
    // Over when the five minutes are up (compared at the same moment, so the season is the same).
    const later = { ...blessed, time: blessed.time + anito.durationSeconds! };
    expect(rates(later, calm).produced.rice).toBeCloseTo(rates({ ...s, time: later.time }, calm).produced.rice);
  });

  it("Diwata's favor: minutes of the fields' rice at once, then a 15-minute cooldown", () => {
    // Kamalig make room, so the storage cap doesn't cut the harvest short.
    const s = shrine({ favor: 100, resources: { rice: 50, wood: 0, gold: 0 } });
    s.buildings.push(at("kamalig", 6, 6), at("kamalig", 7, 6), at("kamalig", 8, 6));
    const perSecond = rates(s, calm).produced.rice;
    const done = apply(s, calm, { type: "ritual", ritual: "diwata-favor" });
    expect(done.resources.rice).toBeCloseTo(50 + perSecond * 60 * diwata.riceMinutes!);
    expect(ritualBlocker(done, content, "diwata-favor")).toBe("cooldown");
    expect(apply(done, calm, { type: "ritual", ritual: "diwata-favor" })).toBe(done);
    const ready = { ...done, favor: 100, time: done.time + diwata.cooldownSeconds };
    expect(ritualBlocker(ready, content, "diwata-favor")).toBeNull();
  });

  it("needs enough Favor", () => {
    const s = shrine({ favor: anito.favorCost - 1 });
    expect(ritualBlocker(s, content, "anito-blessing")).toBe("favor");
    expect(apply(s, calm, { type: "ritual", ritual: "anito-blessing" })).toBe(s);
  });

  it("soothes the forest a little", () => {
    const s = shrine({ favor: 100, forest: { balance: 50, stage: 1, permission: 0, lastClearAt: null } });
    expect(apply(s, calm, { type: "ritual", ritual: "diwata-favor" }).forest.balance).toBe(50 + diwata.forestRestore);
  });
});

describe("a neglected Dambana", () => {
  it("slowly lowers happiness, never by more than neglectMax", () => {
    const s = shrine({ lastRitualAt: 0 });
    expect(neglectPenalty({ ...s, time: w.neglectAfterSeconds }, content)).toBeCloseTo(0);
    expect(neglectPenalty({ ...s, time: w.neglectAfterSeconds + 120 }, content)).toBeCloseTo(-2 * w.neglectPerMinute);
    expect(neglectPenalty({ ...s, time: 1e6 }, content)).toBe(-w.neglectMax);
    expect(happinessTarget({ ...s, time: 1e6 }, content).neglect).toBe(-w.neglectMax);
  });

  it("doesn't count time away", () => {
    const s = shrine({ lastRitualAt: 0, time: 0 });
    const { state } = offlineProgress(s, calm, 3 * 3600);
    expect(state.lastRitualAt).toBe(3 * 3600);
    expect(neglectPenalty(state, content)).toBeCloseTo(0);
  });
});

describe("the game's night", () => {
  it("follows rules.dayNight in game time", () => {
    const d = content.rules.dayNight;
    expect(isNightAt(content, d.daySeconds * 0.2)).toBe(false);
    expect(isNightAt(content, d.daySeconds * ((d.nightFrom + d.nightTo) / 2))).toBe(true);
    expect(isNightAt(content, d.daySeconds * 3 + d.daySeconds * 0.6)).toBe(true);
  });
});

describe("visitors", () => {
  /** Content where every visitor comes at once (chance 1). */
  const eager = (() => {
    const c = loadContent();
    return { ...calm, visitor: { ...c.visitor!, chancePerSecond: 1 }, eclipse: { ...c.eclipse!, chancePerSecond: 1 }, trickery: { ...c.trickery!, chancePerSecond: 1 } };
  })();

  it("the Sarimanok crosses the map and gives a gift when tapped (seeded)", () => {
    const s = updateVisitors(shrine({ villagers: 10 }), eager, 0, 1);
    expect(s.sarimanok).not.toBeNull();
    expect(sarimanokAt(s.sarimanok!, s.sarimanok!.at)).toEqual(s.sarimanok!.from);
    const caught = apply({ ...s, time: 1.5 }, eager, { type: "catchSarimanok" });
    expect(caught.sarimanok).toBeNull();
    const total = (x: GameState) => x.resources.rice + x.resources.wood + x.resources.gold;
    expect(total(caught)).toBeGreaterThan(total(s));
    expect(caught.flags).toContain("sarimanok");
    expect(caught.history.at(-1)).toMatchObject({ kind: "event", event: "sarimanok" });
    // The same seed gives the same gift.
    expect(apply({ ...s, time: 1.5 }, eager, { type: "catchSarimanok" }).resources).toEqual(caught.resources);
  });

  it("the Sarimanok visits the Maranao tradition more often", () => {
    const maranao = content.traditions.find((t) => t.id === "maranao")!;
    const others = content.traditions.filter((t) => t.id !== "maranao");
    expect(others.every((t) => maranao.sarimanokChance > t.sarimanokChance)).toBe(true);
  });

  it("the Bakunawa eclipse: only at night, from 30 villagers; gongs drive it off for Favor and gold", () => {
    const night = content.rules.dayNight.daySeconds * 0.6;
    expect(updateVisitors(shrine({ villagers: 30 }), eager, 10, 11).eclipse).toBeNull(); // day
    expect(updateVisitors(shrine({ villagers: 29, time: night }), eager, night, night + 1).eclipse).toBeNull();
    let s = updateVisitors(shrine({ villagers: 30, time: night }), eager, night, night + 1);
    expect(s.eclipse).not.toBeNull();
    // Strikes on the beat, one every beat.
    const start = s.eclipse!.endsAt - eager.eclipse.durationSeconds;
    const beat = content.rules.eclipse.beatSeconds;
    for (let i = 1; i <= eager.eclipse.gongsNeeded; i++) s = apply({ ...s, time: start + i * beat }, eager, { type: "gong", at: start + i * beat });
    const after = updateVisitors(s, { ...eager, eclipse: { ...eager.eclipse, chancePerSecond: 0 } }, s.time, s.eclipse!.endsAt);
    expect(after.eclipse).toBeNull();
    expect(after.favor).toBe(s.favor + eager.eclipse.success.favor);
    expect(after.resources.gold).toBe(s.resources.gold + eager.eclipse.success.gold);
  });

  it("an eclipse left alone costs some rice", () => {
    const night = content.rules.dayNight.daySeconds * 0.6;
    const s = updateVisitors(shrine({ villagers: 30, time: night }), eager, night, night + 1);
    const after = updateVisitors(s, { ...eager, eclipse: { ...eager.eclipse, chancePerSecond: 0 } }, night + 1, s.eclipse!.endsAt);
    expect(after.resources.rice).toBe(s.resources.rice - Math.floor((s.resources.rice * eager.eclipse.failure.ricePercent) / 100));
  });

  it("the tikbalang leads workers astray until its riddle is answered", () => {
    const s0 = shrine({ villagers: 20 });
    const s = { ...updateVisitors(s0, eager, 0, 1), time: 1 };
    expect(s.tikbalang).not.toBeNull();
    expect(healthyWorkers(s)).toBe(healthyWorkers(s0) - eager.trickery.workersLost);
    const riddle = eager.trickery.riddles.find((r) => r.id === s.tikbalang!.riddle)!;
    const right = apply(s, eager, { type: "answerRiddle", option: riddle.answer });
    expect(right.tikbalang).toBeNull();
    expect(healthyWorkers(right)).toBe(healthyWorkers(s0));
    const wrong = apply(s, eager, { type: "answerRiddle", option: (riddle.answer + 1) % riddle.options.length });
    expect(wrong.tikbalang?.wrong).toBe(true);
    // No second try; they come back when the minute is up.
    expect(apply(wrong, eager, { type: "answerRiddle", option: riddle.answer })).toBe(wrong);
    expect(updateVisitors(wrong, { ...eager, trickery: { ...eager.trickery, chancePerSecond: 0 } }, 1, wrong.tikbalang!.until).tikbalang).toBeNull();
  });

  it("none of them come during offline catch-up", () => {
    const s = shrine({ villagers: 30 });
    const { state } = offlineProgress(s, eager, 4 * 3600);
    expect(state.sarimanok).toBeNull();
    expect(state.eclipse).toBeNull();
    expect(state.tikbalang).toBeNull();
  });

  it("never come to AI barangays", () => {
    expect(tick(shrine({ villagers: 30 }), eager, 1).sarimanok).not.toBeNull();
    const ai = tick(shrine({ villagers: 30 }), aiContent(eager), 1);
    expect(ai.sarimanok).toBeNull();
    expect(ai.tikbalang).toBeNull();
  });
});

describe("the Bakunawa challenge", () => {
  const r = content.rules.eclipse;
  const def = content.eclipse!;
  /** A barangay in an eclipse that began at time 100, at a given renown (level) and buildings. */
  const inEclipse = (patch: Partial<GameState> = {}): GameState => ({ ...shrine({ villagers: 30, time: 100, ...patch }), eclipse: { endsAt: 100 + def.durationSeconds, taps: 0, strength: 0 } });
  const strikeAt = (s: GameState, at: number, held = false) => apply({ ...s, time: at }, content, { type: "gong", at, held });

  it("needs more strength the higher the barangay's level", async () => {
    const { renownForLevel } = await import("./kabantugan");
    const { eclipseNeeded } = await import("./worship");
    const at = (level: number) => eclipseNeeded(inEclipse({ kabantugan: renownForLevel(content, level) ?? 0 }), content);
    expect(at(3)).toBeGreaterThan(at(1));
    expect(at(16)).toBeGreaterThan(at(3) * 1.5);
    expect(at(1)).toBe(def.gongsNeeded);
  });

  it("counts strikes on the beat fully, off the beat less, and mashing not at all", async () => {
    const { eclipseStrength } = await import("./worship");
    const base = inEclipse();
    const strength = (s: GameState) => s.eclipse!.strength!;
    const on = strikeAt(base, 100 + r.beatSeconds * 2);
    const off = strikeAt(base, 100 + r.beatSeconds * 2.5);
    expect(strength(on)).toBe(r.onBeat);
    expect(strength(off)).toBe(r.offBeat);
    expect(strength(on)).toBeGreaterThan(strength(off));
    // Mashing: ten quick taps are worth less than four strikes on the beat.
    let mash = base;
    for (let i = 0; i < 10; i++) mash = strikeAt(mash, 101 + i * 0.05);
    let rhythm = base;
    for (let i = 2; i < 6; i++) rhythm = strikeAt(rhythm, 100 + i * r.beatSeconds);
    expect(strength(mash)).toBeLessThan(strength(rhythm));
    expect(eclipseStrength(rhythm, content)).toBeGreaterThan(0);
  });

  it("hold to beat: each held beat counts holdBeat", () => {
    const held = strikeAt(inEclipse(), 100 + r.beatSeconds, true);
    expect(held.eclipse!.strength).toBe(r.holdBeat);
  });

  it("adds the villagers' strikes for every Kuta level and Bahay ng Datu level", async () => {
    const { eclipseAutoStrikes, eclipseStrength } = await import("./worship");
    const plain = inEclipse({ datuLevel: 1 });
    const prepared = inEclipse({ datuLevel: 3, buildings: [at("bahay-kubo", 5, 3), { ...at("kuta", 2, 6), level: 2 }] });
    expect(eclipseAutoStrikes(plain, content)).toBe(r.autoPerDatuLevel);
    expect(eclipseAutoStrikes(prepared, content)).toBe(3 * r.autoPerDatuLevel + 2 * r.autoStrikes.kuta);
    // Spread over the event: half by halfway, all by the end.
    const end = 100 + def.durationSeconds;
    expect(eclipseStrength(prepared, content, 100 + def.durationSeconds / 2)).toBeCloseTo(eclipseAutoStrikes(prepared, content) / 2);
    expect(eclipseStrength(prepared, content, end)).toBe(eclipseAutoStrikes(prepared, content));
  });

  it("the moon comes back as the strength grows (no count): progress from 0 to 1", async () => {
    const { eclipseProgress } = await import("./worship");
    let s = inEclipse({ datuLevel: 1 });
    const p0 = eclipseProgress(s, content, 100);
    for (let i = 1; i <= 8; i++) s = strikeAt(s, 100 + i * r.beatSeconds);
    expect(p0).toBe(0);
    expect(eclipseProgress(s, content)).toBeGreaterThan(p0);
    expect(eclipseProgress(s, content)).toBeLessThanOrEqual(1);
  });

  it("an old save's eclipse keeps its taps as its strength", async () => {
    const { parseSave } = await import("./save");
    const s = inEclipse();
    const raw = JSON.parse(JSON.stringify(s));
    raw.version = 31;
    raw.eclipse = { endsAt: raw.eclipse.endsAt, taps: 7 };
    const back = parseSave(JSON.stringify(raw), content)!;
    expect(back.eclipse).toMatchObject({ taps: 7, strength: 7 });
  });
});
