import { describe, expect, it } from "vitest";
import { createRegion } from "../engine/region";
import { calm, content, withState } from "../engine/testUtils";
import { awayPeopleLines } from "./stories";
import { barangayName, blocColor, blocName, newsLine, warLine } from "./politicsText";
import { loadUiContent } from "./uiContent";
import { startWar } from "../engine/politics";

const game = loadUiContent(content).game;
const world = () => {
  const s = withState({ villagers: 20 });
  return { ...s, region: createRegion(calm, 0, 7, s.barangay.id) };
};

describe("politics text", () => {
  it("names barangays and blocs, the player's as 'You' and 'your alliance'", () => {
    const s = world();
    expect(barangayName(s, content, "malinaw", game, "en")).toBe("Malinaw");
    expect(barangayName(s, content, s.barangay.id, game, "en")).toBe("You");
    const bloc = s.region!.politics.blocs[0];
    expect(blocName(s, content, bloc.id, game, "en")).toBe(`${barangayName(s, content, bloc.leader, game, "en")}'s alliance`);
    const mine = { ...s, region: { ...s.region!, politics: { ...s.region!.politics, blocs: [...s.region!.politics.blocs, { id: "b9", leader: s.barangay.id, members: [s.barangay.id] }] } } };
    expect(blocName(mine, content, "b9", game, "en")).toBe("your alliance");
    expect(blocColor(mine, "b9")).toBe("#f59e0b");
  });

  it("tells scripted events and actions in the Balita, and in the away story", () => {
    const s = world();
    const bloc = s.region!.politics.blocs[0];
    const member = bloc.members.find((m) => m !== bloc.leader)!;
    const datu = content.neighbors.find((n) => n.id === member)!.datu;
    const line = newsLine({ id: 1, time: 5, key: "member-leaves", barangay: member, bloc: bloc.id }, s, content, game, "en");
    expect(line).toBe(`${datu} of ${barangayName(s, content, member, game, "en")} leaves ${blocName(s, content, bloc.id, game, "en")}.`);
    expect(newsLine({ id: 2, time: 5, key: "ally-defended", barangay: "malinaw", other: "batong-buhay" }, s, content, game, "en")).toBe("Your warriors helped Malinaw drive off Batong-Buhay.");
    const after = { ...s, time: 100, region: { ...s.region!, news: [{ id: 1, time: 50, key: "formed", barangay: "malinaw" }], nextNewsId: 2 } };
    expect(awayPeopleLines(s, after, content, game, "en")).toContain("🐚 Malinaw forms a new alliance.");
  });

  it("says which blocs are at war", () => {
    const s = world();
    const [a, b] = s.region!.politics.blocs;
    const warred = { ...s, region: { ...s.region!, politics: startWar(s.region!.politics, a.id, b.id, 0) } };
    expect(warLine(warred, content, a.leader, game, "en")).toBe(`At war with ${blocName(warred, content, b.id, game, "en")}`);
    expect(warLine(s, content, a.leader, game, "en")).toBeNull();
  });
});
