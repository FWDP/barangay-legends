// Panoorin: watching an expedition (a trade or a raid) play out in the target's village. Display
// only: the record says what happened (the engine decided it), the script (replay.ts) only
// shows it. The village is the read-only one a visit shows (an AI barangay's generated village,
// or the player's own for raids on them), at the current time of day there, with its night.
// With reduced motion, a few stills step through instead. Laktawan goes straight to the report.
import { useEffect, useMemo, useRef, useState } from "react";
import type { Content } from "../engine/content";
import type { Expedition } from "../engine/expeditions";
import type { GameState } from "../engine/game";
import type { Point } from "../engine/map";
import { neighborDef } from "../engine/region";
import { parseSnapshot } from "../engine/save";
import { villageSnapshot } from "../engine/village";
import { BarangayMap } from "./BarangayMap";
import { withTraditionNames } from "./traditionNames";
import { origin, type Camera, type View } from "./camera";
import { costText } from "./format";
import { buildReplay, sampleReplay, type Phase, type Script } from "./replay";
import type { Lang } from "./settings";
import { fill, type GameText } from "./uiContent";
import { drawBoat, drawPerson, drawSparks, useReducedMotion } from "./VillagerLayer";
import { datuHouseBox, datuHouseImage, eraseImage, houseStyleFor, type HouseStyle } from "./datuHouseArt";
import { householdOf } from "../engine/household";
import { houseFront } from "../engine/plaza";
import type { Appearance } from "./villagers";

const noop = () => {};
const FRAME_MS = 1000 / 30 - 2;

/** The name of a barangay in a record: the player's own, or a neighbor's. */
export function placeName(state: GameState, content: Content, id: string, game: GameText, lang: Lang): string {
  if (id === state.barangay.id) return state.barangay.name || game.balita.you[lang];
  return neighborDef(content, id)?.name ?? id;
}

/** A one-line title for a record: "Raid on Talampas", "Trade with Malinaw", "Raiders from Batong Buhay". */
export function expeditionTitle(e: Expedition, state: GameState, content: Content, game: GameText, lang: Lang): string {
  const t = game.expedition;
  if (e.side === "in") return fill(t.raidIn[lang], { barangay: placeName(state, content, e.from, game, lang) });
  return fill((e.kind === "trade" ? t.trade : t.raid)[lang], { barangay: placeName(state, content, e.to, game, lang) });
}

/** The village it happened in, as GameState: the target's (generated for an AI barangay) or the player's own. */
function villageOf(e: Expedition, state: GameState, content: Content): GameState | null {
  if (e.to === state.barangay.id) return state;
  const n = state.region?.neighbors.find((x) => x.id === e.to);
  const def = neighborDef(content, e.to);
  return n && def ? parseSnapshot(villageSnapshot(content, n, def, state.time), content) : null;
}

/** The report lines for a record: the full counts, whatever the replay drew. */
export function reportLines(e: Expedition, state: GameState, content: Content, game: GameText, lang: Lang, script: Script | null): string[] {
  const t = game.expedition;
  const lines: string[] = [];
  if (e.trade) lines.push(fill(t.gave[lang], { gave: costText({ [e.trade.gave.resource]: e.trade.gave.amount }), got: costText({ [e.trade.got.resource]: e.trade.got.amount }) }));
  const b = e.battle;
  if (b) {
    lines.push(b.attackerWins ? t.won[lang] : t.lost[lang]);
    const joined = b.defenders.posts.filter((p) => p.arrives).reduce((n, p) => n + p.warriors, 0);
    lines.push(fill(t.sides[lang], { attackers: e.party.count, defenders: joined }));
    lines.push(fill(t.chance[lang], { percent: Math.round(b.chance * 100) }));
    lines.push(fill(t.losses[lang], { attackers: b.attackerLosses, defenders: b.defenderLosses }));
    if (b.kutaBonus > 0) lines.push(fill(t.kuta[lang], { bonus: Math.round(b.kutaBonus), cover: b.covered ? t.covered[lang] : "" }));
    if (b.defenders.late > 0) lines.push(fill(t.late[lang], { n: b.defenders.late }));
    const allies = b.allies.filter((a) => a.arrives).map((a) => placeName(state, content, a.id, game, lang));
    if (allies.length) lines.push(fill(t.allies[lang], { names: allies.join(", ") }));
    if (b.attackerWins && Object.values(b.loot).some((v) => (v ?? 0) > 0)) lines.push(fill(t.loot2[lang], { goods: costText(b.loot) }));
    const named = [...e.party.named, ...b.defenders.named].map((v) => (v.fell ? fill(t.fell[lang], { name: v.name }) : v.name));
    if (named.length) lines.push(fill(t.named[lang], { names: named.join(", ") }));
  }
  if (script && script.shown < script.total) lines.push(fill(t.capped[lang], { shown: script.shown, total: script.total }));
  return lines;
}

/** One of the datu's household, standing still in a replay. */
interface Figure {
  p: Point;
  role: "datu" | "spouse" | "attendant";
  look: Appearance;
}

/** The datu, spouse and two attendants in front of the Bahay ng Datu (household.ts), as the map shows them. */
function householdFigures(village: GameState, content: Content): Figure[] {
  const home = householdOf(village, content);
  const f = houseFront(village, content);
  const malong = content.traditions.find((t) => t.id === village.tradition)?.dress === "malong";
  return [
    { p: { x: f.x, y: f.y }, role: "datu", look: { gender: home.datuGender, age: "adult", cls: "nobility", malong } },
    { p: { x: f.x + 0.5, y: f.y + 0.05 }, role: "spouse", look: { gender: home.spouse.gender, age: "adult", cls: "nobility", malong } },
    { p: { x: f.x - 0.35, y: f.y + 0.15 }, role: "attendant", look: { gender: "man", age: "adult", cls: "dependent", malong } },
    { p: { x: f.x - 0.65, y: f.y + 0.1 }, role: "attendant", look: { gender: "woman", age: "adult", cls: "dependent", malong } },
  ];
}

/** A label pill on a canvas: solid light background, thin light border, soft shadow under the pill only. */
function drawChip(g: CanvasRenderingContext2D, text: string, x: number, y: number, fontPx: number): void {
  const w = g.measureText(text).width + fontPx * 1.1;
  const h = fontPx * 1.55;
  g.save();
  g.shadowColor = "rgb(0 0 0 / 0.28)";
  g.shadowBlur = 2;
  g.shadowOffsetY = 1;
  g.fillStyle = "#fffbeb";
  g.beginPath();
  g.roundRect(x - w / 2, y - h / 2, w, h, h / 2);
  g.fill();
  g.restore();
  g.strokeStyle = "rgb(255 255 255 / 0.85)";
  g.lineWidth = 1;
  g.stroke();
  g.fillStyle = "#292524";
  g.fillText(text, x, y + 0.5);
}

/** The canvas: draws the script at its own pace (or one still), never re-rendering the map. */
function ReplayLayer(props: { script: Script; house: { box: ReturnType<typeof datuHouseBox>; style: HouseStyle } | null; household: Figure[]; cam: Camera; view: View; still: number | null; onPhase: (p: Phase) => void; onEnd: () => void }) {
  const { script, house, household, cam, view, still, onPhase, onEnd } = props;
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef({ cam, view, onPhase, onEnd });
  live.current = { cam, view, onPhase, onEnd };
  useEffect(() => {
    const el = canvas.current;
    const g = el?.getContext("2d");
    if (!el || !g) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let phase: Phase | null = null;
    const draw = (time: number, wall: number) => {
      const { cam: c, view: v } = live.current;
      const w = Math.max(1, Math.round(v.w * dpr));
      const h = Math.max(1, Math.round(v.h * dpr));
      if (el.width !== w || el.height !== h) {
        el.width = w;
        el.height = h;
        el.style.width = `${v.w}px`;
        el.style.height = `${v.h}px`;
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, v.w, v.h);
      const o = origin(c, v);
      const T = c.tile;
      const px = (p: Point) => ({ x: o.x + p.x * T, y: o.y + p.y * T });
      const f = sampleReplay(script, time);
      if (f.phase !== phase) {
        phase = f.phase;
        live.current.onPhase(f.phase);
      }
      for (const b of f.boats) {
        const q = px(b.p);
        drawBoat(g, q.x, q.y, T, b.heading, b.kind, wall);
      }
      // The datu's household stands with everyone else, sorted by where they stand.
      const people = [...f.people, ...household.map((h, i) => ({ id: 9010 + i, p: h.p, look: h.role, moving: false, figure: h.look, label: undefined, bundle: false }))].sort((a, b) => a.p.y - b.p.y);
      // Those behind the Bahay ng Datu are hidden by it: once everyone behind its ground line is
      // drawn, cut its shape out (the house on the map shows through), then draw the rest.
      const img = house ? datuHouseImage(house.box.level, house.style) : null;
      let erased = !img;
      const erase = () => {
        erased = true;
        if (img && house) eraseImage(g, img, o.x + house.box.cx * T, o.y + house.box.bottom * T, house.box.size * T);
      };
      for (const p of people) {
        if (!erased && house && p.p.y > house.box.ground) erase();
        const q = px(p.p);
        drawPerson(g, q.x, q.y, T, p.id, p.look, { p: p.p, moving: p.moving && still === null, stride: wall * 9 + p.id }, wall, 1, "figure" in p ? p.figure : undefined);
        if (p.bundle) {
          // Goods on the back: the trade's bundles, or the loot.
          g.fillStyle = "#a16207";
          g.beginPath();
          g.arc(q.x - Math.max(7, T * 0.32) * 0.22, q.y - Math.max(7, T * 0.32) * 0.6, Math.max(2.5, T * 0.07), 0, Math.PI * 2);
          g.fill();
        }
      }
      if (!erased) erase();
      if (f.sparks) {
        const q = px(f.sparks);
        drawSparks(g, q.x, q.y, T, still === null ? wall : 0.4);
      }
      // Named villagers' names over their heads, as crisp chips (the map-chip style in index.css).
      const fontPx = Math.max(10, Math.min(12, T * 0.28));
      g.font = `650 ${fontPx}px system-ui, sans-serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      for (const p of people) {
        if (!p.label) continue;
        const q = px(p.p);
        const y = q.y - Math.max(7, T * 0.32) * 1.5;
        drawChip(g, `★ ${p.label}`, q.x, y, fontPx);
      }
    };
    if (still !== null) {
      draw(still, 0);
      return;
    }
    let raf = 0;
    let last = 0;
    const start = performance.now();
    let ended = false;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (now - last < FRAME_MS) return;
      last = now;
      const time = (now - start) / 1000;
      draw(Math.min(time, script.duration), now / 1000);
      if (time >= script.duration && !ended) {
        ended = true;
        live.current.onEnd();
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [script, still]);
  return <canvas ref={canvas} aria-hidden width={1} height={1} className="pointer-events-none absolute top-0 left-0" />;
}

export function ReplayView(props: { expedition: Expedition; state: GameState; content: Content; game: GameText; lang: Lang; onClose: () => void }) {
  const { expedition: e, state, content, game, lang, onClose } = props;
  const t = game.expedition;
  const reduced = useReducedMotion();
  // The village as it is now (the replay doesn't depend on later changes to the player's state).
  const village = useMemo(() => villageOf(e, state, content), [e, content]);
  // The Bahay ng Datu, so people behind it are hidden by it on the canvas.
  const house = useMemo(() => (village ? { box: datuHouseBox(village, content), style: houseStyleFor(village, content) } : null), [village, content]);
  // The datu, their spouse and two attendants, in front of the house to receive the visitors.
  const household = useMemo(() => (village ? householdFigures(village, content) : []), [village, content]);
  const script = useMemo(() => (village ? buildReplay(e, village, content) : null), [e, village, content]);
  const [done, setDone] = useState(!script);
  const [phase, setPhase] = useState<Phase>("arrive");
  const [still, setStill] = useState(0);
  const title = expeditionTitle(e, state, content, game, lang);
  const lines = reportLines(e, state, content, game, lang, script);
  // Shown at the current time of day there: its night if it is night.
  const shown = village ? { ...village, time: state.time } : null;
  const stillT = reduced && script ? script.stills[Math.min(still, script.stills.length - 1)] : null;
  const caption = reduced && script ? (([...script.phases].reverse().find((p) => (stillT ?? 0) >= p.t)?.phase ?? "arrive") as Phase) : phase;
  const outcome = e.battle ? (e.battle.attackerWins === (e.side === "out") ? t.youWon[lang] : t.youLost[lang]) : null;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-sky-900">
      {shown && script && (
        <BarangayMap
          state={shown}
          content={withTraditionNames(content, shown.tradition)}
          placing={null}
          onPlace={noop}
          onTapTile={noop}
          onBuildingMenu={noop}
          onSpirit={noop}
          visit={{ landing: null }}
          overlay={(cam, view) => (done ? null : <ReplayLayer script={script} house={house} household={household} cam={cam} view={view} still={stillT} onPhase={setPhase} onEnd={() => setDone(true)} />)}
        />
      )}
      <div data-map-overlay className="pointer-events-none absolute inset-x-2 top-2 z-10 flex justify-center">
        <div className="pointer-events-auto flex w-full max-w-md items-center gap-2 rounded-xl border-2 border-amber-900/60 bg-amber-50/95 px-2.5 py-1.5 text-stone-800 shadow-lg">
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-display text-base leading-tight text-amber-900">🎬 {title}</h2>
            {!done && (
              <p role="status" className="text-xs">
                {t[caption][lang]}
              </p>
            )}
          </div>
          {!done && reduced && script && still < script.stills.length - 1 && (
            <button type="button" onClick={() => setStill((s) => s + 1)} className="game-btn border-2 border-amber-950/60 bg-amber-200 px-2 py-1 text-sm font-semibold text-amber-950">
              {t.next[lang]}
            </button>
          )}
          {!done && (
            <button type="button" onClick={() => setDone(true)} className="game-btn border-2 border-amber-950/60 bg-stone-200 px-2 py-1 text-sm font-semibold text-stone-900">
              ⏭ {t.skip[lang]}
            </button>
          )}
        </div>
      </div>
      {done && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-stone-900/50 p-4">
          <div role="dialog" aria-labelledby="expedition-report" className="mat-card w-full max-w-sm space-y-2 rounded-2xl border-4 border-amber-950/70 p-5 text-stone-800 shadow-2xl">
            <p className="text-xs tracking-wide text-stone-500 uppercase">{t.report[lang]}</p>
            <h2 id="expedition-report" className="font-display text-xl text-amber-900">
              {title}
              {outcome && <span className="block text-base">{outcome}</span>}
            </h2>
            <ul className="space-y-1 text-sm">
              {lines.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
            <div className="flex justify-end pt-1">
              <button type="button" autoFocus onClick={onClose} className="game-btn border-2 border-amber-950/60 bg-amber-200 px-4 py-2 text-sm font-semibold text-amber-950">
                {t.back[lang]}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** How long (game seconds) a finished expedition is offered on the map before it moves to the Balita. */
const OFFER_SECONDS = 120;

/** The player's expedition that has just arrived and hasn't been offered yet, if any. */
export const freshExpedition = (state: GameState, seen: number) => [...state.expeditions].reverse().find((e) => e.side === "out" && e.id > seen && state.time - e.arriveAt <= OFFER_SECONDS);

/** The next Balangay of the player's to arrive, if one is at sea. */
export const sailingVoyage = (state: GameState) => state.region?.voyages.filter((v) => v.leg === "out").sort((a, b) => a.arriveAt - b.arriveAt)[0];

/**
 * The bar over the map: a Balangay on its way (and when it arrives), then, once the player's
 * expedition has arrived and the engine has decided it, Panoorin.
 */
export function ExpeditionBar(props: { state: GameState; content: Content; game: GameText; lang: Lang; seen: number; onWatch: (id: number) => void; onDismiss: (id: number) => void }) {
  const { state, content, game, lang, seen, onWatch, onDismiss } = props;
  const t = game.expedition;
  const fresh = freshExpedition(state, seen);
  const voyage = sailingVoyage(state);
  if (!fresh && !voyage) return null;
  const panel = "wood-panel pointer-events-auto flex max-w-full items-center gap-2 rounded-xl border-2 border-amber-950/70 px-3 py-1.5 text-xs leading-tight text-amber-50 shadow-lg sm:text-sm";
  if (fresh) {
    return (
      <div role="status" className={panel}>
        <span aria-hidden className="text-xl leading-none">
          {fresh.kind === "raid" ? "⚔️" : "⛵"}
        </span>
        <span className="min-w-0 flex-1">{fill(t.arrived[lang], { barangay: placeName(state, content, fresh.to, game, lang) })}</span>
        <button type="button" onClick={() => onWatch(fresh.id)} className="game-btn border-2 border-amber-950/60 bg-amber-200 px-2 py-1 text-xs font-semibold text-amber-950">
          🎬 {t.watch[lang]}
        </button>
        <button type="button" aria-label={t.close[lang]} onClick={() => onDismiss(fresh.id)} className="px-1 text-amber-100">
          ✕
        </button>
      </div>
    );
  }
  const left = Math.max(0, Math.ceil(voyage!.arriveAt - state.time));
  return (
    <div role="status" className={panel}>
      <span aria-hidden className="text-xl leading-none">
        ⛵
      </span>
      <span className="min-w-0 flex-1">{fill(t.sailing[lang], { barangay: placeName(state, content, voyage!.target, game, lang), time: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` })}</span>
    </div>
  );
}
