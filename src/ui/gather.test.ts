// Starting the game (W.8): forage, not rice; the buttons shrink once food and wood come in.
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { automationStarted, GatherButtons } from "./GatherButtons";
import { loadUiContent } from "./uiContent";
import { newGame } from "../engine/game";
import { at, content, withState } from "../engine/testUtils";

const game = loadUiContent(content).game;

describe("starting the game", () => {
  it("has Forage and Gather Wood, never a Gather Rice button", () => {
    const html = renderToStaticMarkup(createElement(GatherButtons, { amount: 1, quiet: false, game, lang: "en", onGather: () => {} }));
    expect(html).toContain(game.gather.food.en);
    expect(html).toContain('data-gather="food"');
    expect(html).toContain('data-gather="wood"');
    expect(html.toLowerCase()).not.toContain("rice");
    expect(content.rules.gatherable).not.toContain("rice");
  });

  it("the buttons shrink once a food and a wood workplace have people working", () => {
    expect(automationStarted(newGame(content, 3), content)).toBe(false);
    const working = withState({ villagers: 6, buildings: [at("bahay-kubo", 5, 3), at("gabihan", 1, 2), at("woodcutter-camp", 8, 4)] });
    expect(automationStarted(working, content)).toBe(true);
    expect(automationStarted({ ...working, villagers: 0 }, content)).toBe(false);
  });

  it("the adviser and the first tasks never ask a new player to gather rice", () => {
    const ui = loadUiContent(content);
    for (const step of ui.advisor.tutorial) expect(step.text.en.toLowerCase()).not.toMatch(/gather rice/);
    expect(content.quests[0].condition.type).toBe("foraged");
  });
});
