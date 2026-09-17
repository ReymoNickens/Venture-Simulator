import { useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useStudioWorkspace } from "@/hooks/workspace-context";
import { OpportunityForm } from "@/components/forms/OpportunityForm";
import { Badge, Card } from "@/components/ui/badge";

export const Route = createFileRoute("/studio/opportunity")({ component: OpportunityPage });

/** How often to quietly re-check whether the group has become ready, while a
 * student is on the waiting screen. Paused while the tab isn't visible so it
 * doesn't burn data in the background. */
const WAITING_ROOM_POLL_MS = 20_000;

function OpportunityPage() {
  const { data, loading, refresh } = useStudioWorkspace();
  const submitted = Boolean(data?.myOpportunity?.status && data.myOpportunity.status !== "draft");
  const waiting = submitted && !data?.canOpenSelection;

  useEffect(() => {
    if (!waiting) return;
    const tick = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const id = window.setInterval(tick, WAITING_ROOM_POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [waiting, refresh]);

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

  if (submitted) {
    const pending = data.myOpportunity?.syncState === "pending";
    const { submitted: submittedCount, required } = data.submissionProgress;
    const teammatesLeft = Math.max(required - submittedCount, 0);

    return (
      <div className="space-y-5">
        <div role="status">
          <Card className="space-y-2">
            <Badge tone="accent">{pending ? "Saved on this device" : "Saved"}</Badge>
            <h1 className="font-display text-3xl">Your finding is in.</h1>
            <p className="text-sm leading-6 text-muted">
              {pending
                ? "It's saved on this device and will send the moment you're back online. Nothing else to do here."
                : "Your group can only see this once selection opens. Nothing else to do here."}
            </p>
          </Card>
        </div>

        {data.canOpenSelection ? (
          <Card className="space-y-3">
            <Badge tone="accent">Your team is ready</Badge>
            <h2 className="font-display text-2xl">Everyone has submitted.</h2>
            <p className="text-sm leading-6 text-muted">
              Selection is open — go compare what your team found.
            </p>
            <Link
              to="/studio/select"
              className="inline-block rounded-[10px] bg-accent px-4 py-2 text-sm font-medium text-accent-fg"
            >
              Go to selection
            </Link>
          </Card>
        ) : (
          <div aria-live="polite">
            <Card className="space-y-3">
              <h2 className="font-display text-2xl">Waiting on your team</h2>
              <p className="text-sm leading-6 text-muted">
                {submittedCount} of {required} active teammates have submitted so far.
                {teammatesLeft > 0
                  ? ` Once everyone has, this page updates on its own — you don't need to keep checking.`
                  : ""}
              </p>
              <p className="text-xs text-muted">
                You can leave and do something else — group creation, another course, anything. Come
                back here any time and this page will reflect where things stand.
              </p>
            </Card>
          </div>
        )}
      </div>
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
