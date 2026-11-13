import { describe, expect, it } from "vitest";
import { at, content, withState } from "../engine/testUtils";
import { BUILD_TABS, DAAN, DATU, itemsIn, missingFor, OTHER_TAB, recommended, tabOf, tabsWithNew, visibleTabs } from "./buildMenu";

const def = (id: string) => content.buildings.find((b) => b.id === id)!;

describe("build tabs", () => {
  it("puts every building in content under its category", () => {
    expect(tabOf(def("bahay-kubo"))).toBe("tirahan");
    expect(tabOf(def("fishing-dock"))).toBe("pagkain");
    expect(tabOf(def("kuta"))).toBe("depensa");
    expect(tabOf(def("dambana"))).toBe("pananampalataya");
    expect(tabOf(def("tulay"))).toBe("daan");
    expect(content.buildings.every((b) => (BUILD_TABS as readonly string[]).includes(b.category ?? ""))).toBe(true);
  });

  it("never loses a building: no or unknown category goes under Iba pa, which then shows", () => {
    const stray = { ...def("kuta"), id: "watchtower", category: undefined };
    const odd = { ...def("kuta"), id: "boathouse", category: "harbor" };
    expect(tabOf(stray)).toBe(OTHER_TAB);
    expect(tabOf(odd)).toBe(OTHER_TAB);
    expect(visibleTabs(content)).not.toContain(OTHER_TAB);
    const more = { ...content, buildings: [...content.buildings, stray] };
    expect(visibleTabs(more).at(-1)).toBe(OTHER_TAB);
    expect(itemsIn(more, OTHER_TAB)).toEqual(["watchtower"]);
    // Every building appears in exactly one tab.
    const all = visibleTabs(more).flatMap((t) => itemsIn(more, t)).filter((id) => id !== DAAN && id !== DATU);
    expect(all.sort()).toEqual(more.buildings.map((b) => b.id).sort());
  });

  it("puts the Bahay ng Datu's upgrades first under Tirahan, and the Libingan under belief", () => {
    expect(itemsIn(content, "tirahan")[0]).toBe(DATU);
    expect(tabOf(def("libingan"))).toBe("pananampalataya");
  });

  it("keeps the Daan tool in the paths tab", () => {
    expect(itemsIn(content, "daan")).toEqual(["tulay", DAAN]);
  });
});

describe("card states", () => {
  it("names what's missing for the next copy", () => {
    const s = withState({ resources: { rice: 0, wood: 5, gold: 0 } });
    expect(missingFor(s, content, def("palayan"), 0)).toEqual({ wood: def("palayan").cost.wood! - 5 });
    expect(missingFor(withState({ resources: { rice: 0, wood: 500, gold: 0 } }), content, def("palayan"), 0)).toEqual({});
  });

  it("badges a tab when something new unlocks in it, until it has been seen", () => {
    const s = withState({ villagers: 10 });
    const seenBefore = ["bahay-kubo", "palayan", "woodcutter-camp", "babaylan-hut", "dambana"];
    const fresh = tabsWithNew(s, content, seenBefore);
    expect(fresh).toEqual(new Set(["pagkain", "depensa"])); // Kamalig, Kuta at 10 villagers
    expect(tabsWithNew(s, content, [...seenBefore, "kamalig", "kuta"]).size).toBe(0);
  });
});

describe("recommended", () => {
  it("glows what the current task asks for", () => {
    const s = withState({ gawainDone: [] });
    expect(recommended(s, content, null)).toEqual(new Set(["palayan"]));
    const daanTask = withState({ gawainDone: ["first-palayan", "first-camp", "ten-villagers", "clear-five"] });
    expect(recommended(daanTask, content, null).has(DAAN)).toBe(true);
  });

  it("and what the adviser is talking about, if it can be built", () => {
    const s = withState({ buildings: [at("babaylan-hut", 2, 2)] });
    expect(recommended(s, content, "dambana").has("dambana")).toBe(true);
    expect(recommended(s, content, "rice-low").has("palayan")).toBe(true);
    expect(recommended(s, content, "roads").has(DAAN)).toBe(true);
    // A locked building is never pointed at.
    const early = withState({ villagers: 3, gawainDone: content.quests.slice(0, 7).map((q) => q.id) });
    expect([...recommended(early, content, null)].every((id) => id === DAAN || content.buildings.find((b) => b.id === id)!.unlock.start || early.villagers >= (content.buildings.find((b) => b.id === id)!.unlock.villagers ?? 0))).toBe(true);
  });
});
