// How each building looks wherever it is drawn: the map (the player's, visits and replays), the
// build toolbar, the share card. Most buildings are their emoji icon; a Tulay is drawn as its
// deck and has no icon on the map; a few have custom flat SVG art instead (generic for now, the
// same for every tradition: see docs/cultural-review.md). Display only.
import type { BuildingDef } from "../engine/content";

/**
 * The Dambana: a small shrine raised on thin bamboo poles, a thatched roof with a hanging fringe
 * of dried grass, and small offerings (a bowl of rice, a leaf bundle) on its platform. A generic,
 * modest form, not any one community's shrine.
 */
const DAMBANA = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <g stroke="#5b3a1e" stroke-width="2.2" stroke-linecap="round">
    <line x1="20" y1="36" x2="18" y2="61"/><line x1="44" y1="36" x2="46" y2="61"/>
    <line x1="27" y1="37" x2="26" y2="61"/><line x1="37" y1="37" x2="38" y2="61"/>
  </g>
  <g stroke="#8a6a35" stroke-width="1.2"><line x1="18" y1="52" x2="46" y2="52"/></g>
  <rect x="14" y="33" width="36" height="5" rx="1" fill="#b98a4a" stroke="#6b4423" stroke-width="1"/>
  <g stroke="#8a6a35" stroke-width="0.8"><line x1="18" y1="33" x2="18" y2="38"/><line x1="24" y1="33" x2="24" y2="38"/><line x1="30" y1="33" x2="30" y2="38"/><line x1="36" y1="33" x2="36" y2="38"/><line x1="42" y1="33" x2="42" y2="38"/><line x1="46" y1="33" x2="46" y2="38"/></g>
  <g stroke="#5b3a1e" stroke-width="1.6"><line x1="19" y1="33" x2="19" y2="20"/><line x1="45" y1="33" x2="45" y2="20"/></g>
  <path d="M32 4 L54 21 L10 21 Z" fill="#d4a94e" stroke="#a87c2c" stroke-width="1.2" stroke-linejoin="round"/>
  <path d="M32 4 L32 21" stroke="#a87c2c" stroke-width="0.9"/>
  <g stroke="#b38a3a" stroke-width="1.3" stroke-linecap="round">
    <line x1="12" y1="21" x2="11" y2="27"/><line x1="16" y1="21" x2="15.5" y2="28"/><line x1="20" y1="21" x2="20" y2="26"/>
    <line x1="24" y1="21" x2="24" y2="28"/><line x1="28" y1="21" x2="28.5" y2="26"/><line x1="32" y1="21" x2="32" y2="28"/>
    <line x1="36" y1="21" x2="35.5" y2="26"/><line x1="40" y1="21" x2="40" y2="28"/><line x1="44" y1="21" x2="44.5" y2="26"/>
    <line x1="48" y1="21" x2="48.5" y2="28"/><line x1="52" y1="21" x2="53" y2="27"/>
  </g>
  <path d="M24 33 Q24 28 30 28 Q36 28 36 33 Z" fill="#7a4a2a"/>
  <ellipse cx="30" cy="28.5" rx="5" ry="1.8" fill="#f5f0e1"/>
  <path d="M38 33 C38 28 44 27 44 31 C42 30 40 31 40 33 Z" fill="#4d7c0f"/>
  <path d="M39 33 L43 28" stroke="#365314" stroke-width="0.8"/>
</svg>`;

/**
 * The Kuta: a small enclosure of sharpened timber stakes with a gate, and a raised lookout
 * platform with a thatched roof and a ladder. Generic, for every tradition.
 */
const KUTA = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <g stroke="#5b3a1e" stroke-width="1.8"><line x1="40" y1="12" x2="40" y2="44"/><line x1="54" y1="12" x2="54" y2="44"/></g>
  <rect x="38" y="20" width="18" height="3.5" fill="#a07a45" stroke="#6b4423" stroke-width="0.8"/>
  <path d="M47 5 L58 13 L36 13 Z" fill="#d4a94e" stroke="#a87c2c" stroke-width="1" stroke-linejoin="round"/>
  <g stroke="#b38a3a" stroke-width="1" stroke-linecap="round"><line x1="38" y1="13" x2="38" y2="16"/><line x1="42" y1="13" x2="42" y2="16.5"/><line x1="46" y1="13" x2="46" y2="16"/><line x1="50" y1="13" x2="50" y2="16.5"/><line x1="54" y1="13" x2="54" y2="16"/></g>
  <g stroke="#7a4f2a" stroke-width="1.1"><line x1="33" y1="44" x2="38" y2="22"/><line x1="37" y1="44" x2="42" y2="22"/><line x1="34" y1="38" x2="38.4" y2="38"/><line x1="35.3" y1="32" x2="39.7" y2="32"/><line x1="36.6" y1="26" x2="41" y2="26"/></g>
  <g fill="#8b5a2b" stroke="#4a2f17" stroke-width="0.8">
    <path d="M4 60 V36 L6 31 L8 36 V60 Z"/><path d="M8 60 V34 L10 29 L12 34 V60 Z"/><path d="M12 60 V36 L14 31 L16 36 V60 Z"/>
    <path d="M16 60 V35 L18 30 L20 35 V60 Z"/><path d="M20 60 V36 L22 31 L24 36 V60 Z"/>
    <path d="M40 60 V36 L42 31 L44 36 V60 Z"/><path d="M44 60 V35 L46 30 L48 35 V60 Z"/><path d="M48 60 V36 L50 31 L52 36 V60 Z"/>
    <path d="M52 60 V35 L54 30 L56 35 V60 Z"/><path d="M56 60 V36 L58 31 L60 36 V60 Z"/>
  </g>
  <rect x="24" y="40" width="16" height="20" fill="#3b2414"/>
  <g fill="#9a6a35" stroke="#4a2f17" stroke-width="0.6"><rect x="24" y="40" width="5" height="20"/><rect x="35" y="40" width="5" height="20"/></g>
  <path d="M23 40 H41" stroke="#4a2f17" stroke-width="2"/>
  <g stroke="#6b4423" stroke-width="1"><line x1="4" y1="46" x2="24" y2="46"/><line x1="40" y1="46" x2="60" y2="46"/></g>
</svg>`;

/**
 * The ritual specialist's hut (Babaylan's hut, or the tradition's own name): a small hut raised on
 * stilts with a steep thatched roof, bundles of medicinal herbs drying under the eaves, a ladder,
 * and clay jars on the ground beside it.
 */
const HEALER_HUT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <g stroke="#5b3a1e" stroke-width="2.2" stroke-linecap="round"><line x1="17" y1="38" x2="16" y2="58"/><line x1="29" y1="39" x2="29" y2="58"/><line x1="41" y1="38" x2="42" y2="58"/></g>
  <rect x="12" y="27" width="34" height="13" fill="#c9a26b" stroke="#6b4423" stroke-width="1"/>
  <g stroke="#8a6a35" stroke-width="0.7"><line x1="17" y1="27" x2="17" y2="40"/><line x1="22" y1="27" x2="22" y2="40"/><line x1="36" y1="27" x2="36" y2="40"/><line x1="41" y1="27" x2="41" y2="40"/></g>
  <rect x="25" y="29" width="7" height="11" fill="#4a2f17"/>
  <path d="M29 4 L51 28 L7 28 Z" fill="#c8a24a" stroke="#9a7428" stroke-width="1.2" stroke-linejoin="round"/>
  <g stroke="#a8842f" stroke-width="0.8"><line x1="29" y1="4" x2="20" y2="28"/><line x1="29" y1="4" x2="38" y2="28"/></g>
  <g stroke-linecap="round"><line x1="12" y1="28" x2="12" y2="33" stroke="#7a5a2a" stroke-width="0.8"/><path d="M10 33 q2 5 4 0 z" fill="#4d7c0f"/>
    <line x1="46" y1="28" x2="46" y2="33" stroke="#7a5a2a" stroke-width="0.8"/><path d="M44 33 q2 5 4 0 z" fill="#65a30d"/>
    <line x1="49" y1="27" x2="49" y2="31" stroke="#7a5a2a" stroke-width="0.8"/><path d="M47.5 31 q1.5 4 3 0 z" fill="#3f6212"/></g>
  <g stroke="#7a4f2a" stroke-width="1.1"><line x1="31" y1="58" x2="33" y2="40"/><line x1="35" y1="58" x2="37" y2="40"/><line x1="31.6" y1="52" x2="35.6" y2="52"/><line x1="32.3" y1="46" x2="36.3" y2="46"/></g>
  <path d="M46 58 q-4 0 -4 -5 q0 -4 3 -5 h2 q3 1 3 5 q0 5 -4 5 z" fill="#a0522d" stroke="#6b3418" stroke-width="0.8"/>
  <rect x="44.5" y="46.5" width="4" height="2" rx="0.6" fill="#7c3f1d"/>
  <path d="M55 58 q-3 0 -3 -4 q0 -3 2.5 -3.5 h1 q2.5 .5 2.5 3.5 q0 4 -3 4 z" fill="#b5653a" stroke="#6b3418" stroke-width="0.8"/>
</svg>`;

/**
 * The fishing landing: a small bamboo platform on posts at the water's edge, a bangka drawn up
 * beside it, a conical woven fish trap (bubo) and a net hung to dry. No rod or reel.
 */
const FISHING_DOCK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <path d="M2 50 Q16 46 32 50 T62 50 V62 H2 Z" fill="#38bdf8" opacity="0.55"/>
  <g stroke="#5b3a1e" stroke-width="2" stroke-linecap="round"><line x1="10" y1="40" x2="10" y2="56"/><line x1="24" y1="40" x2="24" y2="57"/><line x1="38" y1="40" x2="38" y2="56"/></g>
  <rect x="6" y="37" width="36" height="4" rx="1" fill="#c9a26b" stroke="#6b4423" stroke-width="0.9"/>
  <g stroke="#8a6a35" stroke-width="0.6"><line x1="12" y1="37" x2="12" y2="41"/><line x1="18" y1="37" x2="18" y2="41"/><line x1="30" y1="37" x2="30" y2="41"/><line x1="36" y1="37" x2="36" y2="41"/></g>
  <path d="M30 52 Q44 58 60 51 L58 48 Q44 52 32 49 Z" fill="#8b5a2b" stroke="#4a2f17" stroke-width="0.9"/>
  <line x1="36" y1="47" x2="58" y2="45" stroke="#6b4423" stroke-width="1"/>
  <path d="M8 36 L20 28 L22 31 L10 37 Z" fill="#d6b67a" stroke="#8a6a35" stroke-width="0.8"/>
  <g stroke="#8a6a35" stroke-width="0.5"><line x1="11" y1="34" x2="13" y2="36"/><line x1="14" y1="32" x2="16" y2="34"/><line x1="17" y1="30" x2="19" y2="32"/></g>
  <ellipse cx="21" cy="29.5" rx="1.8" ry="2.4" fill="#a8844a" stroke="#8a6a35" stroke-width="0.6"/>
  <g stroke="#5b3a1e" stroke-width="1.4"><line x1="44" y1="38" x2="46" y2="12"/><line x1="58" y1="38" x2="56" y2="12"/><line x1="45" y1="14" x2="57" y2="14"/></g>
  <path d="M45.5 14 L56.5 14 L55 34 L47 34 Z" fill="none" stroke="#78716c" stroke-width="0.7"/>
  <g stroke="#78716c" stroke-width="0.5"><line x1="46" y1="19" x2="56" y2="19"/><line x1="46.4" y1="24" x2="55.6" y2="24"/><line x1="46.8" y1="29" x2="55.2" y2="29"/><line x1="48.5" y1="14" x2="48.6" y2="34"/><line x1="51" y1="14" x2="51" y2="34"/><line x1="53.5" y1="14" x2="53.4" y2="34"/></g>
  <path d="M26 33 q3 -3 6 0 q-3 3 -6 0 z M32 33 l2 -1.6 v3.2 z" fill="#94a3b8"/>
</svg>`;

/**
 * The woodcutters' camp: a stack of cut timber, a bolo (itak) set in a chopping stump and an
 * adze leaning on the stack. No steel axe.
 */
const WOODCUTTER_CAMP = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <g stroke="#5b3a1e" stroke-width="0.9">
    <rect x="6" y="46" width="34" height="7" rx="3.5" fill="#a0703c"/><rect x="6" y="39" width="34" height="7" rx="3.5" fill="#b07d45"/>
    <rect x="11" y="32" width="26" height="7" rx="3.5" fill="#a0703c"/>
  </g>
  <g fill="#e6c48a" stroke="#8a5a2b" stroke-width="0.8"><circle cx="9.5" cy="49.5" r="3"/><circle cx="9.5" cy="42.5" r="3"/><circle cx="14.5" cy="35.5" r="3"/></g>
  <g fill="none" stroke="#b07d45" stroke-width="0.5"><circle cx="9.5" cy="49.5" r="1.4"/><circle cx="9.5" cy="42.5" r="1.4"/><circle cx="14.5" cy="35.5" r="1.4"/></g>
  <path d="M44 58 V48 Q51 45 58 48 V58 Z" fill="#8b5a2b" stroke="#4a2f17" stroke-width="0.9"/>
  <ellipse cx="51" cy="48" rx="7" ry="2.4" fill="#e6c48a" stroke="#8a5a2b" stroke-width="0.8"/>
  <path d="M50 47 L46 30 Q45 26 48 27 L53 46 Z" fill="#cbd5e1" stroke="#475569" stroke-width="0.8"/>
  <rect x="45.2" y="22" width="3.4" height="7" rx="1.2" fill="#6b4423" transform="rotate(-14 47 25)"/>
  <line x1="40" y1="56" x2="34" y2="22" stroke="#6b4423" stroke-width="2" stroke-linecap="round"/>
  <path d="M31 20 L38 21 L37.5 24.5 L32 23.5 Z" fill="#94a3b8" stroke="#475569" stroke-width="0.7"/>
  <g fill="#d6b67a" opacity="0.9"><path d="M20 58 l3 -2 l1 2 z"/><path d="M27 59 l2 -2.5 l1.5 2.5 z"/></g>
</svg>`;

/** A Tulay, for the build toolbar: a bamboo footbridge on posts with a handrail over water. */
const TULAY = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <path d="M2 44 Q16 40 32 44 T62 44 V62 H2 Z" fill="#38bdf8" opacity="0.6"/>
  <g stroke="#5b3a1e" stroke-width="2" stroke-linecap="round"><line x1="10" y1="22" x2="10" y2="56"/><line x1="32" y1="24" x2="32" y2="58"/><line x1="54" y1="22" x2="54" y2="56"/></g>
  <path d="M4 36 Q32 30 60 36" fill="none" stroke="#b9934f" stroke-width="5" stroke-linecap="round"/>
  <path d="M4 36 Q32 30 60 36" fill="none" stroke="#8a6a35" stroke-width="0.7"/>
  <path d="M6 24 Q32 18 58 24" fill="none" stroke="#a07a45" stroke-width="2" stroke-linecap="round"/>
  <g stroke="#a07a45" stroke-width="1"><line x1="18" y1="22" x2="18" y2="34"/><line x1="25" y1="21" x2="25" y2="33"/><line x1="39" y1="21" x2="39" y2="33"/><line x1="46" y1="22" x2="46" y2="34"/></g>
</svg>`;

const url = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace(/\s+/g, " "))}`;

const ART: Record<string, string> = {
  dambana: url(DAMBANA),
  kuta: url(KUTA),
  "babaylan-hut": url(HEALER_HUT),
  "fishing-dock": url(FISHING_DOCK),
  "woodcutter-camp": url(WOODCUTTER_CAMP),
  tulay: url(TULAY),
};

/** Custom art for a building type, as an image URL, or null (it is drawn as its icon). */
export const buildingArtUrl = (type: string): string | null => ART[type] ?? null;

/** The types that have custom art (for preloading on the share card). */
export const ART_TYPES = Object.keys(ART);

/**
 * The shrine as a small inline image wherever the Dambana stands for faith in the interface (the
 * Pananampalataya tab, the rites list, the shrine's own card): never a candle.
 */
export const DAMBANA_ART = ART.dambana;

/** What stands on a building's own tile as its icon: nothing for a bridge (drawn as its deck). */
export const mapIcon = (def: Pick<BuildingDef, "icon" | "bridge">): string | null => (def.bridge ? null : def.icon);

/** The lore note (content/lore) about how a building with custom art is drawn. */
export const ART_LORE: Record<string, string> = { dambana: "dambana-art", kuta: "kuta", "babaylan-hut": "babaylan" };
