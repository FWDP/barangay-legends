import { useState, type ReactNode } from "react";
import type { Content, Resource } from "../engine/content";
import { isHungry, seasonAt } from "../engine/events";
import { assignWorkers, housing, rates, type GameState, type Rates } from "../engine/game";
import { clock } from "./EventBanners";
import { formatAmount, formatBreakdown, formatRate, RESOURCE_ICON } from "./format";

/** Slim top bar: title, resources, and whatever controls are passed as children. */
export function Hud(props: { state: GameState; content: Content; children: ReactNode }) {
  const { state, content, children } = props;
  const r = rates(state, content);
  const working = Object.values(assignWorkers(state, content)).reduce((a, b) => a + b, 0);

  return (
    <header className="wood-panel relative z-30 flex items-center gap-1.5 border-b-2 border-amber-950/60 px-2 py-1.5 sm:gap-2 sm:px-3">
      <h1 className="text-outline mr-2 hidden font-display text-xl tracking-wide text-amber-100 md:block">
        Barangay Legends
      </h1>
      <ResourceChip resource="rice" amount={state.resources.rice} rates={r} note={notes(state, content).rice} />
      <ResourceChip resource="wood" amount={state.resources.wood} rates={r} note={notes(state, content).wood} />
      <Chip
        icon="👥"
        label={`Villagers: ${state.villagers} of ${housing(state, content)}, ${working} working${state.warriors ? `, ${state.warriors} warriors` : ""}${state.sick.length ? `, ${state.sick.length} sick` : ""}`}
      >
        <span className="block font-display text-base leading-none tabular-nums sm:text-lg">
          {state.villagers}/{housing(state, content)}
        </span>
        <span className="block text-[10px] leading-tight whitespace-nowrap text-amber-200/90">
          {working} working{state.warriors > 0 && <span className="hidden sm:inline"> · ⚔️{state.warriors}</span>}
          {state.sick.length > 0 && <span className="text-red-200"> · 🤒{state.sick.length}</span>}
        </span>
      </Chip>
      <SeasonChip state={state} content={content} />
      <div className="ml-auto flex items-center gap-1.5">{children}</div>
    </header>
  );
}

/** Why a rate is lower than usual, shown under the breakdown. */
function notes(state: GameState, content: Content): Record<Resource, string | null> {
  if (isHungry(state)) {
    const n = `${content.events.hunger?.name ?? "Hunger"}: nobody is working`;
    return { rice: n, wood: n };
  }
  const season = seasonAt(content, state.time)?.season;
  const pct = (r: Resource) => season?.productionPercent[r];
  const note = (r: Resource) => (pct(r) !== undefined ? `${season!.icon} ${season!.name}: ${r} ×${pct(r)! / 100}` : null);
  return { rice: note("rice"), wood: note("wood") };
}

function SeasonChip({ state, content }: { state: GameState; content: Content }) {
  const now = seasonAt(content, state.time);
  if (!now) return null;
  return (
    <div
      className="flex items-center gap-1 rounded-lg bg-black/25 px-1.5 py-1 text-amber-50 shadow-inner sm:px-2"
      title={`${now.season.name}: ${now.season.description}`}
      aria-label={`Season: ${now.season.name}, ${clock(now.remaining)} left. ${now.season.description}`}
    >
      <span className="text-lg sm:text-xl" aria-hidden>
        {now.season.icon}
      </span>
      <span className="text-left leading-none">
        <span className="hidden font-display text-sm sm:block">{now.season.name}</span>
        <span className="block text-[10px] text-amber-200/90 tabular-nums">{clock(now.remaining)}</span>
      </span>
    </div>
  );
}

function Chip(props: { icon: string; label: string; title?: string; children: ReactNode }) {
  return (
    <div
      className="flex min-w-0 items-center gap-1 rounded-lg bg-black/25 px-1.5 py-1 text-amber-50 shadow-inner sm:gap-1.5 sm:px-2"
      title={props.title ?? props.label}
      aria-label={props.label}
    >
      <span className="text-lg sm:text-xl" aria-hidden>
        {props.icon}
      </span>
      <span className="min-w-0 text-left">{props.children}</span>
    </div>
  );
}

const RESOURCE_LABEL: Record<Resource, string> = { rice: "Rice", wood: "Wood" };

/** A resource chip that explains its rate on hover (desktop) or tap (phone). */
function ResourceChip(props: { resource: Resource; amount: number; rates: Rates; note: string | null }) {
  const { resource, amount, rates, note } = props;
  const [open, setOpen] = useState(false);
  const net = rates.net[resource];
  const rateColor = net === 0 ? "text-amber-200/80" : net > 0 ? "text-lime-300" : "text-red-300";
  const tipId = `rate-${resource}`;

  return (
    <div className="group relative" data-resource={resource}>
      <button
        type="button"
        className="flex min-w-[4.2rem] cursor-help items-center gap-1 rounded-lg bg-black/25 px-1.5 py-1 text-amber-50 shadow-inner sm:min-w-24 sm:gap-1.5 sm:px-2"
        aria-label={`${RESOURCE_LABEL[resource]}: ${formatAmount(amount)}, ${formatRate(net)}`}
        aria-expanded={open}
        aria-describedby={tipId}
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setOpen(false)}
      >
        <span className="text-lg sm:text-xl" aria-hidden>
          {RESOURCE_ICON[resource]}
        </span>
        <span className="text-left">
          <span className="block font-display text-base leading-none tabular-nums sm:text-lg">{formatAmount(amount)}</span>
          <span className={`block text-[10px] leading-tight tabular-nums ${rateColor}`}>{formatRate(net)}</span>
        </span>
      </button>
      <div
        id={tipId}
        role="tooltip"
        className={`absolute top-full left-0 z-50 mt-2 w-max max-w-[calc(100vw-1rem)] rounded-lg border border-amber-950/50 bg-stone-900/95 px-2.5 py-1.5 text-xs text-amber-50 tabular-nums shadow-lg group-hover:block ${open ? "block" : "hidden"}`}
      >
        {formatBreakdown(rates, resource)}
        {note && <span className="block text-amber-300">{note}</span>}
      </div>
    </div>
  );
}
