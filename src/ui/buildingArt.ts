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

const url = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace(/\s+/g, " "))}`;

const ART: Record<string, string> = { dambana: url(DAMBANA), kuta: url(KUTA) };

/** Custom art for a building type, as an image URL, or null (it is drawn as its icon). */
export const buildingArtUrl = (type: string): string | null => ART[type] ?? null;

/** The types that have custom art (for preloading on the share card). */
export const ART_TYPES = Object.keys(ART);

/** What stands on a building's own tile as its icon: nothing for a bridge (drawn as its deck). */
export const mapIcon = (def: Pick<BuildingDef, "icon" | "bridge">): string | null => (def.bridge ? null : def.icon);

/** The lore note (content/lore) about how a building with custom art is drawn. */
export const ART_LORE: Record<string, string> = { dambana: "dambana-art", kuta: "kuta" };
