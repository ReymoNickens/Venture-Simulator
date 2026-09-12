import { createFileRoute, Link } from "@tanstack/react-router";
import { useStudioWorkspace } from "@/hooks/workspace-context";
import { OpportunityForm } from "@/components/forms/OpportunityForm";
import { Badge, Card } from "@/components/ui/badge";

export const Route = createFileRoute("/studio/opportunity")({ component: OpportunityPage });

function OpportunityPage() {
  const { data, loading, refresh } = useStudioWorkspace();
  if (loading || !data) return <div className="h-40 animate-pulse rounded-[28px] bg-bg-subtle" />;
  if (!data.group) {
    return (
      <Card>
        <p className="text-sm">Join a group before writing an opportunity.</p>
        <Link to="/studio/group" className="mt-3 inline-block text-sm text-accent">
          Go to groups
        </Link>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <Badge>
          {data.submissionProgress.submitted} / {data.submissionProgress.required} submitted
        </Badge>
        <h1 className="mt-2 font-display text-3xl">A problem you have seen</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          Do not start with “what business do I want to start?”. Investigate a gap on campus, in a
          hostel, a market, a tro-tro park, or a farm. AI-generated ideas are not evidence.
        </p>
      </div>
      {data.myOpportunity?.syncState === "pending" ? (
        <p className="rounded-[12px] bg-warn-soft px-3 py-2 text-sm text-warn">
          Saved locally — will sync when connected.
        </p>
      ) : null}
      <Card>
        <OpportunityForm existing={data.myOpportunity} onSaved={() => void refresh()} />
      </Card>
    </div>
  );
}
