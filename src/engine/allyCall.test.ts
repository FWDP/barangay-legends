// An ally raided: the messenger's call for help, answered or not.
import { describe, expect, it } from "vitest";
import { apply, tick, type GameState } from "./game";
import { choiceDef, isEligible } from "./choices";
import { createRegion, raidableAllies, startAllyCall, type NeighborState } from "./region";
import { parseSave } from "./save";
import { acquainted, calm, content, withState } from "./testUtils";
import type { Content } from "./content";

const c = content.rules.allyCalls;
const ALLY = "bundok-ulap";

function world(patch: Partial<GameState> = {}): GameState {
  const s = withState({ resources: { rice: 2000, wood: 2000, gold: 0 }, villagers: 20, warriors: 6, buildings: [], ...patch });
  let region = acquainted(createRegion(calm, s.time, 7));
  region = { ...region, neighbors: region.neighbors.map((n) => (n.id === ALLY ? { ...n, status: "ally" as const, trust: 50 } : n)) };
  return { ...s, region };
}
const nb = (s: GameState, id: string) => s.region!.neighbors.find((n) => n.id === id)! as NeighborState;
/** Calls come at once (no wait, every second) and nothing else rolls. */
const eager: Content = { ...calm, rules: { ...calm.rules, choices: { ...calm.rules.choices, chancePerSecond: 0 }, allyCalls: { ...c, startsAfterSeconds: 0, chancePerSecond: 1 }, diplomacy: { ...calm.rules.diplomacy, aiRaid: { ...calm.rules.diplomacy.aiRaid, chancePerSecond: 0 } } } };
const called = () => tick(world(), eager, 2);

describe("an ally's call for help", () => {
  it("comes as a choice event at the Bahay ng Datu when an aggressive barangay raids an ally", () => {
    const s = called();
    expect(s.choice?.id).toBe("ally-call");
    expect(s.choice?.neighbor).toBe(ALLY);
    const call = s.region!.allyCall!;
    expect(call.ally).toBe(ALLY);
    expect(s.choice?.enemy).toBe(call.from);
    const raider = nb(s, call.from);
    expect(raider.status).toBe("independent");
    expect(content.rules.diplomacy.traits[content.neighbors.find((n) => n.id === call.from)!.trait].raids).toBe(true);
    expect(call.strikeAt).toBe(s.choice!.at + c.warningSeconds);
  });

  it("is never drawn at random like other choice events", () => {
    const def = choiceDef(content, "ally-call")!;
    expect(isEligible(world(), content, def)).toBe(false);
  });

  it("needs an ally: none without a sandugo ally or bloc mate", () => {
    const lonely = world();
    const none = { ...lonely, region: { ...lonely.region!, neighbors: lonely.region!.neighbors.map((n) => ({ ...n, status: "independent" as const })) } };
    expect(raidableAllies(none)).toEqual([]);
    expect(tick(none, eager, 5).choice).toBeNull();
  });

  it("answering sends warriors to fight beside the ally, for renown and trust", () => {
    const s = called();
    const answered = apply(s, eager, { type: "choose", option: "send" });
    expect(answered.choice).toBeNull();
    expect(answered.region!.allyCall).toBeNull();
    expect(answered.kabantugan).toBeGreaterThanOrEqual(s.kabantugan + c.renown);
    expect(nb(answered, ALLY).trust).toBeGreaterThan(nb(s, ALLY).trust);
    const news = answered.region!.news.at(-1)!;
    expect(["ally-defended", "ally-lost"]).toContain(news.key);
    expect(news.barangay).toBe(ALLY);
  });

  it("can't be answered with no Mandirigma at home", () => {
    const s = { ...called(), warriors: 0 };
    expect(apply(s, eager, { type: "choose", option: "send" })).toBe(s);
  });

  it("saying no costs trust with that ally, and the ally fights alone", () => {
    const s = called();
    const refused = apply(s, eager, { type: "choose", option: "refuse" });
    expect(refused.choice).toBeNull();
    expect(refused.region!.allyCall).toBeNull();
    expect(nb(refused, ALLY).trust).toBe(nb(s, ALLY).trust - c.ignoreTrust);
    expect(refused.warriors).toBe(s.warriors);
    expect(["ally-defended", "ally-lost"]).toContain(refused.region!.news.at(-1)!.key);
  });

  it("left unanswered until the raid strikes, it counts as ignored", () => {
    const s = called();
    const later = tick(s, { ...eager, rules: { ...eager.rules, allyCalls: { ...c, chancePerSecond: 0 } } }, c.warningSeconds + 1);
    expect(later.choice).toBeNull();
    expect(later.region!.allyCall).toBeNull();
    expect(nb(later, ALLY).trust).toBeLessThan(nb(s, ALLY).trust);
  });

  it("comes at most once per cooldown", () => {
    const s = apply(called(), eager, { type: "choose", option: "refuse" });
    expect(tick(s, eager, 5).choice).toBeNull();
    expect(tick(s, eager, c.cooldownSeconds + 1).choice?.id).toBe("ally-call");
  });

  it("survives a save, with the raider named", () => {
    const s = called();
    const back = parseSave(JSON.stringify(s), content)!;
    expect(back.region!.allyCall).toEqual(s.region!.allyCall);
    expect(back.choice).toEqual(s.choice);
  });

  it("a dev command (?dev=1) raids a chosen ally", () => {
    const s = world();
    const raided = apply(s, content, { type: "dev", action: "allyRaid", ally: ALLY });
    expect(raided.devSave).toBe(true);
    expect(raided.choice?.id).toBe("ally-call");
    expect(raided.region!.allyCall?.ally).toBe(ALLY);
    // Not an ally: nothing happens.
    expect(apply(s, content, { type: "dev", action: "allyRaid", ally: "batong-buhay" })).toBe(s);
    expect(startAllyCall(raided, content, ALLY, "batong-buhay", 0)).toBe(raided);
  });
});
