// Ranggo ng Kapuluan: the archipelago's barangays ranked by renown, raids defended and Aklat
// entries. The panel only takes a plain list of entries (RankEntry), so the same panel can show
// an online ranking from a server later; localRanking builds the list for this archipelago.
import { useState } from "react";
import type { Content } from "../engine/content";
import type { GameState } from "../engine/game";
import { barangayLevel, levelForRenown } from "../engine/kabantugan";
import { blocOf } from "../engine/politics";
import { RANK_TABS, rankEntries, toPass, type RankEntry, type RankTab } from "../engine/ranking";
import { LevelBadge } from "./LevelBadge";
import { blocColor, blocName } from "./politicsText";
import type { Lang } from "./settings";
import { useModal } from "./StoryDialogs";
import { fill, type GameText } from "./uiContent";

/** The player's archipelago as ranking entries. */
export function localRanking(state: GameState, content: Content, game: GameText, lang: Lang): RankEntry[] {
  const region = state.region;
  const islandOf = (id: string) => region?.islands.find((i) => i.id === region.places[id]?.island)?.name ?? "";
  const blocFor = (id: string) => {
    const b = region ? blocOf(region.politics, id) : undefined;
    return b ? { name: blocName(state, content, b.id, game, lang), color: blocColor(state, b.id) } : null;
  };
  const me: RankEntry = {
    id: state.barangay.id,
    name: state.barangay.name || game.balita.you[lang],
    datu: state.barangay.datu ? `Datu ${state.barangay.datu}` : "Datu",
    level: barangayLevel(state, content),
    island: islandOf(state.barangay.id),
    bloc: blocFor(state.barangay.id),
    you: true,
    renown: state.kabantugan,
    renownAt: state.achievedAt.renown,
    defended: state.stats.raidsDefended,
    defendedAt: state.achievedAt.defended,
    aklat: state.aklat.length,
    aklatAt: state.achievedAt.aklat,
  };
  const them: RankEntry[] = (region?.neighbors ?? []).map((n) => {
    const def = content.neighbors.find((d) => d.id === n.id);
    return {
      id: n.id,
      name: def?.name.replace(/^Barangay /, "") ?? n.id,
      datu: def?.datu ?? "",
      level: levelForRenown(content, n.fame.renown),
      island: islandOf(n.id),
      bloc: blocFor(n.id),
      you: false,
      renown: n.fame.renown,
      renownAt: n.fame.renownAt,
      defended: n.fame.defended,
      defendedAt: n.fame.defendedAt,
      // AI barangays don't keep an Aklat yet.
      aklat: null,
      aklatAt: 0,
    };
  });
  return [me, ...them];
}

const TAB_ICON: Record<RankTab, string> = { renown: "⭐", defended: "🛡️", aklat: "📖" };

/** The ranking, from any list of entries. */
export function RankingPanel(props: { entries: RankEntry[]; game: GameText; lang: Lang; tab?: RankTab }) {
  const { entries, game, lang } = props;
  const t = game.rank;
  const [tab, setTab] = useState<RankTab>(props.tab ?? "renown");
  const ranked = rankEntries(entries, tab);
  const pass = toPass(ranked, tab);
  const hint = tab === "renown" ? t.renownHint : tab === "defended" ? t.defendedHint : t.aklatHint;
  return (
    <div className="space-y-2">
      <div role="tablist" aria-label={t.title[lang]} className="grid grid-cols-3 gap-1">
        {RANK_TABS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`rounded-lg border-2 px-1 py-1 text-[11px] leading-tight font-semibold sm:text-xs ${
              tab === id ? "border-amber-900 bg-amber-300 text-amber-950" : "border-amber-900/30 bg-amber-50 text-amber-900"
            }`}
          >
            <span aria-hidden className="block text-base leading-none">
              {TAB_ICON[id]}
            </span>
            {t[id][lang]}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-stone-600">{hint[lang]}</p>
      {pass && (
        <p className="rounded-lg bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-900">
          ⬆️ {fill(t.toPass[lang], { n: pass.need, datu: pass.above.datu })}
        </p>
      )}
      {!pass && ranked[0]?.you && (ranked[0][tab] ?? 0) > 0 && <p className="rounded-lg bg-green-100 px-2 py-1 text-xs font-semibold text-green-900">🏆 {t.top[lang]}</p>}
      <ol className="space-y-1" role="tabpanel">
        {ranked.map((e, i) => {
          const value = e[tab];
          return (
            <li
              key={e.id}
              aria-current={e.you ? "true" : undefined}
              className={`flex items-center gap-2 rounded-lg border px-2 py-1 ${e.you ? "border-amber-600 bg-amber-200 shadow" : "border-amber-900/15 bg-white/70"}`}
            >
              <span className={`w-6 shrink-0 text-center font-display text-base tabular-nums ${i < 3 ? "text-amber-700" : "text-stone-500"}`}>{i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-1 text-sm font-semibold">
                  {e.name}
                  {e.you && <span className="rounded-full bg-amber-700 px-1.5 text-[10px] text-white">{t.you[lang]}</span>}
                  <LevelBadge level={e.level} game={game} lang={lang} />
                </span>
                <span className="block text-[11px] leading-snug text-stone-600">
                  {e.datu}
                  {e.island && ` · 🏝️ ${e.island}`}
                  {e.bloc && (
                    <>
                      {" · "}
                      <span style={{ color: e.bloc.color }}>●</span> {e.bloc.name}
                    </>
                  )}
                </span>
              </span>
              <span className="shrink-0 font-display text-base tabular-nums">{value === null ? t.unknown[lang] : `${TAB_ICON[tab]} ${value}`}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** The Ranggo as a dialog. */
export function RankingDialog(props: { open: boolean; entries: RankEntry[]; game: GameText; lang: Lang; onClose: () => void }) {
  const { open, entries, game, lang, onClose } = props;
  const dialog = useModal(open);
  return (
    <dialog
      ref={dialog}
      aria-labelledby="ranggo-title"
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="m-auto max-h-[calc(100dvh-1.5rem)] w-[calc(100%-1.5rem)] max-w-md rounded-2xl border-4 border-amber-950/70 p-0 text-stone-800 shadow-2xl backdrop:bg-stone-900/50"
    >
      {open && (
        <div className="mat-card space-y-2 p-3 sm:p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 id="ranggo-title" className="font-display text-xl text-amber-900">
              🏆 {game.rank.title[lang]}
            </h2>
            <button type="button" autoFocus onClick={onClose} className="game-btn border-2 border-amber-950/60 bg-amber-200 px-3 py-1 text-sm font-semibold text-amber-950">
              {game.rank.close[lang]}
            </button>
          </div>
          <RankingPanel entries={entries} game={game} lang={lang} />
        </div>
      )}
    </dialog>
  );
}
