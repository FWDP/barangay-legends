import { describe, expect, it } from "vitest";
import { newGame, type GameState } from "../engine/game";
import { at, content, withState } from "../engine/testUtils";
import { awayStory } from "./away";

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
