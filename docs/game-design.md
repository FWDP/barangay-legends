# Barangay Legends — Game Design Doc

## Summary

Build a free, open-source idle builder set in a precolonial Philippine barangay, playable in the browser at barangaylegends.fwdp.org within 4 weeks. The player is a datu who grows a small settlement by gathering, building and earning the favor of the anito.

**Working title:** Barangay Legends. Settle the final name before the repo goes public.

**What it is:** a short-session idle/management game. Numbers go up, the barangay visibly grows, and Filipino mythology gives it a distinct identity.

**What it isn't (yet):** an RPG, a combat game, a multiplayer game or a paid product. All of those can come later, once people are playing.

## Where the game is now

_Updated November 2026._ The game is live at barangaylegends.fwdp.org and has grown past the
week-by-week plan below. That plan is kept as the original design. Some of it was built in a
different form, and some (prestige and Dangal, export codes) isn't built yet.

**Built so far**

- **Barangay:** foraging, forest clearing, 24 buildings (houses, ten food buildings, the Palayan,
  Kamalig, Asinan, Baklad, Bantayan, Kuta, Suyak, Tulay, Babaylan's hut, Dambana, Libingan and
  Balangay Dock, among others), Daan footpaths, villagers who work on their own, happiness, named
  villagers with stories, and gentle deaths with mourning.
- **The ruler (V.3, `engine/household.ts`):** a woman or a man, chosen on the new-game form and
  changeable once in Settings; the spouse follows. The title is Datu for both; a woman ruler of a
  Tagalog barangay may be called Dayang (`content/traditions` womanHonorific, flagged).
- **Notices and the map (V.5-V.7):** the "+N" badge and every banner can be tapped and sit above
  the map's labels; connection footprints show only with the Daan tool, while placing, or with
  "Show connections" on; deaths are told as they happened (fell attacking a barangay, fell
  defending ours, old age, sickness, hunger), the same in the history, life stories and the
  Libingan.
- **Seasons and events:** rainy and dry seasons, typhoons, fires, sickness, hunger and choice
  events. Offline progress and autosave.
- **Faith:** a tradition per barangay (Tagalog, Visayan, Maranao), the Dambana with Favor and
  blessings, the Bakunawa eclipse, the tigbalang's riddle, the Sarimanok, the Forest Balance,
  and the Aklat ng Alamat.
- **Bahay ng Datu:** five levels, each needing a minimum barangay level (3, 6, 9, 12). It unlocks
  envoys, the Balangay and alliances.
  From level 3 it stands on 2×2 tiles (`rules.plaza`); those tiles are kept free from level 2,
  and an old save with buildings there keeps the one-tile house. The house is solid: people
  gather on open tiles around it (at most `gatherMax`, the rest wait further out), and anyone
  behind it is hidden by it, on the player's map, in visits and in replays.
  There is no town plaza (those came with Spanish colonial planning): the house stands at the
  edge of an irregular clearing of `clearingMin`–`clearingMax` open tiles in front of it, with
  the fire pit and a shade tree (`map.gathering`, seeded per map, v28). It is walkable, never
  built on, counts as part of the Daan network, and is where gatherings stand first. New maps
  clear one extra row behind the start square to make up for the land it keeps open.
- **Food (V.2, v34, `engine/food.ts`, `rules.food`, `rules.pests`):** villagers eat Pagkain
  (everyday food) from many sources: Gabihan and Kaingin (root crops kept in the ground: they
  don't spoil and survive typhoons; a kaingin tires and is rested back to forest), Sagingan,
  Lumbia (dried sago), Niyugan, the Pangisdaan (the old fishing dock), shore gathering, the
  hunters' camp and the Babuyan. Palay (rice) is a prestige grain for offerings, gifts, marriage,
  rice wine, the Pista and the datu's household; villagers eat it only with no Pagkain, wasting
  it. Asin from the Asinan salts fresh food into household jars; the Kamalig holds Palay, dried
  goods and Asin only; a Baklad keeps fish alive. Fresh food left out spoils. A varied diet makes
  people happier, one kind for long makes them unhappy and sickly. Seasons and rough seas change
  yields by crop; rats, locusts and wild boar are warned about and pass. The Pista at the Bahay
  ng Datu spends Palay, rice wine and Pagkain for happiness, renown and allies' trust. Old saves
  split their rice into Pagkain and Palay and eat Palay without waste for a grace period.
  Labour costs (clearing, warriors, replanting, early buildings) are paid in Pagkain.
- **War, feuds and peace (W, `engine/warfare.ts`, `feud.ts`, `honor.ts`, `rules.military.battle`,
  `rules.feud`, `rules.honor`):** battles end when one side's morale breaks; most hurt are
  wounded (they heal at the healer's hut), deaths are rare and named, and some beaten warriors are
  held for ransom and always come home. With no Kuta villagers flee into the forest from an
  overwhelming raid. Deaths leave blood debts: feuds bring vengeance raids (fiercer, a few houses
  set alight) and cool very slowly; the Make peace flow at the Bahay ng Datu settles them
  (go-between, blood price in gold, Palay and rice wine for now, then a sandugo, shared Pista or
  marriage). Breaking a sealed peace costs trust everywhere. Warriors earn honor (batok for
  Visayan warriors, ornaments elsewhere). Suyak stakes at the shore slow raiders.
- **A lively barangay (W.6-W.8, `engine/social.ts`, `rules.social`, `rules.bayanihan`):**
  evenings under the silong and by the fire, music (agong and flutes; kulintang for Maranao),
  children's play, and a Pista with dancing and guests; free time makes people happier, working
  all the time tires them. The Bahay Kubo is a house on posts whose ladder is pulled up at night;
  moving one is bayanihan. New games start with foraging, a Gabihan or Kaingin and a second kubo.
- **Where villagers come from:** births in a Bahay Kubo (fed, room, happiness) and newcomers
  with a reason (land, marriage, alliance, a trader who stays, kin from a raided ally), told in
  the Balita; children grow up after `rules.population.childDays`, don't work and eat less;
  elders work less. AI barangays keep the simple arrivals. Tuned with `npm run simulate`.
- **Life stories (talambuhay):** every named villager has a 3-5 sentence story from
  `content/villagers/talambuhay.json` (family linked to real villagers, a skill that fits their
  role, a personal detail, all from the seed) and a dated timeline: born or arrived, married,
  became a parent, came of age, fought at a raid, sick and healed, learned from an elder, became
  an elder, died. Tap a named villager for their card (portrait, class and role, family links to
  open, timeline); the Libingan keeps the stories of the dead (v31).
- **How children learned:** no school building (schools came with the Spanish). In the evening
  (`rules.dayNight.eveningShare`) elders and children sit by the fire at the datu's clearing; now
  and then an elder teaches a child or a named apprentice a lesson (`rules.population.learning`),
  a dated line in their life story. Aklat entries: learning by family and apprenticeship, oral
  epics (the Darangen), baybayin.
- **The moon:** drawn small and soft in the HUD beside Araw N (never over the map), with its
  phases (`rules.dayNight.moonCycleDays`), darkened during the Bakunawa eclipse.
- **Palayan fields:** a flat, muted paddy green with faint water lines (`src/ui/paddy.ts`), on
  the map, visits, replays and the share card.
- **No one walks on water:** every person sprite stands on land or a Tulay; crews stay in boats.
- **Fit to the period:** world art and symbols are precolonial (no candles, steel axes,
  fishing reels, railway tracks or padlocks; see the S prompt and `docs/cultural-review.md`).
  The healer's hut is named by tradition (Babaylan, Katalonan, Healer), the balete's spirit is
  the Anito ng Balete (not the colonial "kapre") and the tigbalang has no horse head. Interface
  symbols (menus and buttons) can stay modern.
- **The archipelago:** 4–5 islands of AI barangays with trade (accept, counter or refuse),
  grudges and Handog, marriage alliances, sandugo, raids and defense, tributaries, sea travel by
  Balangay, alliance blocs and wars, and the Balita news feed.
- **Renown:** Kabantugan raises the barangay through 20 levels with rewards and titles.
  AI barangays keep their own renown too. The first Mga Gawain tasks and Aklat entries give
  little renown, rising to the full amount (`rules.kabantugan.taskRamp`, `aklatRamp`), so level 2
  comes at about 3–5 minutes and level 3 at about 10–15 (`npm run simulate` prints the times).
- **Bisitahin:** a read-only visit to any barangay's village from a save-format snapshot. AI
  villages are generated from their seed, so real players' snapshots can be shown later.
- **Panoorin (expedition replays):** each trade and raid (the player's, and AI raids on the
  player) is written down by the engine as a plain record; the newest few can be watched in the
  target's village, or skipped straight to the report. The replay only shows what was decided.
- **Shore defense and ally calls:** a staffed Bantayan (watchtower at the shore) watches the
  landing points within `rules.watch.radius`: a watched raid gives a long warning, shows its
  landing at once and sounds the alarm (horn and drum; a signal fire at night); an unwatched one
  gives a short warning and shows its landing only as the boats come close. The Kuta (palisaded
  refuge, one tile) is the rally point: the Mandirigma gather there (`rules.kuta.rallySeconds`)
  and march to the landing; only those in time fight, those with time to spare fight ready.
  Each Kuta allows `rules.military.warriorsPerKuta` Mandirigma, never more than
  `maxWarriorPercent` (30%) of the villagers. The call to arms is proportional: enough villagers
  stay at work to staff every food workplace (filled first while a raid is coming), and only the
  rest of the Mandirigma go; "Call everyone" on the raid warning (the `callEveryone` command)
  sends them all.
  Families within its shelter take refuge, and winning raiders take much less from storehouses
  and fields there. Raiders prefer unwatched landings, coves and river mouths, come more at night,
  dawn and season changes and less in typhoons, and leave sooner with less loot when allies are
  on the way; tributaries send warriors. The Defense map shows watched and unwatched landing
  points and each Kuta's shelter, with a key. Old saves: Kutas nearer the water than the Bahay ng
  Datu became Bantayan (v33). Sandugo allies and bloc mates can be
  raided by aggressive neighbors, and a messenger asks the player to send warriors
  (`rules.allyCalls`, the `ally-call` choice event).
- **Balance:** a gentle building cost curve (`rules.costCurve`), Kamalig levels 2 and 3, a soft
  cap on wood and gold (`rules.stockpile`), and an AI renown pace retuned with `npm run simulate`.
- **Ranggo ng Kapuluan:** an archipelago ranking by renown, raids defended and Aklat entries,
  built to take online rankings later. Moving up gives no renown, and rank changes aren't
  announced before `rules.kabantugan.rankNewsAfterSeconds` of play.
- **Guidance and sharing:** Mga Gawain tasks, Dalisay the adviser, help in English and Filipino,
  and a share card.

**Kept ready for later (not built):** every action is a serializable command, the engine is
deterministic with time passed in, every barangay has an id and a map position, and saves are
versioned with migrations. Multiplayer (Supabase), cloud saves and online rankings can be added
without a rewrite.

**Not built yet:** prestige and Dangal, save export codes, accounts, the historian review,
heirlooms as their own resource (the blood price uses gold, Palay and rice wine for now), and a
batalan on higher-level houses.

## Guiding principles

Five rules decide every scope question. If a feature breaks one, it waits.

1. **Free to play, no paywalls.** Every mechanic is free. Nothing is sold in v1. A "Support FWDP" donation link is fine because it unlocks nothing.
2. **Traction before money.** Players and contributors come first. Any money discussion waits until the milestones in the roadmap are hit.
3. **Fun before features.** A small loop that feels good beats a long feature list. Every week ends with real people playing it.
4. **Content is data.** Buildings, blessings and quests live in plain data files, so contributors can add them without touching game code.
5. **Respect the culture.** Mythology and history are treated as heritage, not as loot. Accuracy gets reviewed.

## Core gameplay loop

The player starts as a new datu with 5 villagers, 1 bahay kubo and 10 rice, and grows the barangay one decision at a time. The loop repeats every few minutes:

1. **Gather.** Click to gather rice and wood early on. Assigned villagers gather automatically later.
2. **Build.** Spend resources on buildings that produce more resources or house more villagers.
3. **Grow.** More houses bring more villagers. More villagers can work more buildings.
4. **Unlock.** Reaching milestones (population, total rice) unlocks new buildings and anito blessings.
5. **Ascend.** Late in a run, the datu can pass leadership on (prestige) for a permanent bonus, then start again faster.

**What should feel good:** the first automated income (around minute 2), the barangay visibly filling the map, and a new unlock every few minutes in the first session.

**Out of scope for v1:** combat, raids, trading with other players, dialogue and characters with stories.

## Resources and buildings

V1 ships with 4 resources and 6 buildings. All numbers below are starting values for playtesting, not final balance.

> **Today** (see "Where the game is now"): the resources are Pagkain (everyday food, eaten 0.1 a
> second per villager, from foraging and ten food buildings), Palay (rice, a prestige grain from
> the Palayan), wood, gold, Asin (salt) and rice wine; labour costs such as the woodcutter camp,
> clearing and warriors are paid in Pagkain. The tables below are the original V1 plan.

| Resource | How you get it | What it's for |
| --- | --- | --- |
| Rice | Clicking, rice fields | Feeding villagers (0.1 rice/s each), building |
| Wood | Clicking, woodcutter camps | Most buildings |
| Gold | Fishing docks (fish traded at market) | Upgrades, late buildings |
| Dangal (honor) | Earned only through prestige | Permanent bonuses across runs |

| Building | Base cost | Effect | Unlocks at |
| --- | --- | --- | --- |
| Bahay kubo | 10 wood | +2 villager capacity | Start |
| Palayan (rice field) | 15 wood | +0.5 rice/s per worker, 2 workers | Start |
| Woodcutter camp | 10 rice | +0.4 wood/s per worker, 2 workers | Start |
| Kamalig (granary) | 30 wood | +1,500 rice storage; raised to level 2 (150 wood, 20 gold: 2,500) and 3 (400 wood, 60 gold: 4,000) | 10 villagers |
| Fishing dock | 40 wood, 20 rice | +0.1 gold/s per worker, 3 workers | 15 villagers |
| Datu's house upgrade | 50 gold, 100 wood | +10% all production per level | 50 total gold |

**Cost scaling:** each extra copy of a building costs more on a gentle curve: cost × (1 + 0.15·n + 0.012·n²) after n copies (`rules.costCurve`). The first ten copies cost about what the old 1.15ⁿ curve gave; the 50th Bahay Kubo costs about 370 wood instead of about 9,400. Clearing forest rises the same way (`rules.clearing.growth`: 1 + 0.03·n + 0.0001·n²) instead of 1.04ⁿ, which made a tile cost more rice than the granaries could hold after about 140 tiles.

**Stockpile soft cap:** wood and gold above 4× the next big purchase (the dearest next building, Bahay ng Datu level, Kamalig level or Balangay; at least 400 wood, 150 gold) come in 80% slower (`rules.stockpile`); nothing stored is lost and the HUD shows the limit. Balance numbers in this section were retuned with `npm run simulate` (scripts/simulate.ts).

## Anito blessings

Mythology is the game's hook, and it's earned through play, never sold. The player builds a small shrine (dambana) and makes offerings to receive blessings. Some creatures appear as events instead, which fits their role in the stories better than a shop item would.

| Name | Tradition | In the game | How it's earned |
| --- | --- | --- | --- |
| Anito blessing | Widespread (ancestral spirits) | +20% all production for 5 min | Offer 50 rice at the dambana |
| Diwata's favor | Widespread (nature spirits) | Rice fields harvest instantly | Offer rice + wood, 15 min cooldown |
| Anito ng Balete (was "Kapre's grove": see the Aklat on the colonial word) | Tagalog and other lowland belief | +50% wood for 5 min | Leave the old balete tree uncut |
| Sarimanok's fortune | Maranao | A random bonus of rice, wood or gold | Rare: the bird crosses the map, click it |
| Bakunawa eclipse (event) | Visayan | The moon darkens: strike the gongs on the beat (a pulsing ring; mashing doesn't help; "hold to beat" for accessibility) to drive the serpent off. The strength needed grows with barangay level; each Kuta and Bahay ng Datu level adds villagers' strikes (`rules.eclipse`). Progress shows as the moon coming back. Success gives gold, failure costs rice | Random event after 30 villagers |
| Tigbalang trickery (event) | Tagalog | Workers get lost for 1 min unless you solve a short riddle | Random event after first prestige |

**Two choices made on purpose:**

- **Bathala is not a game mechanic.** As the supreme deity in Tagalog belief, a "bonus chest" would feel disrespectful to many players. Bathala can appear in story text only.
- **Origins are labeled.** Each blessing records which tradition it comes from, so the game doesn't present Filipino mythology as one uniform set.

## Progression and prestige

Prestige is what keeps an idle game interesting after the first hour, so it's designed now even though it ships in week 3.

- **Passing leadership.** Once total rice earned reaches 10,000, the datu can hand the barangay to a successor. The run resets, and the player earns Dangal = ⌊√(total rice ÷ 1,000)⌋.
- **What Dangal buys.** Permanent perks: +5% production per point, starting with extra villagers, cheaper first buildings, faster blessing cooldowns.
- **Target pacing.** First prestige after about 45–60 minutes of play. Each later run should reach the same point roughly twice as fast.
- **Offline progress.** On return, the game credits production for the time away, capped at 8 hours, and shows a "while you were away" summary.
- **Saves.** Saved automatically every 10 seconds in the browser, plus an export/import code so players can move a save between devices without accounts.

## Tech stack and hosting

V1 is a static website with no server and no database, so it costs nothing to run beyond the fwdp.org domain and your existing Claude Code subscription.

| Layer | Choice | Why |
| --- | --- | --- |
| Language | TypeScript | Catches mistakes early, and Claude Code works well with it |
| UI | React + Vite | An idle game is mostly buttons and numbers. Vite builds a plain static site |
| Styling | Tailwind CSS | Fast to iterate, easy for contributors |
| Game logic | Plain TypeScript: one `tick(state, seconds)` function | Easy to test and balance, with no engine to learn |
| Map | CSS grid or SVG tiles | Enough for v1. Bring in Phaser only when the map needs animation (v2+) |
| Saving | Browser localStorage + export code | No accounts or backend needed |
| Tests | Vitest | Checks balance math and save loading |
| Dev environment | GitHub Codespaces + Claude Code | Contributors get the same setup in one click |
| Hosting | GitHub Pages or Cloudflare Pages (free tiers) | Deploys automatically on every merge to `main` |
| Domain | `barangaylegends.fwdp.org` (CNAME to the host) | Named after the game, and kept separate from the main fwdp.org site |

**Not in v1:** Next.js, Supabase, accounts or payments. Add Supabase only when a feature truly needs a server, such as cloud saves or leaderboards.

If you'd rather use Vercel, check that its free Hobby plan fits an organization's project before relying on it, since that plan is meant for personal use.

## Content as data

A contributor should be able to add a building or a blessing by adding one small file and opening a pull request, without touching game code. The game reads every file in `content/` at build time and checks it against a schema.

```
barangay-legends/
├── content/
│   ├── buildings/      one JSON file per building
│   ├── blessings/      one JSON file per blessing or event
│   ├── quests/         milestone goals and their rewards
│   └── lore/           short notes with sources
├── src/
│   ├── engine/         tick, costs, prestige, saving
│   └── ui/             React components
├── public/art/
├── docs/
└── CONTRIBUTING.md
```

Example building file, `content/buildings/palayan.json`:

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

**Rules for content PRs:** the schema check must pass, lore and history entries need at least one source, and one maintainer approves balance changes.

## Cultural accuracy, art and licensing

These decisions are cheap to make now and expensive to change later.

**Accuracy**

- Use terms that fit the period: datu, barangay, balangay, maharlika, timawa, alipin. Note in the lore files where practices differed between regions.
- Every lore entry links to a source, such as a museum page, an academic text or a published folklore collection.
- Before v1 launches, ask one historian or heritage educator to review the content. A short list of questions is enough.

**Art**

- Choose one simple style early (for example, flat top-down tiles with a limited palette) and write it up in `docs/art-style.md` so contributed art matches.
- Decide and publish a policy on AI-generated art before contributors start sending it. Open-source communities have strong views on this.

**Licensing**

| What | License | Effect |
| --- | --- | --- |
| Code | MIT | Anyone can reuse it, with credit |
| Art and lore text | CC BY-SA 4.0 | Reuse requires credit, and changes stay open |
| Name and logo | Reserved by FWDP | Forks can't pass themselves off as the official game |

## Roadmap

The first playable version goes live at the end of week 1, and v1 launches at the end of week 4. After that, each phase starts only once the previous one hits its traction gate. The gate numbers are suggestions, so adjust them to what's realistic for FWDP.

| Phase | Timing | Ships | Move on when |
| --- | --- | --- | --- |
| Week 1 | Days 1–7 | Gather, build 3 buildings, villagers eat rice, local save. Live at barangaylegends.fwdp.org | 5 people outside the team have played it |
| Week 2 | Days 8–14 | All 6 buildings, autosave, offline progress, export code | Playtesters come back the next day unprompted |
| Week 3 | Days 15–21 | Dambana, 4 blessings, prestige and Dangal | Testers reach a first prestige in about an hour |
| Week 4 | Days 22–28 | 2 events, polish, CONTRIBUTING.md, Support FWDP link in credits, launch post | v1 launched |
| v1.x | Months 2–3 | Community content: new buildings, blessings, quests | 500 players reach a first prestige, 10 outside contributors |
| v2 | After gate | Neighboring barangays and trade, animated map (Phaser) | Players ask for more to do after several prestiges |
| v3 | After gate | Balangay voyages and exploration | Steady weekly players |
| v4 | After gate | Educational edition aligned with Araling Panlipunan, for schools, DepEd divisions, LGUs and museums | Content reviewed by a historian or educator, and a partner institution is interested |

**Measuring traction:** count visits with free, privacy-friendly analytics (such as Cloudflare Web Analytics). For milestones like a first prestige, put a feedback link in the game that goes to GitHub Discussions, and ask playtesters directly. Collect no personal data.

## Sustainability

Donations open at v1 launch. Everything else waits for traction. None of these options involves selling gameplay power.

1. **Donations (from v1):** a "Support FWDP" link on the credits screen, going to GitHub Sponsors or Ko-fi, which handle the payments. Donors at any amount can be thanked with their name in the credits and a Discord role. Early access isn't offered because the code is public.
2. **Schools and partners (strongest long-term opportunity):** an educational edition for DepEd divisions, private schools, museums and LGUs. Precolonial society is part of Araling Panlipunan, so check the current curriculum and finish the accuracy review before pitching. Pitch once there are players and a reviewed content set to show.
3. **Cosmetics (after the v1.x gate):** optional barangay themes or a supporter title, if players want them.

**Donations vs. sales:** a fixed price with promised perks (such as a PHP 99 pack) is a sale, not a donation. Before selling anything in FWDP's name, confirm how FWDP handles receipts and taxes.

Avoid selling boosters, loot boxes or randomized paid rewards. They conflict with the open-source model and with the cultural framing.

## First steps with Claude Code

Week 1 is done when a stranger can open barangaylegends.fwdp.org, gather rice and wood, and build a bahay kubo.

**Setup**

- [ ] Create `barangay-legends` under the FWDP GitHub org
- [ ] Add `CLAUDE.md`, `README.md`, `CONTRIBUTING.md` and this file as `docs/game-design.md`
- [ ] Open it in a Codespace and start Claude Code
- [ ] Give Claude Code the Week 1 prompt below

**Week 1 prompt**

```
Read docs/game-design.md. Implement ONLY Week 1 of the roadmap.

Stack: Vite, React, TypeScript, Tailwind, Vitest.

Features:
- Gather Rice and Gather Wood buttons
- Resource bar
- Build Bahay Kubo, Palayan, Woodcutter Camp (costs and outputs from the doc, loaded from content/buildings/*.json)
- Villagers eat 0.1 rice/s
- Local save (localStorage)
- Simple barangay grid showing built buildings
- GitHub Actions workflow deploying to GitHub Pages on push to main. The site will be served at barangaylegends.fwdp.org, so set Vite's base to "/" and add a public/CNAME file.

Do not implement: prestige, blessings, events, multiplayer, payments, Phaser.

Run the tests and the dev server, and fix any errors before finishing.
```

After it's live, share the link with 5 people outside the team and write down where they got stuck. That feedback sets week 2.
