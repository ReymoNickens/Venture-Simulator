import type { ReactNode } from "react";
import { EMBLEMS, type EmblemKey } from "@/lib/domain/stages";
import { cn } from "@/lib/utils";

/**
 * Simplified renderings of Adinkra symbols (Akan, Ghana), one per stop on the
 * route. They are drawn as clean geometric marks for small screens — faithful
 * in structure, not reproductions of any particular stamp carving.
 */
const PATHS: Record<EmblemKey, ReactNode> = {
  // Chain links — two interlocked links.
  nkonsonkonson: (
    <g fill="none" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round">
      <rect x="5" y="9" width="20" height="30" rx="10" />
      <rect x="23" y="9" width="20" height="30" rx="10" />
      <path d="M24 16v16" />
    </g>
  ),
  // The king's eyes — watchful eye with iris.
  ohene_aniwa: (
    <g fill="none" stroke="currentColor" strokeWidth="4" strokeLinejoin="round">
      <path d="M4 24 Q24 4 44 24 Q24 44 4 24Z" />
      <circle cx="24" cy="24" r="7" fill="currentColor" />
      <path d="M10 10 L15 15 M38 10 L33 15" strokeLinecap="round" />
    </g>
  ),
  // Linked hearts — four hearts meeting at a centre ring.
  akoma_ntoaso: (
    <g fill="currentColor">
      {[0, 90, 180, 270].map((r) => (
        <path
          key={r}
          transform={`rotate(${r} 24 24) translate(24 10) scale(1.25)`}
          d="M0 6 C-8 0 -8 -7 -3.5 -7 C-1.5 -7 0 -5 0 -4 C0 -5 1.5 -7 3.5 -7 C8 -7 8 0 0 6Z"
        />
      ))}
      <circle cx="24" cy="24" r="4.5" fill="none" stroke="currentColor" strokeWidth="3" />
    </g>
  ),
  // Measuring stick — a cross whose arms each end in a rule.
  hwe_mu_dua: (
    <g fill="currentColor">
      <rect x="21.5" y="6" width="5" height="36" rx="1.5" />
      <rect x="6" y="21.5" width="36" height="5" rx="1.5" />
      <rect x="15" y="4" width="18" height="4.5" rx="1.5" />
      <rect x="15" y="39.5" width="18" height="4.5" rx="1.5" />
      <rect x="4" y="15" width="4.5" height="18" rx="1.5" />
      <rect x="39.5" y="15" width="4.5" height="18" rx="1.5" />
    </g>
  ),
  // "What I hear, I keep" — four ear-like curls.
  mate_masie: (
    <g fill="none" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round">
      {[
        [15, 15],
        [33, 15],
        [15, 33],
        [33, 33],
      ].map(([cx, cy], i) => (
        <g key={i} transform={`rotate(${i * 90 + 45} ${cx} ${cy})`}>
          <path d={`M${cx} ${cy - 8} A8 8 0 1 1 ${cx - 8} ${cy}`} />
          <circle cx={cx} cy={cy} r="2" fill="currentColor" stroke="none" />
        </g>
      ))}
    </g>
  ),
  // Spider's web — nested diamonds on spokes.
  ananse_ntontan: (
    <g fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinejoin="round">
      <path d="M24 3 L45 24 L24 45 L3 24Z" />
      <path d="M24 11 L37 24 L24 37 L11 24Z" />
      <path d="M24 18 L30 24 L24 30 L18 24Z" />
      <path d="M24 3v42 M3 24h42" />
    </g>
  ),
  // The draughts board — quartered board with pieces.
  dame_dame: (
    <g>
      <rect x="5" y="5" width="38" height="38" rx="3" fill="none" stroke="currentColor" strokeWidth="4" />
      <path d="M24 5v38 M5 24h38" stroke="currentColor" strokeWidth="4" />
      {[
        [9.5, 9.5],
        [28.5, 9.5],
        [9.5, 28.5],
        [28.5, 28.5],
      ].map(([x, y], i) => (
        <rect key={i} x={x} y={y} width="10" height="10" rx="1.5" fill="currentColor" />
      ))}
    </g>
  ),
  // Sack of cola nuts — four nuts bound at a centre.
  bese_saka: (
    <g fill="currentColor">
      <circle cx="24" cy="9" r="6.5" />
      <circle cx="39" cy="24" r="6.5" />
      <circle cx="24" cy="39" r="6.5" />
      <circle cx="9" cy="24" r="6.5" />
      <path d="M24 14 L34 24 L24 34 L14 24Z" />
    </g>
  ),
  // The fern — a stem with paired fronds.
  aya: (
    <g fill="currentColor">
      <rect x="22.5" y="4" width="3" height="40" rx="1.5" />
      {[8, 16, 24, 32].map((y, i) => {
        const w = 14 - i * 2;
        return (
          <g key={y}>
            <ellipse cx={24 - w / 2 - 2} cy={y + 2} rx={w / 2} ry="3" transform={`rotate(-28 ${24 - w / 2 - 2} ${y + 2})`} />
            <ellipse cx={24 + w / 2 + 2} cy={y + 2} rx={w / 2} ry="3" transform={`rotate(28 ${24 + w / 2 + 2} ${y + 2})`} />
          </g>
        );
      })}
    </g>
  ),
  // Sankofa — the heart form with inward spirals.
  sankofa: (
    <g fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M24 43 C10 33 4 24 4 15 C4 8 9 4 15 4 C20 4 23 8 24 12 C25 8 28 4 33 4 C39 4 44 8 44 15 C44 24 38 33 24 43Z" />
      <path d="M17 12 C12 12 11 19 16 20 C19 20.5 20 17 18 16" />
      <path d="M31 12 C36 12 37 19 32 20 C29 20.5 28 17 30 16" />
      <path d="M24 28 v8" />
    </g>
  ),
  // Chief of the symbols — concentric circles.
  adinkrahene: (
    <g fill="none" stroke="currentColor" strokeWidth="4">
      <circle cx="24" cy="24" r="19" />
      <circle cx="24" cy="24" r="12" />
      <circle cx="24" cy="24" r="5" fill="currentColor" />
    </g>
  ),
  // Wind-resistant house.
  mframadan: (
    <g fill="none" stroke="currentColor" strokeWidth="4" strokeLinejoin="round">
      <path d="M5 22 L24 5 L43 22" strokeLinecap="round" />
      <rect x="10" y="20" width="28" height="23" />
      <path d="M24 20v23 M10 31.5h28" />
    </g>
  ),
};

export function Emblem({
  emblem,
  className,
  title,
}: {
  emblem: EmblemKey;
  className?: string;
  title?: string;
}) {
  const meta = EMBLEMS[emblem];
  return (
    <svg
      viewBox="0 0 48 48"
      className={cn("size-6 shrink-0", className)}
      role="img"
      aria-label={title ?? `${meta.name}: ${meta.meaning}`}
    >
      {PATHS[emblem]}
    </svg>
  );
}
