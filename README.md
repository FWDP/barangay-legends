# Barangay Legends

A free, open-source idle builder set in a precolonial Philippine barangay.
You are a new datu: gather rice and wood, build bahay kubo and palayan, look after your people,
and earn a name among the barangays of the islands, by friendship or by force.

**Play:** https://barangaylegends.fwdp.org (free, in the browser, on phones and desktops)

**Status:** early and growing fast. Playable now; balance numbers are still playtest guesses.
See [the design doc](docs/game-design.md) for the plan and where the game is today.

## What's in the game

- **Build and grow:** gather, clear the forest, build houses, fields, camps, a granary, fishing
  docks, Daan footpaths and Tulay bridges. Villagers work on their own, eat rice and have a mood.
- **Seasons and events:** rainy and dry seasons, typhoons, fires, sickness, and choice events.
- **Faith and folklore:** choose a tradition (Tagalog, Visayan or Maranao), build a Dambana and
  receive anito blessings, keep the Forest Balance, and fill the Aklat ng Alamat with sourced lore.
- **The Bahay ng Datu:** the datu's house at the plaza grows over five levels and unlocks envoys,
  the Balangay and alliances.
- **Named villagers:** some villagers get names and stories; those who die are remembered at the
  Libingan.
- **The archipelago (Rehiyon):** islands of AI barangays to trade with, marry into, make sandugo
  with, raid or defend against. Sail between islands by Balangay, and join or lead alliances.
- **Renown and levels:** Kabantugan (renown) raises your barangay through 20 levels with rewards.
- **Bisitahin:** visit any barangay and see their village, then trade, send a gift, talk alliances
  or plan a raid.
- **Ranggo ng Kapuluan:** every barangay in the archipelago ranked by renown, raids defended and
  Aklat entries.
- **Mga Gawain:** tasks that guide a new datu, and Dalisay, the elder adviser, with tips.
- English and Filipino, offline progress, autosave in the browser, and a share card for your
  barangay. No accounts, no ads, nothing for sale.

## Run it locally

The easiest way is GitHub Codespaces: click **Code → Codespaces → Create codespace on main**.

Or on your own machine (Node.js 20+):

```bash
npm install
npm run dev      # play at http://localhost:5173
npm test         # engine and content tests (Vitest)
npm run build    # type check and build the static site
```

Every push to `main` is deployed to GitHub Pages by GitHub Actions.

## How it's built

- TypeScript, React, Vite and Tailwind CSS. No game engine and no server.
- `src/engine/`: the game rules as plain, deterministic TypeScript (a pure `tick(state, seconds)`,
  serializable commands, a seeded random number generator). No React or browser APIs, so it is
  easy to test and could run on a server later.
- `src/ui/`: React components. The map is drawn with CSS and SVG.
- `content/`: everything a contributor might want to add or change, as JSON: buildings,
  blessings, events, quests, lore, traditions, neighbors, islands, levels, texts in English and
  Filipino, and the balance numbers in `rules.json`. The game checks every file against a schema.
- Saves live in the browser's localStorage and are versioned, with a migration for every format
  change, so old saves keep working.

## Contribute

You don't need to know the whole codebase. Most contributions are a single JSON file:
a building, a blessing, a quest, an event or a lore note. See [CONTRIBUTING.md](CONTRIBUTING.md).

Historians, heritage educators and native speakers are especially welcome:
[docs/cultural-review.md](docs/cultural-review.md) lists everything waiting for a review.

## License

- Code: MIT
- Art and lore text: CC BY-SA 4.0
- The name "Barangay Legends" and its logo are reserved by FWDP.

Credits are in [docs/credits.md](docs/credits.md). An FWDP community project.
