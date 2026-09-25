import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Lock, MessageSquareQuote, Share2, Sparkles } from "lucide-react";
import { useStudioWorkspace } from "@/hooks/workspace-context";
import { Avatar } from "@/components/ui/avatar";
import { Card, SectionTitle } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/empty";
import { buttonVariants } from "@/components/ui/button";
import { JOURNEY_STEPS, LATER_CHAPTERS } from "@/lib/domain/config";
import { journeyState } from "@/lib/domain/state-machine";
import { CHAPTER_COLOR, describeEvent, nextStep, timeAgo, whatsappInvite, type Chapter } from "@/lib/domain/story";
import type { WorkspaceSnapshot } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/studio/")({ component: StudioHome });

const CHAPTER_LABEL: Record<Chapter, string> = { team: "Team", idea: "Your idea", decide: "Decide", evidence: "Evidence", assumptions: "Assumptions", test: "Test" };

function StudioHome() {
  const { data, loading } = useStudioWorkspace();
  if (loading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-52" />
        <Skeleton className="h-28" />
      </div>
    );
  }
  const first = data.student?.fullName.split(" ")[0] ?? "there";
  const step = nextStep(data);
  const color = CHAPTER_COLOR[step.chapter];
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const shareHref = data.group ? whatsappInvite(data.group.groupName, data.group.joinCode, origin) : "";

  return (
    <div className="space-y-6">
      <div className="animate-rise">
        <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-muted">
          {data.offering ? `${data.offering.courseCode} · ${data.offering.semester} ${data.offering.academicYear}` : "Venture studio"}
        </p>
        <h1 className="mt-1 font-display text-[2rem] leading-tight sm:text-4xl">Akwaaba, {first}.</h1>
      </div>

      {/* The one thing to do next */}
      <section aria-label="Next step" className="animate-rise overflow-hidden rounded-[26px] bg-night text-accent-fg shadow-[var(--shadow-lift)]">
        <div className="kente h-2" />
        <div className="relative p-6 sm:p-7">
          <div className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full opacity-25 blur-2xl" style={{ background: color }} />
          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em]" style={{ background: color, color: "white" }}>
            {step.waiting ? "Waiting" : "Next up"} · {CHAPTER_LABEL[step.chapter]}
          </span>
          <h2 className="mt-3 font-display text-[1.7rem] leading-[1.15] text-accent-fg sm:text-3xl">{step.title}</h2>
          <p className="mt-2 max-w-[52ch] text-[15px] leading-6 text-accent-fg/80">{step.body}</p>
          <div className="mt-5">
            {step.href === "share" ? (
              <a href={shareHref} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "sun", size: "lg" })}>
                <Share2 className="size-4" /> {step.cta}
              </a>
            ) : (
              <Link to={step.href} search={step.search as never} className={buttonVariants({ variant: "sun", size: "lg" })}>
                {step.cta} <ArrowRight className="size-4" />
              </Link>
            )}
          </div>
        </div>
      </section>

      {data.notes[0] ? (
        <Card className="animate-rise border-sun/60 bg-sun-soft/60">
          <div className="flex gap-3">
            <MessageSquareQuote className="mt-0.5 size-5 shrink-0 text-[#8a5a0f]" aria-hidden />
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#8a5a0f]">Note from {data.notes[0].authorName} · {timeAgo(data.notes[0].createdAt)}</p>
              <p className="mt-1 whitespace-pre-line text-[15px] leading-6">{data.notes[0].body}</p>
            </div>
          </div>
        </Card>
      ) : null}

      {data.group ? <TeamCard data={data} shareHref={shareHref} /> : null}

      <JourneyMap data={data} />

      {data.group ? <Activity data={data} /> : null}
    </div>
  );
}

function TeamCard({ data, shareHref }: { data: WorkspaceSnapshot; shareHref: string }) {
  const g = data.group!;
  const active = data.members.filter((m) => m.membershipStatus === "active");
  const phase = !data.canOpenSelection ? "idea" : !data.venture ? "vote" : "venture";
  const done = (m: (typeof active)[number]) => (phase === "idea" ? m.hasSubmittedOpportunity : phase === "vote" ? m.hasRecordedPreference : true);
  const count = active.filter(done).length;
  const open = ["forming", "opportunity_collection"].includes(g.status);
  return (
    <Card className="animate-rise">
      <SectionTitle
        kicker={`Group ${g.groupNumber} · ${active.length}/${g.capacity}`}
        title={g.groupName}
        action={
          open ? (
            <a href={shareHref} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "secondary", size: "sm" })}>
              <Share2 className="size-3.5" /> Invite
            </a>
          ) : null
        }
      />
      <p className="mt-1 text-sm text-muted">
        {phase === "idea" ? `${count} of ${active.length} have sealed their idea` : phase === "vote" ? `${count} of ${active.length} have voted` : "Building the venture together"}
        {open ? (
          <> · code <span className="font-mono font-semibold text-ink">{g.joinCode}</span></>
        ) : null}
      </p>
      <ul className="scroll-snap-x -mx-5 mt-3 flex gap-3 overflow-x-auto px-5 pb-1 pt-1.5">
        {active.map((m) => {
          const me = m.studentId === data.student?.id;
          return (
            <li key={m.id} className="flex w-16 shrink-0 flex-col items-center gap-1.5 text-center">
              <Avatar name={m.fullName} size={44} ring={me ? "you" : phase === "venture" ? "none" : done(m) ? "done" : "waiting"} />
              <span className="w-full truncate text-xs font-semibold">{me ? "You" : m.fullName.split(" ")[0]}</span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function JourneyMap({ data }: { data: WorkspaceSnapshot }) {
  const j = journeyState({
    hasGroup: Boolean(data.group),
    hasDraftOrOpportunity: Boolean(data.myOpportunity),
    hasSubmitted: Boolean(data.myOpportunity) && data.myOpportunity?.status !== "draft",
    groupStatus: data.group?.status ?? null,
    hasVenture: Boolean(data.venture),
    evidenceCount: data.evidence.length,
    assumptionCount: data.assumptions.length,
    experimentsDone: data.experiments.filter((x) => x.status === "done").length,
  });
  const detail: Record<string, string> = {
    team: data.group ? data.group.groupName : "Join or start a group",
    idea: data.myOpportunity ? (data.myOpportunity.status === "draft" ? "Draft saved" : "Sealed") : "A real problem you've seen",
    decide: data.venture ? data.venture.name : data.canOpenSelection ? "Compare, vote, decide" : "Opens when everyone submits",
    evidence: `${data.evidence.length} item${data.evidence.length === 1 ? "" : "s"}`,
    assumptions: `${data.assumptions.length} named`,
    test: `${data.experiments.filter((x) => x.status === "done").length} finished`,
  };
  return (
    <Card className="animate-rise">
      <SectionTitle kicker="The course" title="Your venture journey" />
      <ol className="relative mt-4 space-y-1">
        {JOURNEY_STEPS.map((s, i) => {
          const st = j[s.id];
          const c = CHAPTER_COLOR[s.id];
          return (
            <li key={s.id} className="relative">
              {i < JOURNEY_STEPS.length - 1 ? <span className="absolute left-[19px] top-10 h-[calc(100%-22px)] w-0.5 bg-line" aria-hidden /> : null}
              <Link to={s.href} className={cn("flex items-center gap-3 rounded-[14px] px-1 py-2 transition-colors hover:bg-bg-subtle", st === "current" && "bg-bg-subtle/70")}>
                <span
                  className="relative z-10 ml-1 grid size-8 shrink-0 place-items-center rounded-full border-2 text-xs font-bold"
                  style={{ borderColor: st === "todo" ? "var(--color-line)" : c, background: st === "done" ? c : "var(--color-bg-elevated)", color: st === "done" ? "white" : st === "current" ? c : "var(--color-faint)" }}
                >
                  {st === "done" ? "✓" : i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-[15px] font-semibold", st === "todo" && "text-faint")}>{s.label}</span>
                  <span className="block truncate text-xs text-muted">{detail[s.id]}</span>
                </span>
                {st === "current" ? <span className="mr-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white" style={{ background: c }}>Now</span> : null}
              </Link>
            </li>
          );
        })}
      </ol>
      <div className="mt-4 rounded-[16px] bg-bg-subtle/70 p-4">
        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
          <Lock className="size-3" aria-hidden /> Later in the course
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {LATER_CHAPTERS.map((c) => (
            <div key={c.title} className="rounded-[12px] bg-bg-elevated/70 px-3 py-2">
              <p className="text-sm font-semibold text-ink-soft">{c.title}</p>
              <p className="text-[11px] leading-4 text-muted">{c.body}</p>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function Activity({ data }: { data: WorkspaceSnapshot }) {
  const names = new Map(data.members.map((m) => [m.studentId, m.studentId === data.student?.id ? "You" : m.fullName.split(" ")[0]]));
  const full = new Map(data.members.map((m) => [m.studentId, m.fullName]));
  const items = data.activity
    .map((e) => ({ e, d: describeEvent(e, names) }))
    .filter((x): x is { e: (typeof data.activity)[number]; d: { who: string | null; text: string } } => Boolean(x.d))
    .slice(0, 8);
  if (!items.length) return null;
  return (
    <Card className="animate-rise">
      <SectionTitle kicker="Team activity" title="What's been happening" />
      <ul className="mt-3 divide-y divide-line/70">
        {items.map(({ e, d }) => (
          <li key={e.id} className="flex items-center gap-3 py-2.5">
            {d.who && e.studentId ? (
              <Avatar name={full.get(e.studentId) ?? d.who} size={28} />
            ) : (
              <span className="grid size-7 place-items-center rounded-full bg-sun-soft text-[#8a5a0f]"><Sparkles className="size-3.5" /></span>
            )}
            <p className="min-w-0 flex-1 text-sm">
              {d.who ? <span className="font-semibold">{d.who} </span> : null}
              {d.text}
            </p>
            <span className="shrink-0 text-xs text-faint">{timeAgo(e.createdAt)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
