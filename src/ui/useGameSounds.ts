// Sounds for things the game does on its own: event warnings and battles.
import { useEffect, useRef } from "react";
import type { Content } from "../engine/content";
import type { GameState } from "../engine/game";
import { activeBanners } from "./EventBanners";
import { latestReportId } from "./RegionOverlays";
import { sfx } from "./sound";
import { CLASH_MS } from "./visitors";

/** Delay between the battle drums and the result. */
const RESULT_DELAY_MS = 1300;

export function useGameSounds(state: GameState, content: Content) {
  // Warnings: a gong when a new danger or warning banner appears (fire, typhoon, raid, hunger...).
  const warnings = activeBanners(state, content)
    .filter((b) => b.tone !== "info")
    .map((b) => b.id)
    .sort()
    .join(",");
  const heard = useRef<string[] | null>(null);
  useEffect(() => {
    const now = warnings ? warnings.split(",") : [];
    if (heard.current && now.some((id) => !heard.current!.includes(id))) sfx.warning();
    heard.current = now;
  }, [warnings]);

  // Battles: drums when a raid or defense report arrives, then the result.
  const latest = latestReportId(state);
  const lastReport = useRef(latest);
  useEffect(() => {
    if (latest <= lastReport.current) {
      lastReport.current = latest;
      return;
    }
    const battle = state.region?.reports.find((r) => r.id > lastReport.current && (r.kind === "raid" || r.kind === "defense"));
    lastReport.current = latest;
    if (!battle) return;
    sfx.battleStart();
    // A raid on the barangay plays out at the Kuta first (CLASH_MS); the result sounds as it ends.
    setTimeout(() => (battle.win ? sfx.battleWon() : sfx.battleLost()), battle.kind === "defense" ? CLASH_MS : RESULT_DELAY_MS);
  }, [latest]);
}
