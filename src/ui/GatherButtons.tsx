import type { MouseEvent } from "react";
import type { Resource } from "../engine/content";
import { RESOURCE_ICON } from "./format";

/** Big labelled buttons while clicking is the main income; small round ones once production runs itself. */
export function GatherButtons(props: {
  amount: number;
  quiet: boolean;
  onGather: (r: Resource, e: MouseEvent<HTMLButtonElement>) => void;
}) {
  const { amount, quiet, onGather } = props;
  return (
    <div data-map-overlay className={`absolute right-3 bottom-3 z-10 flex gap-2 ${quiet ? "flex-col" : "flex-row"}`}>
      {(["rice", "wood"] as const).map((r) => (
        <button
          key={r}
          type="button"
          aria-label={`Gather ${r} (+${amount})`}
          onClick={(e) => onGather(r, e)}
          className={`game-btn border-2 font-display shadow-lg ${
            quiet
              ? "flex size-12 flex-col items-center justify-center rounded-full! border-amber-900/60 bg-amber-50/90 text-xs text-amber-900"
              : "border-amber-800 bg-amber-500 px-4 py-2.5 text-lg text-white text-outline"
          }`}
        >
          {quiet ? (
            <>
              <span className="text-xl leading-none">{RESOURCE_ICON[r]}</span>+{amount}
            </>
          ) : (
            <>
              {RESOURCE_ICON[r]} Gather {r === "rice" ? "Rice" : "Wood"}
            </>
          )}
        </button>
      ))}
    </div>
  );
}
