// Warriors and honor (W.4, honor.ts).
import { describe, expect, it } from "vitest";
import type { GameState } from "./game";
import { addHonor, honorFor, honorLevel, steadiness } from "./honor";
import { noteLifeEvents } from "./talambuhay";
import { parseSave } from "./save";
import { sideLosses } from "./warfare";
import { createRegion } from "./region";
import { planVillagers } from "../ui/villagers";
import { acquainted, content, withState } from "./testUtils";

const h = content.rules.honor;
const warrior = (id: number, honor?: number) => ({ id, name: `W${id}`, story: "bravest", role: "warrior" as const, since: 0, resident: id, ...(honor ? { honor } : {}) });
const town = (patch: Partial<GameState> = {}) => withState({ villagers: 10, warriors: 4, named: [warrior(1), warrior(2)], ...patch });

describe("warriors gain honor by fighting well", () => {
  it("a won battle gives honor; a loss gives none", () => {
    expect(honorFor(content, "defense", true)).toBe(h.defenseWon);
    expect(honorFor(content, "raid", true)).toBe(h.raidWon);
    expect(honorFor(content, "raid", false)).toBe(0);
    const { v, levels } = addHonor(content, warrior(1), h.levels[0]);
    expect(honorLevel(content, v.honor)).toBe(1);
    expect(levels).toBe(1);
  });

  it("a won defense raises the named warriors' honor, writes it in their story and adds renown", () => {
    const prev = { ...town(), region: { ...acquainted(createRegion(content, 0, 7)), reports: [] } };
    const next = { ...prev, kabantugan: prev.kabantugan, region: { ...prev.region, reports: [{ id: 1, time: 1, kind: "defense" as const, neighbor: prev.region.neighbors[0].id, win: true }] } } as GameState;
    const after = noteLifeEvents(prev, next, content);
    expect(after.named[0].honor).toBe(h.defenseWon);
    if (h.defenseWon >= h.levels[0]) {
      expect(after.kabantugan).toBe(prev.kabantugan + 2 * h.renownPerLevel);
      expect(after.named[0].life?.some((e) => e.kind === "honored")).toBe(true);
    }
  });

  it("is saved", () => {
    const s = town({ named: [warrior(1, 7), warrior(2)] });
    expect(parseSave(JSON.stringify(s), content)!.named[0].honor).toBe(7);
  });
});

describe("honor steadies warriors and shows on them", () => {
  it("honored warriors make their side steadier: a beaten side loses fewer before breaking", () => {
    expect(steadiness(town(), content)).toBe(0);
    const honored = town({ named: [warrior(1, 20), warrior(2, 20)] });
    expect(steadiness(honored, content)).toBeGreaterThan(0);
    const plain = sideLosses(20, true, [0, 0], content);
    const steady = sideLosses(20, true, [0, 0], content, { steady: steadiness(honored, content) });
    expect(steady.wounded + steady.fallen + steady.captured).toBeLessThanOrEqual(plain.wounded + plain.fallen + plain.captured);
  });

  it("Visayan warriors earn batok; other traditions wear ornaments", () => {
    const base = town({ named: [warrior(1, 20), warrior(2, 7)] });
    // Warriors are drawn as warriors while a raid is coming (they go to meet it).
    const region = acquainted(createRegion(content, 0, 7));
    const honored = { ...base, region: { ...region, incomingRaid: { from: region.neighbors[0].id, strikeAt: 100 } } };
    const looks = (tradition: string) => planVillagers({ ...honored, tradition }, content).filter((p) => p.role === "warrior").map((p) => p.look?.honor);
    const visayan = looks("visayan").filter(Boolean);
    expect(visayan[0]).toEqual({ level: 3, kind: "batok" });
    expect(looks("tagalog").filter(Boolean)[0]?.kind).toBe("ornament");
    expect(content.traditions.every((t) => !t.honorMark || t.honorMark.reviewed === false)).toBe(true);
  });
});
