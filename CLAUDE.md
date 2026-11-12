# CLAUDE.md — Barangay Legends

Barangay Legends is a free, open-source idle builder set in a precolonial Philippine barangay.
The full design is in `docs/game-design.md`. Read it before starting any task.

## Current phase

**Week 1 only.** Do not build anything from later phases unless the task explicitly asks for it.
Not yet: prestige, blessings, events, multiplayer, accounts, payments, Phaser, Supabase.

## Guiding principles

1. **Free to play, no paywalls.** Nothing in the game is sold.
2. **Traction before money.** Players and contributors come first.
3. **Fun before features.** Keep the loop small and make it feel good.
4. **Content is data.** Buildings, blessings and quests live in `content/` as JSON. Never hard-code them in `src/`.
5. **Respect the culture.** Treat mythology and history as heritage. Lore needs a source.

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
content/blessings/   one JSON file per blessing or event (later)
content/quests/      milestone goals (later)
content/lore/        notes with sources
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
- Balance numbers come from `docs/game-design.md` and `content/`. Don't invent new ones in code.
