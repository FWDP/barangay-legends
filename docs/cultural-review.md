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

## Reviewed

Nothing yet.
