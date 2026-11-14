# Cultural review

Barangay Legends treats Philippine mythology and history as heritage. Every being, ritual and
lore entry in `content/` carries a `tradition`, at least one source, and `"reviewed": false`
until a historian or heritage educator has checked it. This file lists everything waiting for
that review. When an entry is checked, set `"reviewed": true` in its file and move it to
"Reviewed" below with the reviewer's name (if they agree) and the date.

## Rules the content follows

- Content draws on well-documented historical lowland traditions (Tagalog, Visayan) and on the
  Sarimanok as a figure of Maranao art and story.
- Supreme deities (e.g. Bathala) appear only in story text, never as a blessing, power-up or
  reward.
- The game does not depict sacred practices of living indigenous communities. The Maranao
  tradition file therefore shows only the Sarimanok, generic wording for rituals, and no burial
  practice; a Maranao educator should review it before anything more is added.
- Filipino text was written for the game and needs a native speaker's review.

## Waiting for review

### Questions for the reviewer

1. **Tikbalang riddles** (`content/blessings/tikbalang.json`): the three riddles were written in
   the style of Tagalog *bugtong*; they are not quoted from a collection. Please replace them with
   documented bugtong (e.g. from Eugenio, *Philippine Folk Literature: The Riddles*) or confirm
   they are acceptable.
2. **Maranao tradition** (`content/traditions/maranao.json`): is it acceptable to offer Maranao as
   a "tradition" choice at all, given that the precolonial practice is not well documented and the
   living community's religion must not be depicted? If yes, what ritual and burial wording (if
   any) is appropriate?
3. **Ritual names**: "Pag-aalay" (Tagalog offering), "Halad" (Visayan offering), "Katalonan"
   (Tagalog ritual specialist, after Plasencia), "Tabi-tabi po" (asking leave of spirits).
4. **Burial styles**: the Tagalog and Visayan summaries are paraphrased from Plasencia and Scott.
5. **The Dambana**: is "dambana" a fair name for a precolonial shrine for anito offerings?
6. **Game mechanics on sacred themes**: blessings are bought with Favor earned by offerings. Is
   this framing respectful enough? (Bathala is never part of it.)

7. **Libingan looks**: the Tagalog tradition shows burial jars and the Visayan one longon
   coffins. Is jar burial a fair default for the Tagalog barangay, or should it be wooden
   coffins after Plasencia? The Maranao tradition shows jars only because the game must not
   depict the living community's burial practice; please advise. The game never uses the
   hanging coffins of Sagada or any living community's current practices.
8. **Archaeology in a game**: the Manunggul and Maitum jars are national treasures from far
   older times than the game's barangays. They appear only in the Aklat and as the look of the
   Libingan. Is that respectful, and is the dating in the lore text right?
9. **Death and mourning**: villagers can die (old age after a warning, long sickness without a
   healer, hunger after families have left, battle). It is shown gently: a small candle where
   they were, a line from the adviser, their name remembered at the Libingan.

10. **The Bahay ng Datu drawing**: the Tagalog and Visayan house is a large raised wooden house
    on thick posts with a steep thatched roof. The Maranao house is torogan-inspired: round posts
    on stones, an upswept roof, and green and gold flared beam ends with okir-like scrolls. The
    torogan belongs to a living Maranao tradition. Is a simplified, game-style version
    respectful, and are the colors and motifs reasonable? Would a Maranao artist or educator be
    willing to review or redraw it?

11. **Renown, levels and titles**: the barangay level is called Kabantugan (renown), and level
    titles for the datu are "Datu of Renown", "Datu of Many Songs", "Datu Remembered by the
    Islands" and, at the top, "Lakan of Legend" (`content/levels.json`). Is "Lakan" (a paramount
    ruler's title, after Scott) fitting as an earned game title? Are the Filipino words used for
    the new features natural: Kabantugan, Ranggo ng Kapuluan, Pinakatanyag, Tagapagtanggol,
    Kolektor ng Alamat, Bisitahin, Bumalik?
12. **Villagers' dress** (`content/lore/precolonial-dress.json`, sprites in
    `src/ui/VillagerLayer.tsx`): women in a baro and a wrapped tapis or patadyong with their hair
    tied back; men in a bahag and short kanggan, some with a putong; the malong for women and men
    in a Maranao barangay. Are these fair at map scale, and are the colors (undyed fiber, indigo,
    plant-dye reds and browns) reasonable?
13. **Women as Mandirigma**: the Mandirigma are drawn (and named) as men for now. Is there a
    sourced basis for showing women among a barangay's warriors? If so, please give the source
    and the game will add it.
14. **Social classes** (`content/traditions/*.json` "classes", `content/lore/datu-nobility.json`,
    `maharlika.json`, `timawa.json`, `alipin.json`): Tagalog maginoo, maharlika (a warrior class,
    not nobles), timawa, alipin (namamahay, sagigilid); Visayan tumao, timawa, oripun. The Maranao
    tradition uses general terms ("noble family", "warrior class", "free commoner", "dependent")
    until a reviewer gives sourced ones. Class shows only in dress details and where people live
    and work, never as a label over heads. Is the alipin entry accurate and respectful (dependents
    bound by debt or service, not chattel), and are the shares of each class (a game setting in
    `rules.json`, not a historical figure) acceptable? Should a binukot entry be added, and from
    which source?
15. **The datu's household**: the datu is drawn with a red putong, gold ornaments and a finer
    kanggan, with two attendants (dependents); the spouse is named and appears by the house. A
    datu whose name is on the women's list of default names is drawn as a woman with a husband.
    Is a woman datu a reasonable option to allow?

### Entries

| File | Kind | Tradition | Sources given |
| --- | --- | --- | --- |
| content/buildings/dambana.json | Building (shrine) | Widespread | Scott 1994; Plasencia 1589; Wikipedia: Anito |
| content/traditions/tagalog.json | Tradition | Tagalog | Plasencia 1589; Scott 1994; Ramos 1971 |
| content/traditions/visayan.json | Tradition | Visayan | Scott 1994; Boxer Codex |
| content/traditions/maranao.json | Tradition | Maranao | Wikipedia: Maranao people, Sarimanok |
| content/blessings/anito-blessing.json | Ritual | Widespread (ancestral spirits) | Scott; Plasencia; Wikipedia: Anito |
| content/blessings/diwata-favor.json | Ritual | Widespread (nature spirits) | Scott; Jocano 1969; Wikipedia: Diwata |
| content/blessings/sarimanok.json | Visitor | Maranao | Wikipedia: Sarimanok, Maranao people |
| content/blessings/bakunawa.json | Event | Visayan | Scott; Eugenio 1993; Wikipedia: Bakunawa |
| content/blessings/tikbalang.json | Event (with riddles) | Tagalog | Ramos 1971; Eugenio 1994; Wikipedia: Tikbalang |
| content/lore/balete.json | Aklat entry | Tagalog and lowland | Ramos 1971 |
| content/lore/kapre.json | Aklat entry | Tagalog and lowland | Ramos 1971 |
| content/lore/sandugo.json | Aklat entry | Widespread | Scott 1994 |
| content/lore/mangayaw.json | Aklat entry | Visayan and others | Scott 1994 |
| content/lore/babaylan.json | Aklat entry | Visayan / Tagalog | Scott; Brewer 2004; Plasencia |
| content/lore/anito.json | Aklat entry | Widespread | Scott; Plasencia |
| content/lore/bathala.json | Aklat entry (story only) | Tagalog | Plasencia; Jocano |
| content/lore/diwata.json | Aklat entry | Widespread | Scott; Jocano |
| content/lore/forest-spirits.json | Aklat entry | Widespread lowland | Ramos; Scott; Wikipedia: Nuno sa punso |
| content/lore/tikbalang.json | Aklat entry | Tagalog | Ramos |
| content/lore/sarimanok.json | Aklat entry | Maranao | Wikipedia |
| content/lore/bakunawa.json | Aklat entry | Visayan | Scott; Eugenio 1993 |
| content/lore/karakoa.json | Aklat entry | Visayan | Scott |
| content/blessings/kapres-grove.json | Passive blessing | Tagalog and lowland | Ramos 1971 |
| content/buildings/libingan.json | Building (resting place) | Widespread | Scott; Fox 1970; Wikipedia: Manunggul Jar |
| content/blessings/mourning-rite.json | Ritual (rite for the departed) | Widespread | Scott; Plasencia |
| content/lore/burial-jars.json | Aklat entry (Manunggul and Maitum jars) | Archaeological (Palawan; Sarangani) | Fox 1970; Dizon and Santiago 1996; Wikipedia |
| content/lore/longon.json | Aklat entry (longon coffins) | Visayan | Scott; Boxer Codex |
| content/lore/datu-houses.json | Lore note (datu houses, torogan) | Visayan, Tagalog; Maranao | Scott 1994; Perez, Encarnacion and Dacanay 1989; Wikipedia: Torogan, Okir |
| content/traditions/*.json "houseStyle" and src/ui/datuHouseArt.ts | How the Bahay ng Datu is drawn | Lowland (Tagalog, Visayan); torogan-inspired (Maranao) | see question 10 |
| content/levels.json | Level titles (Datu of Renown … Lakan of Legend) | Tagalog title (lakan) | see question 11 |
| content/traditions/*.json "burialLook" | How each tradition's Libingan looks | Tagalog: jars, Visayan: longon, Maranao: jars | see questions 7–8 |
| content/lore/dambana-art.json and src/ui/buildingArt.ts | Dambana art: generic form inspired by raised bamboo shrines (pinag-anituhan); needs a historical source and review; tradition-specific designs pending. | Widespread (generic) | Scott 1994; Plasencia 1589 |
| content/lore/precolonial-dress.json and src/ui/VillagerLayer.tsx | Aklat entry and villager sprites: baro, tapis/patadyong, bahag, kanggan, putong; malong (Maranao) | Tagalog, Visayan; Maranao | Scott 1994; Boxer Codex (Souza and Turley 2016); Alcina 1668 (Kobak and Gutiérrez 2002); Wikipedia: Malong |
| content/traditions/tagalog.json, visayan.json "classes" | Social class names and one-line descriptions | Tagalog, Visayan | Plasencia 1589; Scott 1994 |
| content/lore/datu-nobility.json | Aklat entry: the datu and the nobility (maginoo, tumao) | Tagalog, Visayan | Plasencia 1589; Scott 1994 |
| content/lore/maharlika.json | Aklat entry: the maharlika warrior class | Tagalog | Plasencia 1589; Scott 1994 |
| content/lore/timawa.json | Aklat entry: timawa (Tagalog commoners, Visayan retainers) | Tagalog, Visayan | Plasencia 1589; Scott 1994 |
| content/lore/alipin.json | Aklat entry: alipin and oripun, dependents (not chattel) | Tagalog, Visayan | Plasencia 1589; Scott 1994 |
| content/names.json "villagers" | Named villagers' names, split into women's and men's (everyday Tagalog and Visayan words) | Tagalog, Visayan | made up for the game; see the file's note |
| content/lore/kuta.json and src/ui/buildingArt.ts | Kuta art and lore note: precolonial fortifications (kuta/kota) drawn as a palisade with a gate and a thatched lookout; generic, the same for every tradition | Widespread | Scott 1994 |
| content/lore/settlement-layout.json and src/engine/plaza.ts | Aklat entry and map layout: precolonial settlements along rivers and coasts in kinship clusters, gathering informally in a clearing by the datu's house (drawn as an irregular open clearing with a fire pit and a shade tree); the town plaza as a Spanish colonial introduction | Widespread lowland | Scott 1994; Reed 1978; Laws of the Indies 1573 |

## Reviewed

Nothing yet.
