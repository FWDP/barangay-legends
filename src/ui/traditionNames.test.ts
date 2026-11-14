// The healer's hut in each tradition's words (prompt S, section 6).
import { describe, expect, it } from "vitest";
import { content } from "../engine/testUtils";
import { withTraditionNames } from "./traditionNames";

const hut = (tradition: string | null) => withTraditionNames(content, tradition).buildings.find((b) => b.id === "babaylan-hut")!;

describe("the ritual specialist's hut", () => {
  it("is the Babaylan's Hut only in a Visayan barangay", () => {
    expect(hut("visayan").name).toBe("Babaylan's Hut");
    expect(hut("tagalog").name).toBe("Katalonan's Hut");
    expect(hut("maranao").name).toBe("Healer's Hut");
    expect(hut(null).name).toBe("Healer's Hut");
  });

  it("changes only names: the same id, cost and healing, and the Dambana's text follows", () => {
    const base = content.buildings.find((b) => b.id === "babaylan-hut")!;
    expect({ ...hut("tagalog"), name: base.name, description: base.description }).toEqual(base);
    const dambana = withTraditionNames(content, "tagalog").buildings.find((b) => b.id === "dambana")!;
    expect(dambana.description).toContain("Katalonan's Hut");
    expect(dambana.description).not.toContain("Babaylan's Hut");
  });

  it("is the same object for the same tradition (cached)", () => {
    expect(withTraditionNames(content, "tagalog")).toBe(withTraditionNames(content, "tagalog"));
  });
});
