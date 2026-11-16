// A lively barangay (W.6, social.ts and the scenes in ui/villagers.ts).
import { describe, expect, it } from "vitest";
import { tick, type GameState } from "./game";
import { happinessTarget } from "./happiness";
import { feastSicknessFactor, freeShare, isTired, socialHappiness, socialMoment } from "./social";
import { noteSocialMoments } from "./talambuhay";
import { parseSave } from "./save";
import { goal, socialScene, type VillagerPlan } from "../ui/villagers";
import { at, calm, content, withState } from "./testUtils";

const r = content.rules.social;
const plan = (id: number, patch: Partial<VillagerPlan> = {}): VillagerPlan => ({ id, role: "idle", place: null, home: { x: 5, y: 3 }, look: { gender: "woman", age: "adult", malong: false }, ...patch }) as VillagerPlan;

describe("evening life and tiredness", () => {
  it("a barangay with free time is a little happier", () => {
    const s = withState({ villagers: 10, buildings: [at("bahay-kubo", 5, 3)] });
    expect(freeShare(s, content)).toBe(1);
    expect(socialHappiness(s, content)).toBe(r.livelyHappiness);
    expect(happinessTarget(s, content).social).toBe(r.livelyHappiness);
  });

  it("one where everyone works all the time slowly tires: 'Pagod na ang mga tao'", () => {
    const busy = withState({ villagers: 4, buildings: [at("bahay-kubo", 5, 3), at("gabihan", 1, 2), at("gabihan", 1, 6), at("gabihan", 1, 4), at("gabihan", 1, 8)] });
    expect(freeShare(busy, content) * 100).toBeLessThan(r.tiredFreeBelowPercent);
    const later = tick(busy, calm, r.tiredAfterSeconds + 2);
    expect(isTired(later, content)).toBe(true);
    expect(socialHappiness(later, content)).toBe(r.tiredHappiness);
    expect(parseSave(JSON.stringify(later), content)!.tiredFor).toBeGreaterThan(0);
  });

  it("a crowded Pista spreads sickness a little faster", () => {
    const s = withState({ time: 10 });
    expect(feastSicknessFactor(s, content)).toBe(1);
    const feast = { ...s, pista: { occasion: "harvest" as const, at: 0, until: 100, guests: [] } };
    expect(feastSicknessFactor(feast, content)).toBe(1 + r.feastSickPercent / 100);
  });
});

describe("music, dancing and games", () => {
  it("no music or dancing while the barangay mourns", () => {
    const s = withState({ time: 10, pista: { occasion: "harvest", at: 0, until: 100, guests: ["malinaw"] } });
    const mourning = { ...s, mourning: 30 };
    expect(socialScene(mourning, content)).toMatchObject({ quiet: true, pista: null });
    // A fireside musician at night stays quiet while mourning.
    const musician = plan(12);
    expect(goal(musician, 0, true, { x: 5, y: 4 }, false, false, socialScene(mourning, content)).doing).toBeUndefined();
    expect(goal(musician, 0, true, { x: 5, y: 4 }, false, false, socialScene({ ...s, pista: null }, content)).doing).toBe("music");
  });

  it("a Pista fills the clearing with dancers and music, with guests from the invited barangays", () => {
    const s = withState({ time: 10, pista: { occasion: "victory", at: 0, until: 100, guests: ["malinaw", "talampas"] } });
    const scene = socialScene(s, content);
    expect(scene.pista).toEqual({ occasion: "victory", guests: 2 });
    expect(goal(plan(2), 0, false, { x: 5, y: 4 }, false, false, scene).doing).toBe("dance");
    expect(goal(plan(16), 0, false, { x: 5, y: 4 }, false, false, scene).doing).toBe("music");
    // Kulintang only in Maranao (malong) barangays; elsewhere the agong and flutes.
    expect(socialScene({ ...s, tradition: "maranao" }, content).music).toBe("kulintang");
    expect(socialScene({ ...s, tradition: "tagalog" }, content).music).toBe("agong");
  });

  it("children play by day, and neighbors sit under the silong in the evening", () => {
    const child = plan(3, { look: { gender: "man", age: "child", malong: false } });
    expect(goal(child, 0, false, { x: 5, y: 4 }, false).doing).toBe("play");
    expect(goal(plan(5), 0, true, { x: 5, y: 4 }, false, true).doing).toBe("silong");
  });
});

describe("social moments in life stories", () => {
  it("evenings add lines like a sipa contest won or a song taught, never while mourning", () => {
    const named = [1, 2, 3].map((id) => ({ id, name: `V${id}`, story: "singer", role: "villager" as const, since: 0, resident: id }));
    const s = withState({ villagers: 6, named });
    let moments = 0;
    for (let k = 0; k < 40; k++) if (socialMoment(s, content, k)) moments++;
    expect(moments).toBeGreaterThan(0);
    for (let k = 0; k < 40; k++) expect(socialMoment({ ...s, mourning: 10 }, content, k)).toBeNull();
    const day = content.rules.dayNight.daySeconds;
    const after = noteSocialMoments(s, { ...s, time: day * 20 } as GameState, content);
    expect(after.named.some((v) => v.life?.some((e) => e.kind === "social"))).toBe(true);
  });
});
