// Mga Gawain (the task chain), named villagers' cards and the barangay history.
import { onArawText } from "./Days";
import { useEffect, useState } from "react";
import type { Content } from "../engine/content";
import type { Command, GameState } from "../engine/game";
import { currentTask, earnedTitles, taskProgress } from "../engine/gawain";
import { datuLevelNeeded, maxDatuLevel, nextDatuLevel } from "../engine/datu";
import { datuHouseUrl, houseStyleFor } from "./datuHouseArt";
import { asCost, canAfford } from "../engine/game";
import { pistaBlocker, pistaOccasions, type PistaOccasion } from "../engine/food";
import { rulerTitle } from "../engine/household";
import { bloodPrice, scalePrice, type Mediator, type SealKind } from "../engine/feud";
import { feudsOf, mediationBlocker, mediationChance, neutralDatu, sealBlocker, sealCost } from "../engine/region";
import { barangayName } from "./politicsText";
import { clock } from "./EventBanners";
import { costText } from "./format";
import type { Lang } from "./settings";
import { useModal } from "./StoryDialogs";
import { deathLine, historyLine, rewardText, tappedCard } from "./stories";
import type { Tapped } from "./villagers";
import { fill, type GameText } from "./uiContent";
import { LifeStoryView, tappedFor } from "./LifeStory";
import { lifeStory } from "../engine/talambuhay";

const OPEN_KEY = "barangay-legends/gawain-open";

function loadOpen(): boolean {
  try {
    const v = localStorage.getItem(OPEN_KEY);
    // Open by default on wide screens, folded on phones.
    return v === null ? window.matchMedia?.("(min-width: 640px)").matches === true : v === "1";
  } catch {
    return false;
  }
}

/**
 * The current task, always on screen at the map's left edge. Folded it is a slim tab with the
 * task's text; open it shows progress, the reward and the history button.
 */
export function GawainPanel(props: { state: GameState; content: Content; game: GameText; lang: Lang; onHistory: () => void; inline?: boolean }) {
  const { state, content, game, lang, onHistory, inline = false } = props;
  const [open, setOpen] = useState(loadOpen);
  if (content.quests.length === 0) return null;
  const toggle = () => {
    setOpen(!open);
    try {
      localStorage.setItem(OPEN_KEY, open ? "0" : "1");
    } catch {
      // Storage blocked: the panel forgets on reload.
    }
  };
  const t = game.gawain;
  const q = currentTask(state, content);
  const total = content.quests.length;
  const n = state.gawainDone.length + 1;
  const p = q ? taskProgress(state, content, q) : null;
  const text = q ? q.text[lang] : t.moreSoon[lang];
  return (
    <section
      data-map-overlay={inline ? undefined : true}
      aria-label={t.title[lang]}
      className={inline ? "pointer-events-auto max-w-full" : "pointer-events-auto absolute top-14 left-2 z-10 max-w-[min(15rem,calc(100%-5rem))] sm:top-16"}
    >
      {open ? (
        <div className="mat-card rounded-xl border-2 border-amber-900/70 p-2.5 text-stone-800 shadow-lg">
          <div className="flex items-start justify-between gap-2">
            <h2 className="font-display text-sm leading-tight text-amber-900">
              <span aria-hidden>📜</span> {t.title[lang]}
              <span className="ml-1 font-sans text-[10px] font-normal text-stone-500">{q ? fill(t.count[lang], { n, total }) : fill(t.allDone[lang], { total })}</span>
            </h2>
            <button type="button" onClick={toggle} aria-label={t.close[lang]} className="-mt-1 -mr-1 px-1 text-sm text-stone-500">
              ✕
            </button>
          </div>
          <p className="mt-1 text-sm leading-snug font-semibold">{text}</p>
          {q && p && p.need > 1 && (
            <div className="mt-1">
              <div className="h-1.5 overflow-hidden rounded-full bg-amber-900/15" role="progressbar" aria-valuemin={0} aria-valuemax={p.need} aria-valuenow={Math.min(p.have, p.need)}>
                <div className="h-full rounded-full bg-lime-600" style={{ width: `${Math.min(100, (100 * p.have) / p.need)}%` }} />
              </div>
              <span className="text-[11px] text-stone-500 tabular-nums">{fill(t.progress[lang], { have: Math.min(p.have, p.need), need: p.need })}</span>
            </div>
          )}
          {q && <p className="mt-1 text-xs text-amber-900">{fill(t.reward[lang], { reward: rewardText(q, game, lang) })}</p>}
          <button type="button" onClick={onHistory} className="mt-1.5 text-xs font-semibold text-amber-800 underline underline-offset-2">
            {t.history[lang]}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={toggle}
          aria-label={`${t.open[lang]}: ${text}`}
          className="wood-panel flex max-w-full items-center gap-1.5 rounded-xl border-2 border-amber-950/70 py-1 pr-2 pl-1.5 text-left text-amber-50 shadow-lg"
        >
          <span aria-hidden className="text-lg leading-none">
            📜
          </span>
          <span className="min-w-0 text-xs leading-tight">
            <span className="block truncate font-semibold">{text}</span>
            {q && p && p.need > 1 && <span className="block text-[10px] text-amber-200/90 tabular-nums">{fill(t.progress[lang], { have: Math.min(p.have, p.need), need: p.need })}</span>}
          </span>
        </button>
      )}
    </section>
  );
}

/** A villager's card: tap their sprite. A named one (with a star) opens their life story. */
export function VillagerDialog(props: { villager: Tapped | null; state: GameState; content: Content; game: GameText; lang: Lang; onClose: () => void }) {
  const { state, content, game, lang, onClose } = props;
  // A relative opened from the family list replaces the card (Back returns).
  const [trail, setTrail] = useState<Tapped[]>([]);
  useEffect(() => setTrail([]), [props.villager]);
  const villager = trail.at(-1) ?? props.villager;
  const dialog = useModal(!!props.villager);
  const close = () => {
    setTrail([]);
    onClose();
  };
  // The named villager as they are now (sick, family), if they're still here.
  const named = villager?.named ? (state.named.find((v) => v.id === villager.named!.id) ?? villager.named) : null;
  const card = villager ? tappedCard(named ? { ...villager, named } : villager, state, content, game, lang) : null;
  const openRelative = (id: number) => {
    const v = state.named.find((x) => x.id === id);
    if (v) setTrail([...trail, tappedFor(state, content, v)]);
  };
  return (
    <dialog
      ref={dialog}
      aria-labelledby="villager-name"
      onClose={close}
      onClick={(e) => e.target === e.currentTarget && close()}
      className="m-auto w-[calc(100%-1.5rem)] max-w-sm rounded-2xl border-4 border-amber-950/70 p-0 text-stone-800 shadow-2xl backdrop:bg-stone-900/50"
    >
      {card && villager && (
        <div className="mat-card flex max-h-[85dvh] flex-col gap-2 overflow-y-auto p-4">
          {named ? (
            <LifeStoryView
              story={lifeStory(state, content, named)}
              state={state}
              content={content}
              game={game}
              lang={lang}
              look={villager.look}
              role={villager.role}
              line={card.line}
              sick={card.sick}
              onOpen={openRelative}
            />
          ) : (
            <>
              <h2 id="villager-name" className="font-display text-xl text-amber-900">
                {card.name}
              </h2>
              <p className="text-xs font-semibold tracking-wide text-stone-500 uppercase">{card.line}</p>
            </>
          )}
          <div className="flex justify-end gap-2">
            {trail.length > 0 && (
              <button type="button" onClick={() => setTrail(trail.slice(0, -1))} className="game-btn border-2 border-amber-950/60 bg-amber-100 px-4 py-1.5 text-sm font-semibold text-amber-950">
                {game.talambuhay.back[lang]}
              </button>
            )}
            <button type="button" autoFocus onClick={close} className="game-btn border-2 border-amber-950/60 bg-amber-200 px-4 py-1.5 text-sm font-semibold text-amber-950">
              {game.villager.close[lang]}
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}

/** The barangay history: newest first, with the titles the datu has earned. */
export function HistoryDialog(props: { open: boolean; state: GameState; content: Content; game: GameText; lang: Lang; onClose: () => void }) {
  const { open, state, content, game, lang, onClose } = props;
  const dialog = useModal(open);
  const titles = earnedTitles(state, content);
  const entries = [...state.history].reverse();
  return (
    <dialog
      ref={dialog}
      aria-labelledby="history-title"
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="m-auto w-[calc(100%-1.5rem)] max-w-md rounded-2xl border-4 border-amber-950/70 p-0 text-stone-800 shadow-2xl backdrop:bg-stone-900/50"
    >
      {open && (
        <div className="mat-card flex max-h-[80dvh] flex-col gap-2 p-4">
          <h2 id="history-title" className="font-display text-xl text-amber-900">
            <span aria-hidden>📜</span> {game.gawain.history[lang]}
          </h2>
          {titles.length > 0 && (
            <p className="flex flex-wrap gap-1">
              {titles.map((t) => (
                <span key={t.en} className="rounded-full border border-amber-800/40 bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                  🪶 {t[lang]}
                </span>
              ))}
            </p>
          )}
          <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto text-sm leading-snug">
            {entries.length === 0 && <li className="text-stone-500">{game.gawain.noHistory[lang]}</li>}
            {entries.map((h, i) => (
              <li key={`${h.at}-${i}`} className="border-b border-amber-900/10 pb-1">
                <span aria-hidden className="mr-1">
                  {h.kind === "task" ? "✅" : h.kind === "named" ? "⭐" : h.kind === "fell" ? "⚔️" : "👣"}
                </span>
                {historyLine(h, content, game, lang)}
                <span className="ml-1 text-[11px] whitespace-nowrap text-stone-500">· {onArawText(state, content, game, lang, h.at)}</span>
              </li>
            ))}
          </ul>
          <div className="flex justify-end">
            <button type="button" autoFocus onClick={close} className="game-btn border-2 border-amber-950/60 bg-amber-200 px-4 py-1.5 text-sm font-semibold text-amber-950">
              {game.villager.close[lang]}
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}

/** The Bahay ng Datu: its level, what each level gives, and raising it. */
export function DatuDialog(props: {
  open: boolean;
  state: GameState;
  content: Content;
  game: GameText;
  lang: Lang;
  onUpgrade: () => void;
  onPista?: (occasion: PistaOccasion) => void;
  onBrew?: (amount: number) => void;
  /** Making peace in a feud (feud.ts): mediate, the blood price, the seal. */
  onPeace?: (c: Command) => void;
  onClose: () => void;
}) {
  const { open, state, content, game, lang, onUpgrade, onPista, onBrew, onPeace, onClose } = props;
  const dialog = useModal(open);
  const house = content.datuHouse;
  const d = game.datu;
  const next = nextDatuLevel(state, content);
  const cost = asCost(next?.cost ?? {});
  const needs = datuLevelNeeded(state, content);
  const def = house?.datuHouse;
  return (
    <dialog
      ref={dialog}
      aria-labelledby="datu-title"
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="m-auto w-[calc(100%-1.5rem)] max-w-sm rounded-2xl border-4 border-amber-950/70 p-0 text-stone-800 shadow-2xl backdrop:bg-stone-900/50"
    >
      {open && house && def && (
        <div className="mat-card space-y-2 p-4 text-sm">
          <h2 id="datu-title" className="font-display text-xl text-amber-900">
            <img src={datuHouseUrl(state.datuLevel, houseStyleFor(state, content))} alt="" className="inline size-12 align-middle" /> {d.title[lang]}
          </h2>
          <p className="text-xs text-stone-600">
            {state.barangay.datu ? `${rulerTitle(state, content)} ${state.barangay.datu} · ` : ""}
            {fill(d.level[lang], { level: state.datuLevel, max: maxDatuLevel(content) })}
          </p>
          <p>{fill(d.bonus[lang], { production: (state.datuLevel - 1) * def.productionPercentPerLevel, influence: (state.datuLevel - 1) * def.influencePercentPerLevel })}</p>
          <ul className="space-y-0.5 text-xs">
            {def.levels
              .filter((l) => l.unlocks)
              .map((l) => (
                <li key={l.level} className={state.datuLevel >= l.level ? "font-semibold text-green-800" : "text-stone-500"}>
                  {state.datuLevel >= l.level ? "✅" : "⏳"} {fill(d.level[lang], { level: l.level, max: maxDatuLevel(content) })}: {d[l.unlocks!][lang]}
                </li>
              ))}
          </ul>
          <div className="flex items-center justify-between gap-2 pt-1">
            <span className="text-xs font-semibold">
              {next ? costText(cost) : d.max[lang]}
              {needs !== null && <span className="block font-normal text-red-800">⏳ {fill(game.level.needs[lang], { level: needs })}</span>}
            </span>
            {next && (
              <button
                type="button"
                disabled={!canAfford(state, cost) || needs !== null}
                onClick={onUpgrade}
                className="game-btn border-2 border-green-950 bg-green-700 px-3 py-1.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {fill(d.upgrade[lang], { level: next.level })}
              </button>
            )}
          </div>
          {onPeace && <PeacePanel state={state} content={content} game={game} lang={lang} onPeace={onPeace} />}
          {onPista && onBrew && <PistaPanel state={state} content={content} game={game} lang={lang} onPista={onPista} onBrew={onBrew} />}
          <div className="flex justify-end">
            <button type="button" autoFocus onClick={onClose} className="game-btn border-2 border-amber-950/60 bg-amber-200 px-4 py-1.5 text-sm font-semibold text-amber-950">
              {d.close[lang]}
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}

/** Tapping the Libingan: the names of the remembered, and how many others rest there. */
export function RememberedDialog(props: { open: boolean; state: GameState; content: Content; game: GameText; lang: Lang; onClose: () => void }) {
  const { open, state, content, game, lang, onClose } = props;
  const dialog = useModal(open);
  const t = game.death;
  const look = content.traditions.find((x) => x.id === state.tradition)?.burialLook ?? "jars";
  const others = Math.max(0, state.stats.deaths - state.remembered.length);
  // A remembered villager's story, opened from the list (Back returns to it).
  const [reading, setReading] = useState<number | null>(null);
  const [living, setLiving] = useState<Tapped | null>(null);
  const story = reading !== null ? state.remembered[reading]?.story : undefined;
  const close = () => {
    setReading(null);
    setLiving(null);
    onClose();
  };
  if (living) return <VillagerDialog villager={living} state={state} content={content} game={game} lang={lang} onClose={close} />;
  return (
    <dialog
      ref={dialog}
      aria-labelledby={story ? "villager-name" : "remembered-title"}
      onClose={close}
      onClick={(e) => e.target === e.currentTarget && close()}
      className="m-auto w-[calc(100%-1.5rem)] max-w-sm rounded-2xl border-4 border-amber-950/70 p-0 text-stone-800 shadow-2xl backdrop:bg-stone-900/50"
    >
      {open && story && (
        <div className="mat-card flex max-h-[85dvh] flex-col gap-2 overflow-y-auto p-4 text-sm">
          <LifeStoryView
            story={story}
            state={state}
            content={content}
            game={game}
            lang={lang}
            look={{ gender: story.gender, age: story.life.some((e) => e.kind === "elder") ? "elder" : "adult", malong: content.traditions.find((x) => x.id === state.tradition)?.dress === "malong" }}
            role={story.role === "warrior" ? "warrior" : "idle"}
            line={game.roles[story.role][lang]}
            gone
            onOpen={(id) => {
              const v = state.named.find((x) => x.id === id);
              if (v) setLiving(tappedFor(state, content, v));
            }}
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setReading(null)} className="game-btn border-2 border-amber-950/60 bg-amber-100 px-4 py-1.5 text-sm font-semibold text-amber-950">
              {game.talambuhay.back[lang]}
            </button>
            <button type="button" autoFocus onClick={close} className="game-btn border-2 border-amber-950/60 bg-amber-200 px-4 py-1.5 text-sm font-semibold text-amber-950">
              {game.villager.close[lang]}
            </button>
          </div>
        </div>
      )}
      {open && !story && (
        <div className="mat-card flex max-h-[80dvh] flex-col gap-2 p-4 text-sm">
          <h2 id="remembered-title" className="font-display text-xl text-amber-900">
            <span aria-hidden>{look === "longon" ? "⚰️" : "⚱️"}</span> {t.remembered[lang]}
          </h2>
          <p className="text-xs text-stone-500">{t[look][lang]}</p>
          <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto">
            {state.remembered.length === 0 && others === 0 && <li className="text-stone-500">{t.none[lang]}</li>}
            {state.remembered.some((r) => r.story) && <li className="text-xs text-stone-500">{game.talambuhay.remembered[lang]}</li>}
            {[...state.remembered].reverse().map((r, i) => (
              <li key={`${r.name}-${r.at}-${i}`} className="border-b border-amber-900/10 pb-1">
                ⚱️{" "}
                {r.story ? (
                  <button type="button" onClick={() => setReading(state.remembered.length - 1 - i)} className="font-bold text-amber-900 underline underline-offset-2">
                    {r.name}
                  </button>
                ) : (
                  <b>{r.name}</b>
                )}{" "}
                <span className="block text-xs text-stone-500">{deathLine({ name: r.name, cause: r.cause, from: r.from, attack: r.attack }, content, game, lang, "")}</span>
              </li>
            ))}
            {others > 0 && <li className="text-xs text-stone-500 italic">{fill(t.others[lang], { count: others })}</li>}
          </ul>
          <div className="flex justify-end">
            <button type="button" autoFocus onClick={close} className="game-btn border-2 border-amber-950/60 bg-amber-200 px-4 py-1.5 text-sm font-semibold text-amber-950">
              {game.villager.close[lang]}
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}

/** The Pista at the Bahay ng Datu (food.ts holdPista): the occasion, its cost, and rice wine to brew for it. */
function PistaPanel(props: { state: GameState; content: Content; game: GameText; lang: Lang; onPista: (o: PistaOccasion) => void; onBrew: (n: number) => void }) {
  const { state, content, game, lang, onPista, onBrew } = props;
  const t = game.pista;
  const p = content.rules.food.pista;
  const occasions = pistaOccasions(state, content);
  const [pick, setPick] = useState<PistaOccasion>("harvest");
  const occasion = occasions.includes(pick) ? pick : occasions[0];
  const why = pistaBlocker(state, content);
  const brewN = Math.max(1, (p.cost.wine ?? 0) - Math.floor(state.resources.wine)) || 5;
  const brewCost = { rice: brewN * content.rules.food.brew.ricePerWine };
  const reason =
    why === "raid" ? t.raid[lang] : why === "hunger" ? t.hunger[lang] : why === "cost" ? t.cost[lang] : why === "cooldown" ? fill(t.cooldown[lang], { time: clock((state.lastPistaAt ?? 0) + p.cooldownSeconds - state.time) }) : null;
  const joy = state.pista && state.time < state.pista.until ? state.pista : null;
  return (
    <section className="space-y-1.5 border-t border-amber-900/20 pt-2">
      <h3 className="font-display text-base text-amber-900">{t.title[lang]}</h3>
      <p className="text-xs text-stone-600">{t.intro[lang]}</p>
      {joy && (
        <p className="text-xs font-semibold text-green-800">
          {fill(t.joy[lang], { happiness: p.happiness, time: clock(joy.until - state.time) })}
          {joy.guests.length > 0 && <span className="block font-normal">{fill(t.guests[lang], { n: joy.guests.length })}</span>}
        </p>
      )}
      <label className="flex items-center gap-2 text-xs">
        <span>{t.occasion[lang]}</span>
        <select value={occasion} onChange={(e) => setPick(e.target.value as PistaOccasion)} className="min-w-0 flex-1 rounded border border-amber-900/30 bg-amber-50 px-1 py-0.5">
          {occasions.map((o) => (
            <option key={o} value={o}>
              {t[o][lang]}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        disabled={why !== null}
        onClick={() => onPista(occasion)}
        className="game-btn w-full border-2 border-amber-950 bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        {fill(t.hold[lang], { cost: costText(asCost(p.cost)) })}
      </button>
      {reason && <p className="text-xs text-red-800">{reason}</p>}
      <div className="flex items-center justify-between gap-2 text-xs">
        <span>{fill(t.wine[lang], { wine: Math.floor(state.resources.wine) })}</span>
        <button
          type="button"
          disabled={!canAfford(state, asCost(brewCost))}
          onClick={() => onBrew(brewN)}
          className="game-btn border-2 border-amber-950/60 bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-950 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {fill(t.brew[lang], { n: brewN, cost: costText(asCost(brewCost)) })}
        </button>
      </div>
    </section>
  );
}

/**
 * Making peace (W.3) at the Bahay ng Datu, one feud at a time: 1. a go-between (an elder, the
 * babaylan, or a neutral datu), 2. the blood price, paid or asked, with counter-offers, 3. the seal.
 */
function PeacePanel(props: { state: GameState; content: Content; game: GameText; lang: Lang; onPeace: (c: Command) => void }) {
  const { state, content, game, lang, onPeace } = props;
  const t = game.peace;
  const me = state.barangay.id;
  if (!state.region) return null;
  const feuds = feudsOf(state.region).feuds.filter((f) => f.wronged === me || f.offender === me);
  if (feuds.length === 0) return null;
  const btn = "game-btn w-full border-2 border-amber-950/60 bg-amber-100 px-2 py-1 text-left text-xs font-semibold text-amber-950 disabled:cursor-not-allowed disabled:opacity-50";
  return (
    <section className="space-y-2 border-t border-amber-900/20 pt-2" data-peace>
      <h3 className="font-display text-base text-amber-900">🕊️ {t.title[lang]}</h3>
      <p className="text-xs text-stone-600">{t.intro[lang]}</p>
      {feuds.map((f) => {
        const other = f.wronged === me ? f.offender : f.wronged;
        const name = barangayName(state, content, other, game, lang);
        const owe = f.offender === me;
        const full = bloodPrice(content, f);
        const price = f.price ?? full;
        const less = scalePrice(full, content.rules.feud.price.counterPercent);
        const head = owe
          ? fill(game.feud.weOwe[lang], { barangay: name, dead: f.deaths.length, time: clock(state.time - f.since) })
          : fill(game.feud.theyOwe[lang], { barangay: name, dead: f.deaths.length, time: clock(state.time - f.since) });
        return (
          <div key={f.id} className="space-y-1 rounded-lg border border-amber-900/20 bg-amber-50 p-2 text-xs">
            <p className="font-semibold text-red-900">{head}</p>
            <p className="font-semibold">{t.step1[lang]}</p>
            {f.mediated ? (
              <p className="text-green-800">✅ {t.mediated[lang]}</p>
            ) : (
              (["elder", "babaylan", "datu"] as Mediator[]).map((by) => {
                const why = mediationBlocker(state, content, f.id, by);
                const label = by === "datu" ? fill(t.datu[lang], { datu: neutralDatu(state, content, f) ? barangayName(state, content, neutralDatu(state, content, f)!.id, game, lang) : "—" }) : t[by][lang];
                const note =
                  why === "no-elder" ? t.noElder[lang] : why === "no-babaylan" ? t.noBabaylan[lang] : why === "no-datu" ? t.noDatu[lang] : why === "retry" ? fill(t.retry[lang], { time: clock((f.failedAt ?? 0) + content.rules.feud.mediation.retrySeconds - state.time) }) : fill(t.chance[lang], { percent: Math.round(mediationChance(state, content, f, by) * 100) });
                return (
                  <button key={by} type="button" disabled={why !== null} onClick={() => onPeace({ type: "mediate", feud: f.id, by })} className={btn}>
                    {label} <span className="block font-normal">{note}</span>
                  </button>
                );
              })
            )}
            <p className="font-semibold">{t.step2[lang]}</p>
            {f.paid ? (
              <p className="text-green-800">✅ {t.paid[lang]}</p>
            ) : !f.mediated ? null : owe ? (
              <>
                <p>{fill(t.theyAsk[lang], { barangay: name, price: costText(asCost(price)) })}</p>
                <p className="text-[11px] text-stone-500">{t.together[lang]}</p>
                <button type="button" disabled={!canAfford(state, asCost(price))} onClick={() => onPeace({ type: "bloodPrice", feud: f.id, offer: price })} className={btn}>
                  {fill(t.pay[lang], { price: costText(asCost(price)) })}
                </button>
                <button type="button" disabled={!canAfford(state, asCost(less))} onClick={() => onPeace({ type: "bloodPrice", feud: f.id, offer: less })} className={btn}>
                  {fill(t.offerLess[lang], { price: costText(asCost(less)) })}
                </button>
              </>
            ) : (
              <>
                <p>{fill(t.weAsk[lang], { price: costText(asCost(full)) })}</p>
                <button type="button" onClick={() => onPeace({ type: "bloodPrice", feud: f.id, offer: full })} className={btn}>
                  {fill(t.ask[lang], { price: costText(asCost(full)) })}
                </button>
                {f.price && (
                  <button type="button" onClick={() => onPeace({ type: "bloodPrice", feud: f.id, offer: f.price! })} className={btn}>
                    {fill(t.askLess[lang], { price: costText(asCost(f.price)) })}
                  </button>
                )}
              </>
            )}
            <p className="font-semibold">{t.step3[lang]}</p>
            {!f.paid ? (
              <p className="text-stone-500">{t.unpaid[lang]}</p>
            ) : (
              (["sandugo", "pista", "marriage"] as SealKind[]).map((by) => (
                <button key={by} type="button" disabled={sealBlocker(state, content, f.id, by) !== null} onClick={() => onPeace({ type: "sealPeace", feud: f.id, by })} className={btn}>
                  {fill(t[by][lang], { cost: costText(asCost(sealCost(content, by))) })}
                </button>
              ))
            )}
            {f.paid && <p className="text-[11px] text-stone-500">{t.betrayal[lang]}</p>}
          </div>
        );
      })}
    </section>
  );
}
