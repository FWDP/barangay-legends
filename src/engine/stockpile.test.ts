// The stockpile's soft cap for wood and gold.
import { describe, expect, it } from "vitest";
import { buildingCost, owned, rates } from "./game";
import { nextBigCost, overSoftCap, overStopCap, softCap, stopCap } from "./stockpile";
import { at, calm, content, withState } from "./testUtils";

const sp = content.rules.stockpile;
const camp = () => withState({ villagers: 6, happiness: 60, resources: { rice: 900, wood: 0 }, buildings: [at("bahay-kubo", 5, 3), at("woodcutter-camp", 3, 3)] });

describe("stockpile soft cap", () => {
  it("is a few times the next big purchase, never below the minimum", () => {
    const s = camp();
    const kubo = content.buildings.find((b) => b.id === "bahay-kubo")!;
    expect(nextBigCost(s, content).wood).toBeGreaterThanOrEqual(buildingCost(content, kubo, owned(s, "bahay-kubo")).wood);
    expect(softCap(s, content, "wood")).toBe(Math.max(sp.minimum.wood!, Math.ceil(sp.multiple * nextBigCost(s, content).wood)));
    expect(softCap(s, content, "gold")).toBeGreaterThanOrEqual(sp.minimum.gold!);
    // Rice has the Kamalig's hard cap instead.
    expect(softCap(s, content, "rice")).toBe(Infinity);
  });

  it("rises as the barangay grows (dearer next copies)", () => {
    const small = camp();
    const big = withState({ villagers: 60, resources: { rice: 900 }, buildings: Array.from({ length: 40 }, (_, i) => at("bahay-kubo", 1 + (i % 8), Math.floor(i / 8))) });
    expect(nextBigCost(big, content).wood).toBeGreaterThan(nextBigCost(small, content).wood);
  });

  it("above it, work brings in slowPercent less; nothing stored is lost", () => {
    const s = camp();
    const below = rates({ ...s, resources: { ...s.resources, wood: 0 } }, calm).produced.wood;
    const full = { ...s, resources: { ...s.resources, wood: softCap(s, content, "wood") + 10 } };
    expect(overSoftCap(full, content, "wood")).toBe(true);
    expect(rates(full, calm).produced.wood).toBeCloseTo(below * (1 - sp.slowPercent / 100), 6);
    expect(full.resources.wood).toBeGreaterThan(softCap(s, content, "wood"));
  });

  it("above stopMultiple × the cap, work brings in none of it; other resources still come in", () => {
    const s = { ...camp(), buildings: [at("bahay-kubo", 5, 3), at("woodcutter-camp", 3, 3), at("palayan", 7, 3)], villagers: 6 };
    const stop = stopCap(s, content, "wood");
    expect(stop).toBeCloseTo(softCap(s, content, "wood") * sp.stopMultiple, 6);
    const piled = { ...s, resources: { ...s.resources, rice: 10, wood: stop + 1 } };
    expect(overStopCap(piled, content, "wood")).toBe(true);
    expect(rates(piled, calm).produced.wood).toBe(0);
    expect(rates(piled, calm).produced.rice).toBeGreaterThan(0);
    // Spending below the line brings work back.
    const spent = { ...piled, resources: { ...piled.resources, wood: stop - 1 } };
    expect(rates(spent, calm).produced.wood).toBeGreaterThan(0);
  });
});
