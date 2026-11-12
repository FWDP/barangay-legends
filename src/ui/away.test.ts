import { describe, expect, it } from "vitest";
import { newGame, type GameState } from "../engine/game";
import { at, content, withState } from "../engine/testUtils";
import { offlineProgress } from "../engine/offline";
import { awayStory, duration, offlineStory } from "./away";

const before = withState({ time: 100, villagers: 5, resources: { rice: 50, wood: 10 } });
const later = (patch: Partial<GameState>) => ({ ...before, time: before.time + 600, ...patch });

describe("while you were away", () => {
  it("says nothing for a short absence", () => {
    expect(awayStory(before, { ...before, time: before.time + 30 }, content)).toEqual([]);
  });

  it("tells production and newcomers as sentences", () => {
    const story = awayStory(before, later({ resources: { rice: 170, wood: 50 }, villagers: 7 }), content);
    expect(story[0]).toBe("You were gone for about 10 minutes.");
    expect(story).toContain("Your people brought in 120 rice and 40 wood.");
    expect(story).toContain("2 newcomers settled in the barangay.");
  });

  it("explains hunger and damage", () => {
    const story = awayStory(before, later({ resources: { rice: 0, wood: 10 }, villagers: 3, hunger: 40, buildings: [{ ...at("bahay-kubo", 5, 3), damaged: true }] }), content);
    expect(story).toContain("The barangay ate through 50 rice, and the granary is empty.");
    expect(story).toContain("2 villagers left. There was not enough rice.");
    expect(story).toContain("1 building was damaged by fire or storm. Tap it to repair.");
  });

  it("tells of raids, waiting boats and choice events", () => {
    const g = newGame(content, 4);
    const n = g.region!.neighbors[0].id;
    const b = { ...g, time: 0 };
    const a: GameState = {
      ...g,
      time: 900,
      region: {
        ...g.region!,
        reports: [{ id: 1, time: 500, kind: "defense", neighbor: n, win: true }],
        offer: { from: n, give: { resource: "rice", amount: 10 }, want: { resource: "wood", amount: 12 }, expiresAt: 950 },
      },
      choice: { id: "kaingin", neighbor: null, at: 880 },
    };
    const story = awayStory(b, a, content).join(" ");
    expect(story).toMatch(/drove them off/);
    expect(story).toMatch(/bangka .* waiting at the dock/);
    expect(story).toMatch(/A matter waits for the datu: Burn a kaingin\./);
  });

  it("notices a quiet time too", () => {
    expect(awayStory(before, later({}), content)).toContain("The barangay went about its days quietly.");
  });
});

describe("while you were away (game closed)", () => {
  const farm = withState({
    villagers: 3,
    resources: { rice: 200, wood: 0 },
    buildings: [at("bahay-kubo", 5, 3), at("bahay-kubo", 6, 3), at("palayan", 1, 4), at("woodcutter-camp", 8, 4)],
  });

  it("says how long, and that time beyond 8 hours wasn't counted", () => {
    const { state, report } = offlineProgress(farm, content, 20 * 3600);
    const story = offlineStory(report, farm, state, content);
    expect(story[0]).toBe("You were gone for about 20 hours.");
    expect(story[1]).toBe("The barangay kept working for 8 hours, then rested until you came back.");
  });

  it("tells the harvest and the newcomers", () => {
    const { state, report } = offlineProgress(farm, content, 1800);
    const story = offlineStory(report, farm, state, content).join(" ");
    expect(story).toMatch(/Your people brought in \d+ rice from the fields and \d+ wood from the forest, and ate \d+ rice\./);
    expect(story).toMatch(/newcomers? settled in the barangay/);
  });

  it("tells of hunger gently, without anyone leaving", () => {
    const hungry = { ...farm, villagers: 4, resources: { rice: 1, wood: 0 }, buildings: [at("bahay-kubo", 5, 3), at("woodcutter-camp", 8, 4)] };
    const { state, report } = offlineProgress(hungry, content, 3600);
    const story = offlineStory(report, hungry, state, content).join(" ");
    expect(story).toMatch(/granary was empty/);
    expect(story).not.toMatch(/left|died|raid|damaged/i);
  });

  it("reminds the player of warnings that waited", () => {
    const g = newGame(content, 3);
    const s = { ...g, typhoon: { strikeAt: 40 }, region: { ...g.region!, incomingRaid: { from: g.region!.neighbors[0].id, strikeAt: 30 } } };
    const { state, report } = offlineProgress(s, content, 3600);
    const story = offlineStory(report, s, state, content).join(" ");
    expect(story).toMatch(/still on their way/);
    expect(story).toMatch(/typhoon is still coming/);
  });

  it("says nothing when no time was credited", () => {
    const { state, report } = offlineProgress(farm, content, 10);
    expect(offlineStory(report, farm, state, content)).toEqual([]);
  });

  it("formats durations", () => {
    expect(duration(30)).toBe("about a minute");
    expect(duration(12 * 60)).toBe("about 12 minutes");
    expect(duration(3600)).toBe("about an hour");
    expect(duration(3 * 3600)).toBe("about 3 hours");
  });
});
