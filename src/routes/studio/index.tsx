import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Check, ChevronRight, Copy, MessageSquareText, Users } from "lucide-react";
import { useState } from "react";
import { useStudioWorkspace } from "@/hooks/workspace-context";
import { journeyFromSnapshot } from "@/lib/domain/journey-progress";
import type { JourneyId } from "@/lib/domain/state-machine";
import type { WorkspaceSnapshot } from "@/lib/domain/types";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card } from "@/components/ui/badge";
import { Loading } from "@/components/ui/feedback";
import { StepSticker } from "@/components/ui/sticker";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/studio/")({ component: StudioHome });

type StudioHref =
  | "/studio/group"
  | "/studio/opportunity"
  | "/studio/select"
  | "/studio/venture"
  | "/studio/simulation";

type NextStep = {
  step: JourneyId;
  title: string;
  body: string;
  href: StudioHref;
  cta: string;
  waiting?: boolean;
};

function nextStep(data: WorkspaceSnapshot): NextStep {
  if (!data.group) {
    return {
      step: "group",
      title: "Find your group",
      body: "Everything happens in a group of up to ten. Join with the code a classmate shares, start a new group, or try a practice group on your own.",
      href: "/studio/group",
      cta: "Find your group",
    };
  }
  if (!data.myOpportunity || data.myOpportunity.status === "draft") {
    return {
      step: data.myOpportunity ? "submit" : "opportunity",
      title: data.myOpportunity ? "Finish your problem" : "Spot a real problem",
      body: "Go out alone and find one problem you can see or count: a queue, a wasted hour, money lost. Your group only sees it once everyone has submitted.",
      href: "/studio/opportunity",
      cta: data.myOpportunity ? "Keep writing" : "Start",
    };
  }
  if (!data.canOpenSelection) {
    const { submitted, required } = data.submissionProgress;
    return {
      step: "submit",
      title: "Waiting for your group",
      body: `${submitted} of ${required} members have submitted. Choosing opens when everyone has, so nobody copies anybody.`,
      href: "/studio/opportunity",
      cta: "Review what you sent",
      waiting: true,
    };
  }
  if (!data.venture) {
    return {
      step: "select",
      title: "Pick one problem together",
      body: "Read everyone’s problem. Say which one you would pick and why, before the group decides.",
      href: "/studio/select",
      cta: "Compare problems",
    };
  }
  const sim = data.simulation;
  if (!sim) {
    return {
      step: "simulate",
      title: "Launch your venture",
      body: "Six weeks, real-feeling money. Every week you set a price, order stock and see what happened. Keep logging evidence alongside.",
      href: "/studio/simulation",
      cta: "Open the venture",
    };
  }
  if (sim.status === "operating" && sim.completedPeriod < sim.periodCount) {
    return {
      step: "simulate",
      title: `Week ${sim.completedPeriod + 1} of ${sim.periodCount}`,
      body: "Look at what changed in the market, then decide price, stock and marketing for this week.",
      href: "/studio/simulation",
      cta: `Decide week ${sim.completedPeriod + 1}`,
    };
  }
  return {
    step: data.evidence.length ? "assumptions" : "evidence",
    title: data.evidence.length ? "Test what you still assume" : "Log what you found",
    body: "Record what you saw and heard. Say honestly whether it is a fact, an opinion or a guess, and link it to the assumptions that could sink the idea.",
    href: "/studio/venture",
    cta: "Open your notebook",
  };
}

function StudioHome() {
  const { data, loading } = useStudioWorkspace();
  if (loading || !data) return <Loading />;

  const next = nextStep(data);
  const progress = journeyFromSnapshot(data);
  const firstName = data.student?.fullName.split(" ")[0];
  const active = data.members.filter((m) => m.membershipStatus === "active");

  return (
    <div className="flow-enter space-y-5 pt-2">
      <div>
        <p className="text-xs font-semibold text-muted">
          {data.offering
            ? [data.offering.courseCode, data.offering.programme, data.offering.level].filter(Boolean).join(" · ")
            : "Studio"}
        </p>
        <h1 className="font-display text-[34px] leading-none font-semibold">
          {firstName ? `Hi, ${firstName}.` : "Studio"}
        </h1>
      </div>

      <section
        aria-labelledby="next-title"
        className={cn(
          "relative mt-3 rounded-[14px] border border-line bg-bg-elevated px-5 pt-5 pb-5",
          !next.waiting && "border-l-4 border-l-accent",
        )}
      >
        <div className="flex items-center gap-3">
          <StepSticker step={next.step} size="md" />
          <div>
            <p className="text-xs font-semibold text-muted">
              {next.waiting ? "Nothing to do right now" : `Step ${progress.stop} of ${progress.total} · Now`}
            </p>
            <h2 id="next-title" className="font-display text-2xl leading-tight font-semibold">
              {next.title}
            </h2>
          </div>
        </div>
        <p className="mt-3 text-[15px] leading-6 text-ink-soft">{next.body}</p>
        <Link
          to={next.href}
          className={cn(
            buttonVariants({ size: "lg", variant: next.waiting ? "secondary" : "primary" }),
            "mt-5 w-full",
          )}
        >
          {next.cta} <ArrowRight className="size-4" aria-hidden />
        </Link>
      </section>

      {data.feedback.length ? (
        <section aria-labelledby="feedback-title" className="rounded-[14px] border-2 border-indigo/30 bg-indigo-soft p-4">
          <h2 id="feedback-title" className="flex items-center gap-2 text-xs font-semibold text-indigo">
            <MessageSquareText className="size-4" aria-hidden /> From your lecturer
          </h2>
          <p className="mt-1.5 text-[15px] leading-6">{data.feedback[0].body}</p>
          <p className="mt-1 text-xs text-muted">
            {data.feedback[0].author} · {new Date(data.feedback[0].at).toLocaleDateString()}
          </p>
          {data.feedback.length > 1 ? (
            <details className="mt-2">
              <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-indigo">Earlier feedback</summary>
              <ul className="space-y-2">
                {data.feedback.slice(1).map((f) => (
                  <li key={f.id} className="rounded-[14px] bg-bg-elevated px-3 py-2 text-sm leading-6">
                    {f.body}
                    <span className="block text-xs text-faint">
                      {f.author} · {new Date(f.at).toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </section>
      ) : null}

      {data.isClassRep ? (
        <Link
          to="/studio/class"
          className="flex items-center gap-3.5 rounded-[14px] border border-line bg-bg-elevated p-4 hover:border-ink/40"
        >
          <span className="sticker flex size-11 shrink-0 items-center justify-center rounded-full bg-indigo text-white">
            <Users className="size-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-lg leading-tight font-bold">Your class list</span>
            <span className="block text-sm text-muted">You are the course rep. Add students and see who has activated.</span>
          </span>
          <ChevronRight className="size-5 shrink-0 text-faint" aria-hidden />
        </Link>
      ) : null}

      {data.group ? (
        <Card className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-muted">Group {data.group.groupNumber}</p>
              <h3 className="truncate font-display text-lg font-bold">{data.group.groupName}</h3>
            </div>
            <JoinCode code={data.group.joinCode} />
          </div>
          <details className="group">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold">
              <span>
                {active.length} members · {active.filter((m) => m.hasSubmittedOpportunity).length} have
                submitted
              </span>
              <span className="text-muted group-open:hidden">Show</span>
              <span className="hidden text-muted group-open:inline">Hide</span>
            </summary>
            <ul className="mt-1 divide-y divide-line">
              {active.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0 truncate">
                    {m.fullName}
                    {m.isSynthetic ? <span className="ml-2 text-xs text-faint">practice peer</span> : null}
                  </span>
                  {m.hasSubmittedOpportunity ? (
                    <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-mint">
                      <Check className="size-3.5" aria-hidden /> Submitted
                    </span>
                  ) : (
                    <span className="shrink-0 text-xs text-muted">Not yet</span>
                  )}
                </li>
              ))}
            </ul>
          </details>
        </Card>
      ) : null}
    </div>
  );
}

function JoinCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(code).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        });
      }}
      className="flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-gold-soft px-3.5 font-mono text-sm font-medium text-gold-deep"
      aria-label={`Join code ${code}. Copy to share with your group.`}
    >
      {code}
      {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
    </button>
  );
}
