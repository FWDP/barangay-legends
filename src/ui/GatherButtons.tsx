import type { MouseEvent } from "react";
import type { Resource } from "../engine/content";
import { RESOURCE_ICON } from "./format";
import { ResourceIcon } from "./resourceArt";
import type { Lang } from "./settings";
import { fill, type GameText } from "./uiContent";

/**
 * Big labelled buttons while gathering by hand is the main income; small round ones once food
 * and wood come in on their own. Forage brings in everyday food (Pagkain), never rice: rice is a
 * prestige grain grown in a Palayan.
 */
export function GatherButtons(props: {
  amount: number;
  quiet: boolean;
  game: GameText;
  lang: Lang;
  onGather: (r: Resource, e: MouseEvent<HTMLButtonElement>) => void;
}) {
  const { amount, quiet, game, lang, onGather } = props;
  const t = game.gather;
  return (
    <div data-map-overlay className={`absolute right-3 bottom-3 z-10 flex gap-2 ${quiet ? "flex-col" : "flex-row"}`}>
      {(["food", "wood"] as const).map((r) => (
        <button
          key={r}
          type="button"
          data-gather={r}
          aria-label={fill(r === "food" ? t.foodLabel[lang] : t.woodLabel[lang], { amount })}
          onClick={(e) => onGather(r, e)}
          className={`game-btn border-2 font-display shadow-lg ${
            quiet
              ? "flex size-12 flex-col items-center justify-center rounded-full! border-amber-900/60 bg-amber-50/90 text-xs text-amber-900"
              : "border-amber-800 bg-amber-500 px-4 py-2.5 text-lg text-white text-outline"
          }`}
        >
          {quiet ? (
            <>
              <span className="text-xl leading-none">
                <ResourceIcon resource={r} symbol={RESOURCE_ICON[r]} />
              </span>
              +{amount}
            </>
          ) : (
            <>
              <ResourceIcon resource={r} symbol={RESOURCE_ICON[r]} /> {r === "food" ? t.food[lang] : t.wood[lang]}
            </>
          )}
        </button>
      ))}
    </div>
  );
}
