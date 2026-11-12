import { describe, expect, it } from "vitest";
import { housing } from "../engine/game";
import { content } from "../engine/testUtils";
import { canPlay } from "./online";
import { sampleBarangay } from "./sample";

describe("title screen helpers", () => {
  it("builds a lived-in sample barangay, the same every time", () => {
    const s = sampleBarangay(content);
    expect(s.buildings.length).toBeGreaterThan(5);
    expect(s.villagers).toBe(housing(s, content));
    expect(sampleBarangay(content)).toEqual(s);
  });

  it("keeps online play switched off until multiplayer exists", () => {
    expect(canPlay("local")).toBe(true);
    expect(canPlay("online")).toBe(false);
  });
});
