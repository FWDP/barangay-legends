// Mga Gawain: a chain of tasks (content/quests) that teach the game, each with a reward.
// The engine checks the current task every step, so tasks met while the player was away are
// credited on return. Only the ids of finished tasks are saved; the current task is the first
// one in the chain not yet done, so content can add tasks later without a save change.
import { RESOURCES, type Content, type QuestDef, type Text } from "./content";
import type { GameState } from "./game";
import { isConnected } from "./map";
import { addHistory } from "./people";

/** The task to show now, or null when every task is done ("More tasks coming soon"). */
export function currentTask(state: GameState, content: Content): QuestDef | null {
  return content.quests.find((q) => !state.gawainDone.includes(q.id)) ?? null;
}

/** When a season first ends (game seconds), or null if there is no such season. */
export function firstSeasonEnd(content: Content, id: string): number | null {
  let t = 0;
  for (const s of content.events.seasons?.seasons ?? []) {
    t += s.durationSeconds;
    if (s.id === id) return t;
  }
  return null;
}

/** How far along a task is: have / need (need 1 for yes-or-no tasks). */
export function taskProgress(state: GameState, content: Content, q: QuestDef): { have: number; need: number } {
  const c = q.condition;
  switch (c.type) {
    case "built":
      return { have: state.buildings.filter((b) => b.type === c.building).length, need: c.count };
    case "villagers":
      return { have: state.villagers, need: c.count };
    case "tilesCleared":
      return { have: state.tilesCleared, need: c.count };
    case "connected":
      return { have: state.buildings.filter((b) => !b.span && isConnected(state.map, b.x, b.y)).length, need: c.count };
    case "survivedSeason": {
      const end = firstSeasonEnd(content, c.season);
      return { have: end !== null && state.time >= end && state.villagers > 0 ? 1 : 0, need: 1 };
    }
    case "traded":
      return { have: state.region?.paths.includes("trade") ? 1 : 0, need: 1 };
    case "warriors":
      return { have: state.warriors, need: c.count };
    case "raidsDefended":
      return { have: state.stats.raidsDefended, need: c.count };
    case "tributaries":
      return { have: state.region?.neighbors.filter((n) => n.status === "tributary").length ?? 0, need: c.count };
    case "aklat":
      return { have: state.aklat.length, need: c.count };
    case "replanted":
      return { have: state.stats.replanted, need: c.count };
    case "permittedClears":
      return { have: state.stats.permittedClears, need: c.count };
  }
}

export function taskMet(state: GameState, content: Content, q: QuestDef): boolean {
  const p = taskProgress(state, content, q);
  return p.have >= p.need;
}

/** Finishes the current task (and any after it already met): rewards paid, each noted in the history. */
export function checkTasks(state: GameState, content: Content): GameState {
  let s = state;
  for (let q = currentTask(s, content); q && taskMet(s, content, q); q = currentTask(s, content)) {
    const resources = { ...s.resources };
    for (const r of RESOURCES) resources[r] += q.reward.resources?.[r] ?? 0;
    s = addHistory({ ...s, resources, gawainDone: [...s.gawainDone, q.id] }, { at: s.time, kind: "task", task: q.id });
  }
  return s;
}

/** The datu's title: the latest one a finished task gave, or null. */
export function datuTitle(state: GameState, content: Content): Text | null {
  for (const id of [...state.gawainDone].reverse()) {
    const title = content.quests.find((q) => q.id === id)?.reward.title;
    if (title) return title;
  }
  return null;
}

/** Every title earned, oldest first. */
export function earnedTitles(state: GameState, content: Content): Text[] {
  return content.quests.filter((q) => state.gawainDone.includes(q.id) && q.reward.title).map((q) => q.reward.title!);
}
