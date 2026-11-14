// Storage: how much rice the barangay can hold. Each Kamalig (any building with "storage")
// raises the cap. Production and gathering stop at the cap; rice already stored above it (a
// gift, a trade, a reward, a Kamalig lost) is never thrown away.
import type { Content, Resource } from "./content";
import type { GameState } from "./game";
import { levelOf, storageAt } from "./upgrades";

/** Rice the barangay can hold: rules.storage.baseRice plus each standing building's storage at its level. */
export function riceCap(state: GameState, content: Content): number {
  const defs = new Map(content.buildings.map((d) => [d.id, d]));
  return state.buildings.reduce((sum, b) => sum + (b.damaged ? 0 : (storageAt(defs.get(b.type), levelOf(b)).rice ?? 0)), content.rules.storage.baseRice);
}

/** The cap for a resource (only rice has one). */
export function storageCap(state: GameState, content: Content, r: Resource): number {
  return r === "rice" ? riceCap(state, content) : Infinity;
}

/**
 * What `after` becomes when it may not grow past `cap`: an amount that was already above the
 * cap may shrink but not grow; one below it stops at the cap.
 */
export function capGrowth(before: number, after: number, cap: number): number {
  if (after <= cap || after <= before) return after;
  return Math.max(cap, before);
}

/** Is the rice store full? */
export function riceFull(state: GameState, content: Content): boolean {
  return state.resources.rice >= riceCap(state, content);
}
