import { useCallback, useEffect, useRef, useState } from "react";
import { loadContent } from "../engine/content";
import { apply, newGame, tick, type Command, type GameState } from "../engine/game";
import { clearSave, loadGame, parseSave, saveGame, SAVE_KEY } from "../engine/save";

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
/** Cap one frame's catch-up (e.g. after the laptop sleeps). Offline progress is a Week 2 feature. */
const MAX_FRAME_SECONDS = 60;

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
      const seconds = Math.min((now - last) / 1000, MAX_FRAME_SECONDS);
      last = now;
      setState((s) => tick(s, content, seconds));
    }, TICK_MS);
    return () => clearInterval(id);
  }, [running]);

  // Save when the player leaves or switches away from the tab.
  useEffect(() => {
    const save = () => live.current && saveGame(latest.current);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") save();
    };
    window.addEventListener("pagehide", save);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", save);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // Save after every build, so progress that matters is never lost.
  useEffect(() => {
    if (running) saveGame(latest.current);
  }, [state.buildings, running]);

  /** The only way the UI changes the game: plain command objects. */
  const dispatch = useCallback((command: Command) => setState((s) => apply(s, content, command)), []);
  const onReset = useCallback(() => {
    clearSave();
    setState(newGame(content, newSeed()));
  }, []);
  /** A fresh barangay with the names the player chose, replacing any save. */
  const startNew = useCallback((names: { name?: string; datu?: string }) => {
    clearSave();
    setState(newGame(content, newSeed(), true, names));
  }, []);

  return { state, dispatch, onReset, startNew, hasSave };
}
