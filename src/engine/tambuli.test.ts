// Calling for help with the tambuli (region.ts callForHelp): volunteers from allies, as trust and
// distance allow; a trust cost when overused; saved; the same every time.
import { describe, expect, it } from "vitest";
import { apply, type GameState } from "./game";
import { alliedDefenders, callBlocker, callOverused, createRegion, type NeighborState } from "./region";
import { parseSave } from "./save";
import { acquainted, at, calm, content, withState } from "./testUtils";

const t = content.rules.tambuli;
function world(ally: Partial<NeighborState> = {}, raiders = 8): GameState {
  const s = withState({ resources: { rice: 1000, wood: 1000, gold: 0 }, villagers: 12, warriors: 2, buildings: [at("bahay-kubo", 5, 3)], time: 700 });
  let region = acquainted(createRegion(calm, s.time, 7));
  const allyId = region.neighbors.find((n) => n.id !== "batong-buhay")!.id;
  region = {
    ...region,
    truceUntil: 0,
    nextAiRaidAt: 9999,
    incomingRaid: { from: "batong-buhay", strikeAt: 760, landing: { x: 1, y: 4 }, warnedAt: 700, watched: false },
    neighbors: region.neighbors.map((n) =>
      n.id === allyId ? { ...n, status: "ally" as const, trust: 90, ...ally, state: { ...n.state, warriors: 4, villagers: 40 } } : n.id === "batong-buhay" ? { ...n, state: { ...n.state, warriors: raiders } } : n,
    ),
  };
  return { ...s, region };
}
const allyOf = (s: GameState) => s.region!.neighbors.find((n) => n.status === "ally")!;

describe("calling for help (tambuli)", () => {
  it("brings more allied warriors than they'd send on their own", () => {
    const s = world();
    const id = allyOf(s).id;
    const before = alliedDefenders(s, content, 999).find((a) => a.id === id)!;
    const called = apply(s, content, { type: "callForHelp" });
    expect(called.region!.incomingRaid!.called).toBe(true);
    const after = alliedDefenders(called, content, 999).find((a) => a.id === id)!;
    expect(after.warriors).toBeGreaterThan(before.warriors);
    expect(after.volunteers).toBe(after.warriors - before.warriors);
    expect(called.flags).toContain("tambuli");
  });

  it("allies with less trust send fewer volunteers", () => {
    const vol = (trust: number) => {
      const s = apply(world({ trust }), content, { type: "callForHelp" });
      return alliedDefenders(s, content, 999).find((a) => a.id === allyOf(s).id)!.volunteers ?? 0;
    };
    expect(vol(90)).toBeGreaterThan(vol(30));
    expect(vol(0)).toBe(0);
  });

  it("can be sounded once per raid, and only with someone to call", () => {
    const s = world();
    expect(callBlocker(s)).toBeNull();
    const called = apply(s, content, { type: "callForHelp" });
    expect(callBlocker(called)).toBe("called");
    expect(apply(called, content, { type: "callForHelp" })).toBe(called);
    const alone = { ...s, region: { ...s.region!, neighbors: s.region!.neighbors.map((n) => ({ ...n, status: "independent" as const })) } };
    expect(callBlocker(alone)).toBe("no-allies");
    expect(callBlocker({ ...s, region: { ...s.region!, incomingRaid: null } })).toBe("no-raid");
  });

  it("costs trust when overused: a small raid, or again too soon", () => {
    const fair = world();
    expect(callOverused(fair, content)).toBe(false);
    expect(allyOf(apply(fair, content, { type: "callForHelp" })).trust).toBe(allyOf(fair).trust);
    const small = world({}, t.smallRaidAttackers);
    expect(callOverused(small, content)).toBe(true);
    expect(allyOf(apply(small, content, { type: "callForHelp" })).trust).toBe(allyOf(small).trust - t.overuseTrust);
    const soon = { ...fair, region: { ...fair.region!, lastCallAt: fair.time - 10 } };
    expect(callOverused(soon, content)).toBe(true);
  });

  it("is saved, and the same every time", () => {
    const called = apply(world(), content, { type: "callForHelp" });
    const back = parseSave(JSON.stringify(called), content)!;
    expect(back.region!.incomingRaid!.called).toBe(true);
    expect(back.region!.lastCallAt).toBe(700);
    expect(apply(world(), content, { type: "callForHelp" })).toEqual(called);
  });
});
