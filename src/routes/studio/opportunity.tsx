import { createFileRoute, Link } from "@tanstack/react-router";
import { useStudioWorkspace } from "@/hooks/workspace-context";
import { OpportunityForm } from "@/components/forms/OpportunityForm";
import { EmptyNote } from "@/components/ui/badge";
import { Loading } from "@/components/ui/feedback";
import { StepHeader } from "@/components/shell/StepHeader";

export const Route = createFileRoute("/studio/opportunity")({ component: OpportunityPage });

function OpportunityPage() {
  const { data, loading, refresh } = useStudioWorkspace();
  if (loading || !data) return <Loading />;
  if (!data.group) {
    return (
      <div>
        <StepHeader step="opportunity" title="Spot a real problem" />
        <EmptyNote>
          Join a group first.{" "}
          <Link to="/studio/group" className="font-semibold text-accent underline underline-offset-2">
            Find your group
          </Link>
        </EmptyNote>
      </div>
    );
  }

  const submitted = Boolean(data.myOpportunity && data.myOpportunity.status !== "draft");
  const { submitted: done, required } = data.submissionProgress;

  return (
    <div>
      <StepHeader
        step={submitted ? "submit" : "opportunity"}
        aside={`${done} of ${required} submitted`}
        title={submitted ? "Your problem is in" : "Spot a real problem"}
        lead={
          submitted
            ? "Your group sees it once everyone has submitted. You can still sharpen it until the group picks a venture."
            : "Go out alone: a hostel, a market, a trotro station, a lecture hall. Find one problem you can see or count. An AI-written idea is not evidence."
        }
      />
      {data.myOpportunity?.syncState === "pending" ? (
        <p className="mb-4 rounded-[14px] bg-gold-soft px-3 py-2 text-sm text-gold-deep">
          Saved on this phone. It will send when you are back online.
        </p>
      ) : null}
      <OpportunityForm
        existing={data.myOpportunity}
        storageKey={`opportunity-draft:${data.student?.id ?? "me"}:${data.group.id}`}
        onSaved={() => void refresh()}
      />
    </div>
  );
}
