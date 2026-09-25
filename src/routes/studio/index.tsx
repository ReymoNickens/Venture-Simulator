import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Megaphone, Mic, NotebookPen, Users } from "lucide-react";
import { useStudioWorkspace } from "@/hooks/workspace-context";
import { useAction } from "@/hooks/use-action";
import { progressFromSnapshot } from "@/lib/domain/stage-input";
import { currentStage, STAGE_BY_ID, EMBLEMS } from "@/lib/domain/stages";
import type { MarketEvent, WorkspaceSnapshot } from "@/lib/domain/types";
import { saveOffline } from "@/lib/offline/actions";
import { dueLabel, daysAgo, isOverdue, shortDate } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, Eyebrow } from "@/components/ui/badge";
import { Emblem } from "@/components/ui/emblem";
import { Stamp } from "@/components/ui/stamp";
import { Textarea } from "@/components/ui/input";
import { FormMessages, Loading } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/studio/")({ component: Today });

function Today() {
  const { data, loading, refresh } = useStudioWorkspace();
  if (loading || !data) return <Loading />;

  const progress = progressFromSnapshot(data);
  const current = currentStage(progress);
  const def = current ? STAGE_BY_ID[current.id] : null;
  const nextUnmet = current?.criteria.find((c) => !c.met);
  const due = def ? data.life.milestones.find((m) => m.stage === def.id) : undefined;
  const doneCount = progress.filter((p) => p.state === "done").length;
  const openShocks = data.life.marketEvents.filter((e) => !e.myResponse);
  const first = data.student?.fullName.split(" ")[0] ?? "";

  return (
    <div className="space-y-6">
      <div>
        <Eyebrow>
          {data.offering
            ? `${data.offering.courseCode} · ${data.offering.semester} ${data.offering.academicYear}`
            : "Studio"}
        </Eyebrow>
        <h1 className="mt-1 font-display text-3xl font-extrabold sm:text-4xl">
          {greeting()}, {first}.
        </h1>
        {data.group ? (
          <p className="mt-1 text-sm text-muted">
            {doneCount} of 11 stops done
            {data.venture ? ` on ${data.venture.name}` : ""}.
          </p>
        ) : null}
      </div>

      {def && current ? (
        <section className="overflow-hidden rounded-[12px] border-2 border-ink bg-bg-elevated shadow-[4px_4px_0_0_var(--color-ink)]">
          <div className="kente h-2" aria-hidden />
          <div className="p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <span className="flex size-14 shrink-0 items-center justify-center rounded-[10px] border-2 border-ink bg-gold text-ink">
                <Emblem emblem={def.emblem} className="size-9" />
              </span>
              <div className="min-w-0">
                <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
                  Next stop · {String(def.stop).padStart(2, "0")}
                </p>
                <h2 className="font-display text-2xl leading-tight font-extrabold">{def.title}</h2>
                <p className="text-xs italic text-muted">{EMBLEMS[def.emblem].meaning}</p>
              </div>
            </div>
            <p className="mt-3 text-[15px] leading-7 text-ink-soft">{def.mission}</p>
            {nextUnmet ? (
              <p className="mt-3 rounded-[8px] bg-gold-soft px-3 py-2 text-sm">
                <span className="font-semibold">Next:</span> {nextUnmet.label}
                {nextUnmet.detail ? <span className="text-muted"> — {nextUnmet.detail}</span> : null}
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Link to={def.href} className={buttonVariants({ variant: "primary" })}>
                Go to this stop <ArrowRight className="size-4" aria-hidden />
              </Link>
              {due ? (
                <span
                  className={cn(
                    "font-mono text-xs uppercase tracking-wide",
                    isOverdue(due.dueAt) ? "font-semibold text-clay" : "text-muted",
                  )}
                >
                  {dueLabel(due.dueAt)}
                </span>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {data.venture ? (
        <div className="grid grid-cols-2 gap-3">
          <Link
            to="/studio/listen"
            className="flex items-center gap-2 rounded-[10px] border-2 border-ink bg-bg-elevated px-3 py-3 text-sm font-semibold shadow-[2px_2px_0_0_var(--color-ink)]"
          >
            <Mic className="size-5 text-accent" aria-hidden /> Log an interview
          </Link>
          <Link
            to="/studio/notebook"
            className="flex items-center gap-2 rounded-[10px] border-2 border-ink bg-bg-elevated px-3 py-3 text-sm font-semibold shadow-[2px_2px_0_0_var(--color-ink)]"
          >
            <NotebookPen className="size-5 text-accent" aria-hidden /> Log evidence
          </Link>
        </div>
      ) : null}

      {openShocks.map((e) => (
        <MarketShock key={e.id} event={e} onSaved={() => void refresh()} />
      ))}

      {data.life.announcements.length ? (
        <Card as="section" className="space-y-3">
          <Eyebrow className="flex items-center gap-1.5">
            <Megaphone className="size-3.5" aria-hidden /> From your lecturers
          </Eyebrow>
          <ul className="divide-y divide-line">
            {data.life.announcements.slice(0, 3).map((a) => (
              <li key={a.id} className="py-2.5 first:pt-0 last:pb-0">
                <p className="font-display text-base font-bold">{a.title}</p>
                <p className="mt-0.5 text-sm leading-6 whitespace-pre-line text-ink-soft">{a.body}</p>
                <p className="mt-1 text-xs text-faint">
                  {a.staffName} · {shortDate(a.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {data.group ? <Team data={data} /> : null}

      {data.life.marketEvents.some((e) => e.myResponse) ? (
        <Card as="section" className="space-y-2">
          <Eyebrow>Market shocks you have answered</Eyebrow>
          <ul className="space-y-1 text-sm">
            {data.life.marketEvents
              .filter((e) => e.myResponse)
              .map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-2">
                  <span className="truncate">{e.title}</span>
                  <Stamp tone="forest" size="xs">
                    Answered
                  </Stamp>
                </li>
              ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function MarketShock({ event, onSaved }: { event: MarketEvent; onSaved: () => void }) {
  const [body, setBody] = useState("");
  const { pending, error, notice, run, setNotice } = useAction();
  return (
    <section className="rounded-[12px] border-2 border-clay bg-clay-soft/60 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-[8px] border-2 border-clay bg-bg-elevated text-clay">
          <Emblem emblem="mframadan" className="size-7" />
        </span>
        <div className="min-w-0">
          <Stamp tone="clay" size="xs" tilt={-2}>
            Market shock
          </Stamp>
          <h2 className="mt-1 font-display text-xl leading-tight font-extrabold">{event.title}</h2>
        </div>
      </div>
      <p className="mt-2 text-sm leading-6 text-ink-soft">{event.body}</p>
      <p className="mt-2 text-sm leading-6 font-semibold">{event.prompt}</p>
      {event.respondBy ? (
        <p className="mt-1 font-mono text-xs uppercase text-clay">Respond {dueLabel(event.respondBy)}</p>
      ) : null}
      {event.groupResponses.length ? (
        <p className="mt-2 text-xs text-muted">
          {event.groupResponses.length} teammate{event.groupResponses.length === 1 ? " has" : "s have"} answered —
          yours is recorded individually.
        </p>
      ) : null}
      <div className="mt-3 space-y-2">
        <Textarea
          aria-label="Your response"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="What changes for your venture? Be specific — numbers, people, places."
          className="bg-bg-elevated"
        />
        <FormMessages error={error} notice={notice} />
        <Button
          variant="danger"
          size="sm"
          disabled={Boolean(pending) || body.trim().length < 40}
          onClick={() =>
            void run("respond", async () => {
              const r = await saveOffline("respondToMarketEvent", { eventId: event.id, body });
              onSaved();
              setNotice(r.queued ? "Saved on this phone — it will sync when you are connected." : "Response recorded.");
            })
          }
        >
          {pending ? "Saving…" : "Record my response"}
        </Button>
      </div>
    </section>
  );
}

function Team({ data }: { data: WorkspaceSnapshot }) {
  const active = data.members.filter((m) => m.membershipStatus === "active");
  const lastSeen = new Map<string, string>();
  const weekCount = new Map<string, number>();
  for (const e of data.activity) {
    if (!e.studentId) continue;
    if (!lastSeen.has(e.studentId)) lastSeen.set(e.studentId, e.createdAt);
    if (daysAgo(e.createdAt) <= 7) weekCount.set(e.studentId, (weekCount.get(e.studentId) ?? 0) + 1);
  }
  const stage = !data.venture
    ? data.canOpenSelection
      ? "preference"
      : "submission"
    : "activity";
  return (
    <Card as="section">
      <div className="flex items-center justify-between gap-2">
        <Eyebrow className="flex items-center gap-1.5">
          <Users className="size-3.5" aria-hidden /> {data.group?.groupName} · Group {data.group?.groupNumber}
        </Eyebrow>
        <span className="font-mono text-xs text-muted">
          Code <span className="font-semibold text-ink">{data.group?.joinCode}</span>
        </span>
      </div>
      <ul className="mt-3 divide-y divide-line">
        {active.map((m) => {
          const seen = lastSeen.get(m.studentId);
          const n = weekCount.get(m.studentId) ?? 0;
          return (
            <li key={m.id} className="flex items-center justify-between gap-2 py-2 text-sm">
              <span className="min-w-0 truncate">
                {m.fullName}
                {m.studentId === data.student?.id ? <span className="text-faint"> (you)</span> : null}
                {m.isSynthetic ? <span className="ml-1.5 text-xs text-faint">demo peer</span> : null}
              </span>
              {stage === "submission" ? (
                m.hasSubmittedOpportunity ? (
                  <Stamp tone="forest" size="xs">Submitted</Stamp>
                ) : (
                  <span className="text-xs text-muted">not yet</span>
                )
              ) : stage === "preference" ? (
                m.hasRecordedPreference ? (
                  <Stamp tone="forest" size="xs">Voted</Stamp>
                ) : (
                  <span className="text-xs text-muted">no preference yet</span>
                )
              ) : (
                <span className="text-xs text-muted tabular">
                  {n ? `${n} this week` : seen ? `quiet ${daysAgo(seen)}d` : "no activity"}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
