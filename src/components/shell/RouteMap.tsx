import { Link } from "@tanstack/react-router";
import { Bus, Check, Lock } from "lucide-react";
import { STAGE_BY_ID, type StageProgress } from "@/lib/domain/stages";
import type { Milestone } from "@/lib/domain/types";
import { Emblem } from "@/components/ui/emblem";
import { cn } from "@/lib/utils";
import { dueLabel } from "@/lib/dates";

/**
 * The journey drawn as a tro-tro route: a road with numbered stops. Done
 * stops are stamped, the recommended next stop has the bus, locked stops are
 * greyed out until the group reaches them.
 */
export function RouteMap({
  progress,
  milestones = [],
  compact = false,
  onNavigate,
}: {
  progress: StageProgress[];
  milestones?: Milestone[];
  compact?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <ol className="relative">
      {progress.map((p, i) => {
        const def = STAGE_BY_ID[p.id];
        const due = milestones.find((m) => m.stage === p.id);
        const last = i === progress.length - 1;
        const locked = p.state === "locked";
        const inner = (
          <div className={cn("flex gap-3", compact ? "py-1.5" : "py-2.5")}>
            <div className="relative flex w-9 shrink-0 flex-col items-center">
              <span
                className={cn(
                  "relative z-10 flex size-9 items-center justify-center rounded-full border-2 text-xs font-bold tabular",
                  p.state === "done" && "border-ink bg-accent text-accent-fg",
                  p.state === "current" && "border-ink bg-gold text-ink shadow-[2px_2px_0_0_var(--color-ink)]",
                  p.state === "open" && "border-ink/70 bg-bg-elevated text-ink",
                  locked && "border-line-strong bg-bg-subtle text-faint",
                )}
              >
                {p.state === "done" ? (
                  <Check className="size-4" strokeWidth={3} aria-hidden />
                ) : p.state === "current" ? (
                  <Bus className="size-4" aria-hidden />
                ) : locked ? (
                  <Lock className="size-3.5" aria-hidden />
                ) : (
                  def.stop
                )}
              </span>
              {!last ? (
                <span
                  aria-hidden
                  className={cn(
                    "absolute top-9 bottom-[-12px] w-[3px]",
                    p.state === "done" ? "bg-ink" : "bg-[repeating-linear-gradient(180deg,var(--color-line-strong)_0_6px,transparent_6px_11px)]",
                  )}
                />
              ) : null}
            </div>
            <div className={cn("min-w-0 flex-1", compact ? "pt-1.5" : "pt-1")}>
              <div className="flex items-center gap-2">
                <span className={cn("font-display text-[15px] font-bold leading-tight", locked && "text-faint")}>
                  {def.title}
                </span>
                {!compact ? (
                  <Emblem emblem={def.emblem} className={cn("size-4", locked ? "text-faint" : "text-gold-deep")} />
                ) : null}
              </div>
              {!compact ? (
                <p className={cn("mt-0.5 text-xs", locked ? "text-faint" : "text-muted")}>
                  {def.short}
                  {!locked ? ` · ${p.met}/${p.criteria.length}` : ""}
                  {due && p.state !== "done" ? (
                    <span className="ml-1 font-medium text-clay">· {dueLabel(due.dueAt)}</span>
                  ) : null}
                </p>
              ) : null}
            </div>
          </div>
        );
        return (
          <li key={p.id}>
            {locked ? (
              <div aria-disabled className="cursor-not-allowed">
                {inner}
              </div>
            ) : (
              <Link
                to={def.href}
                onClick={onNavigate}
                className="block rounded-[8px] px-1 hover:bg-bg-subtle/70"
                activeProps={{ className: "bg-bg-subtle" }}
              >
                {inner}
              </Link>
            )}
          </li>
        );
      })}
    </ol>
  );
}
