import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type Tone = "neutral" | "accent" | "warn" | "bad" | "sun" | "clay" | "night";

export function Badge({ children, tone = "neutral", className }: { children: ReactNode; tone?: Tone; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em]",
        tone === "neutral" && "bg-bg-subtle text-muted",
        tone === "accent" && "bg-accent-soft text-accent",
        tone === "warn" && "bg-warn-soft text-warn",
        tone === "bad" && "bg-bad-soft text-bad",
        tone === "sun" && "bg-sun-soft text-[#8a5a0f]",
        tone === "clay" && "bg-clay-soft text-clay",
        tone === "night" && "bg-night text-accent-fg",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Card({ className, children, as: As = "div" }: { className?: string; children: ReactNode; as?: "div" | "section" | "article" | "li" }) {
  return (
    <As className={cn("rounded-[22px] border border-line/80 bg-bg-elevated p-5 shadow-[var(--shadow-card)]", className)}>
      {children}
    </As>
  );
}

export function SectionTitle({ kicker, title, action, className }: { kicker?: string; title: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-end justify-between gap-3", className)}>
      <div>
        {kicker ? <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">{kicker}</p> : null}
        <h2 className="font-display text-xl leading-tight">{title}</h2>
      </div>
      {action}
    </div>
  );
}
