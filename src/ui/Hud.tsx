import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { FOOD_GROUPS, RESOURCES, type Content, type Resource } from "../engine/content";
import { foodCaps } from "../engine/food";
import { isHungry, seasonAt } from "../engine/events";
import { freeVillagers } from "../engine/clearing";
import { happinessMultiplier, happinessTarget } from "../engine/happiness";
import { riceCap } from "../engine/storage";
import { softCap, stopCap } from "../engine/stockpile";
import { homeWarriors } from "../engine/region";
import { buildingWorkers, calledToArms, housing, rates, warriorCap, type GameState, type Rates } from "../engine/game";
import { rulerTitle } from "../engine/household";
import { clock } from "./EventBanners";
import { formatAmount, formatBreakdown, formatRate, formatShort, RESOURCE_ICON } from "./format";
import { statusIcons } from "./notices";
import { StatusIcons, statusText } from "./NoticeStack";
import type { Lang } from "./settings";
import { ForestChip, forestIcon, forestText } from "./Spirits";
import { fill, type GameText } from "./uiContent";
import { ResourceIcon } from "./resourceArt";

/*
 * The top bar's layout, by width:
 * - under 1920px it has two rows: the name, level and Araw with the controls, then the
 *   resources and people. From 1920px it is one row.
 * - under lg (1024px) the secondary items (happiness, Forest Balance, season, Mandirigma, Asin,
 *   Tapay, status icons) sit behind a "⋯" chip; from lg they are compact icon chips, with their
 *   words in the tooltip; from xl (1280px) they show their labels too.
 * Every label is one line (whitespace-nowrap); sub-lines that don't fit go into the tooltip.
 */
/** Shown only where the bar has room for labels and sub-lines. */
const ROOMY_BLOCK = "hidden xl:block";

/** The top bar: the barangay, its resources and people, and whatever controls are passed as children. */
export function Hud(props: {
  state: GameState;
  content: Content;
  game: GameText;
  lang: Lang;
  children: ReactNode;
  tradeHeld?: boolean;
  level?: ReactNode;
  day?: ReactNode;
  full?: FullText;
  stockpile?: StockpileText;
  mood?: MoodText;
  food?: FoodText;
}) {
  const { state, content, game, lang, children, level, day, tradeHeld = false } = props;
  const r = rates(state, content);
  const n = notes(state, content);
  const working = buildingWorkers(state, content).reduce((a, b) => a + b, 0);
  const free = freeVillagers(state, content);
  const room = housing(state, content);
  const mood = props.mood ?? MOOD_EN;
  const h = game.hud;
  const peopleTip = [
    fill(h.people[lang], { n: state.villagers, room }),
    fill(h.working[lang], { working, free }),
    state.sick.length > 0 ? fill(h.sick[lang], { n: state.sick.length }) : "",
  ].filter(Boolean).join(" · ");
  const showGold = state.resources.gold > 0 || r.net.gold !== 0;
  const showSalt = state.resources.salt > 0 || r.net.salt !== 0;
  const showWine = state.resources.wine > 0;
  const salt = showSalt && <ResourceChip resource="salt" amount={state.resources.salt} rates={r} note={null} cap={foodCaps(state, content).salt} full={props.full} />;
  const wine = showWine && <ResourceChip resource="wine" amount={state.resources.wine} rates={r} note={null} />;

  return (
    <header className="wood-panel relative z-30 flex flex-wrap items-center gap-x-1 gap-y-1 border-b-2 border-amber-950/60 px-1.5 py-1 sm:gap-x-2 sm:px-3 sm:py-1.5 min-[1920px]:flex-nowrap">
      {/* Who and when. */}
      <div className="order-1 flex min-w-0 flex-1 items-center gap-1 sm:gap-1.5 min-[1920px]:flex-none">
        <NameChip state={state} content={content} game={game} lang={lang} />
        {level}
        {day}
      </div>
      {/* Resources and people (their own row under 1920px), then the secondary chips from lg. */}
      <div className="order-3 flex min-w-0 basis-full items-center gap-1 sm:gap-1.5 min-[1920px]:order-2 min-[1920px]:basis-auto min-[1920px]:flex-1">
        <div className="flex min-w-0 flex-1 items-center gap-1 sm:gap-1.5 md:flex-none [&>*]:max-md:min-w-0 [&>*]:max-md:flex-1">
          <ResourceChip resource="food" amount={state.resources.food} rates={r} note={n.food} extra={props.food ? <FoodTip state={state} content={content} text={props.food} /> : null} />
          <ResourceChip resource="rice" amount={state.resources.rice} rates={r} note={n.rice} cap={riceCap(state, content)} full={props.full} />
          <ResourceChip resource="wood" amount={state.resources.wood} rates={r} note={n.wood} soft={softCap(state, content, "wood")} stop={stopCap(state, content, "wood")} stockpile={props.stockpile} />
          {showGold && <ResourceChip resource="gold" amount={state.resources.gold} rates={r} note={n.gold} soft={softCap(state, content, "gold")} stop={stopCap(state, content, "gold")} stockpile={props.stockpile} />}
          <Chip
            icon="👥"
            label={`${peopleTip} · ${happinessText(state, content, mood)}`}
            tip={
              <>
                {peopleTip}
                <span className="mt-1 block text-amber-300 lg:hidden">
                  {moodFace(state.happiness)} {happinessText(state, content, mood)}
                </span>
              </>
            }
          >
            <span className="block font-display text-base leading-none whitespace-nowrap tabular-nums sm:text-lg">
              {state.villagers}/{room}
            </span>
            <span className={`text-[10px] leading-tight whitespace-nowrap text-amber-200/90 ${ROOMY_BLOCK}`}>
              {fill(h.working[lang], { working, free })}
            </span>
          </Chip>
        </div>
        <div className="hidden shrink-0 items-center gap-1.5 lg:flex">
          {salt}
          {wine}
          <WarriorChip state={state} content={content} game={game} lang={lang} />
          <HappinessChip state={state} content={content} mood={mood} />
          <ForestChip state={state} content={content} game={game} lang={lang} />
          <SeasonChip state={state} content={content} game={game} lang={lang} />
          <StatusIcons state={state} content={content} game={game} lang={lang} tradeHeld={tradeHeld} />
        </div>
      </div>
      {/* Controls: right of the first row, at the far right in one row. The "⋯" chip holds the secondary items on phones. */}
      <div className="order-2 flex shrink-0 items-center gap-1 sm:gap-1.5 min-[1920px]:order-3">
        <MoreChip state={state} content={content} game={game} lang={lang} mood={mood} tradeHeld={tradeHeld} extra={<>{salt}{wine}</>} />
        {children}
      </div>
    </header>
  );
}

/** The barangay's name, cut short to fit; tapping it shows the whole name and its ruler. */
function NameChip({ state, content, game, lang }: { state: GameState; content: Content; game: GameText; lang: Lang }) {
  const [open, setOpen] = useState(false);
  const name = state.barangay.name || "Barangay Legends";
  const full = state.barangay.datu ? fill(game.hud.nameTip[lang], { name, ruler: `${rulerTitle(state, content)} ${state.barangay.datu}` }) : name;
  return (
    <div className="group relative min-w-0">
      <button
        type="button"
        aria-label={full}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setOpen(false)}
        className="text-outline block max-w-full truncate text-left font-display text-base tracking-wide text-amber-100 sm:text-lg lg:max-w-56 lg:text-xl"
      >
        {name}
      </button>
      <div
        role="tooltip"
        className={`absolute top-full left-0 z-50 mt-2 w-max max-w-[calc(100vw-1rem)] rounded-lg border border-amber-950/50 bg-stone-900/95 px-2.5 py-1.5 text-xs text-amber-50 shadow-lg sm:max-w-80 sm:group-hover:block ${open ? "block" : "hidden"}`}
      >
        {full}
      </div>
    </div>
  );
}

/** Mandirigma: how many of how many; red while called to arms. The words are in the tooltip. */
function WarriorChip({ state, content, game, lang }: { state: GameState; content: Content; game: GameText; lang: Lang }) {
  const cap = warriorCap(state, content);
  if (state.warriors === 0 && cap === 0) return null;
  const t = warriorText(state, content, game, lang);
  return (
    <Chip icon="⚔️" label={t.join(" ")} tip={t.map((line, i) => <span key={i} className={`block ${i === 2 ? "text-red-200" : ""}`}>{line}</span>)} tone={t.length > 2 ? "bg-red-800/70" : undefined}>
      <span className="block font-display text-sm leading-none whitespace-nowrap tabular-nums">
        {state.warriors}/{cap}
      </span>
      <span className={`text-[10px] leading-tight whitespace-nowrap text-amber-200/90 ${ROOMY_BLOCK}`}>{t.length > 2 ? game.hud.toArmsShort[lang] : "Mandirigma"}</span>
    </Chip>
  );
}

/** The Mandirigma's lines: count, the cap's rule, and (while a raid is coming) who answered the call. */
function warriorText(state: GameState, content: Content, game: GameText, lang: Lang): string[] {
  const h = game.hud;
  const m = content.rules.military;
  const lines = [fill(h.warriors[lang], { n: state.warriors, cap: warriorCap(state, content) }), fill(h.warriorsTip[lang], { perKuta: m.warriorsPerKuta, percent: m.maxWarriorPercent })];
  const raid = state.region?.incomingRaid;
  const called = calledToArms(state, content);
  if (raid && called > 0) lines.push(raid.everyone ? fill(h.toArmsAll[lang], { called }) : fill(h.toArms[lang], { called, home: homeWarriors(state) }));
  return lines;
}

/**
 * On phones, the "⋯" chip: it opens a list of the secondary items (happiness, Forest Balance,
 * season, Mandirigma, Asin and Tapay, status icons). A dot shows when one of them needs a look.
 */
function MoreChip(props: { state: GameState; content: Content; game: GameText; lang: Lang; mood: MoodText; tradeHeld: boolean; extra: ReactNode }) {
  const { state, content, game, lang, mood, tradeHeld } = props;
  const [open, setOpen] = useState(false);
  const statuses = statusIcons(state, content, lang, tradeHeld);
  const season = seasonAt(content, state.time);
  const warriors = state.warriors > 0 || warriorCap(state, content) > 0 ? warriorText(state, content, game, lang) : null;
  const called = calledToArms(state, content) > 0;
  const alert = called || state.forest.stage > 0 || statuses.length > 0;
  // The list opens just under the top bar, whatever its height.
  const [top, setTop] = useState(0);
  const row = (key: string, icon: ReactNode, text: ReactNode, tone = "") => (
    <li key={key} className={`flex gap-2 ${tone}`}>
      <span aria-hidden className="w-5 shrink-0 text-center text-base leading-5">
        {icon}
      </span>
      <span className="min-w-0">{text}</span>
    </li>
  );
  return (
    <div className="relative lg:hidden">
      <button
        type="button"
        aria-label={game.hud.more[lang]}
        aria-expanded={open}
        onClick={(e) => {
          setTop(e.currentTarget.closest("header")?.getBoundingClientRect().bottom ?? 0);
          setOpen((o) => !o);
        }}
        className={`relative flex h-8 min-w-8 items-center justify-center rounded-lg px-1.5 font-display text-lg leading-none text-amber-50 shadow-inner ${called ? "bg-red-800/70" : "bg-black/25"}`}
      >
        <span aria-hidden>⋯</span>
        {alert && <span aria-hidden className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full border border-amber-950 bg-amber-300" />}
      </button>
      {/* In a portal, so the list sits above the map's notices and banners (the bar is a lower layer). */}
      {open &&
        createPortal(
        <>
          <button type="button" aria-label={game.hud.more[lang]} tabIndex={-1} className="fixed inset-0 z-[55] cursor-default" onClick={() => setOpen(false)} />
          <div role="dialog" aria-label={game.hud.moreTitle[lang]} style={{ top: top + 4 }} className="fixed inset-x-2 z-[55] max-h-[70dvh] overflow-y-auto rounded-lg border border-amber-950/50 bg-stone-900 sm:left-auto sm:w-96 px-3 py-2 text-xs text-amber-50 shadow-lg">
            <p className="mb-1.5 font-display text-sm text-amber-200">{game.hud.moreTitle[lang]}</p>
            <ul className="space-y-1.5 leading-snug">
              {row("mood", moodFace(state.happiness), `${happinessText(state, content, mood)} ${mood.tip}`)}
              {row("forest", forestIcon(state.forest.balance), forestText(state, content, game, lang), state.forest.stage > 0 ? "text-amber-300" : "")}
              {season && row("season", season.season.icon, `${fill(game.hud.season[lang], { name: season.season.name, time: clock(season.remaining) })}. ${season.season.description}`)}
              {warriors && row("warriors", "⚔️", warriors.join(" "), called ? "text-red-200" : "")}
              {statuses.map((s) => row(s.id, s.icon, statusText(s.id, s.detail, game, lang)))}
            </ul>
            <div className="mt-2 flex flex-wrap gap-1.5 empty:hidden">{props.extra}</div>
          </div>
        </>,
          document.body,
        )}
    </div>
  );
}

/** Why a rate is lower than usual, shown under the breakdown. */
function notes(state: GameState, content: Content): Record<Resource, string | null> {
  if (isHungry(state)) {
    const n = `${content.events.hunger?.name ?? "Hunger"}: nobody is working`;
    return Object.fromEntries(RESOURCES.map((r) => [r, n])) as Record<Resource, string | null>;
  }
  const season = seasonAt(content, state.time)?.season;
  const pct = (r: Resource) => season?.productionPercent[r];
  const note = (r: Resource) => (pct(r) !== undefined ? `${season!.icon} ${season!.name}: ${r} ×${pct(r)! / 100}` : null);
  return Object.fromEntries(RESOURCES.map((r) => [r, note(r)])) as Record<Resource, string | null>;
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
        className="flex h-10 cursor-help items-center gap-1 rounded-lg bg-black/25 px-2 text-amber-50 shadow-inner"
      >
        <span className="text-xl leading-none" aria-hidden>
          {face}
        </span>
        <span className="font-display text-sm leading-none tabular-nums">{h}</span>
      </button>
      <div
        role="tooltip"
        className={`absolute top-full right-0 z-50 mt-2 w-56 rounded-lg border border-amber-950/50 bg-stone-900/95 px-2.5 py-1.5 text-xs text-amber-50 shadow-lg group-hover:block ${open ? "block" : "hidden"}`}
      >
        {label} {mood.tip}
      </div>
    </div>
  );
}

/** The map's top-right corner on phones, for what the top bar has no room for (the Aklat). */
export function MapCorner({ children }: { children?: ReactNode }) {
  return (
    <div data-map-overlay className="pointer-events-auto absolute top-2 right-2 z-10 flex flex-col items-end gap-1.5 sm:hidden">
      {children}
    </div>
  );
}

function SeasonChip({ state, content, game, lang }: { state: GameState; content: Content; game: GameText; lang: Lang }) {
  const now = seasonAt(content, state.time);
  if (!now) return null;
  const label = `${fill(game.hud.season[lang], { name: now.season.name, time: clock(now.remaining) })}. ${now.season.description}`;
  return (
    <Chip icon={now.season.icon} label={label} tip={label}>
      <span className={`block font-display text-sm leading-none whitespace-nowrap ${ROOMY_BLOCK}`}>{now.season.name}</span>
      <span className="block text-[10px] leading-tight whitespace-nowrap text-amber-200/90 tabular-nums">{clock(now.remaining)}</span>
    </Chip>
  );
}

/** A HUD chip. With a `tip`, tapping it (or hovering, on desktop) shows the tip. */
function Chip(props: { icon: ReactNode; label: string; title?: string; tip?: ReactNode; tone?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const body = (
    <>
      <span className="text-base leading-none sm:text-xl" aria-hidden>
        {props.icon}
      </span>
      <span className="min-w-0 text-left">{props.children}</span>
    </>
  );
  const look = `flex h-9 w-full min-w-0 items-center justify-center gap-1 rounded-lg px-1.5 text-amber-50 shadow-inner sm:h-10 sm:gap-1.5 sm:px-2 ${props.tone ?? "bg-black/25"}`;
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
        className={`absolute top-full right-0 z-50 mt-2 w-60 rounded-lg border border-amber-950/50 bg-stone-900/95 px-2.5 py-1.5 text-xs text-amber-50 shadow-lg max-lg:fixed max-lg:inset-x-2 max-lg:top-24 max-lg:mt-0 max-lg:w-auto sm:group-hover:block ${open ? "block" : "hidden"}`}
      >
        {props.tip}
      </div>
    </div>
  );
}

/** The words for the Pagkain tooltip (content/ui.json food). */
export interface FoodText {
  variety: (n: number, total: number) => string;
  varietyTip: string;
  monotony: string;
  kept: (ground: string, fresh: string, live: string, preserved: string) => string;
  spoils: string;
  roughSeas: string;
  eatingRice: string;
}

/** Under the Pagkain breakdown: where it's kept, the variety of the diet, rough seas. */
function FoodTip({ state, content, text }: { state: GameState; content: Content; text: FoodText }) {
  const s = state.foodStore;
  const groups = state.dietGroups ?? 0;
  const season = seasonAt(content, state.time)?.season.id;
  const monotonous = (state.monotonyFor ?? 0) >= content.rules.food.variety.monotonySeconds;
  return (
    <span className="block max-w-72 whitespace-normal">
      {s && <span className="block text-amber-100/80">{text.kept(formatAmount(s.ground), formatAmount(s.fresh), formatAmount(s.live), formatAmount(s.preserved))}</span>}
      <span className={`block ${monotonous ? "text-amber-300" : "text-lime-200"}`}>{text.variety(groups, FOOD_GROUPS.length)}</span>
      <span className="block text-amber-100/70">{monotonous ? text.monotony : text.varietyTip}</span>
      {s && s.fresh > 1 && <span className="block text-amber-100/70">{text.spoils}</span>}
      {season && content.rules.food.roughSeas.includes(season) && <span className="block text-sky-200">{text.roughSeas}</span>}
      {state.resources.food <= 0 && state.resources.rice > 0 && <span className="block text-amber-300">{text.eatingRice}</span>}
    </span>
  );
}

const RESOURCE_LABEL: Record<Resource, string> = { food: "Pagkain", rice: "Palay", wood: "Wood", gold: "Gold", salt: "Asin", wine: "Tapay" };

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

function ResourceChip(props: { resource: Resource; amount: number; rates: Rates; note: string | null; cap?: number; full?: FullText; soft?: number; stop?: number; stockpile?: StockpileText; extra?: ReactNode }) {
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
        className="flex h-9 w-full cursor-help items-center justify-center gap-1 rounded-lg bg-black/25 px-1 text-amber-50 shadow-inner sm:h-10 sm:gap-1.5 sm:px-2 md:min-w-[5.5rem] md:justify-start"
        aria-label={`${RESOURCE_LABEL[resource]}: ${formatAmount(amount)}${cap !== undefined ? ` of ${formatAmount(cap)}` : ""}, ${formatRate(net)}`}
        aria-expanded={open}
        aria-describedby={tipId}
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setOpen(false)}
      >
        <span className="text-base leading-none sm:text-xl" aria-hidden>
          <ResourceIcon resource={resource} symbol={RESOURCE_ICON[resource]} className="inline-block size-[1.15em] align-[-0.2em]" />
        </span>
        <span className="text-left">
          {/* Phones show the short form (13.3K); the tooltip and the screen reader have the whole number. */}
          <span className={`block font-display text-base leading-none whitespace-nowrap tabular-nums sm:text-lg ${full || slow ? "text-amber-300" : ""}`}>
            <span className="md:hidden">{formatShort(amount)}</span>
            <span className="hidden md:inline">{formatAmount(amount)}</span>
          </span>
          <span className={`block text-[10px] leading-tight whitespace-nowrap tabular-nums ${full || slow ? "text-amber-300" : rateColor}`}>{full ? words.label : stopped ? (stockpile?.stopLabel ?? "full") : slow ? (stockpile?.label ?? "slow") : formatRate(net)}</span>
        </span>
      </button>
      <div
        id={tipId}
        role="tooltip"
        className={`absolute top-full left-0 z-50 mt-2 w-max max-w-[calc(100vw-1rem)] rounded-lg border border-amber-950/50 bg-stone-900/95 px-2.5 py-1.5 text-xs text-amber-50 tabular-nums shadow-lg group-hover:block max-md:fixed max-md:inset-x-2 max-md:top-24 max-md:mt-0 max-md:w-auto ${open ? "block" : "hidden"}`}
      >
        <span className="block font-semibold md:hidden">
          {RESOURCE_LABEL[resource]} {formatAmount(amount)}
        </span>
        {formatBreakdown(rates, resource)}
        {note && <span className="block text-amber-300">{note}</span>}
        {props.extra}
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
