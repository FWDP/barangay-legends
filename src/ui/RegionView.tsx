import { useState, type ReactNode } from "react";
import { RESOURCES, type Content, type Resource } from "../engine/content";
import { asCost, canAfford, warriorCap, type Command, type GameState } from "../engine/game";
import {
  attackOf,
  defenseOf,
  homeWarriors,
  marriageBlocker,
  neighborDef,
  traitOf,
  type NeighborState,
 tradingPaused } from "../engine/region";
import { clock } from "./EventBanners";
import { RESOURCE_ICON } from "./format";

/** The regional river, drawn left to right in a 200 × 100 box. */
const RIVER: [number, number][] = [
  [0, 52],
  [30, 40],
  [60, 58],
  [95, 46],
  [130, 60],
  [165, 42],
  [200, 54],
];
const PLAYER_POSITION = 0.5;

function riverPoint(t: number): [number, number] {
  const seg = Math.min(RIVER.length - 2, Math.floor(t * (RIVER.length - 1)));
  const local = t * (RIVER.length - 1) - seg;
  const [x0, y0] = RIVER[seg];
  const [x1, y1] = RIVER[seg + 1];
  return [x0 + (x1 - x0) * local, y0 + (y1 - y0) * local];
}

const STATUS = {
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
}) {
  const { state, content, dispatch, onLore } = props;
  const region = state.region;
  const [selected, setSelected] = useState<string>(content.neighbors[0]?.id ?? "");
  if (!region) {
    return <div className="flex flex-1 items-center justify-center bg-green-900 text-amber-50">No neighbors yet.</div>;
  }
  const chosen = region.neighbors.find((n) => n.id === selected) ?? region.neighbors[0];

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-green-900 lg:flex-row">
      <div className="relative shrink-0 lg:min-w-0 lg:flex-1">
        <RiverMap state={state} content={content} selected={chosen?.id} onSelect={setSelected} />
      </div>
      <aside className="mat-card min-h-0 flex-1 overflow-y-auto border-t-4 border-amber-900/60 p-3 text-stone-800 lg:w-[26rem] lg:flex-none lg:border-t-0 lg:border-l-4">
        <OurForces state={state} content={content} dispatch={dispatch} />
        {chosen && <NeighborPanel key={chosen.id} n={chosen} state={state} content={content} dispatch={dispatch} onLore={onLore} />}
      </aside>
    </div>
  );
}

function RiverMap(props: { state: GameState; content: Content; selected?: string; onSelect: (id: string) => void }) {
  const { state, content, selected, onSelect } = props;
  const region = state.region!;
  // The river, continued well past both edges of the view box.
  const riverBeyond = `M-300,52 ${RIVER.map(([x, y]) => `L${x},${y}`).join(" ")} L500,54`;
  const [px, py] = riverPoint(PLAYER_POSITION);
  return (
    <svg viewBox="0 0 200 100" className="block h-auto max-h-[42dvh] w-full overflow-hidden lg:absolute lg:inset-0 lg:h-full lg:max-h-none" role="group" aria-label="Rehiyon: barangays along the river">
      {/* Land, trees and river run past the edges, so a tall or wide panel shows more country, not bars. */}
      <rect x="-300" y="-300" width="800" height="700" fill="#166534" />
      {Array.from({ length: 140 }, (_, i) => (
        <text key={i} x={-150 + ((i * 37) % 500)} y={-150 + ((i * 53) % 400)} fontSize="6" opacity="0.5" aria-hidden>
          {i % 3 ? "🌳" : "🌴"}
        </text>
      ))}
      <path d={riverBeyond} stroke="#0284c7" strokeWidth="9" fill="none" strokeLinecap="round" />
      <path d={riverBeyond} stroke="#7dd3fc" strokeWidth="2" fill="none" strokeDasharray="3 6" opacity="0.7" />
      {/* Our barangay. */}
      <g transform={`translate(${px}, ${py - 14})`}>
        <circle r="9" fill="#fef3c7" stroke="#b45309" strokeWidth="1.5" />
        <text textAnchor="middle" dy="3" fontSize="9" aria-hidden>
          🔥
        </text>
        <text textAnchor="middle" y="-12" fontSize="5" fill="#fffbeb" fontWeight="bold">
          Your barangay
        </text>
      </g>
      {region.neighbors.map((n) => {
        const def = neighborDef(content, n.id)!;
        const [x, y] = riverPoint(def.river.position);
        const dy = def.river.bank === "left" ? -15 : 15;
        const raiding = region.incomingRaid?.from === n.id;
        const isSel = n.id === selected;
        const circumference = 2 * Math.PI * 9;
        return (
          <g
            key={n.id}
            transform={`translate(${x}, ${y + dy})`}
            role="button"
            tabIndex={0}
            aria-label={`${def.name}, ${STATUS[n.status].label}, influence ${Math.round(n.influence)}`}
            aria-pressed={isSel}
            onClick={() => onSelect(n.id)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect(n.id)}
            className="cursor-pointer outline-none"
          >
            {isSel && <circle r="13" fill="none" stroke="#fde68a" strokeWidth="1.2" strokeDasharray="2 2" />}
            <circle r="9" fill="#fffbeb" stroke={STATUS[n.status].ring} strokeWidth="2" />
            {/* Influence, as a ring filling up to 100. */}
            <circle
              r="9"
              fill="none"
              stroke="#f59e0b"
              strokeWidth="2"
              strokeDasharray={`${(circumference * n.influence) / 100} ${circumference}`}
              transform="rotate(-90)"
              opacity={n.status === "independent" ? 1 : 0}
            />
            <text textAnchor="middle" dy="3" fontSize="8" aria-hidden>
              {n.status === "ally" ? "🤝" : n.status === "tributary" ? "🏵️" : "🛖"}
            </text>
            {raiding && (
              <circle r="11" fill="none" stroke="#dc2626" strokeWidth="1.5" className="motion-safe:animate-pulse" />
            )}
            <text textAnchor="middle" y={dy < 0 ? -12 : 17} fontSize="4.6" fill="#fffbeb" fontWeight="bold">
              {def.name.replace("Barangay ", "")}
            </text>
          </g>
        );
      })}
    </svg>
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
        <Stat label="Renown" value={`⭐ ${region.renown}`} note="from battles" />
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

function NeighborPanel(props: {
  n: NeighborState;
  state: GameState;
  content: Content;
  dispatch: (c: Command) => void;
  onLore: (id: string) => void;
}) {
  const { n, state, content, dispatch, onLore } = props;
  const def = neighborDef(content, n.id)!;
  const trait = traitOf(content, n.id);
  const d = content.rules.diplomacy;
  const home = homeWarriors(state);
  const [warriors, setWarriors] = useState(Math.min(home, 5));
  const send = Math.max(1, Math.min(warriors, home));
  const attack = attackOf(send, content);
  const theirDefense = defenseOf(n.state, content);
  const chance = attack / (attack + theirDefense);
  const receive = Math.floor((d.trade.give * (d.trade.receivePercent + trait.tradeBonusPercent)) / 100);
  const marry = marriageBlocker(state, content, n.id);
  const raidCooldown = n.raidCooldownUntil - state.time;

  return (
    <section className="space-y-3">
      <header>
        <div className="flex flex-wrap items-baseline justify-between gap-1">
          <h2 className="font-display text-xl text-amber-900">{def.name}</h2>
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS[n.status].chip}`}>{STATUS[n.status].label}</span>
        </div>
        <p className="text-sm">
          {def.datu} · <span className="font-semibold">{trait.label}</span>
        </p>
        <p className="text-xs text-stone-600">{def.description}</p>
      </header>
      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <Stat label="Size" value={`👥 ${n.state.villagers}`} note={`${n.state.buildings.length} buildings`} />
        <Stat label="Strength" value={`⚔️ ${attackOf(n.state.warriors, content)}`} note={`${n.state.warriors} warriors`} />
        <Stat label="Defense" value={`🛡️ ${Math.round(theirDefense)}`} note="against raids" />
      </div>
      <div className="space-y-1.5">
        {n.status === "independent" && <Bar label="Influence" value={n.influence} color="bg-amber-500" />}
        <Bar label="Trust" value={n.trust} color="bg-sky-500" />
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
        <div className="grid grid-cols-2 gap-2">
          {RESOURCES.map((give) => {
            const get = RESOURCES.find((r) => r !== give)!;
            const paused = tradingPaused(state);
            const ok = !paused && state.resources[give] >= d.trade.give && n.state.resources[get] >= receive;
            return (
              <ActionButton
                key={give}
                onClick={() => dispatch({ type: "trade", neighbor: n.id, give })}
                disabled={!ok}
                why={paused ? "Trade paused — raid in progress." : state.resources[give] < d.trade.give ? `You need ${d.trade.give} ${give}.` : `They're short of ${get}.`}
              >
                {d.trade.give} {RESOURCE_ICON[give]} → {receive} {RESOURCE_ICON[get]}
              </ActionButton>
            );
          })}
        </div>
      </div>

      {n.status !== "ally" && (
        <div className="space-y-2">
          <h3 className="font-display text-base text-amber-900">Alliance</h3>
          {!n.marriage && (
            <ActionButton
              onClick={() => dispatch({ type: "marry", neighbor: n.id })}
              disabled={marry !== null}
              why={
                marry === "trust"
                  ? `Needs trust above ${d.marriage.trustNeeded} (now ${Math.round(n.trust)}).`
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
            disabled={!n.marriage || !canAfford(state, asCost(d.sandugo.cost))}
            why={!n.marriage ? "Needs a marriage alliance first." : `Needs ${fmt(d.sandugo.cost)}.`}
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
          <Stepper value={send} max={home} onChange={setWarriors} label="Warriors to send" />
          <p className="text-xs text-stone-600">
            Attack {attack} vs their defense {Math.round(theirDefense)} · <strong>{Math.round(chance * 100)}% chance</strong> to win. A win brings goods and renown
            but every neighbor will trust you less.
          </p>
          <ActionButton
            tone="war"
            onClick={() => dispatch({ type: "raid", neighbor: n.id, warriors: send })}
            disabled={home < 1 || raidCooldown > 0}
            why={home < 1 ? "Train Mandirigma first." : `Your warriors are resting: ${clock(raidCooldown)}.`}
          >
            🔥 Raid with {send} warrior{send === 1 ? "" : "s"}
          </ActionButton>
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
