import { useState, type ReactNode } from "react";
import type { Content, Resource } from "../engine/content";
import { isHungry, seasonAt } from "../engine/events";
import { freeVillagers } from "../engine/clearing";
import { happinessMultiplier, happinessTarget } from "../engine/happiness";
import { riceCap } from "../engine/storage";
import { softCap, stopCap } from "../engine/stockpile";
import { homeWarriors } from "../engine/region";
import { buildingWorkers, housing, rates, warriorCap, type GameState, type Rates } from "../engine/game";
import { clock } from "./EventBanners";
import { formatAmount, formatBreakdown, formatRate, RESOURCE_ICON } from "./format";

/** Slim top bar: title, resources, and whatever controls are passed as children. */
export function Hud(props: { state: GameState; content: Content; children: ReactNode; extraChips?: ReactNode; level?: ReactNode; day?: ReactNode; full?: FullText; stockpile?: StockpileText; mood?: MoodText }) {
  const { state, content, children, extraChips, level, day } = props;
  const r = rates(state, content);
  const working = buildingWorkers(state, content).reduce((a, b) => a + b, 0);
  const free = freeVillagers(state, content);
  const cap = warriorCap(state, content);
  const called = state.region?.incomingRaid ? homeWarriors(state) : 0;

  return (
    <header className="wood-panel relative z-30 flex items-center gap-1 border-b-2 border-amber-950/60 px-1.5 py-1.5 sm:gap-2 sm:px-3">
      <h1
        className="text-outline mr-2 hidden max-w-48 truncate font-display text-xl tracking-wide text-amber-100 md:block"
        title={state.barangay.datu ? `Datu ${state.barangay.datu}` : undefined}
      >
        {state.barangay.name || "Barangay Legends"}
      </h1>
      {level}
      {day}
      <ResourceChip resource="rice" amount={state.resources.rice} rates={r} note={notes(state, content).rice} cap={riceCap(state, content)} full={props.full} />
      <ResourceChip resource="wood" amount={state.resources.wood} rates={r} note={notes(state, content).wood} soft={softCap(state, content, "wood")} stop={stopCap(state, content, "wood")} stockpile={props.stockpile} />
      {(state.resources.gold > 0 || r.net.gold !== 0) && <ResourceChip resource="gold" amount={state.resources.gold} rates={r} note={notes(state, content).gold} soft={softCap(state, content, "gold")} stop={stopCap(state, content, "gold")} stockpile={props.stockpile} />}
      <Chip
        icon={
          <>
            {/* On phones the mood face stands in for the people icon (no room for its own chip). */}
            <span className="sm:hidden">{moodFace(state.happiness)}</span>
            <span className="hidden sm:inline">👥</span>
          </>
        }
        label={`${state.villagers} villagers (room for ${housing(state, content)}) · ${working} working · ${free} free · ${state.warriors} warriors${called ? ", called to arms" : ""}${state.sick.length ? ` · ${state.sick.length} sick` : ""} · ${happinessText(state, content, props.mood ?? MOOD_EN)}`}
        tip={
          <>
            {state.villagers} villagers, room for {housing(state, content)} · {working} working · {free} free
            {state.sick.length > 0 && <> · {state.sick.length} sick</>}
            <span className="mt-1 block text-amber-300 sm:hidden">
              {moodFace(state.happiness)} {happinessText(state, content, props.mood ?? MOOD_EN)}
            </span>
          </>
        }
      >
        <span className="block font-display text-base leading-none tabular-nums sm:text-lg">
          {state.villagers}/{housing(state, content)}
        </span>
        <span className="block text-[10px] leading-tight whitespace-nowrap text-amber-200/90">
          {working} working<span className="hidden sm:inline"> · {free} free</span>
          {state.sick.length > 0 && <span className="text-red-200"> · 🤒{state.sick.length}</span>}
        </span>
      </Chip>
      {(state.warriors > 0 || cap > 0) && (
        <div
          className={`hidden items-center gap-1 rounded-lg px-2 py-1 text-amber-50 shadow-inner sm:flex ${called ? "bg-red-800/70" : "bg-black/25"}`}
          title={`Mandirigma ${state.warriors}/${cap}: ${content.rules.military.warriorsPerKuta} per Kuta. They work between raids${called ? "; now called to arms" : ""}.`}
          aria-label={`Mandirigma ${state.warriors} of ${cap}${called ? ", called to arms" : ", at work between raids"}`}
        >
          <span className="text-lg" aria-hidden>
            ⚔️
          </span>
          <span className="text-left leading-none">
            <span className="block font-display text-sm tabular-nums">
              {state.warriors}/{cap}
            </span>
            <span className="block text-[10px] text-amber-200/90">{called ? "to arms!" : "Mandirigma"}</span>
          </span>
        </div>
      )}
      <span className="hidden sm:block">
        <HappinessChip state={state} content={content} mood={props.mood ?? MOOD_EN} />
      </span>
      {extraChips && <span className="hidden sm:block">{extraChips}</span>}
      {/* On phones the season sits on the map instead (MapSeasonBadge): the bar has no room. */}
      <span className="hidden sm:block">
        <SeasonChip state={state} content={content} />
      </span>
      <div className="ml-auto flex items-center gap-1 sm:gap-1.5">{children}</div>
    </header>
  );
}

/** Why a rate is lower than usual, shown under the breakdown. */
function notes(state: GameState, content: Content): Record<Resource, string | null> {
  if (isHungry(state)) {
    const n = `${content.events.hunger?.name ?? "Hunger"}: nobody is working`;
    return { rice: n, wood: n, gold: n };
  }
  const season = seasonAt(content, state.time)?.season;
  const pct = (r: Resource) => season?.productionPercent[r];
  const note = (r: Resource) => (pct(r) !== undefined ? `${season!.icon} ${season!.name}: ${r} ×${pct(r)! / 100}` : null);
  return { rice: note("rice"), wood: note("wood"), gold: note("gold") };
}

const moodFace = (h: number) => (h >= 75 ? "😄" : h >= 55 ? "🙂" : h >= 35 ? "😐" : "😟");

/** The happiness chip's words from ui.json: houses near the datu's house, and the tooltip's last line. */
export interface MoodText {
  housesNear: string;
  tip: string;
}

const MOOD_EN: MoodText = { housesNear: "+{n} houses near the datu's house", tip: "Houses near the datu's house lift spirits; hunger and sickness lower them." };

/** e.g. "Happiness 72 of 100: production +3%. Heading to 64 (+4 houses near the datu's house)." */
function happinessText(state: GameState, content: Content, mood: MoodText): string {
  const h = Math.round(state.happiness);
  const parts = happinessTarget(state, content);
  const effect = Math.round((happinessMultiplier(state, content) - 1) * 100);
  const why = [
    parts.houses > 0 && mood.housesNear.replace("{n}", String(parts.houses)),
    parts.hunger < 0 && `${parts.hunger} hunger`,
    parts.sickness < 0 && `${parts.sickness} sickness`,
  ].filter(Boolean);
  return `Happiness ${h} of 100: production ${effect >= 0 ? "+" : "−"}${Math.abs(effect)}%. Heading to ${Math.round(parts.target)}${why.length ? ` (${why.join(", ")})` : ""}.`;
}

/** Happiness: a face and the number; the tooltip says what raises or lowers it. */
function HappinessChip({ state, content, mood }: { state: GameState; content: Content; mood: MoodText }) {
  const [open, setOpen] = useState(false);
  const h = Math.round(state.happiness);
  const face = moodFace(state.happiness);
  const label = happinessText(state, content, mood);
  return (
    <div className="group relative">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setOpen(false)}
        className="flex cursor-help flex-col items-center rounded-lg bg-black/25 px-1 py-0.5 text-amber-50 shadow-inner sm:flex-row sm:gap-1 sm:px-2 sm:py-1"
      >
        <span className="text-base leading-none sm:text-xl" aria-hidden>
          {face}
        </span>
        <span className="text-[10px] leading-none tabular-nums sm:font-display sm:text-sm">{h}</span>
      </button>
      <div
        role="tooltip"
        className={`absolute top-full right-0 z-50 mt-2 w-56 rounded-lg border border-amber-950/50 bg-stone-900/95 px-2.5 py-1.5 text-xs text-amber-50 shadow-lg group-hover:block sm:left-0 sm:right-auto ${open ? "block" : "hidden"}`}
      >
        {label} {mood.tip}
      </div>
    </div>
  );
}

/** The season on the map's top-right corner, for phones (the top bar shows it on wider screens). */
export function MapSeasonBadge({ state, content, children }: { state: GameState; content: Content; children?: ReactNode }) {
  return (
    <div data-map-overlay className="pointer-events-auto absolute top-2 right-2 z-10 flex flex-col items-end gap-1.5 sm:hidden">
      <span className="rounded-lg bg-stone-900/50">
        <SeasonChip state={state} content={content} />
      </span>
      {children}
    </div>
  );
}

function SeasonChip({ state, content }: { state: GameState; content: Content }) {
  const now = seasonAt(content, state.time);
  if (!now) return null;
  return (
    <div
      className="flex flex-col items-center rounded-lg bg-black/25 px-1 py-0.5 text-amber-50 shadow-inner sm:flex-row sm:gap-1 sm:px-2 sm:py-1"
      title={`${now.season.name}: ${now.season.description}`}
      aria-label={`Season: ${now.season.name}, ${clock(now.remaining)} left. ${now.season.description}`}
    >
      <span className="text-base leading-none sm:text-xl" aria-hidden>
        {now.season.icon}
      </span>
      <span className="text-center leading-none sm:text-left">
        <span className="hidden font-display text-sm sm:block">{now.season.name}</span>
        <span className="block text-[10px] text-amber-200/90 tabular-nums">{clock(now.remaining)}</span>
      </span>
    </div>
  );
}

/** A HUD chip. With a `tip`, tapping it (or hovering, on desktop) shows the tip. */
function Chip(props: { icon: ReactNode; label: string; title?: string; tip?: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const body = (
    <>
      <span className="text-lg sm:text-xl" aria-hidden>
        {props.icon}
      </span>
      <span className="min-w-0 text-left">{props.children}</span>
    </>
  );
  const look = "flex min-w-0 items-center gap-1 rounded-lg bg-black/25 px-1.5 py-1 text-amber-50 shadow-inner sm:gap-1.5 sm:px-2";
  if (!props.tip) {
    return (
      <div className={look} title={props.title ?? props.label} aria-label={props.label}>
        {body}
      </div>
    );
  }
  return (
    <div className="group relative min-w-0">
      <button type="button" className={`${look} cursor-help`} aria-label={props.label} aria-expanded={open} onClick={() => setOpen((o) => !o)} onBlur={() => setOpen(false)}>
        {body}
      </button>
      <div
        role="tooltip"
        className={`absolute top-full left-0 z-50 mt-2 w-60 max-w-[calc(100vw-1rem)] rounded-lg border border-amber-950/50 bg-stone-900/95 px-2.5 py-1.5 text-xs text-amber-50 shadow-lg sm:group-hover:block ${open ? "block" : "hidden"}`}
      >
        {props.tip}
      </div>
    </div>
  );
}

const RESOURCE_LABEL: Record<Resource, string> = { rice: "Rice", wood: "Wood", gold: "Gold" };

/** A resource chip that explains its rate on hover (desktop) or tap (phone). */
/** The words for a full store (content/ui.json kamalig.full, kamalig.fullTip). */
export interface FullText {
  label: string;
  tip: string;
}

/** The words for the wood and gold soft cap (content/ui.json stockpile). */
export interface StockpileText {
  label: string;
  /** The short label once work brings in none (over the stop line). */
  stopLabel: string;
  /** The tip, given the cap and the stop line; `over` above the cap, `stopped` above the stop line. */
  tip: (cap: string, stop: string, over: boolean, stopped: boolean) => string;
}

function ResourceChip(props: { resource: Resource; amount: number; rates: Rates; note: string | null; cap?: number; full?: FullText; soft?: number; stop?: number; stockpile?: StockpileText }) {
  const { resource, amount, rates, note, cap, soft, stop, stockpile } = props;
  const slow = soft !== undefined && Number.isFinite(soft) && amount >= soft;
  const stopped = slow && stop !== undefined && amount >= stop;
  const words = props.full ?? { label: "full", tip: "Full: raise a Kamalig to store more, or spend rice." };
  const full = cap !== undefined && amount >= cap;
  const [open, setOpen] = useState(false);
  const net = rates.net[resource];
  const rateColor = net === 0 ? "text-amber-200/80" : net > 0 ? "text-lime-300" : "text-red-300";
  const tipId = `rate-${resource}`;

  return (
    <div className="group relative" data-resource={resource}>
      <button
        type="button"
        className="flex min-w-[3.4rem] cursor-help items-center gap-0.5 rounded-lg bg-black/25 px-1 py-1 text-amber-50 shadow-inner sm:min-w-24 sm:gap-1.5 sm:px-2"
        aria-label={`${RESOURCE_LABEL[resource]}: ${formatAmount(amount)}${cap !== undefined ? ` of ${formatAmount(cap)}` : ""}, ${formatRate(net)}`}
        aria-expanded={open}
        aria-describedby={tipId}
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setOpen(false)}
      >
        <span className="text-lg sm:text-xl" aria-hidden>
          {RESOURCE_ICON[resource]}
        </span>
        <span className="text-left">
          <span className={`block font-display text-base leading-none tabular-nums sm:text-lg ${full || slow ? "text-amber-300" : ""}`}>{formatAmount(amount)}</span>
          <span className={`block text-[10px] leading-tight tabular-nums ${full || slow ? "text-amber-300" : rateColor}`}>{full ? words.label : stopped ? (stockpile?.stopLabel ?? "full") : slow ? (stockpile?.label ?? "slow") : formatRate(net)}</span>
        </span>
      </button>
      <div
        id={tipId}
        role="tooltip"
        className={`absolute top-full left-0 z-50 mt-2 w-max max-w-[calc(100vw-1rem)] rounded-lg border border-amber-950/50 bg-stone-900/95 px-2.5 py-1.5 text-xs text-amber-50 tabular-nums shadow-lg group-hover:block max-sm:fixed max-sm:inset-x-2 max-sm:top-14 max-sm:mt-0 max-sm:w-auto ${open ? "block" : "hidden"}`}
      >
        {formatBreakdown(rates, resource)}
        {note && <span className="block text-amber-300">{note}</span>}
        {cap !== undefined && (
          <span className={`block ${full ? "text-amber-300" : "text-amber-100/80"}`}>
            🧺 Storage {formatAmount(amount)}/{formatAmount(cap)}
            {full && <span className="block">{words.tip}</span>}
          </span>
        )}
        {soft !== undefined && Number.isFinite(soft) && (
          <span className={`block whitespace-normal sm:max-w-72 ${slow ? "text-amber-300" : "text-amber-100/80"}`}>
            {stockpile ? stockpile.tip(formatAmount(soft), formatAmount(stop ?? Infinity), slow, stopped) : `🧺 Stockpile ${formatAmount(amount)}/${formatAmount(soft)}`}
          </span>
        )}
      </div>
    </div>
  );
}
