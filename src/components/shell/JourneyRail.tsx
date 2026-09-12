import { Link } from "@tanstack/react-router";
import { Check, Circle, CircleDot } from "lucide-react";
import { JOURNEY_STEPS } from "@/lib/domain/config";
import { journeyState } from "@/lib/domain/state-machine";
import type { WorkspaceSnapshot } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

export function JourneyRail({ data }: { data: WorkspaceSnapshot }) {
  const state = journeyState({
    hasGroup: Boolean(data.group),
    hasDraftOrOpportunity: Boolean(data.myOpportunity),
    hasSubmitted: data.myOpportunity?.status !== "draft" && Boolean(data.myOpportunity),
    groupStatus: data.group?.status ?? null,
    hasVenture: Boolean(data.venture),
    evidenceCount: data.evidence.length,
    assumptionCount: data.assumptions.length,
  });

  return (
    <nav aria-label="Studio journey" className="overflow-x-auto">
      <ol className="flex min-w-max gap-2 pb-1">
        {JOURNEY_STEPS.map((step, i) => {
          const st = state[step.id];
          return (
            <li key={step.id}>
              <Link
                to={step.href}
                className={cn(
                  "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors",
                  st === "done" && "border-accent/30 bg-accent-soft text-accent",
                  st === "current" && "border-ink/20 bg-bg-elevated text-ink",
                  st === "todo" && "border-transparent text-faint",
                )}
              >
                <span className="font-mono text-[10px] tabular-nums">{i + 1}</span>
                <span>{step.label}</span>
                {st === "done" ? (
                  <Check className="size-3" aria-hidden />
                ) : st === "current" ? (
                  <CircleDot className="size-3" aria-hidden />
                ) : (
                  <Circle className="size-3" aria-hidden />
                )}
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
