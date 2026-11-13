// The battle at a barangay's border, the same in both directions: AI raiders on the player's
// shore, and the player's raiders on an AI barangay's. Raiders land on a river bank or beach;
// the defenders' warriors walk out from their Kutas and fight only if they get there within the
// raid warning; a Kuta counts in full only if the landing is within its radius; allies who
// arrive in time add their share. Pure and deterministic (the one roll is passed in), so a
// server can run it for real players later.
import type { Content } from "./content";
import type { GameState } from "./game";
import { borderDefense, chooseLanding, type Muster } from "./border";
import type { Point } from "./map";
import { dayAt } from "./daynight";
import { blocOf } from "./politics";
import { sameIsland, travelSeconds } from "./archipelago";
import { attackOf, defenseOf, homeWarriors, neighborDef, resolveBattle, type AllyDefender, type BattleResult, type NeighborState, type RegionState } from "./region";
import { generateVillage } from "./village";

export interface BorderBattle {
  landing: Point | null;
  /** Who got to the landing (null with no landing at all: then everyone at home fights, every Kuta in full). */
  muster: Muster | null;
  /** Every ally who could come, and whether they arrived in time. */
  allies: AllyDefender[];
  attack: number;
  defense: number;
  /** The defenders' own warriors who fought. */
  defenders: number;
  battle: BattleResult;
}

/**
 * Resolves a raid on `defender` landing at `landing`: `attackers` warriors against the muster
 * at the landing, the Kutas after their radius and the allies who arrive in time. `roll` is
 * one seeded roll in [0, 1).
 */
export function borderBattle(defender: GameState, content: Content, landing: Point | null, attackers: number, allies: AllyDefender[], roll: number): BorderBattle {
  const d = content.rules.diplomacy;
  const m = content.rules.military;
  const helping = allies.filter((a) => a.arrives);
  const allyDefense = helping.reduce((sum, a) => sum + (a.warriors * m.warrior.defense * d.sandugo.allyDefensePercent) / 100, 0);
  const border = landing ? borderDefense(defender, content, landing, d.aiRaid.warningSeconds) : null;
  const defense = (border ? border.defense : defenseOf(defender, content)) + allyDefense;
  const attack = attackOf(attackers, content);
  return {
    landing,
    muster: border?.muster ?? null,
    allies,
    attack,
    defense,
    defenders: border ? border.muster.joined : homeWarriors(defender),
    battle: resolveBattle(attack, defense, roll, content),
  };
}

/**
 * Who comes to defend barangay `to` from among `candidates`: on the same island they walk
 * (landSeconds plus distance); from another island only those big enough to have boats sail.
 * They fight only if they arrive within the raid warning.
 */
export function alliesComing(region: RegionState, content: Content, to: string, candidates: NeighborState[]): AllyDefender[] {
  const a = content.rules.allyDefense;
  const warning = content.rules.diplomacy.aiRaid.warningSeconds;
  return candidates
    .filter((n) => n.id !== to && n.state.warriors > 0)
    .map((n) => {
      const land = sameIsland(region.places, to, n.id);
      const pa = region.places[to];
      const pb = region.places[n.id];
      const distance = pa && pb ? Math.hypot(pa.x - pb.x, pa.y - pb.y) : 0;
      const eta = land
        ? Math.round(a.landSeconds + distance * a.landSecondsPerUnit)
        : n.state.villagers >= a.balangayMinVillagers
          ? travelSeconds(content, region.islands, region.places, n.id, to)
          : null;
      return { id: n.id, warriors: n.state.warriors, eta, arrives: eta !== null && eta <= warning, by: land ? ("land" as const) : ("sea" as const) };
    });
}

/** The key the landing of a raid on an AI barangay is rolled with: the day (Araw), so the visit preview holds all day. */
export const raidKey = (state: GameState, content: Content) => dayAt(content, state.foundedAt, state.time);

/** Where the player's raiders would land on a village: one of the landing spots nearest it, picked by the seeded roll. */
export const playerRaidLanding = (village: GameState, content: Content, key: number) => chooseLanding(village, content, key);

/**
 * A raid by the player on neighbor `id`, before the roll: their village (the generated one a
 * visit shows, with their warriors), where the raiders land, and their bloc mates who could
 * come. Null if there's no such neighbor.
 */
export function raidSetup(state: GameState, content: Content, id: string): { village: GameState; landing: Point | null; allies: AllyDefender[] } | null {
  const region = state.region;
  const target = region?.neighbors.find((n) => n.id === id);
  const def = neighborDef(content, id);
  if (!region || !target || !def) return null;
  const village = { ...generateVillage(content, target, def, state.time), warriors: target.state.warriors };
  const landing = playerRaidLanding(village, content, raidKey(state, content));
  const bloc = blocOf(region.politics, id);
  const mates = bloc ? region.neighbors.filter((n) => bloc.members.includes(n.id) && n.id !== state.barangay.id) : [];
  return { village, landing, allies: alliesComing(region, content, id, mates) };
}
