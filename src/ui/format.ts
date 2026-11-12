import { RESOURCES, type BuildingDef, type Content, type Resource } from "../engine/content";
import type { Rates } from "../engine/game";

export const RESOURCE_ICON: Record<Resource, string> = { rice: "🍚", wood: "🪵" };
const PRODUCED_LABEL: Record<Resource, string> = { rice: "farmed", wood: "chopped" };

export function formatAmount(n: number): string {
  return Math.floor(n).toLocaleString("en");
}

const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(1)}`;

export function formatRate(n: number): string {
  return `${signed(n)}/s`;
}

/** e.g. "+5.0 farmed · −2.0 eaten = +3.0/s" */
export function formatBreakdown(rates: Rates, r: Resource): string {
  const parts = [`${signed(rates.produced[r])} ${PRODUCED_LABEL[r]}`];
  if (rates.eaten[r] > 0) parts.push(`${signed(-rates.eaten[r])} eaten`);
  return `${parts.join(" · ")} = ${formatRate(rates.net[r])}`;
}

const TERRAIN_NAME: Record<string, string> = { river: "the river", forest: "the forest" };

/** e.g. "+10% next to the river or Palayan", built from the building's JSON. */
export function bonusRuleText(def: BuildingDef, content: Content): string | null {
  const bonus = def.adjacencyBonus;
  if (!bonus) return null;
  const names = bonus.nextTo.map(
    (t) => TERRAIN_NAME[t] ?? content.buildings.find((b) => b.id === t)?.name ?? t,
  );
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} or ${names.at(-1)}` : names[0];
  return `+${bonus.percent}% next to ${list}`;
}

/** e.g. "+10% rice" for a ghost preview; "No bonus" when the tile gives none. */
export function bonusPreviewText(def: BuildingDef, bonus: number): string {
  if (bonus <= 0) return "No bonus";
  const resources = RESOURCES.filter((r) => (def.produces?.[r] ?? 0) > 0);
  return `+${Math.round(bonus * 100)}% ${resources.join(" & ") || "bonus"}`;
}
