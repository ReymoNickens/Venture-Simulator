import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Users } from "lucide-react";
import { useStudioWorkspace } from "@/hooks/workspace-context";
import { AdvisorPanel, STAGE_INTRO } from "@/components/advisor/AdvisorPanel";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Empty, Skeleton } from "@/components/ui/empty";
import type { AdvisorStage } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

const STAGES: AdvisorStage[] = ["idea", "selection", "evidence"];

export const Route = createFileRoute("/studio/advisor")({
  component: AdvisorPage,
  validateSearch: (s: Record<string, unknown>): { stage?: AdvisorStage } =>
    STAGES.includes(s.stage as AdvisorStage) ? { stage: s.stage as AdvisorStage } : {},
});

function AdvisorPage() {
  const { data, loading, refresh } = useStudioWorkspace();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/studio/advisor" });
  if (loading || !data) return <Skeleton className="h-72" />;
  if (!data.group) {
    return <Empty icon={<Users className="size-5" />} title="Join a team first" body="The advisor knows your group's work, so it needs a group." action={<Link to="/studio/group" className={buttonVariants({})}>Find my team</Link>} />;
  }

  const available: Record<AdvisorStage, boolean> = { idea: true, selection: data.canOpenSelection, evidence: Boolean(data.venture) };
  const fallback: AdvisorStage = data.venture ? "evidence" : data.canOpenSelection ? "selection" : "idea";
  const stage = search.stage && available[search.stage] ? search.stage : fallback;

  return (
    <div className="space-y-4">
      <div className="animate-rise">
        <Badge tone="sun">Advisor</Badge>
        <h1 className="mt-2 font-display text-[2rem] leading-tight">Challenge, not cheerleading</h1>
        <p className="mt-1 text-sm text-muted">{STAGE_INTRO[stage].body}</p>
      </div>
      <div role="tablist" aria-label="Conversation" className="grid grid-cols-3 gap-1 rounded-[14px] bg-bg-subtle p-1">
        {STAGES.map((s) => (
          <button
            key={s}
            role="tab"
            type="button"
            aria-selected={s === stage}
            disabled={!available[s]}
            onClick={() => void navigate({ search: { stage: s }, replace: true })}
            className={cn("h-9 rounded-[10px] text-sm font-semibold transition-colors disabled:opacity-40", s === stage ? "bg-bg-elevated shadow-[var(--shadow-card)]" : "text-muted")}
          >
            {STAGE_INTRO[s].title}
          </button>
        ))}
      </div>
      <AdvisorPanel key={stage} data={data} stage={stage} onSent={() => void refresh()} />
    </div>
  );
}
