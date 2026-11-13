import { useState, type ReactNode } from "react";
import { RESOURCES, type Content, type Resource } from "../engine/content";
import { asCost, canAfford, warriorCap, type Command, type GameState } from "../engine/game";
import { fairness, fairnessNeeded, giftValue, isEmbargo, refusalText } from "../engine/trading";
import {
  attackOf,
  defenseOf,
  homeWarriors,
  marriageBlocker,
  standardProposal,
  neighborDef,
  traitOf,
  type NeighborState,
 tradingPaused, sandugoBlocker } from "../engine/region";
import { relationshipDays } from "../engine/limits";
import { clock } from "./EventBanners";
import { sameIsland } from "../engine/archipelago";
import { hasDatuUnlock } from "../engine/datu";
import { barangayLevel } from "../engine/kabantugan";
import { blocOf, blocStrength } from "../engine/politics";
import { blocBlocker, strengthFn } from "../engine/region";
import { boatCap, boatCost, boatsFree, sailBlocker, voyageSeconds } from "../engine/sea";
import { expeditionTitle } from "./ReplayView";
import { barangayName, blocColor, blocName, newsLine, warLine } from "./politicsText";
import type { Lang } from "./settings";
import { fill, type GameText } from "./uiContent";
import { RESOURCE_ICON } from "./format";
import { LevelBadge, levelOf } from "./LevelBadge";
import { arawText } from "./Days";

export const STATUS = {
  independent: { label: "Independent", ring: "#a8a29e", chip: "bg-stone-200 text-stone-700" },
  tributary: { label: "Tributary", ring: "#f59e0b", chip: "bg-amber-200 text-amber-900" },
  ally: { label: "Sandugo ally", ring: "#16a34a", chip: "bg-green-200 text-green-900" },
} as const;

const fmt = (amounts: Partial<Record<Resource, number>>) =>
  RESOURCES.filter((r) => (amounts[r] ?? 0) > 0)
    .map((r) => `${amounts[r]} ${RESOURCE_ICON[r]}`)
    .join(" ");

export function RegionView(props: {
  state: GameState;
  content: Content;
  dispatch: (c: Command) => void;
  onLore: (id: string) => void;
  game: GameText;
  lang: Lang;
  /** Visit a barangay (Bisitahin). */
  onVisit: (id: string) => void;
  /** Open the Ranggo ng Kapuluan. */
  onRanking: () => void;
  /** Panoorin: watch an expedition by its record id. */
  onWatch?: (id: number) => void;
}) {
  const { state, content, dispatch, onLore, game, lang, onVisit, onRanking, onWatch } = props;
  const region = state.region;
  const [selected, setSelected] = useState<string>(content.neighbors[0]?.id ?? "");
  if (!region) {
    return <div className="flex flex-1 items-center justify-center bg-green-900 text-amber-50">No neighbors yet.</div>;
  }
  const chosen = region.neighbors.find((n) => n.id === selected) ?? region.neighbors[0];
  const pick = (id: string) => {
    setSelected(id);
    // On phones the panel is below the list: bring it into view.
    if (typeof window !== "undefined" && window.matchMedia?.("(max-width: 639px)").matches) {
      requestAnimationFrame(() => document.getElementById("neighbor-panel")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-sky-900 sm:overflow-hidden lg:flex-row">
      <div className="relative hidden shrink-0 sm:block lg:min-w-0 lg:flex-1">
        <ArchipelagoMap state={state} content={content} game={game} lang={lang} selected={chosen?.id} onSelect={setSelected} />
      </div>
      <aside className="mat-card flex-1 border-t-4 border-amber-900/60 p-3 text-stone-800 sm:min-h-0 sm:overflow-y-auto lg:w-[26rem] lg:flex-none lg:border-t-0 lg:border-l-4">
        <OurForces state={state} content={content} dispatch={dispatch} />
        <AlliancePanel state={state} content={content} game={game} lang={lang} dispatch={dispatch} onVisit={onVisit} onRanking={onRanking} />
        <BlocList state={state} content={content} game={game} lang={lang} selected={chosen?.id} onSelect={pick} />
        <Balita state={state} content={content} game={game} lang={lang} onWatch={onWatch} />
        <div id="neighbor-panel" className="scroll-mt-2">
          {chosen && <NeighborPanel key={chosen.id} n={chosen} state={state} content={content} dispatch={dispatch} onLore={onLore} game={game} lang={lang} onVisit={() => onVisit(chosen.id)} />}
        </div>
      </aside>
    </div>
  );
}

/**
 * The political map of the islands: barangays as nodes on their islands, colored by alliance,
 * with lines from each alliance's leader to its members, green ties for sandugo allies, amber
 * arrows for tributaries, and the player's Balangay sailing between islands.
 */
function ArchipelagoMap(props: { state: GameState; content: Content; game: GameText; lang: Lang; selected?: string; onSelect: (id: string) => void }) {
  const { state, content, game, lang, selected, onSelect } = props;
  const region = state.region!;
  const me = state.barangay.id;
  const P = (id: string) => {
    const p = region.places[id];
    return p ? { x: p.x * 100, y: p.y * 100 } : { x: 50, y: 50 };
  };
  const mePos = P(me);
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" className="block h-[42dvh] w-full lg:absolute lg:inset-0 lg:h-full" role="group" aria-label="Rehiyon: the islands and their barangays">
      <defs>
        <marker id="arrow-tribute" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="4" markerHeight="4" orient="auto">
          <path d="M0,0 L6,3 L0,6 z" fill="#f59e0b" />
        </marker>
      </defs>
      <rect x="-50" y="-50" width="200" height="200" fill="#0c4a6e" />
      {Array.from({ length: 40 }, (_, i) => (
        <path key={i} d={`M${(i * 23) % 100},${(i * 37) % 100} q2,-1 4,0`} stroke="#38bdf8" strokeWidth="0.3" fill="none" opacity="0.4" aria-hidden />
      ))}
      {region.islands.map((i, k) => (
        <g key={i.id} aria-hidden>
          <ellipse cx={i.x * 100} cy={i.y * 100} rx={i.r * 100 * 1.2} ry={i.r * 100} fill="#fde68a" opacity="0.85" />
          <ellipse cx={i.x * 100} cy={i.y * 100} rx={i.r * 100 * 1.05} ry={i.r * 100 * 0.86} fill="#15803d" />
          {k === 0 && (
            <path d={`M${i.x * 100 - 1},${(i.y - i.r) * 100} q4,${i.r * 50} 0,${i.r * 100} t0,${i.r * 100}`} stroke="#38bdf8" strokeWidth="1.4" fill="none" />
          )}
          <text x={i.x * 100} y={(i.y + i.r) * 100 + 4} textAnchor="middle" fontSize="2.6" fill="#e0f2fe" fontStyle="italic">
            {i.name}
          </text>
        </g>
      ))}
      {/* Alliance lines: from each leader to its members. */}
      {region.politics.blocs.flatMap((b) =>
        b.members
          .filter((m) => m !== b.leader)
          .map((m) => {
            const a = P(b.leader);
            const c = P(m);
            return <line key={`${b.id}-${m}`} x1={a.x} y1={a.y} x2={c.x} y2={c.y} stroke={blocColor(state, b.id)} strokeWidth="0.5" strokeDasharray="1.5 1" opacity="0.85" />;
          }),
      )}
      {/* Sandugo ties and tributary arrows to the player. */}
      {region.neighbors.map((n) => {
        if (n.status === "independent") return null;
        const a = P(n.id);
        return n.status === "ally" ? (
          <line key={`tie-${n.id}`} x1={a.x} y1={a.y} x2={mePos.x} y2={mePos.y} stroke="#16a34a" strokeWidth="0.7" />
        ) : (
          <line key={`tie-${n.id}`} x1={a.x} y1={a.y} x2={mePos.x} y2={mePos.y} stroke="#f59e0b" strokeWidth="0.5" markerEnd="url(#arrow-tribute)" />
        );
      })}
      {/* The player's barangay. */}
      <g transform={`translate(${mePos.x}, ${mePos.y})`}>
        <circle r="3" fill="#fef3c7" stroke={blocColor(state, blocOf(region.politics, me)?.id)} strokeWidth="0.9" />
        <text textAnchor="middle" dy="1.1" fontSize="3" aria-hidden>
          🔥
        </text>
        <text textAnchor="middle" y="-4" fontSize="2.2" fill="#fffbeb" fontWeight="bold" stroke="#0c4a6e" strokeWidth="0.35" paintOrder="stroke">
          {state.barangay.name || game.balita.you[lang]}
        </text>
      </g>
      {region.neighbors.map((n) => {
        const def = neighborDef(content, n.id)!;
        const { x, y } = P(n.id);
        const bloc = blocOf(region.politics, n.id);
        const leader = bloc?.leader === n.id;
        const raiding = region.incomingRaid?.from === n.id;
        const isSel = n.id === selected;
        return (
          <g
            key={n.id}
            transform={`translate(${x}, ${y})`}
            role="button"
            tabIndex={0}
            aria-label={`${def.name}, ${STATUS[n.status].label}${bloc ? `, ${blocName(state, content, bloc.id, game, lang)}` : ""}`}
            aria-pressed={isSel}
            onClick={() => onSelect(n.id)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect(n.id)}
            className="cursor-pointer outline-none"
          >
            {isSel && <circle r="3.8" fill="none" stroke="#fde68a" strokeWidth="0.5" strokeDasharray="1 0.8" />}
            <circle r="2.5" fill="#fffbeb" stroke={bloc ? blocColor(state, bloc.id) : STATUS[n.status].ring} strokeWidth={leader ? 1.1 : 0.7} />
            <text textAnchor="middle" dy="0.9" fontSize="2.5" aria-hidden>
              {n.status === "ally" ? "🤝" : n.status === "tributary" ? "🏵️" : "🛖"}
            </text>
            {leader && (
              <text textAnchor="middle" y="-2.9" fontSize="2.3" aria-hidden>
                👑
              </text>
            )}
            {raiding && <circle r="4" fill="none" stroke="#dc2626" strokeWidth="0.6" className="motion-safe:animate-pulse" />}
            <text textAnchor="middle" y="4.9" fontSize="1.9" fill="#fffbeb" fontWeight="bold" stroke="#0c4a6e" strokeWidth="0.35" paintOrder="stroke">
              {def.name.replace("Barangay ", "")}
            </text>
            <g transform="translate(2.4, -2.2)" aria-hidden>
              <circle r="1.25" fill="#fcd34d" stroke="#78350f" strokeWidth="0.25" />
              <text textAnchor="middle" dy="0.55" fontSize="1.5" fontWeight="bold" fill="#451a03">
                {levelOf(state, content, n.id)}
              </text>
            </g>
          </g>
        );
      })}
      {/* Balangay at sea. */}
      {region.voyages.map((v) => {
        const there = P(v.target);
        const span = Math.max(1, v.arriveAt - v.departAt);
        const f = Math.min(1, Math.max(0, (state.time - v.departAt) / span));
        const [from, to] = v.leg === "out" ? [mePos, there] : [there, mePos];
        const x = v.waiting ? there.x - 4 : from.x + (to.x - from.x) * f;
        const y = v.waiting ? there.y + 3 : from.y + (to.y - from.y) * f;
        return (
          <text key={v.id} x={x} y={y} textAnchor="middle" fontSize="3.6" style={{ transition: "x 0.2s linear, y 0.2s linear" }} aria-label={`Balangay ${v.leg === "out" ? "sailing to" : "coming home from"} ${neighborDef(content, v.target)?.name}${v.waiting ? ", waiting offshore" : ""}`}>
            ⛵
          </text>
        );
      })}
    </svg>
  );
}

/** Barangays grouped by alliance: the list on phones, a quick index everywhere. */
function BlocList(props: { state: GameState; content: Content; game: GameText; lang: Lang; selected?: string; onSelect: (id: string) => void }) {
  const { state, content, game, lang, selected, onSelect } = props;
  const region = state.region!;
  const groups = [
    ...region.politics.blocs.map((b) => ({ id: b.id, title: blocName(state, content, b.id, game, lang), color: blocColor(state, b.id), members: b.members, leader: b.leader })),
    { id: "", title: game.balita.independent[lang], color: "#a8a29e", members: region.neighbors.filter((n) => !blocOf(region.politics, n.id)).map((n) => n.id), leader: "" },
  ].filter((g) => g.members.length > 0);
  const islandOf = (id: string) => region.islands.find((i) => i.id === region.places[id]?.island)?.name ?? "";
  return (
    <section className="mb-3 space-y-2 sm:hidden" aria-label={game.alliance.list[lang]}>
      <h2 className="font-display text-lg text-amber-900">{game.alliance.list[lang]}</h2>
      {groups.map((g) => (
        <div key={g.id || "free"} className="rounded-xl border-2 bg-white/60 p-2" style={{ borderColor: g.color }}>
          <h3 className="flex items-baseline justify-between gap-2 text-sm font-semibold" style={{ color: g.color }}>
            <span>{g.title}</span>
            {g.id && <span className="text-[11px] font-normal text-stone-600">{warLine(state, content, g.leader, game, lang)}</span>}
          </h3>
          <ul className="mt-1 space-y-1">
            {g.members.map((id) => {
              if (id === state.barangay.id) {
                return (
                  <li key={id} className="px-2 py-1 text-sm font-semibold">
                    🔥 {state.barangay.name || game.balita.you[lang]} {g.leader === id && "👑"} <LevelBadge level={levelOf(state, content, id)} game={game} lang={lang} />
                  </li>
                );
              }
              const n = region.neighbors.find((x) => x.id === id);
              const def = neighborDef(content, id);
              if (!n || !def) return null;
              return (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => onSelect(id)}
                    aria-pressed={selected === id}
                    className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1 text-left text-sm ${selected === id ? "bg-amber-200" : "bg-amber-50"}`}
                  >
                    <span>
                      {g.leader === id && "👑 "}
                      {def.name.replace("Barangay ", "")} <LevelBadge level={levelOf(state, content, id)} game={game} lang={lang} />{" "}
                      <span className="text-[11px] text-stone-500">· {islandOf(id)}</span>
                    </span>
                    <span className={`rounded-full px-1.5 text-[10px] font-semibold ${STATUS[n.status].chip}`}>{STATUS[n.status].label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}

/** The player's alliance: form, leave, the members (expel), and the Paramount Datu goal. */
function AlliancePanel(props: { state: GameState; content: Content; game: GameText; lang: Lang; dispatch: (c: Command) => void; onVisit: (id: string) => void; onRanking: () => void }) {
  const { state, content, game, lang, dispatch, onVisit, onRanking } = props;
  const region = state.region!;
  const t = game.alliance;
  const me = state.barangay.id;
  const mine = blocOf(region.politics, me);
  const unlocked = hasDatuUnlock(state, content, "alliances");
  const strength = strengthFn(state, content);
  return (
    <section className="mb-3 space-y-2 rounded-xl border-2 border-amber-900/30 bg-amber-50/70 p-2.5">
      <h2 className="flex items-center gap-1.5 font-display text-lg text-amber-900">
        🤝 {t.title[lang]} <LevelBadge level={levelOf(state, content, me)} game={game} lang={lang} />
        <button type="button" onClick={onRanking} className="ml-auto rounded-full border border-amber-900/40 bg-amber-200 px-2 py-0.5 font-sans text-xs font-semibold text-amber-950">
          🏆 {game.rank.open[lang]}
        </button>
      </h2>
      {!unlocked ? (
        <p className="text-xs text-stone-600">{t.level[lang]}</p>
      ) : mine ? (
        <>
          <p className="text-sm">{fill(mine.leader === me ? t.yours[lang] : t.member[lang], { bloc: blocName(state, content, mine.id, game, lang) })}</p>
          <p className="text-xs text-stone-500">{fill(t.members[lang], { n: mine.members.length, strength: Math.round(blocStrength(mine, strength)) })}</p>
          <ul className="space-y-1">
            {mine.members
              .filter((m) => m !== me)
              .map((m) => (
                <li key={m} className="flex items-center justify-between gap-2 rounded bg-white/60 px-2 py-1 text-sm">
                  <span>
                    {mine.leader === m && "👑 "}
                    {barangayName(state, content, m, game, lang)} <LevelBadge level={levelOf(state, content, m)} game={game} lang={lang} />
                  </span>
                  <button type="button" onClick={() => onVisit(m)} className="ml-auto text-xs font-semibold text-amber-800 underline">
                    🛖 {game.visit.button[lang]}
                  </button>
                  {mine.leader === me && (
                    <button type="button" onClick={() => dispatch({ type: "bloc", action: "expel", target: m })} className="text-xs font-semibold text-red-800 underline">
                      {t.expel[lang]}
                    </button>
                  )}
                </li>
              ))}
          </ul>
          <button type="button" onClick={() => dispatch({ type: "bloc", action: "leave" })} className="text-xs font-semibold text-red-800 underline">
            {t.leave[lang]}
          </button>
        </>
      ) : (
        <>
          <p className="text-sm">{t.none[lang]}</p>
          <ActionButton onClick={() => dispatch({ type: "bloc", action: "form" })}>👑 {t.form[lang]}</ActionButton>
        </>
      )}
      <p className="text-[11px] text-stone-500">{t.paramount[lang]}</p>
    </section>
  );
}

/** The Balita: political news, newest first. */
function Balita(props: { state: GameState; content: Content; game: GameText; lang: Lang; onWatch?: (id: number) => void }) {
  const { state, content, game, lang, onWatch } = props;
  const news = [...(state.region?.news ?? [])].reverse().slice(0, 8);
  return (
    <section className="mb-3 space-y-1 rounded-xl border-2 border-amber-900/30 bg-amber-50/70 p-2.5">
      <h2 className="font-display text-lg text-amber-900">📣 {game.balita.title[lang]}</h2>
      {news.length === 0 && <p className="text-xs text-stone-500">{game.balita.none[lang]}</p>}
      <ul className="space-y-0.5 text-xs">
        {news.map((n) => (
          <li key={n.id} className="border-b border-amber-900/10 pb-0.5">
            <span className="text-stone-400 tabular-nums">{arawText(state, content, game, lang, n.time)}</span> {newsLine(n, state, content, game, lang)}{" "}
            <LevelBadge level={n.barangay ? levelOf(state, content, n.barangay) : null} game={game} lang={lang} />
          </li>
        ))}
      </ul>
      {onWatch && (
        <>
          <h3 className="mt-2 font-display text-sm text-amber-900">🎬 {game.expedition.recent[lang]}</h3>
          {state.expeditions.length === 0 && <p className="text-xs text-stone-500">{game.expedition.none[lang]}</p>}
          <ul className="space-y-0.5 text-xs">
            {[...state.expeditions].reverse().map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-2 border-b border-amber-900/10 pb-0.5">
                <span className="min-w-0">
                  <span className="text-stone-400 tabular-nums">{arawText(state, content, game, lang, e.arriveAt)}</span> {expeditionTitle(e, state, content, game, lang)}
                </span>
                <button type="button" onClick={() => onWatch(e.id)} className="game-btn shrink-0 border-2 border-amber-950/60 bg-stone-200 px-2 py-0.5 text-[11px] font-semibold text-stone-900">
                  {game.expedition.watch[lang]}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function Bar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-xs">
      <div className="flex justify-between text-stone-600">
        <span>{label}</span>
        <span className="tabular-nums">{Math.round(value)}/100</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-stone-300" role="meter" aria-label={label} aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
        <div className={`h-full ${color}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function ActionButton(props: { onClick: () => void; disabled?: boolean; why?: string | null; tone?: "go" | "war"; children: ReactNode }) {
  const { onClick, disabled, why, tone = "go", children } = props;
  return (
    <div>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`game-btn w-full border-2 px-3 py-1.5 text-left text-sm font-semibold disabled:cursor-not-allowed disabled:border-stone-400 disabled:bg-stone-200 disabled:text-stone-500 ${
          tone === "war" ? "border-red-950 bg-red-700 text-white" : "border-green-900 bg-green-700 text-white"
        }`}
      >
        {children}
      </button>
      {disabled && why && <p className="mt-0.5 text-[11px] text-stone-500">{why}</p>}
    </div>
  );
}

function OurForces(props: { state: GameState; content: Content; dispatch: (c: Command) => void }) {
  const { state, content, dispatch } = props;
  const region = state.region!;
  const m = content.rules.military;
  const cost = asCost(m.warrior.cost);
  const free = state.villagers - state.warriors - state.sick.length;
  const cap = warriorCap(state, content);
  const home = homeWarriors(state);
  const truceLeft = region.truceUntil - state.time;
  return (
    <section className="mb-3 space-y-2 rounded-xl border-2 border-amber-900/30 bg-amber-50/70 p-2.5">
      <h2 className="font-display text-lg text-amber-900">Your barangay</h2>
      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <Stat label="Mandirigma" value={`⚔️ ${state.warriors}/${cap}`} note={home < state.warriors ? `${state.warriors - home} away` : `${m.warriorsPerKuta} per Kuta`} />
        <Stat label="Defense" value={`🛡️ ${Math.round(defenseOf(state, content))}`} note="warriors + kuta" />
        <Stat label="Kabantugan" value={`⭐ ${state.kabantugan}`} note={`level ${barangayLevel(state, content)}`} />
      </div>
      <ActionButton
        onClick={() => dispatch({ type: "train" })}
        disabled={free < 1 || state.warriors >= cap || !canAfford(state, cost)}
        why={
          state.warriors >= cap
            ? cap === 0
              ? `Build a Kuta first: each one trains up to ${m.warriorsPerKuta} Mandirigma.`
              : `Each Kuta trains up to ${m.warriorsPerKuta}. Build another Kuta to train more.`
            : free < 1
              ? "Every healthy villager is already a warrior."
              : `Needs ${fmt(m.warrior.cost)}.`
        }
      >
        ⚔️ Train Mandirigma · {fmt(m.warrior.cost)}
      </ActionButton>
      <p className="text-[11px] text-stone-500">
        A Mandirigma is a villager with warrior training: they farm and fish like anyone else, and take up arms when raiders come or when sent to guard.
      </p>
      {boatCap(state, content) > 0 && (
        <div className="space-y-1 rounded-lg bg-sky-50 p-2 text-xs text-sky-900">
          <p>
            ⛵ {boatsFree(state)} / {state.balangays} Balangay in port{region.voyages.length ? ` · ${region.voyages.length} at sea` : ""}
            {region.voyages.some((v) => v.waiting) && " (one waiting offshore)"}
          </p>
          <ActionButton
            onClick={() => dispatch({ type: "trainBalangay" })}
            disabled={state.balangays >= boatCap(state, content) || !canAfford(state, boatCost(content))}
            why={state.balangays >= boatCap(state, content) ? "The docks are full: build another Balangay Dock." : `Needs ${fmt(boatCost(content))}.`}
          >
            ⛵ Train a Balangay · {fmt(boatCost(content))}
          </ActionButton>
        </div>
      )}
      {truceLeft > 0 && <p className="text-xs text-green-800">🕊️ Truce: no raids for {clock(truceLeft)}.</p>}
      {region.incomingRaid && (
        <p className="rounded bg-red-100 px-2 py-1 text-xs font-semibold text-red-900">
          🔥 Raid from {neighborDef(content, region.incomingRaid.from)?.name} in {clock(region.incomingRaid.strikeAt - state.time)}! Train warriors and
          build a Kuta.
        </p>
      )}
    </section>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-lg bg-white/70 p-1.5">
      <div className="text-[10px] tracking-wide text-stone-500 uppercase">{label}</div>
      <div className="font-display text-base">{value}</div>
      <div className="text-[10px] text-stone-500">{note}</div>
    </div>
  );
}

export function NeighborPanel(props: {
  n: NeighborState;
  state: GameState;
  content: Content;
  dispatch: (c: Command) => void;
  onLore: (id: string) => void;
  game: GameText;
  lang: Lang;
  /** Offer Bisitahin (visit their village). */
  onVisit?: () => void;
  /** Leave out the header (the visit screen shows its own). */
  bare?: boolean;
  /**
   * Visiting: a raid is planned first (the map shows where it would land and which Kuta cover
   * it), then confirmed.
   */
  raidPlan?: { text: string; planning: boolean; setPlanning: (on: boolean) => void };
}) {
  const { n, state, content, dispatch, onLore, game, lang, onVisit, bare = false, raidPlan } = props;
  const region = state.region!;
  const t = game.alliance;
  const me = state.barangay.id;
  // Another island: actions sail by Balangay (and need a free boat).
  const far = !sameIsland(region.places, me, n.id);
  const seaWhy = far && boatsFree(state) < 1 ? t.noBoat[lang] : null;
  const island = region.islands.find((i) => i.id === region.places[n.id]?.island)?.name ?? "";
  const tradition = content.traditions.find((x) => x.id === n.tradition)?.name[lang] ?? "";
  const theirBloc = blocOf(region.politics, n.id);
  const mine = blocOf(region.politics, me);
  const war = warLine(state, content, n.id, game, lang);
  const blocWhy = (b: ReturnType<typeof blocBlocker>) =>
    b === "trust" ? fill(t.trust[lang], { trust: content.rules.politics.joinTrust }) : b === "grudge" ? t.grudge[lang] : b === "tributary" ? t.tributary[lang] : b === "taken" ? t.taken[lang] : b === "level" ? t.level[lang] : null;
  const canInvite = mine?.leader === me && !theirBloc;
  const canJoin = !mine && theirBloc?.leader === n.id && hasDatuUnlock(state, content, "alliances");
  const def = neighborDef(content, n.id)!;
  const trait = traitOf(content, n.id);
  const d = content.rules.diplomacy;
  const home = homeWarriors(state);
  const [warriors, setWarriors] = useState(Math.min(home, 5));
  // A raid by sea carries at most one boat's worth of warriors.
  const raidMax = far ? Math.min(home, content.rules.sea.raidWarriorsPerBoat) : home;
  const send = Math.max(1, Math.min(warriors, raidMax));
  const attack = attackOf(send, content);
  const theirDefense = defenseOf(n.state, content);
  const chance = attack / (attack + theirDefense);
  const embargo = isEmbargo(n, content);
  const marry = marriageBlocker(state, content, n.id);
  const sandugoWhy = sandugoBlocker(state, content, n.id);
  const raidCooldown = n.raidCooldownUntil - state.time;

  return (
    <section className="space-y-3">
      {!bare && (
      <header>
        <div className="flex flex-wrap items-baseline justify-between gap-1">
          <h2 className="flex items-center gap-1.5 font-display text-xl text-amber-900">
            {def.name} <LevelBadge level={levelOf(state, content, n.id)} game={game} lang={lang} />
          </h2>
          <span className="flex gap-1">
            {embargo && <span className="rounded-full bg-red-700 px-2 py-0.5 text-xs font-semibold text-white">⛔ Embargo</span>}
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS[n.status].chip}`}>{STATUS[n.status].label}</span>
          </span>
        </div>
        <p className="text-sm">
          {def.datu} · <span className="font-semibold">{trait.label}</span>
        </p>
        <p className="text-xs text-stone-600">{def.description}</p>
        <p className="mt-1 text-xs text-stone-600">
          🏝️ {fill(t.island[lang], { island })} · {fill(t.tradition[lang], { tradition })}
        </p>
        <p className="text-xs text-stone-600">🤝 {n.metAt === null ? t.notMet[lang] : fill(t.met[lang], { days: relationshipDays(state, content, n) })}</p>
        <p className="text-xs text-stone-600">
          {theirBloc ? (
            <>
              <span style={{ color: blocColor(state, theirBloc.id) }}>●</span> {fill(t.bloc[lang], { bloc: blocName(state, content, theirBloc.id, game, lang) })}
              {theirBloc.leader === n.id && ` (${t.leader[lang]})`}
            </>
          ) : (
            t.noBloc[lang]
          )}
          {war && <span className="font-semibold text-red-800"> · {war}</span>}
        </p>
        {far && (
          <p className="mt-1 rounded bg-sky-100 px-2 py-1 text-xs text-sky-900">
            ⛵ {fill(t.byBoat[lang], { time: clock(voyageSeconds(state, content, n.id)) })}
            {seaWhy && <span className="block font-semibold">{seaWhy}</span>}
          </p>
        )}
        {onVisit && (
          <button
            type="button"
            onClick={onVisit}
            className="game-btn mt-2 w-full border-2 border-amber-950/60 bg-amber-300 px-3 py-1.5 font-display text-amber-950"
          >
            🛖 {game.visit.button[lang]}
          </button>
        )}
      </header>
      )}
      {(canInvite || canJoin || (mine?.leader === me && mine.members.includes(n.id))) && (
        <div className="space-y-1">
          {canInvite && (
            <ActionButton onClick={() => dispatch({ type: "bloc", action: "invite", target: n.id })} disabled={blocBlocker(state, content, "invite", n.id) !== null} why={blocWhy(blocBlocker(state, content, "invite", n.id))}>
              🤝 {t.invite[lang]}
            </ActionButton>
          )}
          {canJoin && theirBloc && (
            <ActionButton onClick={() => dispatch({ type: "bloc", action: "join", target: theirBloc.id })} disabled={blocBlocker(state, content, "join", theirBloc.id) !== null} why={blocWhy(blocBlocker(state, content, "join", theirBloc.id))}>
              🤝 {t.join[lang]}: {blocName(state, content, theirBloc.id, game, lang)}
            </ActionButton>
          )}
          {mine?.leader === me && mine.members.includes(n.id) && (
            <button type="button" onClick={() => dispatch({ type: "bloc", action: "expel", target: n.id })} className="text-xs font-semibold text-red-800 underline">
              {t.expel[lang]}
            </button>
          )}
        </div>
      )}
      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <Stat label="Size" value={`👥 ${n.state.villagers}`} note={`${n.state.buildings.length} buildings`} />
        <Stat label="Strength" value={`⚔️ ${attackOf(n.state.warriors, content)}`} note={`${n.state.warriors} warriors`} />
        <Stat label="Defense" value={`🛡️ ${Math.round(theirDefense)}`} note="against raids" />
      </div>
      <div className="space-y-1.5">
        {n.status === "independent" && <Bar label="Influence" value={n.influence} color="bg-amber-500" />}
        <Bar label="Trust" value={n.trust} color="bg-sky-500" />
        <Bar label="Grudge" value={n.grudge} color="bg-red-600" />
        {n.grudge > 0 && (
          <p className="text-[11px] text-stone-500">
            {embargo
              ? `They refuse all trade until their grudge falls below ${d.grudge.embargoAt}. A Handog helps.`
              : `Grudge from your raids fades by ${d.grudge.decayPerMinute} a minute.${n.grudge > d.grudge.noAlliancesAbove ? " Too high for marriage or sandugo." : ""}`}
          </p>
        )}
        {n.lastRefusal && (
          <p className="rounded bg-stone-100 px-2 py-1 text-xs italic text-stone-700">
            Last refusal: “{refusalText(n.lastRefusal.reason, content, def.datu)}”
          </p>
        )}
        {n.status === "tributary" && <Bar label="Loyalty" value={n.loyalty} color="bg-green-600" />}
        <p className="text-[11px] text-stone-500">
          {n.marriage ? "💍 Marriage alliance · " : ""}
          {n.status === "tributary"
            ? `Sends ${d.tribute.percent}% of their production every minute. Rebels below ${d.loyalty.rebelBelow} loyalty: trade with them or send guards.`
            : n.status === "ally"
              ? "Bound by sandugo: they help defend you."
              : `At 100 influence they become a tributary.`}
        </p>
      </div>

      <div className="space-y-2">
        <h3 className="font-display text-base text-amber-900">Trade</h3>
        {tradingPaused(state) && <p className="rounded bg-red-100 px-2 py-1 text-xs font-semibold text-red-900">⏸ Trade paused — raid in progress</p>}
        <TradeForm n={n} state={state} content={content} dispatch={dispatch} seaWhy={seaWhy} />
      </div>

      <HandogForm n={n} state={state} content={content} dispatch={dispatch} />

      {n.status !== "ally" && (
        <div className="space-y-2">
          <h3 className="font-display text-base text-amber-900">Alliance</h3>
          {!n.marriage && (
            <ActionButton
              onClick={() => dispatch({ type: "marry", neighbor: n.id })}
              disabled={marry !== null || !!seaWhy}
              why={
                seaWhy
                  ? seaWhy
                  : marry === "grudge"
                  ? refusalText("alliance", content, def.datu)
                  : marry === "trust"
                  ? `Needs trust above ${d.marriage.trustNeeded} (now ${Math.round(n.trust)}).`
                  : marry === "young"
                  ? fill(t.young[lang], { days: content.rules.limits.marriageMinDays, now: relationshipDays(state, content, n) })
                  : marry === "cost"
                    ? `Gift: ${fmt(d.marriage.cost)}.`
                    : null
              }
            >
              💍 Marriage alliance · gift {fmt(d.marriage.cost)}
            </ActionButton>
          )}
          <ActionButton
            onClick={() => dispatch({ type: "sandugo", neighbor: n.id })}
            disabled={sandugoWhy !== null || !!seaWhy}
            why={
              seaWhy
                ? seaWhy
                : sandugoWhy === "young"
                  ? fill(t.sandugoYoung[lang], { days: content.rules.limits.sandugoMinDays, now: relationshipDays(state, content, n) })
                  : sandugoWhy === "grudge"
                    ? refusalText("alliance", content, def.datu)
                    : `Needs ${fmt(d.sandugo.cost)}.`
            }
          >
            🩸 Sandugo (blood compact) · {fmt(d.sandugo.cost)}
          </ActionButton>
          <button type="button" className="text-xs text-amber-800 underline" onClick={() => onLore("sandugo")}>
            What is sandugo?
          </button>
        </div>
      )}

      {n.status === "independent" && (
        <div className="space-y-2">
          <h3 className="font-display text-base text-amber-900">Mangayaw (raid)</h3>
          <Stepper value={send} max={raidMax} onChange={setWarriors} label="Warriors to send" />
          <p className="text-xs text-stone-600">
            Attack {attack} vs their defense {Math.round(theirDefense)} · <strong>{Math.round(chance * 100)}% chance</strong> to win. A win brings goods and renown
            but every neighbor will trust you less.
          </p>
          {raidPlan?.planning && <p className="rounded bg-red-50 px-2 py-1 text-xs text-red-900">⚔️ {raidPlan.text}</p>}
          <ActionButton
            tone="war"
            onClick={() => {
              // When visiting, the first press shows the plan on their map; the second sends the raid.
              if (raidPlan && !raidPlan.planning) return raidPlan.setPlanning(true);
              raidPlan?.setPlanning(false);
              dispatch({ type: "raid", neighbor: n.id, warriors: send });
            }}
            disabled={home < 1 || raidCooldown > 0 || !!seaWhy || (far && sailBlocker(state, content, { type: "raid", neighbor: n.id, warriors: send }) !== null)}
            why={seaWhy ? seaWhy : home < 1 ? "Train Mandirigma first." : `Your warriors are resting: ${clock(raidCooldown)}.`}
          >
            {raidPlan && !raidPlan.planning ? `🗺️ ${game.visit.preview[lang]}` : raidPlan ? `🔥 ${game.visit.confirm[lang]} · ${send}` : `🔥 Raid with ${send} warrior${send === 1 ? "" : "s"}`}
          </ActionButton>
          {raidPlan?.planning && (
            <button type="button" onClick={() => raidPlan.setPlanning(false)} className="text-xs font-semibold text-stone-700 underline">
              {game.visit.cancel[lang]}
            </button>
          )}
          <button type="button" className="text-xs text-amber-800 underline" onClick={() => onLore("mangayaw")}>
            What is mangayaw?
          </button>
        </div>
      )}

      {n.status === "tributary" && (
        <div className="space-y-2">
          <h3 className="font-display text-base text-amber-900">Protect</h3>
          {n.guard && <p className="text-xs text-green-800">🛡️ {n.guard.warriors} of your warriors guard them for {clock(n.guard.until - state.time)}.</p>}
          <Stepper value={send} max={home} onChange={setWarriors} label="Warriors to send" />
          <ActionButton
            onClick={() => dispatch({ type: "guard", neighbor: n.id, warriors: send })}
            disabled={home < 1}
            why="Train Mandirigma first."
          >
            🛡️ Guard them for {clock(d.loyalty.guardSeconds)}
          </ActionButton>
        </div>
      )}
    </section>
  );
}

/** Propose a trade: what you give, what you ask for. Shows their counter-offer when they make one. */
function TradeForm({ n, state, content, dispatch, seaWhy = null }: { n: NeighborState; state: GameState; content: Content; dispatch: (c: Command) => void; seaWhy?: string | null }) {
  const td = content.rules.diplomacy.tradeDecision;
  const def = neighborDef(content, n.id)!;
  const std = standardProposal(content, n.id, "rice");
  const [give, setGive] = useState<Resource>("rice");
  const [wantPick, setWant] = useState<Resource>(std.want.resource);
  const want = wantPick === give ? RESOURCES.find((r) => r !== give)! : wantPick;
  /** The next resource after `r`, skipping `not` (tapping the icon cycles through them). */
  const cycle = (r: Resource, not: Resource) => {
    const others = RESOURCES.filter((x) => x !== not);
    return others[(others.indexOf(r) + 1) % others.length];
  };
  const [giveAmount, setGiveAmount] = useState(std.give.amount);
  const [wantAmount, setWantAmount] = useState(std.want.amount);
  const paused = tradingPaused(state);
  const embargo = isEmbargo(n, content);
  const counter = state.region?.counter?.neighbor === n.id && state.time <= state.region.counter.expiresAt ? state.region.counter : null;
  const margin = fairness({ give: { resource: give, amount: giveAmount }, want: { resource: want, amount: wantAmount } }, content) - fairnessNeeded(n, content);
  const step = (v: number, by: number) => Math.min(td.maxAmount, Math.max(td.minAmount, v + by));
  const why = seaWhy
    ? seaWhy
    : paused
    ? "Trade paused — raid in progress."
    : embargo
      ? refusalText("embargo", content, def.datu)
      : state.resources[give] < giveAmount
        ? `You have ${Math.floor(state.resources[give])} ${give}.`
        : null;
  return (
    <div className="space-y-2">
      {counter ? (
        <div className="rounded-lg border-2 border-amber-500 bg-amber-50 p-2 text-sm">
          <p>
            <b>{def.datu} counters:</b> {counter.want.amount} {RESOURCE_ICON[counter.want.resource]} for your {counter.give.amount} {RESOURCE_ICON[counter.give.resource]} ·{" "}
            {clock(counter.expiresAt - state.time)}
          </p>
          <div className="mt-1.5 flex gap-2">
            <button type="button" onClick={() => dispatch({ type: "acceptCounter" })} className="game-btn border-2 border-green-950 bg-green-700 px-3 py-1 text-xs font-semibold text-white">
              Accept
            </button>
            <button type="button" onClick={() => dispatch({ type: "declineCounter" })} className="game-btn border-2 border-amber-950/60 bg-amber-200 px-3 py-1 text-xs font-semibold text-amber-950">
              No thanks
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            <span className="text-stone-600">Give</span>
            <AmountStepper value={giveAmount} onChange={(v) => setGiveAmount(step(v, 0))} by={5} />
            <button
              type="button"
              className="game-btn border-2 border-amber-900/50 bg-amber-100 px-1.5 text-base"
              aria-label={`Give ${give}; tap for another resource`}
              onClick={() => {
                const g = cycle(give, want);
                setGive(g);
              }}
            >
              {RESOURCE_ICON[give]} ▾
            </button>
            <span className="text-stone-600">for</span>
            <AmountStepper value={wantAmount} onChange={(v) => setWantAmount(step(v, 0))} by={5} />
            <button
              type="button"
              className="game-btn border-2 border-amber-900/50 bg-amber-100 px-1.5 text-base"
              aria-label={`Ask for ${want}; tap for another resource`}
              onClick={() => setWant(cycle(want, give))}
            >
              {RESOURCE_ICON[want]} ▾
            </button>
          </div>
          <p className="text-[11px] text-stone-500">
            {embargo
              ? "They won't trade at all right now."
              : margin >= td.closeBand
                ? "They'll likely accept."
                : margin > -td.closeBand
                  ? "A close call: it could go either way."
                  : margin >= -td.counterBand
                    ? "Not quite enough for them: they may counter."
                    : "They'll likely refuse."}{" "}
            Their trust, grudge and temper change what they'll take.
          </p>
          <ActionButton
            onClick={() => dispatch({ type: "proposeTrade", neighbor: n.id, give: { resource: give, amount: giveAmount }, want: { resource: want, amount: wantAmount } })}
            disabled={why !== null}
            why={why}
          >
            🛶 Propose: {giveAmount} {RESOURCE_ICON[give]} for {wantAmount} {RESOURCE_ICON[want]}
          </ActionButton>
        </>
      )}
    </div>
  );
}

/** Handog: a peace gift of rice and wood that eases their grudge and builds trust. */
function HandogForm({ n, state, content, dispatch }: { n: NeighborState; state: GameState; content: Content; dispatch: (c: Command) => void }) {
  const h = content.rules.diplomacy.handog;
  const [gift, setGift] = useState<Record<Resource, number>>(() => Object.fromEntries(RESOURCES.map((r) => [r, r === "rice" ? 20 : 0])) as Record<Resource, number>);
  const v = giftValue(gift, content);
  const short = RESOURCES.find((r) => state.resources[r] < gift[r]);
  return (
    <div className="space-y-2">
      <h3 className="font-display text-base text-amber-900">Handog (peace gift)</h3>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        {RESOURCES.map((r) => (
          <span key={r} className="flex items-center gap-1">
            <AmountStepper value={gift[r]} onChange={(x) => setGift({ ...gift, [r]: Math.max(0, Math.min(500, x)) })} by={10} min={0} />
            <span className="text-base">{RESOURCE_ICON[r]}</span>
          </span>
        ))}
      </div>
      <p className="text-[11px] text-stone-500">
        Grudge −{Math.round(Math.min(n.grudge, v * h.grudgePerValue))}, trust +{Math.round(Math.min(100 - n.trust, v * h.trustPerValue))}.
      </p>
      <ActionButton
        onClick={() => dispatch({ type: "handog", neighbor: n.id, gift })}
        disabled={v < h.minValue || !!short}
        why={short ? `You have ${Math.floor(state.resources[short])} ${short}.` : `A gift must be worth at least ${h.minValue}.`}
      >
        🎁 Send Handog
      </ActionButton>
    </div>
  );
}

function AmountStepper(props: { value: number; onChange: (n: number) => void; by: number; min?: number }) {
  const { value, onChange, by, min = 0 } = props;
  return (
    <span className="inline-flex items-center gap-1">
      <button type="button" aria-label="Less" className="game-btn size-7 border-2 border-amber-900/50 bg-amber-100 text-sm" onClick={() => onChange(Math.max(min, value - by))}>
        −
      </button>
      <span className="w-8 text-center font-display tabular-nums">{value}</span>
      <button type="button" aria-label="More" className="game-btn size-7 border-2 border-amber-900/50 bg-amber-100 text-sm" onClick={() => onChange(value + by)}>
        +
      </button>
    </span>
  );
}

function Stepper(props: { value: number; max: number; onChange: (n: number) => void; label: string }) {
  const { value, max, onChange, label } = props;
  return (
    <div className="flex items-center gap-2 text-sm" role="group" aria-label={label}>
      <span className="text-stone-600">{label}:</span>
      <button type="button" aria-label="Fewer" className="game-btn size-8 border-2 border-amber-900/50 bg-amber-100" onClick={() => onChange(Math.max(1, value - 1))}>
        −
      </button>
      <span className="w-8 text-center font-display tabular-nums">{max < 1 ? 0 : value}</span>
      <button type="button" aria-label="More" className="game-btn size-8 border-2 border-amber-900/50 bg-amber-100" onClick={() => onChange(Math.min(max, value + 1))}>
        +
      </button>
      <span className="text-xs text-stone-500">of {max}</span>
    </div>
  );
}
