import { useEffect, useState } from "react";

const COLORS = ["#c4553b", "#eaa530", "#1f5c45", "#2b7a78", "#6a4c93", "#fffdf8"];

/** A short, light celebration for real milestones (idea sealed, venture chosen, first test done). */
export function Confetti({ fire }: { fire: number }) {
  const [pieces, setPieces] = useState<{ id: number; left: number; dx: number; rot: number; delay: number; color: string; w: number }[]>([]);
  useEffect(() => {
    if (!fire) return;
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const batch = Array.from({ length: 60 }, (_, i) => ({
      id: fire * 100 + i,
      left: Math.random() * 100,
      dx: (Math.random() - 0.5) * 240,
      rot: 360 + Math.random() * 720,
      delay: Math.random() * 0.35,
      color: COLORS[i % COLORS.length],
      w: 6 + Math.random() * 6,
    }));
    setPieces(batch);
    const t = setTimeout(() => setPieces([]), 2600);
    return () => clearTimeout(t);
  }, [fire]);
  if (!pieces.length) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[60] overflow-hidden">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="absolute top-0 block rounded-[2px]"
          style={{
            left: `${p.left}%`,
            width: p.w,
            height: p.w * 0.45,
            background: p.color,
            animation: `confetti-fall 2.2s ${p.delay}s cubic-bezier(.2,.6,.4,1) forwards`,
            ["--dx" as string]: `${p.dx}px`,
            ["--rot" as string]: `${p.rot}deg`,
          }}
        />
      ))}
    </div>
  );
}
