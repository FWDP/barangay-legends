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

/**
 * Ghost preview label, e.g. "+10% wood · 🌳 Kapre's grove +25%"; "No bonus" when the tile
 * gives none. `grove` is the grove bonus there, if any, with the grove's name.
 */
export function bonusPreviewText(def: BuildingDef, bonus: number, grove?: { name: string; bonus: number }): string {
  const parts: string[] = [];
  if (bonus > 0) {
    const resources = RESOURCES.filter((r) => (def.produces?.[r] ?? 0) > 0);
    parts.push(`+${Math.round(bonus * 100)}% ${resources.join(" & ") || "bonus"}`);
  }
  if (grove && grove.bonus > 0) parts.push(`🌳 ${grove.name} +${Math.round(grove.bonus * 100)}%`);
  return parts.length ? parts.join(" · ") : "No bonus";
}

/** e.g. "🌳 Kapre's grove: +25% wood within 3 tiles of an old balete", for building cards. */
export function groveRuleText(def: BuildingDef, content: Content): string | null {
  const grove = content.groves.find((g) => g.affects === def.id);
  if (!grove) return null;
  const tile = content.lore[grove.tile]?.name.toLowerCase() ?? grove.tile;
  return `🌳 ${grove.name}: +${grove.percent}% ${grove.resource} within ${grove.radius} tiles of an ${tile}`;
}

/** The balete warning with the grove's real numbers filled in. */
export function baleteWarning(content: Content): string {
  const grove = content.groves.find((g) => g.tile === "balete");
  const text = String(content.lore.balete?.clearWarning ?? "This can't be undone.");
  return text.replace("{percent}", String(grove?.percent ?? 0));
}
