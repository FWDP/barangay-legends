// Flat SVG art for the food buildings (V.2): the same 64×64 style as buildingArt.ts, drawn on the
// map (the player's, visits, replays), in the build toolbar, on the share card and in the Aklat.
// No emoji for anything in the game world. Only crops and animals known before contact: no
// camote, corn or chilies (docs/cultural-review.md). Display only.

/** Gabihan: broad heart-shaped taro leaves standing in wet, dark ground with a little water. */
export const GABIHAN = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <path d="M3 46 Q32 38 61 46 L61 60 Q32 64 3 60 Z" fill="#5b4632" stroke="#3b2c1f" stroke-width="0.8"/>
  <path d="M8 52 Q20 49 30 52 M36 55 Q46 52 56 55" stroke="#60a5c8" stroke-width="1.6" fill="none" opacity="0.8"/>
  <g stroke="#3f6212" stroke-width="1.6" stroke-linecap="round"><line x1="16" y1="50" x2="14" y2="30"/><line x1="32" y1="48" x2="32" y2="22"/><line x1="48" y1="50" x2="50" y2="30"/><line x1="24" y1="52" x2="22" y2="38"/><line x1="41" y1="52" x2="42" y2="38"/></g>
  <g fill="#4d7c0f" stroke="#365314" stroke-width="1">
    <path d="M14 30 C4 28 4 16 12 14 C14 18 16 18 18 14 C25 17 22 29 14 30 Z"/>
    <path d="M32 22 C20 20 20 4 30 3 C31 8 33 8 34 3 C44 5 43 20 32 22 Z"/>
    <path d="M50 30 C42 29 39 17 46 14 C48 18 50 18 52 14 C60 16 60 28 50 30 Z"/>
  </g>
  <g fill="#65a30d" stroke="#3f6212" stroke-width="0.8"><path d="M22 38 C15 37 15 28 21 27 C22 30 24 30 25 27 C30 29 29 37 22 38 Z"/><path d="M42 38 C36 37 35 28 40 27 C41 30 43 30 44 27 C49 29 48 37 42 38 Z"/></g>
  <g stroke="#365314" stroke-width="0.6" fill="none"><path d="M14 30 L13 18"/><path d="M32 22 L32 7"/><path d="M50 30 L49 18"/></g>
</svg>`;

/** Kaingin: a swidden clearing with charred stumps, mounds of ube and tugi vines on stakes and a patch of dawa (millet). */
export const KAINGIN = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <path d="M2 40 Q32 30 62 40 L62 60 Q32 64 2 60 Z" fill="#8a6b45" stroke="#5b4632" stroke-width="0.8"/>
  <g fill="#3b2a1d"><rect x="6" y="40" width="5" height="5" rx="1"/><rect x="54" y="42" width="5" height="4" rx="1"/></g>
  <g fill="#6b4f32"><ellipse cx="18" cy="52" rx="8" ry="4"/><ellipse cx="38" cy="54" rx="8" ry="4"/></g>
  <g stroke="#6b4423" stroke-width="1.4" stroke-linecap="round"><line x1="18" y1="51" x2="18" y2="28"/><line x1="38" y1="53" x2="38" y2="30"/></g>
  <g fill="none" stroke="#4d7c0f" stroke-width="1.4"><path d="M18 50 Q14 44 18 38 Q22 33 18 28"/><path d="M38 52 Q42 46 38 40 Q34 35 38 30"/></g>
  <g fill="#65a30d" stroke="#3f6212" stroke-width="0.6">
    <path d="M18 44 c-5 -1 -6 -6 -2 -7 c1 2 3 2 4 0 c3 2 2 6 -2 7 z"/><path d="M18 33 c5 -1 6 -6 2 -7 c-1 2 -3 2 -4 0 c-3 2 -2 6 2 7 z"/>
    <path d="M38 46 c5 -1 6 -6 2 -7 c-1 2 -3 2 -4 0 c-3 2 -2 6 2 7 z"/><path d="M38 35 c-5 -1 -6 -6 -2 -7 c1 2 3 2 4 0 c3 2 2 6 -2 7 z"/>
  </g>
  <g fill="#7c4a8a"><ellipse cx="13" cy="55" rx="2.6" ry="1.6"/><ellipse cx="33" cy="57" rx="2.6" ry="1.6"/></g>
  <g stroke="#a3a33a" stroke-width="1.2" stroke-linecap="round"><line x1="49" y1="56" x2="48" y2="40"/><line x1="52" y1="56" x2="53" y2="39"/><line x1="55" y1="56" x2="57" y2="42"/><line x1="46" y1="56" x2="44" y2="43"/></g>
  <g fill="#d4b440" stroke="#9a7e1e" stroke-width="0.5"><ellipse cx="48" cy="38" rx="1.6" ry="3.2"/><ellipse cx="53" cy="37" rx="1.6" ry="3.2"/><ellipse cx="57.5" cy="40" rx="1.4" ry="2.8" transform="rotate(20 57.5 40)"/><ellipse cx="43.5" cy="41" rx="1.4" ry="2.8" transform="rotate(-20 43.5 41)"/></g>
  <path d="M8 38 q2 -5 0 -9 M10 37 q3 -4 1 -8" stroke="#9ca3af" stroke-width="1" fill="none" opacity="0.7"/>
</svg>`;

/** Sagingan: a stand of banana plants with long torn leaves and a hanging bunch of green fruit. */
export const SAGINGAN = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <ellipse cx="32" cy="58" rx="28" ry="4" fill="#6b5536" opacity="0.6"/>
  <g fill="#8aa04a" stroke="#4d5c22" stroke-width="0.9"><rect x="17" y="30" width="5" height="28" rx="2"/><rect x="40" y="26" width="6" height="32" rx="2"/></g>
  <g fill="#4d9a2a" stroke="#2f6a17" stroke-width="0.9">
    <path d="M19 31 Q6 26 2 14 Q12 18 19 29 Z"/><path d="M20 30 Q24 16 34 10 Q30 22 21 31 Z"/><path d="M19 32 Q8 34 3 42 Q14 40 20 33 Z"/>
    <path d="M43 27 Q30 22 26 8 Q37 14 43 25 Z"/><path d="M43 26 Q50 12 62 8 Q56 20 44 27 Z"/><path d="M44 28 Q56 30 62 40 Q51 37 44 29 Z"/>
  </g>
  <g stroke="#2f6a17" stroke-width="0.6"><path d="M8 18 l3 2 M12 22 l3 1 M28 14 l-2 3 M32 12 l-3 3 M34 12 l2 3 M54 12 l-2 3 M58 11 l-3 3"/></g>
  <path d="M36 30 Q34 36 36 42" stroke="#6b4423" stroke-width="1.2" fill="none"/>
  <g fill="#a3c442" stroke="#5f7a1e" stroke-width="0.6">
    <path d="M33 34 q-4 2 -3 6 q3 -2 4 -5 z"/><path d="M36 35 q-2 3 0 6 q2 -3 1 -6 z"/><path d="M39 34 q4 2 3 6 q-3 -2 -4 -5 z"/>
    <path d="M33 39 q-4 2 -3 6 q3 -2 4 -5 z"/><path d="M36 40 q-2 3 0 6 q2 -3 1 -6 z"/><path d="M39 39 q4 2 3 6 q-3 -2 -4 -5 z"/>
  </g>
  <path d="M36 46 q-2 4 0 7 q2 -3 0 -7 z" fill="#8b2a4a" stroke="#5a1a30" stroke-width="0.6"/>
</svg>`;

/** Lumbia: sago palms with a felled trunk split open, and a trough where the pith is washed for sago flour. */
export const LUMBIA = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <ellipse cx="32" cy="58" rx="29" ry="4" fill="#5b4632" opacity="0.55"/>
  <rect x="12" y="20" width="5" height="38" rx="2" fill="#7a5a3a" stroke="#4a3520" stroke-width="0.9"/>
  <g stroke="#4a3520" stroke-width="0.6"><line x1="12" y1="28" x2="17" y2="28"/><line x1="12" y1="36" x2="17" y2="36"/><line x1="12" y1="44" x2="17" y2="44"/><line x1="12" y1="52" x2="17" y2="52"/></g>
  <g fill="none" stroke="#3f7a1a" stroke-width="2.2" stroke-linecap="round"><path d="M14 20 Q4 14 1 22"/><path d="M14 20 Q8 6 2 6"/><path d="M15 20 Q16 4 24 2"/><path d="M15 20 Q26 10 32 16"/><path d="M15 20 Q26 18 30 26"/></g>
  <g stroke="#65a30d" stroke-width="0.8"><path d="M5 17 l-1 3 M8 16 l0 3 M6 9 l1 3 M10 12 l-2 2 M19 7 l2 2 M22 5 l-1 3 M24 14 l2 1 M28 15 l-1 2 M22 21 l1 2 M27 22 l-2 2"/></g>
  <path d="M26 46 L58 40 L60 46 L28 52 Z" fill="#9a7348" stroke="#5b4632" stroke-width="0.9"/>
  <path d="M30 47 L57 42 L58 44 L31 49 Z" fill="#efe6d2"/>
  <path d="M34 56 L56 52 L56 57 L34 61 Z" fill="#8b5a2b" stroke="#4a2f17" stroke-width="0.8"/>
  <path d="M36 57 L54 54 L54 56 L36 59 Z" fill="#f5f0e1" opacity="0.9"/>
  <g fill="#e7dcc0" stroke="#a8956a" stroke-width="0.5"><ellipse cx="22" cy="57" rx="4" ry="2"/></g>
</svg>`;

/** Niyugan: two leaning coconut palms with clusters of nuts, and a husked coconut on the ground. */
export const NIYUGAN = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <ellipse cx="32" cy="59" rx="28" ry="3.5" fill="#c9b07a" opacity="0.7"/>
  <path d="M20 59 Q18 38 26 16" stroke="#8b6a45" stroke-width="4" fill="none" stroke-linecap="round"/>
  <path d="M44 59 Q48 40 42 22" stroke="#8b6a45" stroke-width="3.6" fill="none" stroke-linecap="round"/>
  <g stroke="#6b4f32" stroke-width="0.6"><path d="M18.5 50 l3 0 M18.6 42 l3 .5 M20 34 l3 .6 M22 26 l3 .8 M45.5 50 l-3 0 M46.5 42 l-3 .2 M46 34 l-3 0 M44 27 l-3 0"/></g>
  <g fill="none" stroke="#3f7a1a" stroke-width="2" stroke-linecap="round">
    <path d="M26 16 Q16 8 8 14"/><path d="M26 16 Q20 4 12 3"/><path d="M26 16 Q30 2 38 4"/><path d="M26 16 Q38 10 42 18"/><path d="M26 16 Q22 22 14 26"/>
    <path d="M42 22 Q34 14 30 20"/><path d="M42 22 Q44 10 52 8"/><path d="M42 22 Q54 16 60 22"/><path d="M42 22 Q52 26 56 34"/>
  </g>
  <g fill="#6b8f2a" stroke="#3f5a16" stroke-width="0.7"><circle cx="24" cy="19" r="2.4"/><circle cx="28" cy="19.5" r="2.4"/><circle cx="26" cy="22" r="2.2"/><circle cx="40" cy="25" r="2.2"/><circle cx="44" cy="25" r="2.2"/></g>
  <g><circle cx="32" cy="56" r="3.4" fill="#8b5a2b" stroke="#4a2f17" stroke-width="0.8"/><circle cx="31" cy="55" r="0.6" fill="#3b2414"/><circle cx="33" cy="55" r="0.6" fill="#3b2414"/></g>
</svg>`;

/** Pangangalap (shore gathering): a woven basket of shells and seaweed on wet sand at low tide, with a digging stick. */
export const PANGANGALAP = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <path d="M2 34 Q32 28 62 34 V48 Q32 44 2 48 Z" fill="#e3cf9a"/>
  <path d="M2 46 Q32 42 62 46 V62 H2 Z" fill="#38bdf8" opacity="0.5"/>
  <path d="M2 46 Q16 43 30 46 T62 45" stroke="#e0f2fe" stroke-width="1.2" fill="none"/>
  <g fill="#3f7a4a" stroke="#24502c" stroke-width="0.6"><path d="M8 44 q2 -6 0 -10 q4 4 2 10 z"/><path d="M12 45 q3 -5 2 -8 q3 4 0 8 z"/><path d="M50 44 q-2 -5 1 -9 q2 5 0 9 z"/></g>
  <path d="M20 28 L44 28 L41 44 Q32 47 23 44 Z" fill="#c9a36a" stroke="#7a5230" stroke-width="1"/>
  <g stroke="#a07a45" stroke-width="0.7"><line x1="21" y1="32" x2="43" y2="32"/><line x1="21.7" y1="36" x2="42.3" y2="36"/><line x1="22.4" y1="40" x2="41.6" y2="40"/><line x1="26" y1="28" x2="27" y2="45"/><line x1="32" y1="28" x2="32" y2="46"/><line x1="38" y1="28" x2="37" y2="45"/></g>
  <ellipse cx="32" cy="28" rx="12" ry="2.6" fill="#a07a45" stroke="#7a5230" stroke-width="0.8"/>
  <g stroke="#7a5230" stroke-width="0.5"><path d="M24 27 q3 -5 6 0 z" fill="#f2d7c4"/><path d="M31 27 q3 -6 7 0 z" fill="#e8b4a0"/><ellipse cx="38" cy="26.5" rx="2.6" ry="1.6" fill="#1f2937"/></g>
  <path d="M27 25 q1 -4 4 -3" stroke="#3f7a4a" stroke-width="1.4" fill="none"/>
  <line x1="50" y1="40" x2="56" y2="22" stroke="#6b4423" stroke-width="2" stroke-linecap="round"/>
  <g stroke="#7a5230" stroke-width="0.5"><path d="M10 38 q2 -3 4 0 z" fill="#f5e6d3"/><path d="M56 40 q2 -3 4 0 z" fill="#e8b4a0"/></g>
</svg>`;

/** Pangangaso: a hunters' camp at the forest edge: a lean-to, spears against a post, and a drying rack. */
export const PANGANGASO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <ellipse cx="32" cy="58" rx="28" ry="4" fill="#6b5536" opacity="0.55"/>
  <g fill="#2f6a17" stroke="#1d4510" stroke-width="0.8"><path d="M50 10 L60 30 L40 30 Z"/><path d="M50 20 L62 42 L38 42 Z"/></g>
  <rect x="48.5" y="42" width="3" height="14" fill="#5b3a1e"/>
  <path d="M4 56 L18 24 L36 56 Z" fill="#c8a24a" stroke="#9a7428" stroke-width="1.2" stroke-linejoin="round"/>
  <g stroke="#a8842f" stroke-width="0.8"><line x1="18" y1="24" x2="10" y2="56"/><line x1="18" y1="24" x2="18" y2="56"/><line x1="18" y1="24" x2="27" y2="56"/></g>
  <path d="M12 56 L18 40 L24 56 Z" fill="#3b2414"/>
  <g stroke="#6b4423" stroke-width="1.4" stroke-linecap="round"><line x1="38" y1="56" x2="40" y2="20"/><line x1="42" y1="56" x2="41" y2="22"/></g>
  <g fill="#94a3b8" stroke="#475569" stroke-width="0.6"><path d="M40 20 l-1.6 -6 l3 0 z"/><path d="M41 22 l-1.4 -6 l2.8 0 z"/></g>
  <g stroke="#5b3a1e" stroke-width="1.6" stroke-linecap="round"><line x1="26" y1="56" x2="26" y2="42"/><line x1="36" y1="56" x2="36" y2="42"/><line x1="25" y1="43" x2="37" y2="43"/></g>
  <g fill="#9a4a3a" stroke="#5a2a1e" stroke-width="0.5"><rect x="28" y="43" width="2.4" height="6" rx="1"/><rect x="32" y="43" width="2.4" height="5" rx="1"/></g>
  <path d="M28 57 q2 -4 4 0 q2 -4 4 0" stroke="#f97316" stroke-width="1.2" fill="none" opacity="0.8"/>
</svg>`;

/** Babuyan/manukan: a small bamboo pen under a house's eaves, with a pig and chickens (chickens only where the tradition keeps no pigs). */
export const babuyanSvg = (pigs: boolean) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <ellipse cx="32" cy="57" rx="28" ry="4.5" fill="#8a6b45" opacity="0.6"/>
  <g stroke="#8a6a35" stroke-width="1.6" stroke-linecap="round"><line x1="6" y1="58" x2="6" y2="34"/><line x1="58" y1="58" x2="58" y2="34"/><line x1="32" y1="60" x2="32" y2="38"/></g>
  <g stroke="#b9945a" stroke-width="1.4"><line x1="5" y1="38" x2="59" y2="38"/><line x1="5" y1="46" x2="59" y2="46"/></g>
  <path d="M2 34 L32 22 L62 34 Z" fill="#c8a24a" stroke="#9a7428" stroke-width="1.1" stroke-linejoin="round"/>
  ${
    pigs
      ? `<g><ellipse cx="18" cy="52" rx="9" ry="5.4" fill="#4a3b36" stroke="#2a201d" stroke-width="0.8"/><ellipse cx="9.6" cy="51" rx="3" ry="2.6" fill="#4a3b36" stroke="#2a201d" stroke-width="0.8"/><ellipse cx="7.4" cy="51.4" rx="1.3" ry="1.1" fill="#6b5a54"/><path d="M11 47.4 l1.6 -2.6 l1 3 z" fill="#2a201d"/><g stroke="#2a201d" stroke-width="1.4"><line x1="13" y1="56" x2="13" y2="59"/><line x1="23" y1="56" x2="23" y2="59"/></g></g>`
      : `<g><ellipse cx="16" cy="53" rx="4.4" ry="3.4" fill="#f5efe0" stroke="#78716c" stroke-width="0.7"/><circle cx="12.5" cy="50" r="2" fill="#f5efe0" stroke="#78716c" stroke-width="0.7"/><path d="M11 48.6 l1 -1.6 l1 1.4 z" fill="#dc2626"/><path d="M10.6 50.2 l-1.6 .6 l1.6 .5 z" fill="#d97706"/></g>`
  }
  <g><ellipse cx="44" cy="53" rx="5" ry="3.8" fill="#b45309" stroke="#78350f" stroke-width="0.7"/><path d="M48 50 q5 -4 4 2 q-2 0 -4 1 z" fill="#1f2937"/><circle cx="40" cy="49.6" r="2.2" fill="#b45309" stroke="#78350f" stroke-width="0.7"/><path d="M38.6 48 l1 -1.8 l1 1.6 z" fill="#dc2626"/><path d="M37.9 49.8 l-1.7 .6 l1.7 .5 z" fill="#d97706"/></g>
  <g stroke="#d97706" stroke-width="0.8"><line x1="43" y1="56.5" x2="43" y2="59"/><line x1="45" y1="56.5" x2="45" y2="59"/></g>
</svg>`;

/** Asinan: shallow salt beds on the shore, white crusts drying, a rake and a basket of salt cakes. */
export const ASINAN = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <path d="M2 48 Q32 44 62 48 V62 H2 Z" fill="#38bdf8" opacity="0.5"/>
  <path d="M2 30 Q32 24 62 30 V50 Q32 46 2 50 Z" fill="#e3cf9a"/>
  <g stroke="#8a6a35" stroke-width="1.2">
    <path d="M6 32 L28 30 L28 40 L6 42 Z" fill="#9ccbe0"/><path d="M34 30 L58 31 L58 41 L34 40 Z" fill="#f4f1ea"/>
    <path d="M8 43 L30 41 L30 47 L8 49 Z" fill="#f4f1ea"/><path d="M34 41 L58 42 L58 47 L34 46 Z" fill="#c8e4ef"/>
  </g>
  <g fill="#ffffff" opacity="0.9"><circle cx="40" cy="35" r="1"/><circle cx="46" cy="36" r="1.2"/><circle cx="52" cy="34" r="0.9"/><circle cx="14" cy="45" r="1"/><circle cx="22" cy="45" r="1.1"/></g>
  <g stroke="#6b4423" stroke-width="1.6" stroke-linecap="round"><line x1="20" y1="8" x2="30" y2="30"/></g>
  <path d="M24 30 L36 28" stroke="#6b4423" stroke-width="2" stroke-linecap="round"/>
  <path d="M40 14 L54 14 L52 26 Q47 28 42 26 Z" fill="#c9a36a" stroke="#7a5230" stroke-width="0.9"/>
  <g fill="#f4f1ea" stroke="#9ca3af" stroke-width="0.6"><path d="M42 14 l3 -5 l4 0 l1 5 z"/><path d="M47 14 l2 -4 l3 1 l0 3 z"/></g>
</svg>`;

/** Baklad: a bamboo fish corral of staked screens in the shallows, funnelling fish into a closed pen. */
export const BAKLAD = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect x="0" y="16" width="64" height="48" fill="#38bdf8" opacity="0.55"/>
  <path d="M0 24 Q16 20 32 24 T64 24 M0 40 Q16 36 32 40 T64 40" stroke="#e0f2fe" stroke-width="0.9" fill="none" opacity="0.8"/>
  <g stroke="#8a6a35" stroke-width="1.3" stroke-dasharray="1.6 1.4" fill="none">
    <path d="M4 20 L30 40"/><path d="M60 20 L36 40"/>
    <path d="M30 40 Q24 52 32 58 Q40 52 36 40"/>
  </g>
  <g stroke="#5b3a1e" stroke-width="1.6" stroke-linecap="round">
    <line x1="4" y1="18" x2="4" y2="22"/><line x1="12" y1="24" x2="12" y2="28"/><line x1="20" y1="30" x2="20" y2="34"/><line x1="28" y1="36" x2="28" y2="40"/>
    <line x1="60" y1="18" x2="60" y2="22"/><line x1="52" y1="24" x2="52" y2="28"/><line x1="44" y1="30" x2="44" y2="34"/><line x1="36" y1="36" x2="36" y2="40"/>
    <line x1="27" y1="48" x2="27" y2="52"/><line x1="37" y1="48" x2="37" y2="52"/><line x1="32" y1="56" x2="32" y2="60"/>
  </g>
  <g fill="#94a3b8" stroke="#475569" stroke-width="0.4"><path d="M29 50 q3 -2.4 6 0 q-3 2.4 -6 0 z M35 50 l2 -1.4 v2.8 z"/><path d="M28 54 q2.6 -2 5.2 0 q-2.6 2 -5.2 0 z M33.2 54 l1.6 -1.2 v2.4 z"/><path d="M16 30 q2.6 -2 5.2 0 q-2.6 2 -5.2 0 z M21.2 30 l1.6 -1.2 v2.4 z"/></g>
</svg>`;
