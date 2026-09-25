import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Mail } from "lucide-react";
import { useStudioWorkspace } from "@/hooks/workspace-context";
import { OpportunityForm } from "@/components/forms/OpportunityForm";
import { MissionStart } from "@/components/stage/MissionStart";
import { StageHeader } from "@/components/stage/StageHeader";
import { EmptyNote } from "@/components/ui/badge";
import { Stamp } from "@/components/ui/stamp";
import { Button } from "@/components/ui/button";
import { Loading } from "@/components/ui/feedback";
import { shortDateTime } from "@/lib/dates";

export const Route = createFileRoute("/studio/opportunity")({ component: OpportunityPage });

function OpportunityPage() {
  const { data, loading, refresh } = useStudioWorkspace();
  const [mode, setMode] = useState<"intro" | "flow" | "view">("view");
  const [justSaved, setJustSaved] = useState<string | null>(null);
  if (loading || !data) return <Loading />;
  if (!data.group) {
    return (
      <EmptyNote>
        Join a group first.{" "}
        <Link to="/studio/group" className="font-semibold text-accent underline">
          Team up
        </Link>
      </EmptyNote>
    );
  }
  const mine = data.myOpportunity;
  const submitted = Boolean(mine && mine.status !== "draft");
  const locked = data.group.status === "venture_created";
  const effective = mode === "view" && !submitted ? "intro" : mode;

  if (effective === "flow" && !locked) {
    return (
      <OpportunityForm
        existing={mine}
        onCancel={() => setMode("view")}
        onSaved={(r) => {
          setJustSaved(
            r.queued
              ? "Saved on this phone. It will be sealed and sent when you are back online."
              : r.submitted
                ? "Sealed."
                : "Draft saved. Only you can see it.",
          );
          setMode("view");
          void refresh();
        }}
      />
    );
  }

  if (effective === "intro") {
    return (
      <div className="space-y-4">
        <MissionStart
          stage="spot"
          time="About 10 minutes to write it up"
          bring="after you have looked"
          cta={mine ? "Continue your draft" : "Start"}
          onStart={() => setMode("flow")}
        >
          <p className="mt-4 rounded-[8px] bg-white/10 px-3 py-2 text-sm leading-6 text-bg-elevated/85">
            Haven’t found one yet? Spend twenty minutes at Science Market, the shuttle stop or Kotokuraba.
            Watch where people wait, complain, or pay more than they should.
          </p>
        </MissionStart>
        {justSaved ? <p className="text-sm text-accent">{justSaved}</p> : null}
      </div>
    );
  }

  const done = data.submissionProgress.submitted;
  const total = data.submissionProgress.required;
  return (
    <div className="space-y-5">
      <StageHeader stage="spot" data={data} />
      {justSaved ? <p className="text-sm font-semibold text-accent">{justSaved}</p> : null}
      {mine ? (
        <section className="relative overflow-hidden rounded-[12px] border-2 border-ink bg-[#f3e6c8] p-5 shadow-[4px_4px_0_0_var(--color-ink)]">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Mail className="size-5" aria-hidden /> Your opportunity
            </div>
            <Stamp tone={mine.status === "selected" ? "forest" : mine.status === "rejected" ? "muted" : "clay"} size="md" tilt={-7}>
              {mine.status === "submitted" ? "Sealed" : mine.status === "rejected" ? "Not chosen" : mine.status}
            </Stamp>
          </div>
          <p className="mt-3 font-display text-xl leading-snug font-bold">{mine.problem}</p>
          <p className="mt-2 text-sm text-ink-soft">
            {mine.affectedPeople} · {mine.context}
          </p>
          <p className="mt-3 text-xs text-muted">
            {mine.submittedAt ? `Sealed ${shortDateTime(mine.submittedAt)}` : ""}
            {mine.syncState === "pending" ? " · waiting for a connection" : ""}
          </p>
          {!locked ? (
            <Button variant="secondary" size="sm" className="mt-4" onClick={() => setMode("flow")}>
              {data.canOpenSelection ? "Edit (your group can already see it)" : "Edit before the group sees it"}
            </Button>
          ) : null}
        </section>
      ) : null}
      {!data.canOpenSelection ? (
        <section className="rounded-[12px] border-2 border-dashed border-ink/50 p-5 text-center">
          <p className="font-display text-4xl font-extrabold tabular">
            {done}
            <span className="text-muted">/{total}</span>
          </p>
          <p className="mt-1 text-sm text-muted">envelopes sealed</p>
          <div className="mx-auto mt-3 flex max-w-xs justify-center gap-1.5">
            {Array.from({ length: total }).map((_, i) => (
              <span key={i} className={`h-8 w-6 rounded-[3px] border-2 ${i < done ? "border-ink bg-[#f3e6c8]" : "border-dashed border-line-strong"}`} />
            ))}
          </div>
          <p className="mt-3 text-sm leading-6">
            When the last one lands, every idea opens at once — and you choose together.
          </p>
        </section>
      ) : (
        <Link to="/studio/select" className="block rounded-[12px] border-2 border-ink bg-gold p-4 text-center font-display text-lg font-extrabold shadow-[3px_3px_0_0_var(--color-ink)]">
          All envelopes are open. See every idea →
        </Link>
      )}
    </div>
  );
}
