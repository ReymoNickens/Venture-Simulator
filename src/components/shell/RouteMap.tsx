import { Link } from "@tanstack/react-router";
import { Check, Lock } from "lucide-react";
import { STAGE_BY_ID, type StageProgress } from "@/lib/domain/stages";
import type { Milestone } from "@/lib/domain/types";
import { StopSticker } from "@/components/ui/sticker";
import { cn } from "@/lib/utils";
import { dueLabel } from "@/lib/dates";

/**
 * The journey, top to bottom. Each stop is its sticker and its name — the
 * line under it appears only where it helps: "now" gets the task, locked
 * stops get a teaser, done stops get nothing.
 */
export function RouteMap({
  progress,
  milestones = [],
  compact = false,
}: {
  progress: StageProgress[];
  milestones?: Milestone[];
  compact?: boolean;
}) {
  return (
    <ol className="space-y-1">
      {progress.map((p) => {
        const def = STAGE_BY_ID[p.id];
        const locked = p.state === "locked";
        const now = p.state === "current";
        const due = milestones.find((m) => m.stage === p.id);
        const body = (
          <div
            className={cn(
              "flex items-center gap-3 rounded-[16px] px-2.5 py-2",
              now && "bg-bg-elevated ring-1 ring-line",
            )}
          >
            <span className="relative">
              <StopSticker stage={p.id} size="sm" muted={locked || p.state === "done"} tilt={!locked} />
              {p.state === "done" ? (
                <span className="absolute -right-1 -bottom-1 flex size-4 items-center justify-center rounded-full bg-mint text-white ring-2 ring-bg">
                  <Check className="size-2.5" strokeWidth={4} aria-label="done" />
                </span>
              ) : null}
            </span>
            <span className="min-w-0 flex-1">
              <span className={cn("flex items-center gap-2 text-sm font-semibold", locked && "text-faint", p.state === "done" && "text-muted")}>
                <span className="truncate">{def.title}</span>
                {now ? <span className="rounded-full bg-gold px-2 py-[1px] text-[10px] font-bold text-ink">NOW</span> : null}
                {locked ? <Lock className="size-3 shrink-0" aria-label="locked" /> : null}
              </span>
              {!compact && (now || locked) ? (
                <span className={cn("mt-0.5 block text-xs leading-5", locked ? "text-faint italic" : "text-muted")}>
                  {locked ? def.teaser : `${p.met} of ${p.criteria.length} done${due ? ` · ${dueLabel(due.dueAt)}` : ""}`}
                </span>
              ) : null}
            </span>
          </div>
        );
        return (
          <li key={p.id}>
            {locked ? (
              <div aria-disabled>{body}</div>
            ) : (
              <Link to={def.href} className="block rounded-[16px] hover:bg-bg-subtle/70">
                {body}
              </Link>
            )}
          </li>
        );
      })}
    </ol>
  );
}
