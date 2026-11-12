// "While you were away": what happened between two snapshots of the game, told as a few short
// sentences instead of a table of numbers. Pure, so it is tested.
import type { Content } from "../engine/content";
import { choiceDef } from "../engine/choices";
import { seasonAt } from "../engine/events";
import type { GameState } from "../engine/game";
import { neighborDef, type Report } from "../engine/region";

/** Shorter absences aren't worth a story. */
export const AWAY_MIN_SECONDS = 60;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const goods = (g?: Partial<Record<string, number>>) =>
  Object.entries(g ?? {})
    .filter(([, n]) => (n ?? 0) > 0)
    .map(([r, n]) => `${n} ${r}`)
    .join(" and ");

function reportLine(r: Report, content: Content): string | null {
  const who = neighborDef(content, r.neighbor);
  const name = who?.name ?? r.neighbor;
  switch (r.kind) {
    case "defense":
      return r.win
        ? `Raiders from ${name} came by karakoa, but your warriors drove them off at the gates.`
        : `Raiders from ${name} came by karakoa and carried off ${goods(r.lost) || "what they could"}. Your houses still stand.`;
    case "tributary":
      return `${name} now sends you tribute as your tributary.`;
    case "rebellion":
      return `${name} grew tired of paying tribute and broke away.`;
    case "alliance":
      return `A blood compact now binds you to ${name}.`;
    case "raid":
      return null;
  }
}

/** The story of an absence, one sentence per thing that happened. Empty if it was too short. */
export function awayStory(before: GameState, after: GameState, content: Content): string[] {
  const seconds = after.time - before.time;
  if (seconds < AWAY_MIN_SECONDS) return [];
  const minutes = Math.round(seconds / 60);
  const lines: string[] = [`You were gone for ${minutes <= 1 ? "about a minute" : `about ${minutes} minutes`}.`];

  // The season turning.
  const s0 = seasonAt(content, before.time)?.season;
  const s1 = seasonAt(content, after.time)?.season;
  if (s0 && s1 && s0.id !== s1.id) lines.push(`${s0.name} gave way to ${s1.name}. ${s1.description}`);

  // Rice and wood.
  const rice = Math.round(after.resources.rice - before.resources.rice);
  const wood = Math.round(after.resources.wood - before.resources.wood);
  const gains = [rice > 0 && `${rice} rice`, wood > 0 && `${wood} wood`].filter(Boolean);
  if (gains.length) lines.push(`Your people brought in ${gains.join(" and ")}.`);
  if (rice < 0) lines.push(`The barangay ate through ${-rice} rice${after.resources.rice <= 0 ? ", and the granary is empty" : ""}.`);

  // People.
  const villagers = after.villagers - before.villagers;
  if (villagers > 0) lines.push(`${plural(villagers, "newcomer", "newcomers")} settled in the barangay.`);
  if (villagers < 0) {
    const why = after.hunger > 0 || before.hunger > 0 ? " There was not enough rice." : "";
    lines.push(`${plural(-villagers, "villager", "villagers")} left.${why}`);
  }
  if (after.sick.length > before.sick.length) lines.push(`Sickness spread: ${plural(after.sick.length, "villager is", "villagers are")} sick now.`);
  else if (before.sick.length > 0 && after.sick.length === 0) lines.push("The sick have all recovered.");

  // Damage from fire and storm.
  const damaged = after.buildings.filter((b) => b.damaged).length - before.buildings.filter((b) => b.damaged).length;
  if (damaged > 0) lines.push(`${plural(damaged, "building was", "buildings were")} damaged by fire or storm. Tap ${damaged === 1 ? "it" : "them"} to repair.`);

  // Raids and diplomacy.
  const seen = Math.max(0, ...(before.region?.reports ?? []).map((r) => r.id));
  for (const r of after.region?.reports ?? []) {
    if (r.id <= seen) continue;
    const line = reportLine(r, content);
    if (line) lines.push(line);
  }

  // What is waiting for the datu now.
  const offer = after.region?.offer;
  if (offer) lines.push(`A bangka from ${neighborDef(content, offer.from)?.name ?? offer.from} is waiting at the dock with goods to trade.`);
  if (after.region?.incomingRaid) lines.push(`Warriors from ${neighborDef(content, after.region.incomingRaid.from)?.name ?? "a rival"} are on their way!`);
  if (after.typhoon) lines.push("Dark clouds gather over the sea: a typhoon is coming.");
  const choice = after.choice && choiceDef(content, after.choice.id);
  if (choice) lines.push(`A matter waits for the datu: ${choice.title.replace(/[.?!]$/, "")}.`);

  if (lines.length === 1) lines.push("The barangay went about its days quietly.");
  return lines;
}
