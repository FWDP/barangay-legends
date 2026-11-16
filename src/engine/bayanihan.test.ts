// Houses and moving them together (W.7): the Bahay Kubo's art, its ladder, and bayanihan.
import { describe, expect, it } from "vitest";
import { apply, availableWorkers, bayanihanBlocker, tick } from "./game";
import { happinessTarget } from "./happiness";
import { parseSave } from "./save";
import { buildingArtUrl } from "../ui/buildingArt";
import { kuboSvg } from "../ui/foodArt";
import { at, calm, content, withState } from "./testUtils";

const b = content.rules.bayanihan;
const named = [1, 2, 3, 4, 5, 6].map((id) => ({ id, name: `V${id}`, story: "singer", role: "villager" as const, since: 0, resident: id }));
const town = (patch: Parameters<typeof withState>[0] = {}) =>
  withState({ villagers: 10, resources: { wood: 0, food: 500 }, named, buildings: [at("bahay-kubo", 5, 3), at("bahay-kubo", 3, 3)], ...patch });

describe("moving a Bahay Kubo is bayanihan", () => {
  it("uses free villagers for a short time and no fee", () => {
    const s = town();
    expect(bayanihanBlocker(s, content)).toBeNull();
    const moved = apply(s, calm, { type: "move", x: 3, y: 3, toX: 3, toY: 6 });
    expect(moved.buildings.some((x) => x.x === 3 && x.y === 6)).toBe(true);
    expect(moved.resources).toEqual(s.resources);
    expect(moved.bayanihan).toMatchObject({ fromX: 3, fromY: 3, x: 3, y: 6, until: s.time + b.seconds });
    expect(availableWorkers(moved, content)).toBe(availableWorkers(s, content) - b.helpers);
    expect(bayanihanBlocker(moved, content)).toBe("busy");
    // It lifts everyone's spirits, and the helpers remember it.
    expect(happinessTarget(moved, content).social).toBeGreaterThanOrEqual(b.happiness);
    expect(moved.named.filter((v) => v.life?.some((e) => e.kind === "social" && e.moment === "bayanihan")).length).toBeGreaterThan(0);
    expect(moved.flags).toContain("bayanihan");
    // Done after a short time.
    const done = tick(moved, calm, b.seconds + 1);
    expect(availableWorkers(done, content)).toBeGreaterThan(availableWorkers(moved, content));
    expect(parseSave(JSON.stringify(moved), content)!.bayanihan).toEqual(moved.bayanihan);
  });

  it("needs enough free hands; other buildings keep the move fee", () => {
    const few = town({ villagers: 2 });
    expect(bayanihanBlocker(few, content)).toBe("helpers");
    expect(apply(few, calm, { type: "move", x: 3, y: 3, toX: 3, toY: 6 })).toBe(few);
    const camp = town({ resources: { wood: 0, food: 0 }, buildings: [at("bahay-kubo", 5, 3), at("woodcutter-camp", 7, 3)] });
    expect(apply(camp, calm, { type: "move", x: 7, y: 3, toX: 7, toY: 6 })).toBe(camp); // can't pay the fee
    const paid = apply({ ...camp, resources: { ...camp.resources, food: 500, wood: 500 } }, calm, { type: "move", x: 7, y: 3, toX: 7, toY: 6 });
    expect(paid.bayanihan ?? null).toBeNull();
  });
});

describe("the Bahay Kubo's art", () => {
  it("a rectangular house on posts with a ladder that is pulled up at night or in a raid", () => {
    expect(buildingArtUrl("bahay-kubo")).not.toBeNull();
    expect(buildingArtUrl("bahay-kubo", 1, true, true)).not.toBe(buildingArtUrl("bahay-kubo"));
    // Posts reaching the ground, and the ladder down only by day.
    expect(kuboSvg(false)).toContain('y2="60"');
    expect(kuboSvg(false)).not.toBe(kuboSvg(true));
    expect(content.lore["bahay-kubo"].reviewed).toBe(false);
    expect(content.lore["bayanihan"].reviewed).toBe(false);
  });
});
