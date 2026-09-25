import { createFileRoute, Link } from "@tanstack/react-router";
import { useStudioWorkspace } from "@/hooks/workspace-context";
import { OpportunityForm } from "@/components/forms/OpportunityForm";
import { StageHeader } from "@/components/stage/StageHeader";
import { EmptyNote } from "@/components/ui/badge";
import { Stamp } from "@/components/ui/stamp";
import { Loading } from "@/components/ui/feedback";

export const Route = createFileRoute("/studio/opportunity")({ component: OpportunityPage });

function OpportunityPage() {
  const { data, loading, refresh } = useStudioWorkspace();
  if (loading || !data) return <Loading />;
  if (!data.group) {
    return (
      <EmptyNote>
        Join a group before writing an opportunity.{" "}
        <Link to="/studio/group" className="font-semibold text-accent underline">
          Go to Team up
        </Link>
      </EmptyNote>
    );
  }
  const status = data.myOpportunity?.status;
  return (
    <div className="space-y-5">
      <StageHeader stage="spot" data={data} />
      {data.myOpportunity?.syncState === "pending" ? (
        <p className="rounded-[8px] border-2 border-warn/40 bg-warn-soft px-3 py-2 text-sm text-warn">
          Saved on this phone — it will sync when you are connected.
        </p>
      ) : null}
      <div className="notebook relative rounded-[10px] border-2 border-ink py-5 pr-4 pl-10 sm:pr-6">
        {status && status !== "draft" ? (
          <div className="absolute top-3 right-3">
            <Stamp tone={status === "selected" ? "forest" : status === "rejected" ? "muted" : "clay"} tilt={-8} size="md">
              {status}
            </Stamp>
          </div>
        ) : null}
        <OpportunityForm existing={data.myOpportunity} onSaved={() => void refresh()} />
      </div>
    </div>
  );
}
