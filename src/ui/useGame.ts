import { useCallback, useEffect, useRef, useState } from "react";
import { loadContent } from "../engine/content";
import { apply, newGame, tick, type Command, type GameState } from "../engine/game";
import { offlineProgress, type OfflineReport } from "../engine/offline";
import { clearSave, loadGame, parseSave, readSavedAt, saveGame, SAVE_KEY } from "../engine/save";

export const content = loadContent();

const TICK_MS = 100;

/** A fresh seed for each new barangay, so events differ between games. The engine itself stays seeded. */
function newSeed(): number {
  try {
    return crypto.getRandomValues(new Uint32Array(1))[0];
  } catch {
    return Date.now() >>> 0;
  }
}
/** Longer gaps between frames (the laptop slept, the phone froze the tab) count as time away. */
const MAX_FRAME_SECONDS = 60;
/** Save this often while playing, so a crash loses little and offline progress knows when we left. */
const AUTOSAVE_MS = 10_000;

/** Saves with the wall-clock time (the engine never reads the clock itself). */
const save = (state: GameState) => saveGame(state, localStorage, Date.now());

/** What happened while the game was closed, for the "While you were away" story. */
export interface TimeAway {
  before: GameState;
  after: GameState;
  report: OfflineReport;
}

/** Is there a save the player can continue? */
function savedGameExists(): boolean {
  try {
    const json = localStorage.getItem(SAVE_KEY);
    return json !== null && parseSave(json, content) !== null;
  } catch {
    return false;
  }
}

/**
 * The game state and its loop. While `running` is false (the title screen) time stands still
 * and nothing is saved, so looking at the title never costs rice or creates a save.
 */
export function useGame(running = true) {
  const [hasSave] = useState(savedGameExists);
  const [savedAt] = useState(() => readSavedAt(localStorage));
  const [state, setState] = useState<GameState>(() => loadGame(content, localStorage, newSeed()));
  const latest = useRef(state);
  latest.current = state;
  const live = useRef(running);
  live.current = running;

  // Game loop.
  useEffect(() => {
    if (!running) return;
    let last = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      const seconds = (now - last) / 1000;
      last = now;
      // A long stall is time away: credited gently, like a closed game, never with disasters.
      setState((s) => (seconds > MAX_FRAME_SECONDS ? offlineProgress(s, content, seconds).state : tick(s, content, seconds)));
    }, TICK_MS);
    return () => clearInterval(id);
  }, [running]);

  // Save when the player leaves or switches away from the tab.
  useEffect(() => {
    const saveNow = () => live.current && save(latest.current);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") saveNow();
    };
    window.addEventListener("pagehide", saveNow);
    document.addEventListener("visibilitychange", onVisibility);
    const autosave = setInterval(saveNow, AUTOSAVE_MS);
    return () => {
      clearInterval(autosave);
      window.removeEventListener("pagehide", saveNow);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // Save after every build, so progress that matters is never lost.
  useEffect(() => {
    if (running) save(latest.current);
  }, [state.buildings, running]);

  /** The only way the UI changes the game: plain command objects. */
  const dispatch = useCallback((command: Command) => setState((s) => apply(s, content, command)), []);
  const onReset = useCallback(() => {
    clearSave();
    setState(newGame(content, newSeed()));
  }, []);
  /** An imported game replaces the current one, and is saved at once. */
  const replaceGame = useCallback((next: GameState) => {
    latest.current = next;
    setState(next);
    save(next);
  }, []);
  /** A fresh barangay with the names the player chose, replacing any save. */
  const startNew = useCallback((names: { name?: string; datu?: string }) => {
    clearSave();
    setState(newGame(content, newSeed(), true, names));
  }, []);

  /**
   * Continue the saved game: credit the time since it was saved (capped, gentle; see
   * engine/offline.ts). Returns what happened, or null if no time is credited.
   */
  const continueGame = useCallback((): TimeAway | null => {
    if (savedAt === null) return null;
    const before = latest.current;
    const { state: after, report } = offlineProgress(before, content, (Date.now() - savedAt) / 1000);
    if (report.seconds <= 0) return null;
    latest.current = after;
    setState(after);
    // Save at once with the new time, so the same hours can never be credited twice.
    save(after);
    return { before, after, report };
  }, [savedAt]);

  return { state, dispatch, onReset, startNew, hasSave, continueGame, replaceGame };
}
