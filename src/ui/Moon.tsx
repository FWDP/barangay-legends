// The moon, drawn small and soft in the HUD (beside Araw N), never over the map: its phase from
// engine/daynight.ts, darkened while the Bakunawa swallows it and coming back as the gongs drive
// the serpent off.

/** The lit part of a moon disc at a phase (0 new, 0.5 full): an SVG path in a 24 × 24 box. */
export function moonPath(phase: number, r = 10, c = 12): string {
  const lit = Math.cos(phase * 2 * Math.PI); // 1 new .. -1 full
  const waxing = phase < 0.5;
  // The terminator: an ellipse whose half-width goes from r (new) through 0 (half) to r (full).
  const rx = Math.abs(lit) * r;
  const outer = waxing ? 1 : 0;
  const inner = lit > 0 === waxing ? 0 : 1;
  return `M ${c} ${c - r} A ${r} ${r} 0 0 ${outer} ${c} ${c + r} A ${rx} ${r} 0 0 ${inner} ${c} ${c - r} Z`;
}

/**
 * A small moon. `swallowed` (0..1) is how much of it the Bakunawa has (an eclipse): the dark
 * shadow covers that share and the moon turns red; null when there is no eclipse.
 */
export function Moon(props: { phase: number; swallowed: number | null; className?: string }) {
  const { phase, swallowed, className = "size-4" } = props;
  const eclipse = swallowed !== null;
  // Reduced brightness: a soft cream moon, never a bright light over the map.
  const lit = eclipse ? "#b45309" : "#fdf6d8";
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={`inline-block ${className}`} data-moon>
      <circle cx="12" cy="12" r="10" fill={eclipse ? "#3b0a0a" : "#475569"} opacity={eclipse ? 0.9 : 0.35} />
      <path d={eclipse ? moonPath(0.5) : moonPath(phase)} fill={lit} opacity={0.85} />
      {eclipse && <circle cx={12 + 20 * (1 - swallowed!)} cy="12" r="10.5" fill="#0f0a1e" opacity="0.9" />}
    </svg>
  );
}
