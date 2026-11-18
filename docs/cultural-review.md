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

1. **Tigbalang riddles** (`content/blessings/tikbalang.json`): the three riddles were written in
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
16. **Staple foods** (flag for the historian, nothing changed yet): the game makes rice the one
    staple in every tradition. Millet, taro (gabi), yams and sago were staples too, and in many
    places more common than rice. Should some traditions or islands grow other staples?
17. **The ritual specialist's name** (`src/ui/traditionNames.ts`): the healer's hut is called
    Babaylan's Hut in Visayan barangays, Katalonan's Hut in Tagalog ones and Healer's Hut in
    Maranao ones and before a tradition is chosen. Is "katalonan" (Plasencia's catalonan) the
    right Tagalog form, and is there a sourced Maranao term to use?
18. **The anito of the balete and the tigbalang** (`content/lore/anito-ng-balete.json`,
    `tikbalang.json`): the colonial word "kapre" and the cigar-smoking giant are left out, and the
    tigbalang keeps Plasencia's name and no horse head. Are the explanations in the Aklat accurate?
    The balete spirit is drawn as a glow, a faint shape and rustling leaves; the tigbalang as a
    tall dark figure between trunks.
19. **How children learned** (`content/lore/learning-by-family.json`, `oral-epics.json`,
    `baybayin.json`, the lessons in `content/villagers/talambuhay.json`): there is no school
    building; elders teach children by the evening fire at the datu's clearing (drawn, no words).
    Is it fair to show every tradition's elders teaching "the long epic" and baybayin, or should
    lessons follow the tradition (the Darangen only for Maranao barangays, baybayin for Tagalog
    and Visayan ones)? Is the UNESCO wording on the Darangen and the Mindoro and Palawan scripts
    accurate, and respectful of the communities who still keep them?
20. **Elders' titles**: the timeline says "Learned the old songs from Ines", without "Lola" or
    "Lolo" (Spanish-derived). Is there a precolonial form of address for elders (e.g. "Apo",
    "Impo", "Ingkong") the game should use?

21. **The Kamalig** (`content/lore/kamalig.json`, its art): is a raised, thatched granary with
    woven bamboo walls a fair generic form for lowland Tagalog and Visayan barangays? Is the note
    that rice was kept unhusked in the sheaf and pounded daily accurate (Scott 1994), and is the
    mention of the Ifugao alang (Barton 1922) appropriate, or should the entry stay with the
    lowlands?

22. **Bantayan and Kuta** (`content/lore/bantayan.json`, `kuta.json`): the game splits defense into
    a watchtower at the shore and a palisaded refuge near the datu's house. Is there evidence for
    precolonial wooden watchtowers (as opposed to Spanish-era stone ones), and for alarms by horn
    (tambuli), drum, gong and fire? Is the description of Rajah Sulayman's Maynila (1570) fair?
    No crew sizes or population shares are stated as fact.
23. **Weapons by tradition** (`src/ui/VillagerLayer.tsx`): Maranao warriors draw a kampilan,
    Maranao raiders a kris; Tagalog and Visayan warriors a spear, raiders a shield and blade. The
    Sulu tradition isn't in the game. Are these fair, and what would fit the lowland traditions
    better (e.g. the kalasag shield, the bangkaw spear)?
24. **Pangayaw and captives** (`content/lore/mangayaw.json`): the entry says raids historically
    sought captives (bihag) who became dependents, along with gold and trade goods. Is this
    accurate and respectfully put?

25. **Tambuli and budyong** (`content/lore/tambuli.json`): is "tambuli" (horn, often of a water
    buffalo) right for the Tagalog barangay and "budyong" (conch trumpet) for the Visayan one?
    Was the water buffalo widespread before contact? Is there a better-sourced account of signal
    fires and drums along the coast?

26. **Food staples** (`content/lore/gabi.json`, `kaingin-food.json`, `saging.json`, `lumbia.json`,
    `niyog.json`): the game makes root crops and other starches (gabi, ube, tugi, dawa, sago,
    starchy bananas) the everyday food and rice a prestige grain, eaten daily only in some
    lowland river basins (Scott 1994). Is this fair for each tradition? Is the Visayan and
    Maranao lean toward sago and root crops, and the Tagalog lean toward rice, right?
27. **Rice as a prestige food** (`content/lore/palay-prestige.json`): rice for feasts, offerings,
    rice wine, bride-price and the datu's household. Is "pagkaing may dangal" an apt Filipino
    phrase, and is the Manila Bay example fair?
28. **Fishing, salt, hunting and animals** (`pangingisda.json`, `pangangalap.json`, `asin.json`,
    `baklad.json`, `pangangaso.json`, `babuyan.json`): is "baklad" (a Tagalog term) right as the
    general name for fish corrals? **Pork customs by tradition**: Maranao barangays keep chickens
    only (`content/traditions/maranao.json` "pigs": false); are pigs right for the Tagalog and
    Visayan barangays, and for feasts and offerings?
29. **Feasts and rice wine** (`content/lore/pista-tapay.json`): is "tapay" (Tagalog) and "pangasi"
    (Visayan) right for rice wine? **Distilled drinks** such as lambanog may be later and are not
    in the game: please confirm.
30. **How food was kept** (`content/lore/food-storage.json`): kamalig for grain, dried goods and
    salt; root crops left in the ground; household jars (tapayan, banga) of bagoong, salted fish
    and palm wine; smoked fish on racks over the hearth; baklad corrals. Is this fair?
31. **Greens and seasonings to check**: which greens were present before contact (for example
    malunggay)? Okra is likely post-contact and is left out. **Garlic and onions** are not shown
    yet: were they present before contact? **Chilies** came from the Americas after contact and
    are never shown, nor camote (sweet potato) or corn.
32. **Dish names**: the game uses no dish names of Spanish origin (no "adobo"). If dishes are named
    later, which native names (e.g. kinilaw) are well sourced?
33. **Women rulers** (`content/lore/women-rulers.json`, `content/traditions/tagalog.json`
    womanHonorific): is "Dayang" right as an honorific a Tagalog woman ruler might be called
    (Noceda and Sanlúcar 1754; Scott 1994)? Is there a sourced Visayan one? "Bai" is a
    Maranao/Maguindanao title and is not used for Tagalog or Visayan barangays (and not yet for
    Maranao ones either, until sourced). Individual names are flagged, not presented as certain:
    Dayang Kalangitan (partly from genealogical tradition) and "Queen Sima" (usually placed in
    Java, not Cotabato).
34. **Ritual specialists, women and men** (`content/lore/ritual-specialists-gender.json`): most
    babaylan and katalonan were women; some were men who took on women's dress and roles,
    recorded as asog (Visayan) and bayoguin (Tagalog). Is the wording accurate and respectful? It
    avoids modern labels and describes what the sources record; the Spanish sources are often
    hostile. Are the terms right for each tradition?
35. **Suyak** (`content/lore/suyak.json`, `content/buildings/suyak.json`): is "suyak" the right
    term for sharpened bamboo stakes, and for which traditions? Is their use around settlements
    and approaches well sourced?
36. **The house and bayanihan** (`content/lore/bahay-kubo.json`, `content/lore/bayanihan.json`,
    `src/ui/foodArt.ts` kuboSvg): does the word "kubo" have a Spanish origin (and should the game
    name the house differently)? How far back is carrying a house together documented (it is well
    known from later records and art)? Are the house's parts (haligi, amakan, hagdan, silong,
    batalan) fair for the Tagalog and Visayan barangays?
37. **War, captives and feuds** (`content/lore/raiding.json`, `captives-ransom.json`,
    `blood-debts.json`, `blood-price.json`, `peace-rituals.json`, engine/warfare.ts and feud.ts):
    is it fair that raids sought goods, captives and prestige and that battles ended when one side
    broke? Is the honest note that unransomed captives could become dependents (alipin) well put?
    Is "utang na dugo" and "bayad sa dugo" right for the Tagalog and Visayan barangays, and are
    the heirloom goods (gongs, porcelain, fine textiles) named as the historical blood price fair?
    The game avoids "wergild" (Germanic) and "adat" (Muslim and Malay contexts) for Tagalog and
    Visayan barangays.
38. **The mourning raid** (`engine/region.ts` mourningRaid): an AI barangay may raid a rival after
    its datu dies (a Visayan practice). Is the practice and its name well sourced, and should it
    be limited to Visayan barangays?
39. **Honor marks** (`content/traditions/*.json` honorMark, `content/lore/warrior-honor.json`):
    batok for Visayan warriors; gold ornaments for Tagalog and Maranao warriors. What did each
    tradition actually use (e.g. colored headcloths)?
40. **Music, dances, games and betel** (`content/lore/music.json`, `dances.json`, `games.json`,
    `betel.json`, `feasts-social.json`, `cockfighting.json`): sources found so far include summaries
    and folklore sites. Game names by tradition: tubigan or harangang-taga (Tagalog) and tadlas
    (Visayan) for the lines-and-runners game, never "patintero"; sungka, noting the older kunggit;
    luksong tinik and buno for Tagalog barangays; no bagbagto for lowland barangays; no names of
    Spanish origin (trumpo, arnis, eskrima, balagtasan): the activities are described instead.
    Kulintang only for Maranao and other Mindanao traditions. Cockfighting and wagering are told
    only as recorded history (Pigafetta 1521), never as gameplay. Terms still to check before any
    use: magahat, larao, barote, sumpit, barong.

41. **Trade between the coast and upriver** (`content/lore/precolonial-trade.json`,
    `engine/tradeOffers.ts`): barter, gold by weight as the measure of value, salt and fish from
    the coast for forest goods, root crops, hardwood and gold from upriver (Bronson's
    upstream-downstream model, Junker 1999). Is gold as the general measure of value fair for all
    the traditions, and are "tuyong isda", "bagoong", "lamang-ugat" and "matigas na kahoy" apt
    names in the offers? Beeswax, resin and rattan are left for later.

### Notes for the future

- **Earth spirits**: if spirits of the ground are added, use precolonial names (for example the
  nuno sa punso) and the *tabi-tabi po* custom of asking leave, not later names.
- **The aswang**: not in the game. If it is ever added, never tie it to women or to the babaylan:
  that link is a colonial demonization of women ritual specialists (see Brewer 2004).
- **No engkanto or duwende** for now (later, partly Spanish-derived figures).

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
| content/blessings/tikbalang.json | Event (with riddles): the tigbalang (shown as "Tigbalang"; the id stays tikbalang) | Tagalog | Plasencia 1589; Ramos 1971; Eugenio 1994 |
| content/lore/balete.json | Aklat entry | Tagalog and lowland | Ramos 1971 |
| content/lore/anito-ng-balete.json (was kapre.json) | Aklat entry: the spirit of the balete, and the colonial origin of the word "kapre" (Spanish cafre, from Arabic kafir) and of the cigar-smoking giant image; drawn as a glow, rustling leaves and a faint shape in the tree | Tagalog and lowland | Plasencia 1589; Scott 1994; Ramos 1971 |
| content/lore/babaylan.json | Aklat entry | Visayan / Tagalog | Scott; Brewer 2004; Plasencia |
| content/lore/anito.json | Aklat entry | Widespread | Scott; Plasencia |
| content/lore/bathala.json | Aklat entry (story only) | Tagalog | Plasencia; Jocano |
| content/lore/diwata.json | Aklat entry | Widespread | Scott; Jocano |
| content/lore/forest-spirits.json | Aklat entry | Widespread lowland | Ramos; Scott; Wikipedia: Nuno sa punso |
| content/lore/tikbalang.json | Aklat entry: the tigbalang (name as in Plasencia 1589), a tall shadowy forest phantom; the horse-headed image as later folklore (no horses before the Spanish); drawn as a dark figure between trunks | Tagalog | Plasencia 1589; Scott 1994; Ramos 1971 |
| content/lore/sarimanok.json | Aklat entry | Maranao | Wikipedia |
| content/lore/bakunawa.json | Aklat entry | Visayan | Scott; Eugenio 1993 |
| content/lore/karakoa.json | Aklat entry | Visayan | Scott |
| content/blessings/anito-ng-balete.json (was kapres-grove.json) | Passive blessing: the Anito ng Balete's grove | Tagalog and lowland | Plasencia 1589; Scott 1994; Ramos 1971 |
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
| content/lore/kuta.json and src/ui/buildingArt.ts | Aklat entry and Kuta art: a palisaded refuge (kuta/kota) where people gathered and warriors set out, drawn as a palisaded enclosure with a gate and a thatched shelter inside (no tower); Rajah Sulayman's palisaded Maynila, 1570; generic, the same for every tradition | Widespread | Scott 1994; Relation of the Voyage to Luzon 1570 (Blair and Robertson vol. 3) |
| content/lore/bantayan.json, content/buildings/bantayan.json and src/ui/buildingArt.ts | Aklat entry, building and art: a bamboo watchtower whose lookouts (bantay) see war boats and raise the alarm (horn, drum, signal fire). Precolonial wooden watchtowers are less documented than the Spanish-era stone ones (left out); see question 22 | Widespread (coastal and riverine) | Scott 1994 |
| content/lore/mangayaw.json | Aklat entry: raids sought captives (bihag) who became dependents, with gold and trade goods; captives stay abstract in play | Visayan and others | Scott 1994; Alcina 1668 |
| content/lore/sandugo.json | Aklat entry: an alliance between leaders, possibly between equals (Sikatuna and Legazpi, 1565) | Widespread | Scott 1994; Legazpi 1565 (Blair and Robertson vol. 2) |
| src/ui/VillagerLayer.tsx (drawKampilan, raiders' kris) | Weapons by tradition: Maranao warriors carry a kampilan, Maranao raiders a kris; others a spear, or a shield and blade | Maranao; lowland | see question 23 |
| src/ui/buildingArt.ts (healer's hut, fishing landing, woodcutters' camp, Tulay) | Building art: a raised thatched hut with herbs drying under the eaves and clay jars; a bamboo landing with a bangka, a bubo fish trap and a net; cut timber with a bolo in a stump and an adze; a bamboo footbridge. Generic, for every tradition; replaces a fishing rod with a reel, a steel axe and a plant icon | Widespread lowland | Scott 1994 |
| Interface symbols (see the S prompt summary) | Era check of emoji: no candles (the Dambana's art, a burial jar for mourning), no railway track for the Daan (footprints), no padlock, ring, crown, dove, wrapped present, megaphone or snare drum (a gong is drawn) | n/a | n/a |
| content/lore/settlement-layout.json and src/engine/plaza.ts | Aklat entry and map layout: precolonial settlements along rivers and coasts in kinship clusters, gathering informally in a clearing by the datu's house (drawn as an irregular open clearing with a fire pit and a shade tree); the town plaza as a Spanish colonial introduction | Widespread lowland | Scott 1994; Reed 1978; Laws of the Indies 1573 |
| content/lore/learning-by-family.json and engine/talambuhay.ts (teach) | Aklat entry and evening lessons: no schools before the Spanish; children learned from family, by apprenticeship and from elders by the fire | Widespread lowland (Tagalog, Visayan) | Scott 1994; Chirino 1604 |
| content/lore/oral-epics.json | Aklat entry: oral epics (the Maranao Darangen; Hinilawod, Hudhud); the game does not quote or retell the Darangen | Maranao; Visayan; Ifugao | UNESCO 2005/2008; MSU Folklore Division, Darangen (1986–1995); Eugenio 2001 |
| content/lore/baybayin.json | Aklat entry: baybayin and the living related scripts of Mindoro and Palawan | Tagalog, Visayan; Hanunó'o, Buhid, Tagbanwa | Chirino 1604; Scott 1994; UNESCO Memory of the World 1999 |
| content/villagers/talambuhay.json | Life-story templates: skills, personal details, family sentences, life events and the lessons elders teach. Skills are open to women and men alike (fighting only to the Mandirigma, men for now). Elders are called by name, not "Lola/Lolo" (Spanish-derived) | Widespread lowland | Scott 1994; see questions 19–20 |
| content/lore/kamalig.json and src/ui/buildingArt.ts (kamaligSvg) | Aklat entry and Kamalig art: a granary raised on posts, woven bamboo walls, steep thatched roof, ladder, palay sheaves; wider on more posts at levels 2-3. Generic, the same for every tradition | Widespread lowland (Tagalog, Visayan) | Scott 1994; Noceda and Sanlúcar 1754; Barton 1922 |
| content/lore/tambuli.json and src/ui/EventBanners.tsx (TambuliIcon) | Aklat entry and icon: the tambuli (horn) and budyong (conch trumpet) blown to call for help; drums and fires passing warnings; the call-for-help action | Tagalog (tambuli), Visayan (budyong) | Scott 1994; see question 25 |
| content/lore/gabi.json, content/lore/kaingin-food.json, content/lore/saging.json, content/lore/lumbia.json, content/lore/niyog.json and content/buildings (gabihan, kaingin, sagingan, lumbia, niyugan) | Aklat entries and food buildings: root crops, millet, sago, starchy bananas and coconuts as everyday food; kaingin plots that tire and rest back to forest; no camote, corn or chilies | Widespread; sago more Visayan and Maranao | Scott 1994; Alcina 1668; Spencer 1966; Pigafetta 1521; see questions 26 and 31 |
| content/lore/palay-prestige.json and content/buildings/palayan.json | Aklat entry: rice as a prestige food (feasts, offerings, rice wine, bride-price, the datu's household); villagers eat it only when there is no other food | Widespread; Tagalog river basins grew more | Scott 1994; Plasencia 1589; Alcina 1668; see question 27 |
| content/lore/pangingisda.json, content/lore/pangangalap.json, content/lore/asin.json, content/lore/baklad.json, content/lore/pangangaso.json, content/lore/babuyan.json and content/buildings (fishing-dock as the Pangisdaan, pangangalap, asinan, baklad, pangangaso, babuyan) | Aklat entries and buildings: fishing with bubo and nets from a bangka, shore gathering at low tide, salt-making, fish corrals, hunting boar and deer, pigs and chickens (chickens only for Maranao) | Widespread; pork customs by tradition | Scott 1994; Alcina 1668; see question 28 |
| content/lore/pista-tapay.json and engine/food.ts (holdPista, brewWine) | Aklat entry and action: the Pista for a harvest, victory, marriage, peace or the end of mourning; rice wine (tapay, pangasi) brewed from Palay; no distilled drinks | Widespread (Tagalog tapay, Visayan pangasi) | Scott 1994; Pigafetta 1521; Alcina 1668; see question 29 |
| content/lore/food-storage.json and engine/food.ts (foodCaps, feed) | Aklat entry and rules: kamalig for grain, dried goods and salt; root crops in the ground; household jars and smoking racks; baklad keeping fish alive | Widespread lowland | Scott 1994; Alcina 1668; see question 30 |
| src/ui/foodArt.ts and src/ui/resourceArt.tsx | Art for the food buildings (taro patch, swidden with yams and millet, banana stand, sago palms and trough, coconut palms, shore basket, hunters' lean-to, pen with pig or chickens, salt beds, fish corral) and for Pagkain (a bilao with gabi, banana and fish), Palay (a sheaf), Asin and rice wine (a tapayan). Generic, the same for every tradition | Widespread | Scott 1994 |
| content/traditions/*.json foodYield, pigs | Which food each tradition grows more of (rice for the Tagalog; root crops and sago for the Visayans and Maranao) and whether pigs are kept; playtest numbers, not a historical claim | Tagalog, Visayan, Maranao | see questions 26 and 28 |
| content/lore/women-rulers.json, content/traditions/tagalog.json (womanHonorific) and engine/household.ts | Aklat entry and rule: the ruler can be a woman or a man; bilateral inheritance; "Datu" for both, "Dayang" offered only for a Tagalog woman ruler; individual historical names flagged | Widespread lowland; Dayang (Tagalog) | Scott 1994; Plasencia 1589; Boxer Codex; Brewer 2004; Noceda and Sanlúcar 1754; see question 33 |
| content/lore/ritual-specialists-gender.json | Aklat entry: ritual specialists were mostly women; some were men in women's dress and roles (asog, bayoguin), respected; standing from lineage, wealth and skill more than sex; no modern labels, no jokes | Visayan, Tagalog | Scott 1994; Brewer 2004; Alcina 1668; Boxer Codex; San Antonio 1738–1744; see question 34 |
| content/lore/suyak.json, content/buildings/suyak.json and src/ui/buildingArt.ts (SUYAK) | Aklat entry, building and art: sharpened bamboo stakes at the shore that slow raiders; term flagged | Widespread (term flagged) | Scott 1994; Alcina 1668; see question 35 |
| content/lore/bahay-kubo.json, content/lore/bayanihan.json and src/ui/foodArt.ts (kuboSvg) | Aklat entries and house art: a rectangular house on posts with a steep thatched roof, woven walls, slatted floor, ladder (pulled up at night and in a raid) and a silong; moving a house together (bayanihan) | Widespread lowland; bayanihan from later records | Scott 1994; Boxer Codex; Alcina 1668; CCP Encyclopedia 1994; see question 36 |
| content/lore/raiding.json, content/lore/captives-ransom.json and engine/warfare.ts | Aklat entries and rules: raids for goods, captives and prestige; battles end when one side breaks; most hurt are wounded; captives ransomed and always home in play (historically some became dependents) | Widespread | Scott 1994; Junker 1999; Alcina 1668; Plasencia 1589; see question 37 |
| content/lore/blood-debts.json, content/lore/blood-price.json, content/lore/peace-rituals.json and engine/feud.ts | Aklat entries and rules: blood debts and feuds, mediation by a go-between, a blood price (historically heirloom goods; gold, Palay and rice wine in play for now), peace sealed by sandugo, a shared feast or marriage | Widespread (Tagalog, Visayan) | Scott 1994; Plasencia 1589; Junker 1999; Pigafetta 1521; see questions 37-38 |
| content/lore/warrior-honor.json, content/traditions/*.json honorMark and src/ui/VillagerLayer.tsx (drawHonor) | Aklat entry and sprites: warriors' honor; batok drawn for Visayan warriors, gold ornaments elsewhere | Visayan; others flagged | Scott 1994; Alcina 1668; Boxer Codex; see question 39 |
| content/lore/music.json, content/lore/dances.json, content/lore/games.json, content/lore/betel.json, content/lore/feasts-social.json, content/lore/cockfighting.json, src/ui/socialArt.ts and engine/social.ts | Aklat entries, art and evening life: gongs, kulintang (Maranao), flutes, dances, children's play and games (names by tradition, flagged), betel chewing, feasts; cockfighting and wagering as history only, no gambling in play | Widespread; names by tradition | Pigafetta 1521; Alcina 1668; Scott 1994; Junker 1999; see question 40 |
| content/lore/precolonial-trade.json, content/rules.json (diplomacy.offers) and engine/tradeOffers.ts | Aklat entry and trade offers: barter between coast and upriver; coastal barangays offer Asin and fish for hardwood, Palay and gold; upriver ones gold, root crops and hardwood for Asin and fish; food asked after a poor harvest or flood; gold as the measure of value; Palay valued highly | Widespread (coastal and upriver) | Scott 1994; Junker 1999; Bronson 1977; see question 41 |

## Reviewed

Nothing yet.
