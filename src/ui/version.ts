// The game's version, set at build time (vite.config.ts): package.json's version and the short
// git commit, e.g. "0.1.0 (a1b2c3d)".
declare const __APP_VERSION__: string;
declare const __APP_COMMIT__: string;

export const APP_VERSION = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "0.0.0";
export const APP_COMMIT = typeof __APP_COMMIT__ === "string" ? __APP_COMMIT__ : "dev";
export const VERSION_TEXT = `v${APP_VERSION} (${APP_COMMIT})`;
