// Player preferences kept per browser, separate from the game save: volumes, tips, language.
// The mute toggle keeps its own older key (see sound.ts), so it is not stored here.
import { useSyncExternalStore } from "react";

export const LANGS = ["en", "fil"] as const;
export type Lang = (typeof LANGS)[number];

export interface Settings {
  /** 0..1 */
  musicVolume: number;
  /** 0..1 */
  effectsVolume: number;
  /** The adviser's tips and tutorial. */
  tips: boolean;
  /** Help and adviser language; null follows the browser. */
  language: Lang | null;
}

export const DEFAULT_SETTINGS: Settings = { musicVolume: 0.5, effectsVolume: 0.8, tips: true, language: null };

const KEY = "barangay-legends/settings";
const unit = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback);

/** Reads stored settings, keeping only valid values. */
export function parseSettings(json: string | null): Settings {
  let raw: Record<string, unknown> = {};
  try {
    const v = json ? JSON.parse(json) : null;
    if (v && typeof v === "object") raw = v;
  } catch {
    // Corrupt: use defaults.
  }
  return {
    musicVolume: unit(raw.musicVolume, DEFAULT_SETTINGS.musicVolume),
    effectsVolume: unit(raw.effectsVolume, DEFAULT_SETTINGS.effectsVolume),
    tips: typeof raw.tips === "boolean" ? raw.tips : DEFAULT_SETTINGS.tips,
    language: (LANGS as readonly unknown[]).includes(raw.language) ? (raw.language as Lang) : null,
  };
}

/** Filipino for browsers set to Filipino or Tagalog, English otherwise. */
export function browserLang(languages: readonly string[]): Lang {
  for (const l of languages) {
    const code = l.toLowerCase().split("-")[0];
    if (code === "fil" || code === "tl") return "fil";
    if (code === "en") return "en";
  }
  return "en";
}

let current: Settings | null = null;
const listeners = new Set<() => void>();

export function getSettings(): Settings {
  if (!current) {
    try {
      current = parseSettings(localStorage.getItem(KEY));
    } catch {
      current = { ...DEFAULT_SETTINGS };
    }
  }
  return current;
}

export function updateSettings(patch: Partial<Settings>): void {
  current = { ...getSettings(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Storage blocked: the setting lasts until the page closes.
  }
  for (const l of listeners) l();
}

export function subscribeSettings(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useSettings(): Settings {
  return useSyncExternalStore(subscribeSettings, getSettings);
}

/** The language to show: the player's choice, or the browser's. */
export function useLang(): Lang {
  const { language } = useSettings();
  if (language) return language;
  return browserLang(typeof navigator === "undefined" ? [] : navigator.languages ?? [navigator.language]);
}
