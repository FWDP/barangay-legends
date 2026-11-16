// Suyak: sharpened bamboo stakes slow raiders (W.5, watch.ts stakesDelay).
import { describe, expect, it } from "vitest";
import { apply } from "./game";
import { startRaid } from "./region";
import { stakesDelay, warningFor, isWatched } from "./watch";
import { chooseLanding } from "./border";
import { acquainted, at, calm, content, withState } from "./testUtils";
import { createRegion } from "./region";

const k = content.rules.watch.stakes;

describe("suyak slow raiders", () => {
  const base = () => {
    const s = withState({ resources: { wood: 200, food: 200 }, villagers: 12, buildings: [at("bahay-kubo", 5, 3)] });
    return { ...s, region: acquainted(createRegion(calm, 0, 7)) };
  };

  it("stakes near the landing make the raid strike later, so defenders have more time", () => {
    const s = base();
    const landing = chooseLanding(s, content, 100);
    expect(landing).not.toBeNull();
    const near = [at("suyak", 1, Math.max(0, landing!.y - 1)), at("suyak", 1, Math.min(8, landing!.y + 1))].filter((b) => Math.hypot(b.x - landing!.x, b.y - landing!.y) <= k.radius);
    const staked = { ...s, buildings: [...s.buildings, ...near] };
    expect(stakesDelay(staked, content, landing)).toBe(Math.min(k.maxSeconds, near.length * k.secondsEach));
    const plain = startRaid(s, content, s.region!.neighbors[0].id, 100);
    const slowed = startRaid(staked, content, s.region!.neighbors[0].id, 100);
    if (plain.landing && slowed.landing && plain.landing.x === slowed.landing.x && plain.landing.y === slowed.landing.y) {
      expect(slowed.strikeAt - plain.strikeAt).toBe(stakesDelay(staked, content, slowed.landing));
    }
    expect(warningFor(content, isWatched(s, content, landing))).toBeGreaterThan(0);
  });

  it("are cheap, go on the shore, and can be cleared", () => {
    const def = content.buildings.find((d) => d.id === "suyak")!;
    expect(def.stakes).toBe(true);
    expect(def.placeNextTo).toContain("river");
    expect(def.cost.wood).toBeLessThanOrEqual(10);
    const s = { ...base(), buildings: [at("bahay-kubo", 5, 3), at("suyak", 1, 2)] };
    const cleared = apply(s, calm, { type: "demolish", x: 1, y: 2 });
    expect(cleared.buildings.some((b) => b.type === "suyak")).toBe(false);
    // Far from any landing they do nothing.
    expect(stakesDelay(s, content, { x: 1, y: 2 + k.radius + 3 })).toBe(0);
  });
});
