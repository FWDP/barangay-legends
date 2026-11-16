// The ruler (V.3, household.ts): a woman or a man, chosen at the start, changeable once; "Datu"
// for both, or a sourced honorific for a woman ruler in her tradition.
import { describe, expect, it } from "vitest";
import { apply, newGame, STATE_VERSION } from "./game";
import { householdOf, rulerTitle } from "./household";
import { parseSave } from "./save";
import { content } from "./testUtils";

const start = (gender: "woman" | "man", datu = "Lakan") => newGame(content, 11, true, { datu, name: "Ilog", gender });

describe("the ruler: woman or man", () => {
  it("is chosen on the new-game form; the spouse follows", () => {
    const her = householdOf(start("woman"), content);
    expect(her.datuGender).toBe("woman");
    expect(her.spouse.gender).toBe("man");
    expect(content.villagers.men).toContain(her.spouse.name);
    expect(householdOf(start("man"), content)).toMatchObject({ datuGender: "man", spouse: { gender: "woman" } });
  });

  it("is saved, and an old save keeps the household it had", () => {
    const s = start("woman");
    expect(parseSave(JSON.stringify(s), content)!.household).toEqual(s.household);
    const old = { ...start("man"), version: 34 };
    const loaded = parseSave(JSON.stringify(old), content)!;
    expect(loaded.version).toBe(STATE_VERSION);
    expect(loaded.household?.datuGender).toBe("man");
  });

  it("can be changed once in Settings, and no more", () => {
    const s = start("man");
    const changed = apply(s, content, { type: "setRulerGender", gender: "woman" });
    expect(householdOf(changed, content)).toMatchObject({ datuGender: "woman", spouse: { gender: "man" }, changed: true });
    expect(apply(changed, content, { type: "setRulerGender", gender: "man" })).toBe(changed);
    expect(parseSave(JSON.stringify(changed), content)!.household?.changed).toBe(true);
  });

  it("is called Datu, or Dayang only for a Tagalog woman ruler who chooses it", () => {
    const tagalog = { ...start("woman"), tradition: "tagalog" };
    expect(rulerTitle(tagalog, content)).toBe("Datu");
    const dayang = apply(tagalog, content, { type: "setHonorific", on: true });
    expect(rulerTitle(dayang, content)).toBe("Dayang");
    expect(parseSave(JSON.stringify(dayang), content)!.household?.honorific).toBe(true);
    // Not for a man, nor in a tradition with no sourced honorific.
    expect(apply({ ...start("man"), tradition: "tagalog" }, content, { type: "setHonorific", on: true }).household?.honorific).toBeUndefined();
    const visayan = { ...start("woman"), tradition: "visayan" };
    expect(apply(visayan, content, { type: "setHonorific", on: true })).toBe(visayan);
    expect(content.traditions.find((t) => t.id === "tagalog")?.womanHonorific?.reviewed).toBe(false);
  });

  it("has an Aklat entry on women rulers, sourced and waiting for review", () => {
    const e = content.aklat.find((x) => x.id === "women-rulers")!;
    expect(e.reviewed).toBe(false);
    expect(e.sources.length).toBeGreaterThan(0);
  });
});
