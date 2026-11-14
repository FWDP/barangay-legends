// The build toolbar: category tabs over a row of compact cards (icon, name, count, cost).
// Details (description, bonuses, staffing) open in a popover on hover (desktop) or long-press
// (phone), with a Build button. The row fades at its edges and shows arrows when it
// overflows. Tabs badge newly unlocked buildings; the adviser's or task's pick glows.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { RESOURCES, type BuildingDef, type Content } from "../engine/content";
import { asCost, buildingCost, canAfford, owned, roadCost, staffedBuildings, unreachableWorkplaces, type GameState } from "../engine/game";
import { isUnlocked } from "../engine/map";
import { datuLevelNeeded, maxDatuLevel, nextDatuLevel } from "../engine/datu";
import { datuHouseUrl, houseStyleFor } from "./datuHouseArt";
import { DAAN, DATU, itemsIn, missingFor, tabOfItem, tabsWithNew, unlockedIds, visibleTabs, type BuildTab } from "./buildMenu";
import { bonusRuleText, costText, groveRuleText, RESOURCE_ICON } from "./format";
import type { Lang } from "./settings";
import { fill, type GameText } from "./uiContent";
import { buildingArtUrl } from "./buildingArt";

const TAB_KEY = "barangay-legends/build-tab";
const SEEN_KEY = "barangay-legends/build-seen";
const LONG_PRESS_MS = 450;
const HOVER_MS = 350;

const TAB_ICON: Record<BuildTab, string> = { tirahan: "🛖", pagkain: "🌾", depensa: "🛡️", pananampalataya: "🕯️", daan: "🛤️", iba: "📦" };

function read<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage blocked: the toolbar forgets on reload.
  }
}

function effectText(b: BuildingDef, content: Content): string {
  const parts: string[] = [];
  if (b.housing) parts.push(`+${b.housing} villager capacity`);
  if (b.storage?.rice) parts.push(`+${b.storage.rice} rice storage`);
  if (b.placeNextTo) parts.push(`next to the ${b.placeNextTo.join(" or ")}`);
  if (b.shrine) parts.push("offerings and rituals");
  if (b.requiresNear) {
    const near = content.buildings.find((d) => d.id === b.requiresNear!.building)?.name ?? b.requiresNear.building;
    parts.push(`within ${b.requiresNear.radius} tiles of a ${near}`);
  }
  for (const r of RESOURCES) {
    const amount = b.produces?.[r];
    if (amount) parts.push(`+${amount} ${r}/s per worker`);
  }
  if (b.workers) parts.push(`${b.workers} workers`);
  if (b.heals) parts.push(`sick villagers heal ${b.heals.percentFaster}% faster`);
  if (b.defense) parts.push(`+${b.defense} defense`);
  if (b.bridge) parts.push("crosses the river, opening the far bank");
  return parts.join(", ");
}

/** One card's facts, shared by the card and its popover. */
interface Item {
  id: string;
  icon: string;
  name: string;
  count: number | null;
  unlocked: boolean;
  lockText: string;
  affordable: boolean;
  costLine: ReactNode;
  missing: string;
  details: string[];
  status: string[];
  recommended: boolean;
  selected: boolean;
  /** A drawn picture in place of the icon (the Bahay ng Datu). */
  iconUrl?: string;
  /** The Bahay ng Datu card: its level, and the upgrade button's label (none at the top). */
  datuLevel?: number;
  upgradeLabel?: string;
}

/** Cost as icons, with any resource the barangay is short of in red. */
function CostLine({ cost, have, suffix }: { cost: Record<string, number>; have: Record<string, number>; suffix?: string }) {
  const parts = RESOURCES.filter((r) => cost[r] > 0);
  // Wraps onto two lines in a narrow card rather than spilling out of it.
  return (
    <span className="inline-flex flex-wrap justify-center gap-x-1">
      {parts.map((r) => (
        <span key={r} className={`whitespace-nowrap ${have[r] < cost[r] ? "text-red-700" : ""}`}>
          {RESOURCE_ICON[r]} {cost[r]}
        </span>
      ))}
      {suffix && <span className="font-normal">{suffix}</span>}
    </span>
  );
}

export function BuildToolbar(props: {
  state: GameState;
  content: Content;
  game: GameText;
  lang: Lang;
  selected: string | null;
  onSelect: (id: string | null) => void;
  /** Laying Daan right now. */
  roadActive: boolean;
  onRoad: () => void;
  /** Ids to glow (see buildMenu.recommended). */
  recommend: Set<string>;
  /** Raise the Bahay ng Datu a level. */
  onUpgradeDatu: () => void;
}) {
  const { state, content, game, lang, selected, onSelect, roadActive, onRoad, recommend, onUpgradeDatu } = props;
  const t = game.build;
  const tabs = visibleTabs(content);
  const [tab, setTabState] = useState<BuildTab>(() => {
    const saved = read<string>(TAB_KEY, tabs[0]);
    return (tabs as string[]).includes(saved) ? (saved as BuildTab) : tabs[0];
  });
  // Buildings already seen unlocked, per barangay, so a tab only badges what's new to the player.
  const barangay = `${state.barangay.id}:${state.map.seed}`;
  const [seen, setSeen] = useState<string[]>(() => read<Record<string, string[]>>(SEEN_KEY, {})[barangay] ?? unlockedIds(state, content));
  const markSeen = (ids: string[]) => {
    const next = [...new Set([...seen, ...ids])];
    if (next.length === seen.length) return;
    setSeen(next);
    write(SEEN_KEY, { ...read<Record<string, string[]>>(SEEN_KEY, {}), [barangay]: next });
  };
  const setTab = (next: BuildTab) => {
    setTabState(next);
    write(TAB_KEY, next);
  };
  // What's in the open tab counts as seen.
  const unlocked = unlockedIds(state, content);
  const inTab = itemsIn(content, tab);
  useEffect(() => {
    markSeen(unlocked.filter((id) => inTab.includes(id)));
  }, [tab, unlocked.join(",")]);
  const fresh = tabsWithNew(state, content, seen);

  const staffed = staffedBuildings(state, content);
  const noPath = unreachableWorkplaces(state, content).reduce<Record<string, number>>((m, b) => ({ ...m, [b.type]: (m[b.type] ?? 0) + 1 }), {});

  const itemFor = (id: string): Item => {
    if (id === DATU && content.datuHouse) {
      const d = game.datu;
      const next = nextDatuLevel(state, content);
      const cost = asCost(next?.cost ?? {});
      const needs = datuLevelNeeded(state, content);
      const needsText = needs !== null ? fill(game.level.needs[lang], { level: needs }) : "";
      const ok = !!next && canAfford(state, cost) && needs === null;
      const def = content.datuHouse.datuHouse;
      return {
        id,
        icon: content.datuHouse.icon,
        iconUrl: datuHouseUrl(state.datuLevel, houseStyleFor(state, content)),
        name: content.datuHouse.name,
        count: null,
        unlocked: true,
        lockText: "",
        // At the top level the card shows the finished house, not a dimmed one.
        affordable: ok || !next,
        costLine: next ? <CostLine cost={cost} have={state.resources} /> : <span>{fill(d.level[lang], { level: state.datuLevel, max: maxDatuLevel(content) })}</span>,
        missing: next && !canAfford(state, cost) ? costText(Object.fromEntries(RESOURCES.filter((r) => state.resources[r] < cost[r]).map((r) => [r, Math.ceil(cost[r] - state.resources[r])]))) : "",
        details: [
          content.datuHouse.description,
          fill(d.level[lang], { level: state.datuLevel, max: maxDatuLevel(content) }),
          fill(d.bonus[lang], { production: (state.datuLevel - 1) * def.productionPercentPerLevel, influence: (state.datuLevel - 1) * def.influencePercentPerLevel }),
          next ? `${fill(d.upgrade[lang], { level: next.level })}${next.unlocks ? ` · ${fill(d.unlocks[lang], { what: d[next.unlocks][lang] })}` : ""}` : d.max[lang],
          ...(needsText ? [`🔒 ${needsText}`] : []),
        ],
        status: [],
        recommended: recommend.has(id),
        selected: false,
        datuLevel: state.datuLevel,
        upgradeLabel: next ? fill(d.upgrade[lang], { level: next.level }) : undefined,
      };
    }
    if (id === DAAN) {
      const cost = roadCost(content);
      const ok = canAfford(state, cost);
      return {
        id,
        icon: "🛤️",
        name: t.daanName[lang],
        count: null,
        unlocked: true,
        lockText: "",
        affordable: ok || roadActive,
        costLine: <CostLine cost={cost} have={state.resources} suffix={`/ ${t.perTile[lang]}`} />,
        missing: ok ? "" : costText(Object.fromEntries(RESOURCES.filter((r) => state.resources[r] < cost[r]).map((r) => [r, Math.ceil(cost[r] - state.resources[r])]))),
        details: [fill(t.daanText[lang], { percent: content.rules.roads.connectedBonusPercent })],
        status: [],
        recommended: recommend.has(id),
        selected: roadActive,
      };
    }
    const b = content.buildings.find((d) => d.id === id)!;
    const count = owned(state, b.id);
    const cost = buildingCost(content, b, count);
    const open = isUnlocked(state, b);
    const missing = missingFor(state, content, b, count);
    const bonus = bonusRuleText(b, content);
    const grove = groveRuleText(b, content);
    return {
      id,
      icon: b.icon,
      // The same custom art as on the map (Dambana, Kuta).
      iconUrl: buildingArtUrl(b.id) ?? undefined,
      name: b.name,
      count,
      unlocked: open,
      lockText: b.unlock.datuLevel !== undefined ? fill(t.lockedDatu[lang], { level: b.unlock.datuLevel }) : fill(t.locked[lang], { villagers: b.unlock.villagers ?? 0 }),
      affordable: open && canAfford(state, cost),
      costLine: <CostLine cost={cost} have={state.resources} />,
      missing: Object.keys(missing).length ? costText(missing) : "",
      details: [b.description, effectText(b, content), bonus && `✨ ${bonus}`, grove].filter((x): x is string => !!x),
      status: [b.id in staffed ? `× ${count} · ${fill(t.staffed[lang], { staffed: staffed[b.id] })}` : "", noPath[b.id] ? fill(t.noPath[lang], { n: noPath[b.id] }) : ""].filter(Boolean),
      recommended: open && recommend.has(id),
      selected: selected === id,
    };
  };

  const pick = (it: Item) => {
    if (it.id === DATU) onUpgradeDatu();
    else if (it.id === DAAN) onRoad();
    else onSelect(it.selected ? null : it.id);
  };

  // ---------- Details popover ----------
  const [details, setDetails] = useState<{ id: string; x: number; top: number } | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressed = useRef(false);
  const clearTimers = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    if (pressTimer.current) clearTimeout(pressTimer.current);
  };
  const openDetails = (id: string, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setDetails({ id, x: r.left + r.width / 2, top: r.top });
  };
  useEffect(() => setDetails(null), [tab]);
  useEffect(() => {
    if (!details) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDetails(null);
    const onDown = (e: PointerEvent) => {
      if (!(e.target as Element).closest?.("[data-build-details], [data-build-card]")) setDetails(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [details]);

  // ---------- Overflow: fades and arrows ----------
  const row = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const measure = () => {
    const el = row.current;
    if (!el) return;
    setEdges({ left: el.scrollLeft > 2, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 });
  };
  useLayoutEffect(() => {
    // A new tab starts at its first card.
    if (row.current) row.current.scrollLeft = 0;
    measure();
  }, [tab, inTab.length]);
  useEffect(() => {
    const el = row.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    el.addEventListener("scroll", measure, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", measure);
    };
  }, []);
  const scrollBy = (dir: number) => row.current?.scrollBy({ left: dir * Math.max(120, row.current.clientWidth * 0.7), behavior: "smooth" });

  const items = inTab.map(itemFor);
  const shown = details ? itemFor(details.id) : null;

  return (
    <nav aria-label="Build" className="bamboo-panel relative z-20 border-t-2 border-amber-950/50 pb-[max(0.4rem,env(safe-area-inset-bottom))]">
      <div role="tablist" aria-label="Building types" className="flex gap-1 overflow-x-auto px-2 pt-1.5 [scrollbar-width:none]">
        {tabs.map((id) => {
          const active = id === tab;
          const glow = itemsIn(content, id).some((x) => recommend.has(x) && id !== tab);
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(id)}
              aria-label={`${t[id][lang]}${fresh.has(id) ? `, ${t.new[lang]}` : ""}`}
              title={t[id][lang]}
              className={`relative flex shrink-0 items-center gap-1 rounded-t-lg border-2 border-b-0 px-2 py-1 text-xs font-semibold whitespace-nowrap sm:px-3 sm:text-sm ${
                active ? "border-amber-950/60 bg-amber-100 text-amber-950" : "border-transparent bg-amber-950/25 text-amber-50 hover:bg-amber-950/40"
              } ${glow ? "shadow-[0_0_10px_2px_rgba(250,204,21,0.8)]" : ""}`}
            >
              <span aria-hidden>{id === "depensa" ? <img src={buildingArtUrl("kuta")!} alt="" draggable={false} className="inline-block size-[1.15em] align-[-0.2em]" /> : TAB_ICON[id]}</span>
              <span className={active ? "" : "hidden sm:inline"}>{t[id][lang].replace(/ \(.*\)$/, "")}</span>
              {fresh.has(id) && <span aria-hidden className="absolute -top-1 -right-1 size-3 rounded-full border-2 border-amber-50 bg-red-600" />}
            </button>
          );
        })}
      </div>
      <div className="relative border-t-2 border-amber-950/40 bg-amber-100/10">
        <ul
          ref={row}
          role="tabpanel"
          aria-label={t[tab][lang]}
          className="flex snap-x snap-proximity scroll-px-2 gap-1.5 overflow-x-auto scroll-smooth px-2 pt-2 pb-1 [scrollbar-width:none] sm:gap-2"
        >
          {items.map((it, i) => (
            <li key={it.id} className={`shrink-0 snap-start ${i === 0 ? "ml-auto" : ""} ${i === items.length - 1 ? "mr-auto" : ""}`}>
              <button
                type="button"
                data-build-card
                disabled={!it.affordable && !it.selected && it.id !== DATU}
                draggable={it.affordable && it.id !== DAAN}
                aria-pressed={it.selected}
                aria-label={
                  !it.unlocked
                    ? `${it.name}: ${it.lockText}`
                    : `${it.selected ? "Placing" : "Build"} ${it.name}${it.count !== null ? `, you have ${it.count}` : ""}${it.missing ? `. ${fill(t.need[lang], { missing: it.missing })}` : ""}`
                }
                onClick={(e) => {
                  if (pressed.current) {
                    pressed.current = false;
                    return;
                  }
                  // The house is raised from its details, never by a stray tap.
                  if (it.id === DATU) openDetails(it.id, e.currentTarget);
                  else {
                    setDetails(null);
                    pick(it);
                  }
                }}
                onPointerDown={(e) => {
                  if (e.pointerType !== "touch") return;
                  const el = e.currentTarget;
                  pressed.current = false;
                  clearTimers();
                  pressTimer.current = setTimeout(() => {
                    pressed.current = true;
                    openDetails(it.id, el);
                  }, LONG_PRESS_MS);
                }}
                onPointerUp={() => pressTimer.current && clearTimeout(pressTimer.current)}
                onPointerCancel={() => pressTimer.current && clearTimeout(pressTimer.current)}
                onContextMenu={(e) => e.preventDefault()}
                onMouseEnter={(e) => {
                  const el = e.currentTarget;
                  clearTimers();
                  hoverTimer.current = setTimeout(() => openDetails(it.id, el), HOVER_MS);
                }}
                onMouseLeave={() => {
                  clearTimers();
                  hoverTimer.current = setTimeout(() => setDetails((d) => (d?.id === it.id ? null : d)), 250);
                }}
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/plain", it.id);
                  e.dataTransfer.effectAllowed = "copy";
                  setDetails(null);
                  onSelect(it.id);
                }}
                onDragEnd={() => onSelect(null)}
                className={`game-btn mat-card relative flex h-full w-[5rem] flex-col items-center gap-0.5 border-2 px-1 pt-1.5 pb-1 text-stone-800 shadow-md select-none [-webkit-touch-callout:none] disabled:cursor-not-allowed sm:w-[6.6rem] ${
                  it.selected ? "-translate-y-1 border-amber-500 ring-4 ring-amber-300" : it.recommended ? "border-yellow-400 shadow-[0_0_12px_3px_rgba(250,204,21,0.75)]" : "border-amber-900/70"
                } ${it.affordable ? "cursor-grab active:cursor-grabbing" : ""} ${it.unlocked && !it.affordable && !it.selected ? "opacity-75" : ""}`}
              >
                {it.recommended && !it.selected && (
                  <span aria-hidden title={t.recommended[lang]} className="absolute -top-1.5 -right-1.5 text-sm">
                    ✨
                  </span>
                )}
                <span className={`text-3xl leading-none sm:text-4xl ${it.affordable || it.selected ? "" : "opacity-50 grayscale"}`} aria-hidden>
                  {it.iconUrl ? <img src={it.iconUrl} alt="" draggable={false} className="size-[1.25em]" /> : it.icon}
                </span>
                <span className="text-center font-display text-[12px] leading-tight text-amber-950 sm:text-sm">{it.name}</span>
                {it.count !== null && <span className="text-[10px] leading-tight text-stone-600 sm:text-xs">× {it.count}</span>}
                {it.datuLevel !== undefined && <span className="text-[10px] leading-tight text-stone-600 sm:text-xs">Lv {it.datuLevel}</span>}
                <span
                  className={`mt-auto w-full rounded-md px-1 py-0.5 text-center text-[11px] leading-tight font-semibold sm:text-xs ${
                    !it.unlocked ? "bg-stone-700 text-stone-100" : it.affordable ? "bg-green-700 text-white [&_.text-red-700]:text-white" : "bg-stone-200 text-stone-600"
                  }`}
                >
                  {it.unlocked ? it.costLine : it.lockText}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {/* Overflow hints: the row fades at an edge with more cards beyond it, with an arrow to scroll. */}
        {edges.left && (
          <>
            <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-amber-900/70 to-transparent" />
            <button type="button" aria-label={`${t.more[lang]} ←`} onClick={() => scrollBy(-1)} className="game-btn absolute top-1/2 left-1 size-8 -translate-y-1/2 border-2 border-amber-950/60 bg-amber-200 text-amber-950 shadow">
              ◀
            </button>
          </>
        )}
        {edges.right && (
          <>
            <span aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-amber-900/70 to-transparent" />
            <button type="button" aria-label={`${t.more[lang]} →`} onClick={() => scrollBy(1)} className="game-btn absolute top-1/2 right-1 size-8 -translate-y-1/2 border-2 border-amber-950/60 bg-amber-200 text-amber-950 shadow">
              ▶
            </button>
          </>
        )}
      </div>
      {shown && details && (
        <div
          data-build-details
          role="dialog"
          aria-label={shown.name}
          onMouseEnter={clearTimers}
          onMouseLeave={() => setDetails(null)}
          className="mat-card fixed z-50 w-72 max-w-[calc(100vw-1rem)] rounded-xl border-2 border-amber-900/70 p-3 text-sm text-stone-800 shadow-2xl"
          style={{
            left: Math.min(Math.max(8, details.x - 144), (typeof window === "undefined" ? 400 : window.innerWidth) - 296),
            bottom: (typeof window === "undefined" ? 800 : window.innerHeight) - details.top + 8,
          }}
        >
          <div className="flex items-center gap-2">
            <span aria-hidden className="text-3xl">
              {shown.iconUrl ? <img src={shown.iconUrl} alt="" className="size-[1.4em]" /> : shown.icon}
            </span>
            <div className="min-w-0">
              <h3 className="font-display text-base leading-tight text-amber-900">{shown.name}</h3>
              <p className="text-xs text-stone-500">{t[tabOfItem(content, shown.id)][lang]}</p>
            </div>
          </div>
          <ul className="mt-1.5 space-y-0.5 text-xs leading-snug">
            {shown.details.map((d) => (
              <li key={d}>{d}</li>
            ))}
            {shown.status.map((d) => (
              <li key={d} className="font-semibold text-amber-900">
                {d}
              </li>
            ))}
          </ul>
          {shown.recommended && <p className="mt-1 text-xs font-semibold text-yellow-700">✨ {t.recommended[lang]}</p>}
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold">{shown.unlocked ? shown.costLine : shown.lockText}</span>
            <button
              type="button"
              disabled={!shown.affordable || (shown.id === DATU && !shown.upgradeLabel)}
              onClick={() => {
                setDetails(null);
                if (!shown.selected) pick(shown);
              }}
              className="game-btn border-2 border-green-950 bg-green-700 px-3 py-1 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {shown.id === DATU ? (shown.upgradeLabel ?? game.datu.max[lang]) : shown.id === DAAN ? t.layDaan[lang] : t.build[lang]}
            </button>
          </div>
          {shown.unlocked && shown.missing && <p className="mt-1 text-xs text-red-700">{fill(t.need[lang], { missing: shown.missing })}</p>}
        </div>
      )}
    </nav>
  );
}
