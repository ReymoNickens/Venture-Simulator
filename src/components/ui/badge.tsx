import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "warn" | "bad" | "gold";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-[4px] px-2 py-0.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.08em]",
        tone === "neutral" && "bg-bg-subtle text-muted",
        tone === "accent" && "bg-accent-soft text-accent",
        tone === "warn" && "bg-warn-soft text-warn",
        tone === "bad" && "bg-bad-soft text-bad",
        tone === "gold" && "bg-gold-soft text-gold-deep",
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * A sheet of paper on the desk: square-ish corners, a hard hairline edge and
 * a short offset shadow — printed matter, not a floating glass panel.
 */
export function Card({
  className,
  children,
  as: Tag = "div",
}: {
  className?: string;
  children: ReactNode;
  as?: "div" | "section" | "article" | "li";
}) {
  return (
    <Tag
      className={cn(
        "rounded-[10px] border border-line bg-bg-elevated p-4 shadow-[3px_3px_0_0_rgba(28,23,18,0.07)] sm:p-5",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

/** Small uppercase label that heads a section. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("font-mono text-[10.5px] uppercase tracking-[0.16em] text-muted", className)}>
      {children}
    </p>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-[8px] border border-dashed border-line-strong px-3 py-4 text-center text-sm text-muted">
      {children}
    </p>
  );
}
