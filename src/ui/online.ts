// Online play is not built yet (see CLAUDE.md: war and multiplayer come later, via Supabase).
// The title screen already routes through startPlay(mode), so turning it on later means
// setting `available` and handling the "online" branch, with no change to the screen itself.

export type PlayMode = "local" | "online";

export const ONLINE_PLAY = {
  /** Flip to true once there is a server to connect to. */
  available: false,
} as const;

/** Whether a play mode can be started right now. */
export const canPlay = (mode: PlayMode) => mode === "local" || ONLINE_PLAY.available;
