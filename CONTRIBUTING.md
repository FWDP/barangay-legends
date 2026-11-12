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
- `content/names.json`: random default names for a new datu and barangay. Keep them made-up (not real historical datus or places) and at most 30 characters.
- `content/title.json`: the title screen's text in English and Filipino, and its links (including the Support FWDP link).

Rules for content pull requests:

- The schema check must pass (`npm test` runs it).
- Lore and history entries need at least one source: a museum page, an academic text or a published folklore collection.
- Say which tradition a myth comes from (for example Tagalog, Visayan, Maranao). Don't present one region's version as the only one.
- A maintainer approves any change to balance numbers.

## 2. Code

1. Open an issue first, or comment on an existing one, so work isn't duplicated.
2. Create a branch from `main`.
3. Keep game logic in `src/engine/` and UI in `src/ui/`.
4. Add or update Vitest tests for engine changes.
5. Run `npm test` and `npm run build` before opening the pull request.

Using Claude Code? `CLAUDE.md` holds the project rules, and Claude Code reads it automatically.

## Sound

Sounds are generated with the Web Audio API in `src/ui/sound.ts`. Sound files must be CC0, and every file needs a row in `docs/credits.md` with its source.

## Art

Read `docs/art-style.md` before submitting art. Art is licensed CC BY-SA 4.0.

## Be kind

This is a community project about shared heritage. Be respectful in issues, reviews and discussions.
