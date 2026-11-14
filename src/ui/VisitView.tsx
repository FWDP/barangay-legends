// Bisitahin: visiting another barangay. Its village is drawn read-only with the same map as the
// player's own, from a snapshot in the save format (an AI barangay's is generated; a real
// player's will come from the server later, with no change here). Nothing here changes either
// barangay; the actions (trade, handog, diplomacy, raid) are the usual commands.
import { useMemo, useState } from "react";
import type { Content } from "../engine/content";
import type { Command, GameState } from "../engine/game";
import { neighborDef } from "../engine/region";
import { parseSnapshot } from "../engine/save";
import { isEmbargo } from "../engine/trading";
import { raidPreview } from "../engine/village";
import { raidKey } from "../engine/battle";
import { blocOf } from "../engine/politics";
import { BarangayMap } from "./BarangayMap";
import { LevelBadge, levelOf } from "./LevelBadge";
import { blocColor, blocName } from "./politicsText";
import { NeighborPanel, STATUS } from "./RegionView";
import type { Lang } from "./settings";
import { fill, type GameText } from "./uiContent";

const noop = () => {};

/** Which shore a tile is on, as seen from the middle of the map. */
function shore(map: { width: number; height: number }, p: { x: number; y: number }): "north" | "south" | "east" | "west" {
  const dx = p.x - map.width / 2;
  const dy = p.y - map.height / 2;
  if (Math.abs(dx) * map.height >= Math.abs(dy) * map.width) return dx < 0 ? "west" : "east";
  return dy < 0 ? "north" : "south";
}

export function VisitView(props: {
  /** The visited barangay as a snapshot (the same JSON as a save). */
  snapshot: string;
  /** Its id in the player's region (for the relation and the actions). */
  id: string;
  state: GameState;
  content: Content;
  dispatch: (c: Command) => void;
  onLore: (id: string) => void;
  onBack: () => void;
  game: GameText;
  lang: Lang;
}) {
  const { snapshot, id, state, content, dispatch, onLore, onBack, game, lang } = props;
  const t = game.visit;
  const village = useMemo(() => parseSnapshot(snapshot, content), [snapshot, content]);
  // Where a raid would land today: the same seeded pick the raid makes (it holds for the day).
  const key = raidKey(state, content);
  const preview = useMemo(() => (village ? raidPreview(village, content, key) : null), [village, content, key]);
  const [planning, setPlanning] = useState(false);
  const n = state.region?.neighbors.find((x) => x.id === id);
  const def = neighborDef(content, id);
  if (!village || !n || !def || !state.region) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-green-900 text-amber-50">
        <button type="button" onClick={onBack} className="game-btn border-2 border-amber-950/60 bg-amber-200 px-3 py-1.5 font-display text-amber-950">
          🛖 {t.back[lang]}
        </button>
      </div>
    );
  }
  // Their village, at the player's time of day (the walkers and the light move on).
  const shown = { ...village, time: state.time };
  const bloc = blocOf(state.region.politics, id);
  const tradition = content.traditions.find((x) => x.id === n.tradition)?.name[lang] ?? "";
  const embargo = isEmbargo(n, content);
  const planText = preview?.landing
    ? fill(t.raidPreview[lang], { direction: t[shore(village.map, preview.landing)][lang], cover: preview.covering.length ? t.covered[lang] : t.uncovered[lang] })
    : t.uncovered[lang];

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-sky-900 lg:flex-row lg:overflow-hidden">
      <div className="relative flex h-[52vh] shrink-0 flex-col lg:h-auto lg:min-w-0 lg:flex-1">
        <BarangayMap
          state={shown}
          content={content}
          placing={null}
          onPlace={noop}
          onTapTile={noop}
          onBuildingMenu={noop}
          onSpirit={noop}
          visit={{ landing: planning ? (preview?.landing ?? null) : null }}
        />
        {/* Who they are, over the top of their map. */}
        <div data-map-overlay className="pointer-events-none absolute inset-x-2 top-2 z-10 flex items-start justify-between gap-2">
          <div className="pointer-events-auto w-full rounded-xl sm:w-auto sm:max-w-md border-2 border-amber-900/60 bg-amber-50/95 px-2.5 py-1.5 text-stone-800 shadow-lg">
            <button
              type="button"
              onClick={onBack}
              className="game-btn float-right ml-2 flex items-center gap-1 border-2 border-amber-950/60 bg-amber-200 px-2 py-1 font-display text-sm text-amber-950"
            >
              🛖 {t.back[lang]}
            </button>
            <h2 className="flex flex-wrap items-center gap-1.5 font-display text-base leading-tight text-amber-900 sm:text-lg">
              {fill(t.title[lang], { barangay: def.name })} <LevelBadge level={levelOf(state, content, id)} game={game} lang={lang} />
            </h2>
            <p className="text-xs">
              {def.datu}
              {tradition && ` · ${tradition}`}
              {" · "}
              {bloc ? (
                <>
                  <span style={{ color: blocColor(state, bloc.id) }}>●</span> {blocName(state, content, bloc.id, game, lang)}
                </>
              ) : (
                game.alliance.noBloc[lang]
              )}
            </p>
            <p className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-stone-600">
              <span className={`rounded-full px-1.5 font-semibold ${STATUS[n.status].chip}`}>{STATUS[n.status].label}</span>
              {embargo && <span className="rounded-full bg-red-700 px-1.5 font-semibold text-white">⛔ Embargo</span>}
              <span>{fill(t.relation[lang], { trust: Math.round(n.trust), grudge: Math.round(n.grudge), influence: Math.round(n.influence) })}</span>
            </p>
          </div>
        </div>
        <p className="pointer-events-none absolute inset-x-2 bottom-2 z-10 text-center">
          <span className="map-chip whitespace-normal">
            {t.ai[lang]} {t.readOnly[lang]}
          </span>
        </p>
      </div>
      <aside className="mat-card flex-1 border-t-4 border-amber-900/60 p-3 text-stone-800 lg:w-[26rem] lg:flex-none lg:overflow-y-auto lg:border-t-0 lg:border-l-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="font-display text-lg text-amber-900">{t.actions[lang]}</h2>
        </div>
        <NeighborPanel
          key={id}
          n={n}
          state={state}
          content={content}
          dispatch={dispatch}
          onLore={onLore}
          game={game}
          lang={lang}
          bare
          raidPlan={{ text: planText, planning, setPlanning }}
        />
      </aside>
    </div>
  );
}
