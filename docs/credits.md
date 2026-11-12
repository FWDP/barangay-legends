# Credits

## Contributors

Barangay Legends is made by [Filipino Web Development Peers (FWDP)](https://github.com/FWDP) and everyone who sends a pull request. See the full list on [GitHub](https://github.com/FWDP/barangay-legends/graphs/contributors). Salamat!

## Licenses

| What | License |
| --- | --- |
| Code | MIT (see `LICENSE`) |
| Art and lore text | CC BY-SA 4.0 |
| Font | SIL Open Font License 1.1 |
| Name and logo | Reserved by FWDP |

Barangay Legends is free to play. Nothing in the game is sold.

## Sound

Every sound in the game is generated in the browser with the Web Audio API. There are **no audio files**, so nothing needs a license. The code is in `src/ui/sound.ts` (MIT, like the rest of the code).

| Sound | When it plays | How it is made | Source |
| --- | --- | --- | --- |
| Gather (rice) | Tapping Gather Rice (at most once per 250 ms) | Short falling sine tone | Generated, `sfx.gather` |
| Gather (wood) | Tapping Gather Wood, starting to clear land | Short falling triangle tone | Generated, `sfx.gather` |
| Pick up | Choosing a building to place or move | Two quick triangle "tocks" | Generated, `sfx.pick` |
| Build | Placing, moving, repairing or demolishing a building | Low thunk and a two-note chime | Generated, `sfx.build` |
| Extinguish | Putting out a fire | Falling sawtooth whoosh | Generated, `sfx.extinguish` |
| Click | Menus, undo, the kapre | Very short sine tick | Generated, `sfx.click` |
| Event warning | A fire, typhoon, raid, hunger or sickness warning appears | Two low gong strokes | Generated, `sfx.warning` |
| Battle start | A raid or defense report arrives | Four filtered-noise drum hits and a gong | Generated, `sfx.battleStart` |
| Battle won | After a won battle | Three rising gongs | Generated, `sfx.battleWon` |
| Battle lost | After a lost battle | Three falling, lower gongs | Generated, `sfx.battleLost` |
| Ambient: river | Always, while sound is on (music volume) | Looping soft noise through a low-pass filter, slowly swelling | Generated, `startAmbient` |
| Ambient: birds | Every few seconds | Short bursts of high sine chirps | Generated, `startAmbient` |
| Ambient: gongs | Every 15–30 seconds | One to three soft gong notes from a five-note scale | Generated, `startAmbient` |

The gongs are kulintang-*style*: a sine fundamental with a few slightly inharmonic partials and a long decay. They are not samples or tuned copies of a real kulintang set. A real recording would be welcome if it is CC0 and its source is listed here.

**Adding a sound file:** only CC0 files are accepted. Add a row to the table with the file path, the author and a link to where it was published.

## Fonts

- **Lilita One** by Juan Montoreano, SIL Open Font License 1.1. Self-hosted from `public/fonts/` (license in `public/fonts/OFL.txt`).

## Characters

- **Dalisay**, the datu's elder adviser, is a fictional character. Her portrait is an emoji.
