import type { ReactNode } from "react";
import type { Content } from "../engine/content";
import { healRate, isBurning, secondsUntilLeaving } from "../engine/events";
import { hungerDeathAt, sicknessWarning } from "../engine/death";
import { overcrowded, type GameState } from "../engine/game";

export interface Banner {
  id: string;
  icon: string;
  title: string;
  text: string;
  tone: "danger" | "warning" | "info";
}

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
    // Its title and text are in the player's language (App: defenseText.ts raidBannerText).
    banners.push({ id: "raid", icon: "🔥", title: `Raid in ${clock(raid.strikeAt - state.time)}`, text: "", tone: "danger" });
  }
  const leaving = secondsUntilLeaving(state, content);
  if (hunger && leaving !== null) {
    banners.push({
      id: "hunger",
      icon: hunger.icon,
      title: `${hunger.name}! No food`,
      text:
        leaving > 0
          ? `Nobody can work. Forage for food! Families leave in ${Math.ceil(leaving)}s.`
          : state.hunger < hungerDeathAt(content)
            ? `A family leaves every ${hunger.secondsPerVillagerLeaving}s. If the hunger goes on, people will die in ${Math.ceil(hungerDeathAt(content) - state.hunger)}s. Forage for food!`
            : `Families have left and people are dying. Forage for food!`,
      tone: "danger",
    });
  }
  // Rats, locusts or boar (food.ts updatePests): its words are in the player's language (App: pestText).
  if (state.pest && state.time < state.pest.until) banners.push({ id: "pest", icon: "⚠️", title: "", text: "", tone: "warning" });
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
    const sickName = state.named.find((v) => v.sick)?.name;
    const lingering = sicknessWarning(state, content);
    banners.push({
      id: "sickness",
      icon: sickness.icon,
      title: `${sickness.name}: ${state.sick.length} sick`,
      text: lingering
        ? `It has lasted long: without a healer, someone may die.${healer ? ` Build a ${healer.name}.` : ""}`
        : `${sickName ? `${sickName} is among them: they` : "They"} can't work. All well in ${clock(longest)}.${healer ? ` A ${healer.name} heals faster.` : ""}`,
      tone: "warning",
    });
  }
  const damaged = state.buildings.filter((b) => b.damaged).length;
  if (damaged > 0) {
    banners.push({
      id: "damaged",
      icon: "🪵",
      title: `${damaged} damaged`,
      text: "Damaged buildings do nothing. Tap one to repair it with wood.",
      tone: "info",
    });
  }
  // The season (its own chip) and mourning (a status icon) are ongoing states, not banners.
  return banners;
}

const TONE = {
  danger: "border-red-950 bg-red-700 text-white",
  warning: "border-amber-950 bg-amber-400 text-amber-950",
  info: "border-amber-950/70 wood-panel text-amber-50",
} as const;

/** An event banner; `extra` is one more line (the raid warning: is the landing covered?), `danger` makes it stand out. */
/** A button on a banner (e.g. sounding the tambuli on the raid warning). */
export interface BannerAction {
  label: string;
  icon?: ReactNode;
  tip: string;
  onClick: () => void;
  disabled?: boolean;
  /** A line under the button (why it can't be used, or a warning). */
  note?: string;
}

export function EventBanner({ banner, extra, danger = false, action }: { banner: Banner; extra?: string; danger?: boolean; action?: BannerAction }) {
  const button = action && (
    <button
      type="button"
      title={action.tip}
      aria-label={`${action.label}: ${action.tip}`}
      disabled={action.disabled}
      onClick={action.onClick}
      className="game-btn flex shrink-0 items-center gap-1 border-2 border-amber-950 bg-amber-300 px-2 py-1 text-xs font-semibold text-amber-950 disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm"
    >
      {action.icon}
      {action.label}
    </button>
  );
  return (
    <div
      role={banner.tone === "info" ? "status" : "alert"}
      className={`pointer-events-auto flex max-w-full items-center gap-2 rounded-xl border-2 px-3 py-1.5 shadow-lg ${TONE[banner.tone]}`}
    >
      <span className="text-xl leading-none" aria-hidden>
        {banner.icon}
      </span>
      <span className="min-w-0 flex-1 text-xs leading-tight sm:text-sm">
        {/* An action sits beside the title, so it shows even when a phone cuts the banner short. */}
        {button ? (
          <span className="mb-0.5 flex items-center justify-between gap-2">
            <span className="font-display text-sm sm:text-base">{banner.title}</span>
            {button}
          </span>
        ) : (
          <span className="font-display text-sm sm:text-base">{banner.title}</span>
        )}{" "}
        {action?.note && <span className="mb-0.5 block text-[11px] font-semibold opacity-90">{action.note}</span>}
        {banner.text}
        {extra && <span className={`mt-0.5 block font-semibold ${danger ? "rounded bg-red-950/40 px-1 text-yellow-200" : ""}`}>{extra}</span>}
      </span>
    </div>
  );
}

/** The tambuli: a curved horn (a water buffalo's horn, or a conch: see the Aklat), blown to call for help. */
export function TambuliIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="inline-block size-[1.2em]">
      <path d="M3 15 Q5 6 15 5 Q20 4.6 21 7 L19 9 Q15 8.4 11 11 Q7.5 13.5 6.6 17.2 Z" fill="#e7d3a8" stroke="#6b4423" strokeWidth="1" strokeLinejoin="round" />
      <path d="M3 15 L6.6 17.2 L5.6 19.6 L2.2 17.6 Z" fill="#8b5a2b" stroke="#4a2f17" strokeWidth="0.8" />
      <g stroke="#b08a52" strokeWidth="0.7" fill="none"><path d="M9 8.5 Q8 10 8.4 12" /><path d="M12.5 6.6 Q11.6 8 12 9.8" /><path d="M16 5.6 Q15.4 6.8 15.8 8.2" /></g>
    </svg>
  );
}
