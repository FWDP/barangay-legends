// The hidden dev panel, only with ?dev=1 in the address. Every action is an ordinary command
// (type "dev"), so saves stay valid; a save that used one is marked as a dev save. "Whole map"
// only moves the camera. For testers, not players: its labels stay in English.
import { useState } from "react";
import type { Content } from "../engine/content";
import { DEV_EVENTS, MAX_FAST_FORWARD_DAYS, type DevAction, type DevEvent } from "../engine/dev";
import type { Command, GameState } from "../engine/game";

/** Is the dev panel on (?dev=1)? */
export function devMode(): boolean {
  try {
    return new URLSearchParams(window.location.search).get("dev") === "1";
  } catch {
    return false;
  }
}

const btn = "rounded border border-lime-300/60 bg-stone-800 px-1.5 py-0.5 text-[11px] font-semibold text-lime-100 hover:bg-stone-700";

export function DevPanel(props: { state: GameState; content: Content; dispatch: (c: Command) => void; onWholeMap: () => void }) {
  const { state, content, dispatch, onWholeMap } = props;
  const [open, setOpen] = useState(false);
  const [event, setEvent] = useState<DevEvent>("fire");
  const dev = (c: DevAction) => dispatch({ type: "dev", ...c });
  const events: DevEvent[] = [...DEV_EVENTS, ...content.choices.map((c) => `choice:${c.id}` as DevEvent)];
  return (
    <div data-map-overlay className="pointer-events-auto fixed bottom-2 left-2 z-[60] max-w-[min(20rem,calc(100vw-1rem))] rounded-lg border-2 border-lime-400 bg-stone-900/95 p-1.5 font-mono text-[11px] text-lime-100 shadow-xl">
      <button type="button" className="font-bold text-lime-300" onClick={() => setOpen(!open)} aria-expanded={open}>
        🛠 DEV {state.devSave ? "(dev save)" : ""} {open ? "▾" : "▸"}
      </button>
      {open && (
        <div className="mt-1 space-y-1">
          <div className="flex flex-wrap items-center gap-1">
            ⏩
            {[1, 3, MAX_FAST_FORWARD_DAYS].map((d) => (
              <button key={d} type="button" className={btn} onClick={() => dev({ action: "fastForward", days: d })}>
                +{d}d
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1">
            ➕
            <button type="button" className={btn} onClick={() => dev({ action: "addResources", amounts: { rice: 500, wood: 500 } })}>
              500 rice+wood
            </button>
            <button type="button" className={btn} onClick={() => dev({ action: "addResources", amounts: { gold: 100 } })}>
              100 gold
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            ⚡
            <select value={event} onChange={(e) => setEvent(e.target.value as DevEvent)} className="max-w-36 rounded bg-stone-800 px-1 text-[11px] text-lime-100">
              {events.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
            <button type="button" className={btn} onClick={() => dev({ action: "trigger", event })}>
              trigger
            </button>
            <button type="button" className={btn} onClick={() => dev({ action: "trigger", event: "raid" })}>
              raid
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            🕒
            <button type="button" className={btn} onClick={() => dev({ action: "setTime", phase: "day" })}>
              day
            </button>
            <button type="button" className={btn} onClick={() => dev({ action: "setTime", phase: "night" })}>
              night
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            🗺
            <button type="button" className={btn} onClick={onWholeMap}>
              whole map
            </button>
            <button type="button" className={btn} onClick={() => dev({ action: "clearForest" })}>
              clear all forest
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
