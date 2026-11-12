import { describe, expect, it } from "vitest";
import { GATHER_GAP_MS, limiter } from "./sound";

describe("sound limiter", () => {
  it("plays at most one gather sound per 250 ms, however fast the clicks", () => {
    let t = 0;
    const once = limiter(() => t);
    let played = 0;
    for (; t < 1000; t += 20) once("gather", GATHER_GAP_MS, () => played++);
    expect(played).toBe(4);
  });

  it("limits each sound separately", () => {
    const once = limiter(() => 0);
    expect(once("gather", 250, () => {})).toBe(true);
    expect(once("build", 250, () => {})).toBe(true);
    expect(once("gather", 250, () => {})).toBe(false);
  });
});
