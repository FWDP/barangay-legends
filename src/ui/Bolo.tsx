// The bolo (itak), the long blade people cleared forest and cut timber with: drawn in place of
// the modern steel axe emoji wherever clearing is shown in the interface. Display only.

/** A small bolo, sized to the text around it. */
export function Bolo({ className = "inline-block size-[1.1em] align-[-0.2em]" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={className}>
      <path d="M5 19.5 L16.5 5.5 Q19.5 2.5 20.5 4.5 Q21 6 18.5 8.5 L8 21 Z" fill="#cbd5e1" stroke="#475569" strokeWidth="1" strokeLinejoin="round" />
      <path d="M8 21 L5 19.5 L3 22 Q2.5 23 3.6 23.3 L5.4 23.6 Z" fill="#7c4a1e" stroke="#4a2f17" strokeWidth="0.8" />
      <path d="M7 18.5 L17.5 6.2" stroke="#f1f5f9" strokeWidth="0.7" opacity="0.8" />
    </svg>
  );
}
