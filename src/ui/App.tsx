import { useCallback, useEffect, useState, type MouseEvent } from "react";
import type { Resource } from "../engine/content";
import { buildingCost, canAfford, owned, repairCost } from "../engine/game";
import { buildingAt, canPlace } from "../engine/map";
import { BarangayMap } from "./BarangayMap";
import { BuildToolbar } from "./BuildToolbar";
import { activeBanners, EventBanner } from "./EventBanners";
import { FloatLayer, spawnFloat, spawnFloatAt } from "./floats";
import { bonusRuleText, RESOURCE_ICON } from "./format";
import { GatherButtons } from "./GatherButtons";
import { Hud } from "./Hud";
import { SettingsMenu } from "./SettingsMenu";
import { isMuted, setMuted, sfx } from "./sound";
import { content, useGame } from "./useGame";

export function App() {
  const { state, dispatch, onReset } = useGame();
  const [muted, setMutedState] = useState(isMuted);
  const [selected, setSelected] = useState<string | null>(null);
  const placing = content.buildings.find((b) => b.id === selected) ?? null;
  const placingAffordable = placing ? canAfford(state, buildingCost(content, placing, owned(state, placing.id))) : false;

  // Drop the selection if it stops being affordable, and let Esc cancel placing.
  useEffect(() => {
    if (placing && !placingAffordable) setSelected(null);
  }, [placing, placingAffordable]);
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSelected(null);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selected]);

  // Once the player owns every starting producer (a palayan and a woodcutter camp), gathering
  // is no longer the main income, so the buttons step back.
  const hasAutomation = content.buildings
    .filter((b) => b.unlock.start && b.produces)
    .every((b) => owned(state, b.id) > 0);

  // Keep the top of the map clear: placing shows one event banner, otherwise two.
  const banners = activeBanners(state, content).slice(0, placing ? 1 : 2);

  const gather = useCallback(
    (r: Resource, e: MouseEvent<HTMLButtonElement>) => {
      dispatch({ type: "gather", resource: r });
      sfx.gather(r);
      // Keyboard presses have no pointer position, so float from the button instead.
      const rect = e.currentTarget.getBoundingClientRect();
      const fromPointer = e.clientX !== 0 || e.clientY !== 0;
      spawnFloat(
        fromPointer ? e.clientX : rect.left + rect.width / 2,
        fromPointer ? e.clientY : rect.top,
        `+${content.rules.gatherPerClick} ${RESOURCE_ICON[r]}`,
        r,
      );
    },
    [dispatch],
  );

  const place = (x: number, y: number) => {
    if (!placing || !placingAffordable || !canPlace(state, content, x, y)) return;
    dispatch({ type: "build", building: placing.id, x, y });
    sfx.build();
    setSelected(null);
  };

  /** Tapping a building: put out a fire, or repair damage. */
  const tapBuilding = (x: number, y: number, el: Element) => {
    const b = buildingAt(state, x, y);
    if (!b) return;
    if (b.burningSince !== undefined) {
      dispatch({ type: "extinguish", x, y });
      sfx.extinguish();
      spawnFloatAt(el, "Fire out! 💧", "info");
    } else if (b.damaged) {
      const cost = repairCost(content, b.type);
      if (canAfford(state, cost)) {
        dispatch({ type: "repair", x, y });
        sfx.build();
        spawnFloatAt(el, "Repaired!", "info");
      } else {
        spawnFloatAt(el, `Need ${cost.wood} ${RESOURCE_ICON.wood}`, "info");
      }
    }
  };

  const toggleSound = () => {
    setMuted(!muted);
    setMutedState(!muted);
    if (muted) sfx.click(); // just unmuted: confirm with a tick
  };

  return (
    <div className="fixed inset-0 flex flex-col bg-green-800 pt-[env(safe-area-inset-top)] text-stone-800">
      <Hud state={state} content={content}>
        <button
          type="button"
          onClick={toggleSound}
          aria-label={muted ? "Turn sound on" : "Turn sound off"}
          aria-pressed={!muted}
          className="game-btn hidden size-9 items-center justify-center border-2 border-amber-950/60 bg-amber-200 text-lg sm:flex"
        >
          {muted ? "🔇" : "🔊"}
        </button>
        <SettingsMenu onReset={onReset} muted={muted} onToggleSound={toggleSound} />
      </Hud>

      <main className="relative flex min-h-0 flex-1 flex-col">
        <BarangayMap state={state} content={content} placing={placing} onPlace={place} onTapBuilding={tapBuilding} />
        <div className="pointer-events-none absolute top-2 left-1/2 z-10 flex w-max max-w-[calc(100%-1rem)] -translate-x-1/2 flex-col items-center gap-1.5">
          {placing && (
            <div
              role="status"
              className="wood-panel pointer-events-auto flex items-center gap-2 rounded-xl border-2 border-amber-950/70 py-1.5 pr-1.5 pl-3 text-amber-50 shadow-lg"
            >
              <span className="text-2xl leading-none" aria-hidden>
                {placing.icon}
              </span>
              <span className="text-sm leading-tight">
                <span className="text-outline block font-display text-base">Place {placing.name}</span>
                <span className="block text-xs text-amber-100/90">
                  Tap a highlighted tile
                  {bonusRuleText(placing, content) && <> · ✨ {bonusRuleText(placing, content)}</>}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="game-btn border-2 border-amber-950/60 bg-amber-200 px-2.5 py-1 text-sm font-semibold text-amber-950"
              >
                Cancel
              </button>
            </div>
          )}
          {banners.map((b) => (
            <EventBanner key={b.id} banner={b} />
          ))}
        </div>
        <GatherButtons amount={content.rules.gatherPerClick} quiet={hasAutomation} onGather={gather} />
      </main>

      <BuildToolbar state={state} content={content} selected={selected} onSelect={setSelected} />
      <FloatLayer />
    </div>
  );
}
