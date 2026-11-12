import { RESOURCES, type BuildingDef, type Content } from "../engine/content";
import { buildingCost, canAfford, owned, staffedBuildings, type GameState } from "../engine/game";
import { bonusRuleText, RESOURCE_ICON } from "./format";

function effectText(b: BuildingDef): string {
  const parts: string[] = [];
  if (b.housing) parts.push(`+${b.housing} villager capacity`);
  for (const r of RESOURCES) {
    const amount = b.produces?.[r];
    if (amount) parts.push(`+${amount} ${r}/s per worker`);
  }
  if (b.workers) parts.push(`${b.workers} workers`);
  if (b.heals) parts.push(`sick villagers heal ${b.heals.percentFaster}% faster`);
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
}) {
  const { state, content, selected, onSelect } = props;
  const staffed = staffedBuildings(state, content);

  return (
    <nav
      aria-label="Build"
      className="bamboo-panel relative z-20 border-t-2 border-amber-950/50 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
    >
      <ul className="mx-auto flex max-w-4xl snap-x gap-1.5 overflow-x-auto px-1 pt-1 pb-1 sm:gap-2">
        {content.buildings
          .filter((b) => b.unlock.start)
          .map((b) => {
            const count = owned(state, b.id);
            const cost = buildingCost(content, b, count);
            const affordable = canAfford(state, cost);
            const costParts = RESOURCES.filter((r) => cost[r] > 0);
            const isSelected = selected === b.id;
            const bonus = bonusRuleText(b, content);
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
                  title={[b.description, effectText(b), bonus].filter(Boolean).join(". ") + "."}
                  aria-label={`${isSelected ? "Placing" : "Build"} ${b.name} for ${costParts.map((r) => `${cost[r]} ${r}`).join(", ")}. You have ${count}.`}
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
                  <span
                    className={`mt-auto w-full rounded-md px-1 py-0.5 text-[11px] leading-tight font-semibold sm:text-sm ${
                      affordable ? "bg-green-700 text-white" : "bg-stone-300 text-stone-500"
                    }`}
                  >
                    {costParts.map((r) => `${RESOURCE_ICON[r]} ${cost[r]} ${r}`).join(" ")}
                  </span>
                </button>
              </li>
            );
          })}
      </ul>
    </nav>
  );
}
