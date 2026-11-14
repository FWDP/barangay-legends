// Worship and the spirits on screen: the Dambana (tradition, offerings, rituals, asking
// permission), the Aklat ng Alamat, the Forest Balance leaf, and the bars for the beings who
// come on their own (the Bakunawa eclipse, the tigbalang's riddle, the balete spirit's prank).
import { useEffect, useRef, useState } from "react";
import { RESOURCES, type Content, type Resource } from "../engine/content";
import { aklatEntry, aklatProgress } from "../engine/aklat";
import { forestStage, isPranked } from "../engine/forest";
import type { Command, GameState } from "../engine/game";
import { eclipseAutoStrikes, eclipseProgress, isActive, offeringFavor, ritualBlocker, traditionChangeCost, traditionOf, worshipBlocker } from "../engine/worship";
import { Moon } from "./Moon";
import { useReducedMotion } from "./VillagerLayer";
import { DAMBANA_ART } from "./buildingArt";
import { clock } from "./EventBanners";
import { costText, RESOURCE_ICON } from "./format";
import type { Lang } from "./settings";
import { useModal } from "./StoryDialogs";
import { fill, type GameText } from "./uiContent";

const btn = "game-btn border-2 px-3 py-1.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50";
const primary = `${btn} border-green-950 bg-green-700 text-white`;
const plain = `${btn} border-amber-950/60 bg-amber-200 text-amber-950`;

/** The leaf: Forest Balance, with what it means. */
export function forestText(state: GameState, content: Content, game: GameText, lang: Lang): string {
  const stage = forestStage(content, state.forest.balance);
  const now = stage === 2 ? fill(game.forest.stage2[lang], { percent: content.rules.forest.riceWithheldPercent }) : stage === 1 ? game.forest.stage1[lang] : "";
  return [fill(game.forest.label[lang], { balance: Math.round(state.forest.balance) }), now, game.forest.tip[lang]].filter(Boolean).join(" ");
}

export const forestIcon = (balance: number) => (balance >= 60 ? "🍃" : balance >= 30 ? "🍂" : "🥀");

/** Forest Balance as a small leaf chip with a tap/hover tooltip. */
export function ForestChip({ state, content, game, lang }: { state: GameState; content: Content; game: GameText; lang: Lang }) {
  const [open, setOpen] = useState(false);
  const b = Math.round(state.forest.balance);
  const label = forestText(state, content, game, lang);
  const tone = state.forest.stage === 2 ? "bg-red-900/60" : state.forest.stage === 1 ? "bg-amber-800/60" : "bg-black/25";
  return (
    <div className="group relative">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setOpen(false)}
        className={`flex cursor-help flex-col items-center rounded-lg px-1 py-0.5 text-amber-50 shadow-inner sm:flex-row sm:gap-1 sm:px-2 sm:py-1 ${tone}`}
      >
        <span aria-hidden className="text-base leading-none sm:text-xl">
          {forestIcon(state.forest.balance)}
        </span>
        <span className="text-[10px] leading-none tabular-nums sm:font-display sm:text-sm">{b}</span>
      </button>
      <div
        role="tooltip"
        className={`absolute top-full right-0 z-50 mt-2 w-60 rounded-lg border border-amber-950/50 bg-stone-900/95 px-2.5 py-1.5 text-xs text-amber-50 shadow-lg sm:group-hover:block ${open ? "block" : "hidden"}`}
      >
        {label}
      </div>
    </div>
  );
}

/** The button that opens the Aklat ng Alamat, with how many entries are found. */
export function AklatButton({ state, content, game, lang, onOpen, compact = false }: { state: GameState; content: Content; game: GameText; lang: Lang; onOpen: () => void; compact?: boolean }) {
  const p = aklatProgress(state, content);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${game.aklat.title[lang]}: ${fill(game.aklat.progress[lang], p)}`}
      title={game.aklat.title[lang]}
      className={`game-btn flex items-center justify-center gap-1 border-2 border-amber-950/60 bg-amber-200 font-display text-amber-950 ${compact ? "size-9 text-lg" : "h-9 px-2 text-sm"}`}
    >
      <span aria-hidden className="text-lg leading-none">
        📖
      </span>
      {!compact && (
        <span className="tabular-nums">
          {p.found}/{p.total}
        </span>
      )}
    </button>
  );
}

/** The Aklat ng Alamat: found entries open to their lore; locked ones show a silhouette and a hint. */
export function AklatDialog(props: { open: boolean; state: GameState; content: Content; game: GameText; lang: Lang; onClose: () => void }) {
  const { open, state, content, game, lang, onClose } = props;
  const dialog = useModal(open);
  const [pick, setPick] = useState<string | null>(null);
  const t = game.aklat;
  const p = aklatProgress(state, content);
  const entry = pick ? aklatEntry(content, pick) : undefined;
  const found = entry && state.aklat.includes(entry.id);
  const close = () => {
    setPick(null);
    onClose();
  };
  return (
    <dialog
      ref={dialog}
      aria-labelledby="aklat-title"
      onClose={close}
      onClick={(e) => e.target === e.currentTarget && close()}
      className="m-auto w-[calc(100%-1.5rem)] max-w-lg rounded-2xl border-4 border-amber-950/70 p-0 text-stone-800 shadow-2xl backdrop:bg-stone-900/60"
    >
      {open && (
        <div className="mat-card flex max-h-[85dvh] flex-col gap-2 p-4">
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="aklat-title" className="font-display text-xl text-amber-900">
              <span aria-hidden>📖</span> {t.title[lang]}
            </h2>
            <span className="text-xs text-stone-500 tabular-nums">{fill(t.progress[lang], p)}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-amber-900/15" role="progressbar" aria-valuemin={0} aria-valuemax={p.total} aria-valuenow={p.found}>
            <div className="h-full rounded-full bg-amber-600" style={{ width: `${(100 * p.found) / Math.max(1, p.total)}%` }} />
          </div>
          {entry ? (
            <article className="min-h-0 flex-1 space-y-2 overflow-y-auto text-sm leading-snug">
              <button type="button" onClick={() => setPick(null)} className="text-xs font-semibold text-amber-800 underline underline-offset-2">
                ← {t.title[lang]}
              </button>
              <div className="flex items-center gap-3">
                <span aria-hidden className={`flex size-16 shrink-0 items-center justify-center rounded-xl border-2 border-amber-900/30 bg-amber-100 text-4xl ${found ? "" : "brightness-0 opacity-40"}`}>
                  {entry.aklat.icon}
                </span>
                <div>
                  <h3 className="font-display text-lg text-amber-900">{found ? entry.aklat.name[lang] : t.locked[lang]}</h3>
                  {found && <p className="text-xs text-stone-500">{fill(t.tradition[lang], { tradition: entry.tradition })}</p>}
                </div>
              </div>
              {found ? (
                <>
                  <p>{entry.aklat.lore[lang]}</p>
                  <h4 className="font-semibold text-amber-900">{t.inGame[lang]}</h4>
                  <p>{entry.aklat.inGame[lang]}</p>
                  <h4 className="font-semibold text-amber-900">{t.sources[lang]}</h4>
                  <ul className="list-disc pl-5 text-xs text-stone-600">
                    {entry.sources.map((src) => (
                      <li key={src} className="break-words">
                        {/^https:\/\//.test(src) ? (
                          <a href={src} target="_blank" rel="noreferrer" className="underline">
                            {src}
                          </a>
                        ) : (
                          src
                        )}
                      </li>
                    ))}
                  </ul>
                  {!entry.reviewed && <p className="text-[11px] text-stone-500 italic">{t.review[lang]}</p>}
                </>
              ) : (
                <p className="text-stone-600">{fill(t.hint[lang], { hint: entry.aklat.hint[lang] })}</p>
              )}
            </article>
          ) : (
            <ul className="grid min-h-0 flex-1 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
              {content.aklat.map((e) => {
                const has = state.aklat.includes(e.id);
                return (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => setPick(e.id)}
                      aria-label={has ? e.aklat.name[lang] : `${t.locked[lang]}: ${e.aklat.hint[lang]}`}
                      className="flex w-full flex-col items-center gap-1 rounded-xl border-2 border-amber-900/25 bg-amber-50 p-2 text-center hover:bg-amber-100"
                    >
                      <span aria-hidden className={`text-3xl ${has ? "" : "brightness-0 opacity-30"}`}>
                        {e.aklat.icon}
                      </span>
                      <span className={`text-[11px] leading-tight font-semibold ${has ? "text-amber-950" : "text-stone-400"}`}>{has ? e.aklat.name[lang] : "?"}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="flex justify-end">
            <button type="button" autoFocus onClick={close} className={plain}>
              {game.villager.close[lang]}
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}

function Stepper({ value, onChange, icon }: { value: number; onChange: (n: number) => void; icon: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <button type="button" aria-label="Less" className="game-btn size-7 border-2 border-amber-900/50 bg-amber-100 text-sm" onClick={() => onChange(Math.max(0, value - 5))}>
        −
      </button>
      <span className="w-8 text-center font-display tabular-nums">{value}</span>
      <button type="button" aria-label="More" className="game-btn size-7 border-2 border-amber-900/50 bg-amber-100 text-sm" onClick={() => onChange(value + 5)}>
        +
      </button>
      <span aria-hidden className="text-base">
        {icon}
      </span>
    </span>
  );
}

/**
 * The Dambana: choose the tradition (the first time it opens), make offerings for Favor, and
 * have the babaylan perform rituals or ask the forest's permission. `onRitual` plays the
 * babaylan's short animation at the shrine.
 */
export function DambanaDialog(props: {
  open: boolean;
  state: GameState;
  content: Content;
  game: GameText;
  lang: Lang;
  dispatch: (c: Command) => void;
  onRitual: (icon: string) => void;
  onClose: () => void;
}) {
  const { open, state, content, game, lang, dispatch, onRitual, onClose } = props;
  const dialog = useModal(open);
  const [gift, setGift] = useState<Record<Resource, number>>({ rice: 20, wood: 0, gold: 0 });
  const [choosing, setChoosing] = useState(false);
  const t = game.dambana;
  const tradition = traditionOf(state, content);
  const pick = state.tradition === null || choosing;
  const changeCost = traditionChangeCost(state, content);
  const blocked = worshipBlocker(state, content);
  const favor = offeringFavor(content, gift);
  const short = RESOURCES.find((r) => state.resources[r] < gift[r]);
  const perm = content.rules.worship.permission;
  const close = () => {
    setChoosing(false);
    onClose();
  };
  return (
    <dialog
      ref={dialog}
      aria-labelledby="dambana-title"
      onClose={close}
      onClick={(e) => e.target === e.currentTarget && close()}
      className="m-auto w-[calc(100%-1.5rem)] max-w-md rounded-2xl border-4 border-amber-950/70 p-0 text-stone-800 shadow-2xl backdrop:bg-stone-900/60"
    >
      {open && (
        <div className="mat-card flex max-h-[85dvh] flex-col gap-3 overflow-y-auto p-4 text-sm">
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="dambana-title" className="font-display text-xl text-amber-900">
              <span aria-hidden><img src={DAMBANA_ART} alt="" draggable={false} className="inline-block size-[1.15em] align-[-0.2em]" /></span> {pick ? t.chooseTitle[lang] : t.title[lang]}
            </h2>
            {!pick && <span className="rounded-full bg-amber-100 px-2 py-0.5 font-display text-amber-900 tabular-nums">✨ {fill(t.favor[lang], { favor: Math.floor(state.favor) })}</span>}
          </div>
          {pick ? (
            <>
              <p className="text-stone-600">{t.chooseText[lang]}</p>
              <ul className="space-y-2">
                {content.traditions.map((tr) => (
                  <li key={tr.id} className="rounded-xl border-2 border-amber-900/25 bg-amber-50 p-2.5">
                    <h3 className="font-display text-base text-amber-900">{tr.name[lang]}</h3>
                    <p className="text-xs text-stone-600">{tr.description[lang]}</p>
                    <p className="mt-1 text-xs text-stone-500">{fill(t.healer[lang], { name: tr.rituals.healer[lang] })}</p>
                    <button
                      type="button"
                      disabled={tr.id === state.tradition}
                      onClick={() => {
                        dispatch({ type: "chooseTradition", tradition: tr.id });
                        setChoosing(false);
                      }}
                      className={`${primary} mt-2`}
                    >
                      {state.tradition === null ? t.choose[lang] : fill(t.change[lang], { cost: costText(changeCost) })}
                    </button>
                  </li>
                ))}
              </ul>
              {state.tradition !== null && (
                <button type="button" onClick={() => setChoosing(false)} className={plain}>
                  {t.close[lang]}
                </button>
              )}
            </>
          ) : (
            <>
              {tradition && (
                <section className="rounded-xl border-2 border-amber-900/20 bg-amber-50 p-2.5">
                  <h3 className="font-display text-base text-amber-900">{tradition.name[lang]}</h3>
                  <p className="text-xs text-stone-600">{fill(t.healer[lang], { name: tradition.rituals.healer[lang] })}</p>
                  <p className="text-xs text-stone-600">{fill(t.burial[lang], { style: tradition.burial[lang] })}</p>
                  <button type="button" onClick={() => setChoosing(true)} className="mt-1 text-xs font-semibold text-amber-800 underline underline-offset-2">
                    {fill(t.change[lang], { cost: costText(changeCost) })}
                  </button>
                </section>
              )}
              <section className="space-y-1.5">
                <h3 className="font-display text-base text-amber-900">
                  {tradition ? tradition.rituals.offering[lang] : t.offer[lang]}
                </h3>
                <p className="text-xs text-stone-500">{t.offerHint[lang]}</p>
                <div className="flex flex-wrap gap-2">
                  {RESOURCES.map((r) => (
                    <Stepper key={r} value={gift[r]} icon={RESOURCE_ICON[r]} onChange={(n) => setGift({ ...gift, [r]: n })} />
                  ))}
                </div>
                <button
                  type="button"
                  disabled={!!blocked || favor <= 0 || !!short || state.favor >= content.rules.worship.maxFavor}
                  onClick={() => {
                    dispatch({ type: "offer", gift });
                    onRitual("🍚");
                  }}
                  className={primary}
                >
                  🙏 {t.offer[lang]} · +{Math.round(favor)} ✨
                </button>
              </section>
              <section className="space-y-1.5">
                {content.rituals.map((r) => {
                  const why = ritualBlocker(state, content, r.id);
                  const timer = state.blessings[r.id];
                  const note =
                    why === "active" && timer?.until
                      ? fill(t.active[lang], { time: clock(timer.until - state.time) })
                      : why === "cooldown" && timer?.readyAt
                        ? fill(t.cooldown[lang], { time: clock(timer.readyAt - state.time) })
                        : why === "favor"
                          ? t.needFavor[lang]
                          : why === "no-tradition"
                            ? t.needTradition[lang]
                            : null;
                  return (
                    <div key={r.id} className={`rounded-xl border-2 p-2.5 ${isActive(state, r.id) ? "border-lime-600 bg-lime-50" : "border-amber-900/20 bg-amber-50"}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-display text-base text-amber-900">{r.name[lang]}</h3>
                          <p className="text-xs text-stone-600">{r.description[lang]}</p>
                          <p className="text-[11px] text-stone-500">{r.tradition}</p>
                        </div>
                        <button
                          type="button"
                          disabled={why !== null}
                          onClick={() => {
                            dispatch({ type: "ritual", ritual: r.id });
                            onRitual(r.productionPercent ? "🔥" : "🌾");
                          }}
                          className={`${primary} shrink-0`}
                        >
                          {t.bless[lang]} · {r.favorCost} ✨
                        </button>
                      </div>
                      {note && <p className="mt-1 text-[11px] font-semibold text-amber-800">{note}</p>}
                    </div>
                  );
                })}
              </section>
              <section className="rounded-xl border-2 border-green-900/30 bg-green-50 p-2.5">
                <h3 className="font-display text-base text-green-900">🍃 {tradition ? tradition.rituals.permission[lang] : ""}</h3>
                {state.forest.permission > 0 ? (
                  <p className="text-xs font-semibold text-green-900">{fill(t.permissionActive[lang], { tiles: state.forest.permission })}</p>
                ) : (
                  <button
                    type="button"
                    disabled={!!blocked || state.favor < perm.favorCost}
                    onClick={() => {
                      dispatch({ type: "askPermission" });
                      onRitual("🍃");
                    }}
                    className={`${primary} mt-1`}
                  >
                    {fill(t.permission[lang], { cost: perm.favorCost })}
                  </button>
                )}
                <p className="mt-1 text-[11px] text-stone-600">{forestText(state, content, game, lang)}</p>
              </section>
              <div className="flex justify-end">
                <button type="button" autoFocus onClick={close} className={plain}>
                  {t.close[lang]}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </dialog>
  );
}

/**
 * The eclipse: strike the gong on the beat (a ring pulses with it) to drive the Bakunawa off; the
 * moon comes back as the strength grows (no count). Mashing doesn't help (engine/worship.ts).
 * With reduced motion the ring doesn't pulse: it just lights on each beat. "Hold to beat" strikes
 * on every beat by itself, for players who can't tap in rhythm.
 */
export function EclipseBar({ state, content, game, lang, onGong }: { state: GameState; content: Content; game: GameText; lang: Lang; onGong: (at: number, held: boolean) => void }) {
  const e = state.eclipse;
  const def = content.eclipse;
  const reducedMotion = useReducedMotion();
  // The game moves in steps; between them the moment of a tap is worked out from the clock.
  const clockRef = useRef({ time: state.time, at: performance.now() });
  if (clockRef.current.time !== state.time) clockRef.current = { time: state.time, at: performance.now() };
  const gameNow = () => clockRef.current.time + Math.min(0.2, (performance.now() - clockRef.current.at) / 1000);
  const [glow, setGlow] = useState(0);
  const holding = useRef(false);
  const lastBeat = useRef(-1);
  const strike = useRef(onGong);
  strike.current = onGong;
  const beat = content.rules.eclipse.beatSeconds;
  const start = e && def ? e.endsAt - def.durationSeconds : 0;
  useEffect(() => {
    if (!e) return;
    let raf = 0;
    const loop = () => {
      const t = gameNow() - start;
      const k = Math.floor(t / beat);
      const into = t - k * beat;
      // 1 on the beat, fading to 0 before the next.
      setGlow(Math.max(0, 1 - Math.min(into, beat - into) / (beat / 2)));
      if (holding.current && k !== lastBeat.current) {
        lastBeat.current = k;
        strike.current(start + k * beat, true);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [!!e, start, beat]);
  if (!e || !def) return null;
  const progress = eclipseProgress(state, content);
  const done = progress >= 1;
  const helping = Math.round(eclipseAutoStrikes(state, content));
  const ring = reducedMotion ? 1 : 1 + glow * 0.35;
  const hold = (on: boolean) => {
    holding.current = on;
    lastBeat.current = Math.floor((gameNow() - start) / beat);
  };
  return (
    <div role="alert" className="pointer-events-auto flex max-w-full flex-wrap items-center gap-2 rounded-xl border-2 border-red-950 bg-stone-900/90 py-1.5 pr-1.5 pl-3 text-amber-50 shadow-lg">
      <span className="flex min-w-0 basis-full items-center gap-2 sm:basis-0 sm:flex-1">
        <Moon phase={0.5} swallowed={1 - progress} className="size-8 shrink-0" />
        <span className="min-w-0 text-xs leading-tight sm:text-sm">
          {game.events.eclipse[lang]}
          <span className="block text-amber-300">
            <span className="sr-only">{fill(game.events.moonBack[lang], { percent: Math.round(progress * 100) })} · </span>
            {game.events.beat[lang]} · <span className="tabular-nums">{clock(e.endsAt - state.time)}</span>
            {helping > 0 && <span className="block text-[11px] text-amber-200/80">{fill(game.events.helping[lang], { n: helping })}</span>}
          </span>
        </span>
      </span>
      <span className="ml-auto flex shrink-0 items-center gap-1.5">
        {/* The beat: a ring that pulses (or, with reduced motion, steadily lights) on every beat. */}
        <span aria-hidden className="relative flex size-9 items-center justify-center">
          <span
            className="absolute inset-0 rounded-full border-[3px] border-amber-300"
            style={{ transform: `scale(${ring})`, opacity: 0.35 + glow * 0.65, boxShadow: glow > 0.7 ? "0 0 10px rgb(252 211 77 / 0.8)" : "none" }}
          />
          <span className="size-2.5 rounded-full bg-amber-300" style={{ opacity: 0.4 + glow * 0.6 }} />
        </span>
        <button
          type="button"
          onPointerDown={(ev) => {
            ev.preventDefault();
            onGong(gameNow(), false);
          }}
          onKeyDown={(ev) => {
            if ((ev.key === "Enter" || ev.key === " ") && !ev.repeat) {
              ev.preventDefault();
              onGong(gameNow(), false);
            }
          }}
          className={`${btn} border-amber-950 ${done ? "bg-lime-400" : "bg-amber-400"} text-amber-950 active:scale-95`}
        >
          <GongIcon /> {game.events.gong[lang]}
        </button>
        <button
          type="button"
          title={game.events.holdTip[lang]}
          aria-label={`${game.events.hold[lang]}: ${game.events.holdTip[lang]}`}
          onPointerDown={() => hold(true)}
          onPointerUp={() => hold(false)}
          onPointerLeave={() => hold(false)}
          onPointerCancel={() => hold(false)}
          onKeyDown={(ev) => (ev.key === "Enter" || ev.key === " ") && (ev.preventDefault(), hold(true))}
          onKeyUp={(ev) => (ev.key === "Enter" || ev.key === " ") && hold(false)}
          onBlur={() => hold(false)}
          className="game-btn border-2 border-amber-950/60 bg-amber-200 px-2 py-1.5 text-xs font-semibold text-amber-950 select-none"
        >
          {game.events.hold[lang]}
        </button>
      </span>
    </div>
  );
}

/** A bossed bronze gong (agung) hung on a cord, for the eclipse: struck to drive the Bakunawa off. */
function GongIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="inline-block size-[1.15em] align-[-0.25em]">
      <path d="M12 1.5 L7 6 M12 1.5 L17 6" stroke="#78350f" strokeWidth="1" fill="none" />
      <circle cx="12" cy="14" r="8.5" fill="#ca8a04" stroke="#713f12" strokeWidth="1.2" />
      <circle cx="12" cy="14" r="5.5" fill="none" stroke="#a16207" strokeWidth="0.8" />
      <circle cx="12" cy="14" r="2.6" fill="#eab308" stroke="#713f12" strokeWidth="0.8" />
    </svg>
  );
}

/**
 * The tigbalang as the early sources have it: a tall, shadowy phantom among the trees (no horse
 * head: horses came with the Spanish; content/lore/tikbalang.json).
 */
function TigbalangFigure() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="mr-1 inline-block size-5 align-[-0.3em]">
      <rect x="2" y="2" width="2.2" height="22" fill="#3f6212" opacity="0.8" />
      <rect x="19.5" y="1" width="2.4" height="23" fill="#3f6212" opacity="0.8" />
      <path d="M12 2.5c-2 0-3 1.8-3 3.6 0 1.4.6 2.2 1.2 2.8L8.6 21c-.1.9.5 1.6 1.4 1.6h4c.9 0 1.5-.7 1.4-1.6l-1.6-12.1c.6-.6 1.2-1.4 1.2-2.8 0-1.8-1-3.6-3-3.6z" fill="#1c1917" opacity="0.75" />
      <path d="M9 10.5 5.5 16M15 10.5l3.5 5.5" stroke="#1c1917" strokeWidth="1.2" strokeLinecap="round" opacity="0.6" />
      <circle cx="11" cy="6" r="0.5" fill="#fef3c7" /><circle cx="13" cy="6" r="0.5" fill="#fef3c7" />
    </svg>
  );
}

/** The tigbalang's riddle: the right answer brings the lost workers home. */
export function TikbalangBar({ state, content, game, lang, onAnswer }: { state: GameState; content: Content; game: GameText; lang: Lang; onAnswer: (i: number) => void }) {
  const t = state.tikbalang;
  const riddle = content.trickery?.riddles.find((r) => r.id === t?.riddle);
  if (!t || !riddle || state.time >= t.until) return null;
  return (
    <div role="alert" className="pointer-events-auto max-w-[min(26rem,100%)] rounded-xl border-2 border-amber-950 bg-stone-900/90 p-2.5 text-amber-50 shadow-lg">
      <p className="text-xs leading-snug sm:text-sm">
        <TigbalangFigure />
        {fill(game.events.tikbalang[lang], { n: t.workers })}
      </p>
      <p className="mt-1 text-sm font-semibold">{riddle.question[lang]}</p>
      {t.wrong ? (
        <p className="mt-1 text-xs text-amber-300">{fill(game.events.wrong[lang], { time: clock(t.until - state.time) })}</p>
      ) : (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {riddle.options.map((o, i) => (
            <button key={o.en} type="button" onClick={() => onAnswer(i)} className="game-btn border-2 border-amber-950/60 bg-amber-200 px-2 py-1 text-xs font-semibold text-amber-950">
              {o[lang]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** The anito of the balete hid a camp's tools: which camp, and for how long. */
export function PrankBar({ state, content, game, lang }: { state: GameState; content: Content; game: GameText; lang: Lang }) {
  const p = state.pranks.find((x) => isPranked(state, x.x, x.y));
  if (!p) return null;
  const name = content.buildings.find((d) => d.id === state.buildings.find((b) => b.x === p.x && b.y === p.y)?.type)?.name ?? "";
  return (
    <div role="status" className="pointer-events-auto rounded-xl border-2 border-amber-950/70 bg-stone-900/85 px-3 py-1.5 text-xs text-amber-50 shadow-lg sm:text-sm">
      <span aria-hidden>🌲 </span>
      {fill(game.forest.prank[lang], { building: name, time: clock(p.until - state.time) })}
    </div>
  );
}

/** Asking to replant a cleared tile (or to stop replanting one). */
export function ReplantBar(props: { state: GameState; content: Content; game: GameText; lang: Lang; tile: { x: number; y: number }; onReplant: () => void; onStop: () => void; onCancel: () => void }) {
  const { state, content, game, lang, tile, onReplant, onStop, onCancel } = props;
  const job = state.replanting.find((j) => j.x === tile.x && j.y === tile.y);
  const cost = content.rules.forest.replant.cost;
  return (
    <div role="status" className="wood-panel pointer-events-auto flex items-center gap-2 rounded-xl border-2 border-amber-950/70 py-1.5 pr-1.5 pl-3 text-amber-50 shadow-lg">
      <span aria-hidden className="text-2xl leading-none">
        🌱
      </span>
      <span className="text-xs leading-tight sm:text-sm">
        {job ? fill(game.forest.replanting[lang], { time: clock(job.seconds - job.progress) }) : fill(game.forest.replant[lang], { cost: costText(cost) })}
      </span>
      {job ? (
        <button type="button" onClick={onStop} className="game-btn border-2 border-red-950 bg-red-700 px-2.5 py-1 text-sm font-semibold text-white">
          ✕
        </button>
      ) : (
        <button
          type="button"
          onClick={onReplant}
          disabled={RESOURCES.some((r) => state.resources[r] < (cost[r] ?? 0))}
          className="game-btn border-2 border-green-950 bg-green-700 px-2.5 py-1 text-sm font-semibold text-white disabled:opacity-50"
        >
          🌱
        </button>
      )}
      <button type="button" onClick={onCancel} aria-label="Close" className="game-btn border-2 border-amber-950/60 bg-amber-200 px-2.5 py-1 text-sm font-semibold text-amber-950">
        ↩
      </button>
    </div>
  );
}
