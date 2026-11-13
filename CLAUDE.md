# CLAUDE.md — Barangay Legends

Barangay Legends is a free, open-source idle builder set in a precolonial Philippine barangay.
The full design is in `docs/game-design.md`. Read it before starting any task.

## Current phase

**Feature prompts.** The game is live and past the original week-by-week plan; see "Where the game
is now" in `docs/game-design.md` for what is built. Build only what the current prompt asks for.
Not yet, unless a prompt explicitly asks: prestige and Dangal, save export codes, real multiplayer,
accounts, cloud saves, online rankings, payments, Phaser, Supabase.

## Guiding principles

1. **Free to play, no paywalls.** Nothing in the game is sold.
2. **Traction before money.** Players and contributors come first.
3. **Fun before features.** Keep the loop small and make it feel good.
4. **Content is data.** Buildings, blessings and quests live in `content/` as JSON. Never hard-code them in `src/`.
5. **Respect the culture.** Treat mythology and history as heritage. Lore needs a source. Cultural content (beings, rituals, lore, burial and house styles) carries a `tradition`, its sources and `"reviewed": false`, and is listed in `docs/cultural-review.md`.

## Tech stack

- TypeScript, React, Vite, Tailwind CSS
- Game logic: plain TypeScript in `src/engine/`, built around a pure `tick(state, seconds)` function
- Map: CSS grid or SVG (no game engine)
- Saving: browser localStorage
- Tests: Vitest
- Hosting: GitHub Pages, deployed by GitHub Actions on push to `main`

## Folder layout

```
content/buildings/   one JSON file per building
content/blessings/   blessings and spirit events
content/quests/      Mga Gawain tasks
content/lore/        Aklat ng Alamat entries, with sources
content/traditions/  Tagalog, Visayan, Maranao
content/neighbors/   AI barangays
content/events/      disasters, seasons, choice events, alliance news
content/help/        the help screen (en, fil)
content/*.json       rules (balance), ui texts, levels, islands, names, adviser, villagers, title
src/engine/          game state, tick, costs, saving (no React here)
src/ui/              React components
public/art/          images
docs/                design docs
```

## Rules for code changes

- Keep `src/engine/` free of React and browser APIs except in the save module, so it stays easy to test.
- Every change to the engine gets a Vitest test.
- Before finishing a task, run `npm test` and `npm run build`, and fix any errors.
- Keep dependencies minimal. Ask before adding a new one.
- New text the player sees goes in `content/` (`ui.json`, help) in English and Filipino. (Some older UI text is still in code.)
- Check UI changes on a phone-sized screen (375px) as well as desktop.
- Balance numbers come from `docs/game-design.md` and `content/`. Don't invent new ones in code.

## Future-proofing for war and multiplayer

The long-term plan is war, raids and alliances against neighboring barangays: AI first, then real players via a database (Supabase). The AI side is built (raids, alliances, wars, sea travel, visits, the ranking). Real players are not: keep these rules so they can be added without a rewrite:

- Every player action is a serializable command object (build, gather, place, later attack). Game state is derived by applying commands to the engine.
- The engine is deterministic: seeded RNG stored in GameState, no Math.random() or Date.now() inside src/engine (time is passed in).
- src/engine has no React or browser APIs, so it can run on a server later.
- Each barangay has an id and a regional map position.
- Views of other barangays take save-format snapshots or plain entry lists (see `VisitView`, `RankingPanel`), so server data can replace generated data.
- Save data is versioned, with a migration for every format change.

## Before building a prompt

Before writing any code, check that everything the prompt references already exists in the codebase or is created by the prompt itself. If something is missing, stop and list it, and ask whether to build it, skip it, or use a placeholder. Never silently build features from other prompts.