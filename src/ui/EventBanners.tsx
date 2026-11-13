import { directionFrom, raidLanding } from "../engine/border";
import type { Content } from "../engine/content";
import { barangayCenter } from "../engine/map";
import { healRate, isBurning, seasonAt, secondsUntilLeaving } from "../engine/events";
import { overcrowded, type GameState } from "../engine/game";

export interface Banner {
  id: string;
  icon: string;
  title: string;
  text: string;
  tone: "danger" | "warning" | "info";
}

/** Seconds a "new season" banner stays up. */
const SEASON_BANNER_SECONDS = 10;

export const clock = (seconds: number) => {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** Every active event as a banner, most urgent first. Derived from state, so it can't drift. */
export function activeBanners(state: GameState, content: Content): Banner[] {
  const { hunger, fire, typhoon, sickness } = content.events;
  const banners: Banner[] = [];

  const burningCount = state.buildings.filter(isBurning).length;
  if (fire && burningCount > 0) {
    banners.push({
      id: "fire",
      icon: fire.icon,
      title: `${fire.name}!`,
      text: `${burningCount} burning. Tap ${burningCount > 1 ? "them" : "it"} to put the fire out before it spreads.`,
      tone: "danger",
    });
  }
  if (typhoon && state.typhoon) {
    banners.push({
      id: "typhoon",
      icon: typhoon.icon,
      title: `${typhoon.name} in ${clock(state.typhoon.strikeAt - state.time)}`,
      text: "A typhoon is coming. A few buildings will be damaged. Save wood for repairs.",
      tone: "warning",
    });
  }
  const raid = state.region?.incomingRaid;
  if (raid) {
    const who = content.neighbors.find((n) => n.id === raid.from);
    const landing = raidLanding(state, content);
    const where = landing ? ` on the ${directionFrom(barangayCenter(state.map), landing)} bank (⚔️ on the map)` : "";
    banners.push({
      id: "raid",
      icon: "🔥",
      title: `Raid in ${clock(raid.strikeAt - state.time)}`,
      text: `${who?.datu ?? "A datu"} of ${who?.name ?? raid.from} will land${where}. ${
        state.warriors > 0 ? `Your ${state.warriors} Mandirigma leave their work to meet them there` : "Train Mandirigma to meet them there"
      }; a Kuta close by helps most. Buildings will stand.`,
      tone: "danger",
    });
  }
  const leaving = secondsUntilLeaving(state, content);
  if (hunger && leaving !== null) {
    banners.push({
      id: "hunger",
      icon: hunger.icon,
      title: `${hunger.name}! No rice`,
      text:
        leaving > 0
          ? `Nobody can work. Gather rice! Families leave in ${Math.ceil(leaving)}s.`
          : `A family leaves every ${hunger.secondsPerVillagerLeaving}s. Gather rice!`,
      tone: "danger",
    });
  }
  const homeless = overcrowded(state, content);
  if (homeless > 0 && leaving === null) {
    const house = content.buildings.find((b) => b.housing);
    banners.push({
      id: "overcrowded",
      icon: house?.icon ?? "🛖",
      title: `${homeless} without a home`,
      text: `A family leaves every ${content.rules.secondsPerVillagerLeavingOvercrowded}s.${house ? ` Build a ${house.name} to keep them.` : ""}`,
      tone: "warning",
    });
  }
  if (sickness && state.sick.length > 0) {
    const healer = content.buildings.find((b) => b.heals);
    const longest = Math.max(...state.sick) / healRate(state, content);
    banners.push({
      id: "sickness",
      icon: sickness.icon,
      title: `${sickness.name}: ${state.sick.length} sick`,
      text: `They can't work. All well in ${clock(longest)}.${healer ? ` A ${healer.name} heals faster.` : ""}`,
      tone: "warning",
    });
  }
  const damaged = state.buildings.filter((b) => b.damaged).length;
  if (damaged > 0) {
    banners.push({
      id: "damaged",
      icon: "🛠️",
      title: `${damaged} damaged`,
      text: "Damaged buildings do nothing. Tap one to repair it with wood.",
      tone: "info",
    });
  }
  const season = seasonAt(content, state.time);
  if (season && state.time >= season.season.durationSeconds && season.elapsed < SEASON_BANNER_SECONDS) {
    banners.push({
      id: "season",
      icon: season.season.icon,
      title: season.season.name,
      text: season.season.description,
      tone: "info",
    });
  }
  return banners;
}

const TONE = {
  danger: "border-red-950 bg-red-700 text-white",
  warning: "border-amber-950 bg-amber-400 text-amber-950",
  info: "border-amber-950/70 wood-panel text-amber-50",
} as const;

export function EventBanner({ banner }: { banner: Banner }) {
  return (
    <div
      role={banner.tone === "info" ? "status" : "alert"}
      className={`pointer-events-auto flex max-w-full items-center gap-2 rounded-xl border-2 px-3 py-1.5 shadow-lg ${TONE[banner.tone]}`}
    >
      <span className="text-xl leading-none" aria-hidden>
        {banner.icon}
      </span>
      <span className="min-w-0 text-xs leading-tight sm:text-sm">
        <span className="font-display text-sm sm:text-base">{banner.title}</span> {banner.text}
      </span>
    </div>
  );
}
