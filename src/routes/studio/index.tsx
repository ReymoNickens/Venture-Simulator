import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ChevronRight, Lock, Megaphone, MessageCircle, Zap } from "lucide-react";
import { useStudioWorkspace } from "@/hooks/workspace-context";
import { useAction } from "@/hooks/use-action";
import { progressFromSnapshot } from "@/lib/domain/stage-input";
import { currentStage, STAGE_BY_ID, STAGES } from "@/lib/domain/stages";
import { activitySentence, timeAgo } from "@/lib/domain/activity";
import { RECAP_SEEN_KEY, recapInputFrom, recapTeaser, recapWeeks, weeklyRecap } from "@/lib/domain/recap";
import { PERSONA_COLORS } from "@/lib/recap-image";
import type { MarketEvent, WorkspaceSnapshot } from "@/lib/domain/types";
import { saveOffline } from "@/lib/offline/actions";
import { dueLabel, isOverdue } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { StopSticker, Sparkle } from "@/components/ui/sticker";
import type { Tint } from "@/lib/domain/stages";
import { Stamp } from "@/components/ui/stamp";
import { Textarea } from "@/components/ui/input";
import { FormMessages, Loading } from "@/components/ui/feedback";
import { Ring } from "@/components/stage/StageHeader";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/studio/")({ component: Today });

/** The hero takes the colour of the stop you are on. */
const HERO: Record<Tint, string> = {
  butter: "bg-gold text-ink",
  coral: "bg-clay-soft text-ink",
  lilac: "bg-indigo-soft text-ink",
  cobalt: "bg-accent-soft text-ink",
  mint: "bg-mint-soft text-ink",
  pink: "bg-[#ffe3f1] text-ink",
};

/**
 * Today answers three questions, in this order, and nothing else:
 *   1. What is my next move?            (one card, one button)
 *   2. What changed since I last looked? (lecturer, shocks, teammates)
 *   3. What is coming?                   (a sealed glimpse of the next stop)
 */
function Today() {
  const { data, loading, refresh } = useStudioWorkspace();
  if (loading || !data) return <Loading />;

  const progress = progressFromSnapshot(data);
  const current = currentStage(progress);
  const def = current ? STAGE_BY_ID[current.id] : null;
  const nextUnmet = current?.criteria.find((c) => !c.met);
  const due = def ? data.life.milestones.find((m) => m.stage === def.id) : undefined;
  const doneCount = progress.filter((p) => p.state === "done").length;
  const shock = data.life.marketEvents.find((e) => !e.myResponse);
  const ahead = def ? STAGES.find((s) => s.stop === def.stop + 1) : null;
  const staffMessages = data.life.messages.filter((m) => m.authorKind === "staff");
  const latestStaff = staffMessages[staffMessages.length - 1];
  const announcement = data.life.announcements[0];
  const first = data.student?.fullName.split(" ")[0] ?? "";

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[28px] leading-tight font-extrabold sm:text-4xl">
            {greeting()}, {first}.
          </h1>
          <p className="mt-0.5 text-sm text-muted">
            {data.venture ? data.venture.name : data.group ? data.group.groupName : "Let’s get you into a group."}
          </p>
        </div>
        {data.group ? (
          <Link to="/studio/map" className="relative shrink-0" aria-label={`${doneCount} of 11 stops done — see the route`}>
            <Ring value={doneCount / 11} size={52} />
            <span className="absolute inset-0 flex items-center justify-center font-mono text-xs font-semibold tabular">
              {doneCount}/11
            </span>
          </Link>
        ) : null}
      </div>

      {def && current ? (
        <section className={cn("relative overflow-hidden rounded-[28px] p-6", HERO[def.tint])}>
          <Sparkle className="absolute top-5 right-6 size-5 opacity-70" />
          <StopSticker stage={def.id} size="lg" />
          <p className="mt-5 text-sm font-semibold opacity-75">Your next move</p>
          <h2 className="font-display text-[30px] leading-[1.05] font-extrabold">{def.title}</h2>
          <p className="mt-2 text-[16px] leading-7 opacity-90">
            {nextUnmet ? nextUnmet.label : def.mission}
            {nextUnmet?.detail ? <span className="opacity-70"> ({nextUnmet.detail})</span> : null}
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Link to={def.href} className={buttonVariants({ size: "lg" })}>
              Let’s go <ArrowRight className="size-4" aria-hidden />
            </Link>
            {due ? (
              <span className={cn("text-sm font-semibold", isOverdue(due.dueAt) ? "text-clay" : "opacity-75")}>
                {dueLabel(due.dueAt)}
              </span>
            ) : null}
          </div>
        </section>
      ) : null}

      {data.life.unreadMessages > 0 && latestStaff ? (
        <Link to="/studio/messages" className="flex items-start gap-3 rounded-[22px] bg-indigo-soft p-4">
          <MessageCircle className="mt-0.5 size-5 shrink-0 text-indigo" aria-hidden />
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-indigo">
              {latestStaff.authorName} · {data.life.unreadMessages} new
            </span>
            <span className="line-clamp-2 text-sm leading-6 text-ink-soft">{latestStaff.body}</span>
          </span>
        </Link>
      ) : null}

      {shock ? <MarketShock event={shock} onSaved={() => void refresh()} /> : null}

      {announcement && daysSince(announcement.createdAt) <= 7 ? (
        <section className="flex items-start gap-3 rounded-[22px] bg-bg-elevated p-4 ring-1 ring-line">
          <Megaphone className="mt-0.5 size-5 shrink-0 text-gold-deep" aria-hidden />
          <div className="min-w-0">
            <p className="font-semibold">{announcement.title}</p>
            <p className="mt-0.5 text-sm leading-6 whitespace-pre-line text-ink-soft">{announcement.body}</p>
            <p className="mt-1 text-xs text-faint">
              {announcement.staffName} · {timeAgo(announcement.createdAt)} ago
            </p>
          </div>
        </section>
      ) : null}

      {data.group && data.student ? <RecapTeaser data={data} owner={data.student.id} /> : null}

      {ahead && def ? (
        <section className="flex items-center gap-3 rounded-[22px] border-2 border-dashed border-line-strong p-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-bg-subtle text-faint">
            <Lock className="size-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-muted">After this · stop {ahead.stop}</p>
            <p className="text-[15px] leading-6 text-ink-soft italic">{ahead.teaser}</p>
          </div>
        </section>
      ) : null}

      {data.group ? <TeamFeed data={data} /> : null}
    </div>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

/**
 * Last week's card, offered once: it shows from Monday until the student
 * opens it, and only when the crew actually did something worth posting.
 */
function RecapTeaser({ data, owner }: { data: WorkspaceSnapshot; owner: string }) {
  const last = useMemo(() => {
    const input = recapInputFrom(data);
    const week = recapWeeks(input)[1];
    return week ? weeklyRecap(input, week) : null;
  }, [data]);
  const [seen, setSeen] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    try {
      setSeen(localStorage.getItem(RECAP_SEEN_KEY(owner)));
    } catch {
      setSeen(null);
    }
  }, [owner]);
  const line = last ? recapTeaser(last) : "";
  if (!last || !line || seen === undefined || (seen && seen >= last.weekStart)) return null;
  const c = PERSONA_COLORS[last.persona.key];
  return (
    <Link to="/studio/recap" className="flex items-center gap-3 rounded-[22px] p-4" style={{ background: c.bg, color: c.ink }}>
      <Sparkle className="size-6 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold opacity-80">Your week is ready · {last.label}</span>
        <span className="block font-display text-lg leading-tight font-extrabold">{last.persona.title}</span>
        <span className="block text-sm opacity-80">{line}</span>
      </span>
      <ChevronRight className="size-5 shrink-0" aria-hidden />
    </Link>
  );
}

function TeamFeed({ data }: { data: WorkspaceSnapshot }) {
  const names = new Map(data.members.map((m) => [m.studentId, m.fullName.split(" ")[0]]));
  const me = data.student?.id;
  const lines = data.activity
    .map((e) => ({
      e,
      text: activitySentence(e.eventType, e.studentId === me ? "You" : e.studentId ? (names.get(e.studentId) ?? null) : null),
    }))
    .filter((x): x is { e: (typeof data.activity)[number]; text: string } => Boolean(x.text))
    .slice(0, 6);
  if (!lines.length) return null;
  return (
    <section>
      <p className="mb-3 text-xs font-semibold text-muted">Your team lately</p>
      <ul className="space-y-2">
        {lines.map(({ e, text }) => (
          <li key={e.id} className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-ink-soft">{text}</span>
            <span className="shrink-0 font-mono text-[11px] text-faint">{timeAgo(e.createdAt)}</span>
          </li>
        ))}
      </ul>
      <Link to="/studio/recap" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-accent">
        See your week <ChevronRight className="size-4" aria-hidden />
      </Link>
    </section>
  );
}

function MarketShock({ event, onSaved }: { event: MarketEvent; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const { pending, error, notice, run, setNotice } = useAction();
  return (
    <section className="rounded-[22px] bg-clay-soft p-4">
      <div className="flex items-start gap-3">
        <span className="sticker flex size-11 shrink-0 rotate-[-6deg] items-center justify-center rounded-full bg-clay text-white">
          <Zap className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Stamp tone="clay" size="xs">
              Breaking
            </Stamp>
            {event.respondBy ? <span className="font-mono text-[11px] text-clay uppercase">answer {dueLabel(event.respondBy)}</span> : null}
          </div>
          <h2 className="mt-1 font-display text-lg leading-snug font-extrabold">{event.title}</h2>
        </div>
      </div>
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="mt-3 text-sm font-semibold text-clay underline underline-offset-2">
          Read it and respond
        </button>
      ) : (
        <div className="rise mt-3 space-y-2">
          <p className="text-sm leading-6 text-ink-soft">{event.body}</p>
          <p className="text-sm leading-6 font-semibold">{event.prompt}</p>
          <Textarea
            aria-label="Your response"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="What changes for your venture? Be specific."
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
                setNotice(r.queued ? "Saved on this phone — it will send when you are back online." : "Recorded.");
                onSaved();
              })
            }
          >
            {pending ? "Saving…" : body.trim().length < 40 ? `A little more (${body.trim().length}/40)` : "Send my response"}
          </Button>
          {event.groupResponses.length ? (
            <p className="text-xs text-muted">{event.groupResponses.length} teammate(s) have answered. Yours is your own.</p>
          ) : null}
        </div>
      )}
    </section>
  );
}
