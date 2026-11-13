// A short celebration when the barangay reaches a new level or rises in the Ranggo: a banner
// that pops in over the map for a few seconds (still, with reduced motion). The adviser and the
// Balita say the rest.
import { useEffect, useRef, useState } from "react";
import type { GameState } from "../engine/game";
import type { HistoryEntry } from "../engine/people";
import type { Lang } from "./settings";
import { fill, type GameText } from "./uiContent";

const SHOW_MS = 3200;

export function Celebration(props: { state: GameState; game: GameText; lang: Lang }) {
  const { state, game, lang } = props;
  const [shown, setShown] = useState<HistoryEntry | null>(null);
  // Entries already there when the game opens aren't celebrated again.
  const seen = useRef<number | null>(null);
  useEffect(() => {
    const last = state.history.reduce((m, h) => Math.max(m, h.at), -1);
    if (seen.current === null) {
      seen.current = last;
      return;
    }
    const fresh = state.history.filter((h) => h.at > seen.current! && (h.kind === "level" || h.kind === "rank"));
    seen.current = Math.max(seen.current, last);
    if (fresh.length) setShown(fresh.at(-1)!);
  }, [state.history]);
  useEffect(() => {
    if (!shown) return;
    const t = setTimeout(() => setShown(null), SHOW_MS);
    return () => clearTimeout(t);
  }, [shown]);
  if (!shown) return null;
  const text = shown.kind === "level" ? fill(game.level.up[lang], { level: shown.level ?? 1 }) : fill(game.rank.up[lang], { rank: shown.level ?? 1 });
  return (
    <div role="status" className="pointer-events-none fixed inset-x-0 top-[22%] z-40 flex justify-center px-4">
      <div className="motion-safe:animate-bounce rounded-2xl border-4 border-amber-900 bg-amber-300 px-4 py-2 text-center font-display text-lg text-amber-950 shadow-2xl sm:text-xl">
        <span aria-hidden className="mr-1">{shown.kind === "level" ? "⭐" : "🏆"}</span>
        {text}
        <span aria-hidden className="ml-1">🎉</span>
      </div>
    </div>
  );
}
