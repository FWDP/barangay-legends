# Contributing to Barangay Legends

Salamat for helping! There are two kinds of contributions.

## 1. Content (no game code needed)

Add one JSON file to the right folder in `content/` and open a pull request.

Example: `content/buildings/palayan.json`

```json
{
  "id": "palayan",
  "name": "Palayan",
  "description": "A terraced rice field worked by two villagers.",
  "cost": { "wood": 15 },
  "produces": { "rice": 0.5 },
  "workers": 2,
  "unlock": { "start": true },
  "sources": ["<link to a reference>"]
}
```

Other content you can edit the same way:

- `content/help/en.json` and `content/help/fil.json`: the "?" help screen. Both files must have the same sections in the same order. Improvements to the Filipino are very welcome.
- `content/advisor.json`: the elder adviser's tutorial steps and tips. Add a line with a new `id`, one of the listed `trigger` ids and text in English and Filipino, and the adviser will rotate it in. The file's `_comment` lists the triggers and the `{placeholders}` each one can use.
- `content/events/choices/*.json`: choice events, a short story with 2 or 3 choices. Each choice lists `effects` (any of `resources` like `{ "rice": -5 }`, `villagers`, `sick`, and, if the event names a `neighbor`, `trust` and `influence`). Optional `conditions`: `season`, `hasBuilding`, `lacksBuilding`, `allied`, `minVillagers`. Stories may use `{neighbor}` and `{datu}`. Every event needs a `sources` entry for its history; `kaingin.json` is a good one to copy.
- `content/names.json`: random default names for a new datu and barangay. Keep them made-up (not real historical datus or places) and at most 30 characters.
- `content/title.json`: the title screen's text in English and Filipino, and its links (including the Support FWDP link).
- `content/quests/*.json`: Mga Gawain, the tasks that guide a new datu, with their rewards.
- `content/blessings/*.json` and `content/lore/*.json`: anito blessings, spirit events and Aklat ng Alamat entries. These are cultural content: see the rules below.
- `content/traditions/*.json`: the traditions a barangay can follow (Tagalog, Visayan, Maranao), with their ritual words, burial look and house style.
- `content/neighbors/*.json` and `content/islands.json`: the AI barangays of the archipelago (name, datu, temperament) and the island names.
- `content/events/politics/*.json`: alliance news in the Balita.
- `content/levels.json`: the reward for each barangay level.
- `content/ui.json`: the game's labels in English and Filipino. Placeholders like `{level}` must stay as they are.
- `content/rules.json`: every balance number (costs, rates, renown amounts, level thresholds). Changes here need a maintainer's approval.

Rules for content pull requests:

- The schema check must pass (`npm test` runs it).
- Lore and history entries need at least one source: a museum page, an academic text or a published folklore collection.
- Say which tradition a myth comes from (for example Tagalog, Visayan, Maranao). Don't present one region's version as the only one.
- Cultural content (beings, rituals, lore, burial and house styles) also needs `"tradition"`, its sources and `"reviewed": false`, and a row in `docs/cultural-review.md` until a historian or heritage educator has checked it.
- Don't depict the sacred practices of living indigenous communities, and keep supreme deities such as Bathala to story text only.
- A maintainer approves any change to balance numbers.

## 2. Code

1. Open an issue first, or comment on an existing one, so work isn't duplicated.
2. Create a branch from `main`.
3. Keep game logic in `src/engine/` and UI in `src/ui/`.
4. Add or update Vitest tests for engine changes. The engine must stay deterministic (no `Math.random()` or `Date.now()` in `src/engine/`), and any change to the save format needs a new save version and a migration.
5. Run `npm test` and `npm run build` before opening the pull request.

Using Claude Code? `CLAUDE.md` holds the project rules, and Claude Code reads it automatically.

## Sound

Sounds are generated with the Web Audio API in `src/ui/sound.ts`. Sound files must be CC0, and every file needs a row in `docs/credits.md` with its source.

## Art

Art is licensed CC BY-SA 4.0. There is no written style guide yet (`docs/art-style.md` is planned); until then, match what's in the game: flat, top-down, simple shapes and a limited palette. The Bahay ng Datu, for example, is drawn as SVG in `src/ui/datuHouseArt.ts`.

## Be kind

This is a community project about shared heritage. Be respectful in issues, reviews and discussions.
