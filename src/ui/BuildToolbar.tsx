import { RESOURCES, type BuildingDef, type Content } from "../engine/content";
import { buildingCost, canAfford, owned, roadCost, staffedBuildings, unreachableWorkplaces, type GameState } from "../engine/game";
import { isUnlocked } from "../engine/map";
import { bonusRuleText, groveRuleText, RESOURCE_ICON } from "./format";

function effectText(b: BuildingDef): string {
  const parts: string[] = [];
  if (b.housing) parts.push(`+${b.housing} villager capacity`);
  if (b.storage?.rice) parts.push(`+${b.storage.rice} rice storage`);
  if (b.placeNextTo) parts.push(`next to the ${b.placeNextTo.join(" or ")}`);
  for (const r of RESOURCES) {
    const amount = b.produces?.[r];
    if (amount) parts.push(`+${amount} ${r}/s per worker`);
  }
  if (b.workers) parts.push(`${b.workers} workers`);
  if (b.heals) parts.push(`sick villagers heal ${b.heals.percentFaster}% faster`);
  if (b.bridge) parts.push("crosses the river, opening the far bank");
  return parts.join(", ");
}

/**
 * Bottom toolbar of building cards. Tap a card to pick it up, then tap a tile to place it.
 * On desktop a card can also be dragged onto the map.
 */
export function BuildToolbar(props: {
  state: GameState;
  content: Content;
  selected: string | null;
  onSelect: (id: string | null) => void;
  /** Laying Daan right now. */
  roadActive: boolean;
  onRoad: () => void;
}) {
  const { state, content, selected, onSelect, roadActive, onRoad } = props;
  const staffed = staffedBuildings(state, content);
  const noPath = unreachableWorkplaces(state, content).reduce<Record<string, number>>((m, b) => ({ ...m, [b.type]: (m[b.type] ?? 0) + 1 }), {});
  const daanCost = roadCost(content);
  const daanParts = RESOURCES.filter((r) => daanCost[r] > 0);
  const canLay = canAfford(state, daanCost);

  return (
    <nav
      aria-label="Build"
      className="bamboo-panel relative z-20 border-t-2 border-amber-950/50 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
    >
      <ul className="mx-auto flex max-w-4xl snap-x gap-1.5 overflow-x-auto px-1 pt-1 pb-1 sm:gap-2">
        {content.buildings.map((b) => {
            const count = owned(state, b.id);
            const cost = buildingCost(content, b, count);
            const unlocked = isUnlocked(state, b);
            const affordable = unlocked && canAfford(state, cost);
            const costParts = RESOURCES.filter((r) => cost[r] > 0);
            const isSelected = selected === b.id;
            const bonus = bonusRuleText(b, content);
            const groveRule = groveRuleText(b, content);
            return (
              <li key={b.id} className="min-w-[5rem] flex-1 snap-start sm:min-w-[6.6rem]">
                <button
                  type="button"
                  disabled={!affordable}
                  draggable={affordable}
                  onClick={() => onSelect(isSelected ? null : b.id)}
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", b.id);
                    e.dataTransfer.effectAllowed = "copy";
                    onSelect(b.id);
                  }}
                  onDragEnd={() => onSelect(null)}
                  aria-pressed={isSelected}
                  title={[b.description, effectText(b), bonus, groveRule].filter(Boolean).join(". ") + "."}
                  aria-label={
                    unlocked
                      ? `${isSelected ? "Placing" : "Build"} ${b.name} for ${costParts.map((r) => `${cost[r]} ${r}`).join(", ")}. You have ${count}.`
                      : `${b.name}: unlocks at ${b.unlock.villagers} villagers.`
                  }
                  className={`game-btn mat-card flex h-full w-full flex-col items-center gap-0.5 border-2 px-1.5 pt-1.5 pb-1 text-stone-800 shadow-md disabled:cursor-not-allowed ${
                    isSelected
                      ? "-translate-y-1 border-amber-500 ring-4 ring-amber-300"
                      : "border-amber-900/70"
                  } ${affordable ? "cursor-grab active:cursor-grabbing" : ""}`}
                >
                  <span className={`text-3xl leading-none sm:text-4xl ${affordable ? "" : "opacity-50 grayscale"}`} aria-hidden>
                    {b.icon}
                  </span>
                  <span className="text-center font-display text-[13px] leading-tight text-amber-950 sm:text-base">{b.name}</span>
                  <span className="text-[10px] leading-tight text-stone-600 sm:text-xs">
                    × {count}
                    {b.id in staffed && ` · ${staffed[b.id]} staffed`}
                  </span>
                  <span className="hidden text-[11px] leading-tight text-stone-500 sm:block">{effectText(b)}</span>
                  {bonus && <span className="hidden text-[11px] leading-tight text-amber-800 sm:block">✨ {bonus}</span>}
                  {groveRule && <span className="hidden text-[11px] leading-tight text-emerald-800 sm:block">{groveRule}</span>}
                  {noPath[b.id] > 0 && (
                    <span className="rounded bg-red-100 px-1 text-[10px] leading-tight font-semibold text-red-900 sm:text-[11px]" title="Workers can't walk there: build a Tulay or move it">
                      🚫 {noPath[b.id]} no path
                    </span>
                  )}
                  <span
                    className={`mt-auto w-full rounded-md px-1 py-0.5 text-[11px] leading-tight font-semibold sm:text-sm ${
                      affordable ? "bg-green-700 text-white" : unlocked ? "bg-stone-300 text-stone-500" : "bg-stone-700 text-stone-100"
                    }`}
                  >
                    {unlocked
                      ? costParts.map((r) => `${RESOURCE_ICON[r]} ${cost[r]} ${r}`).join(" ")
                      : `🔒 ${b.unlock.villagers} 👥`}
                  </span>
                </button>
              </li>
            );
          })}
        <li className="min-w-[5rem] flex-1 snap-start sm:min-w-[6.6rem]">
          <button
            type="button"
            disabled={!canLay && !roadActive}
            onClick={onRoad}
            aria-pressed={roadActive}
            title={`Daan: a dirt footpath on cleared land. Villagers walk faster on it, and buildings joined to the plaza by an unbroken Daan get +${content.rules.roads.connectedBonusPercent}% output. Taking one up is free.`}
            aria-label={`${roadActive ? "Stop laying" : "Lay"} Daan footpaths for ${daanParts.map((r) => `${daanCost[r]} ${r}`).join(", ")} a tile`}
            className={`game-btn mat-card flex h-full w-full flex-col items-center gap-0.5 border-2 px-1.5 pt-1.5 pb-1 text-stone-800 shadow-md disabled:cursor-not-allowed ${
              roadActive ? "-translate-y-1 border-amber-500 ring-4 ring-amber-300" : "border-amber-900/70"
            }`}
          >
            <span className={`text-3xl leading-none sm:text-4xl ${canLay ? "" : "opacity-50 grayscale"}`} aria-hidden>
              🛤️
            </span>
            <span className="text-center font-display text-[13px] leading-tight text-amber-950 sm:text-base">Daan</span>
            <span className="text-[10px] leading-tight text-stone-600 sm:text-xs">footpath</span>
            <span className="hidden text-[11px] leading-tight text-amber-800 sm:block">✨ +{content.rules.roads.connectedBonusPercent}% when linked to the plaza</span>
            <span className={`mt-auto w-full rounded-md px-1 py-0.5 text-[11px] leading-tight font-semibold sm:text-sm ${canLay ? "bg-green-700 text-white" : "bg-stone-300 text-stone-500"}`}>
              {daanParts.map((r) => `${RESOURCE_ICON[r]} ${daanCost[r]}`).join(" ")} / tile
            </span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
