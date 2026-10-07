import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Send } from "lucide-react";
import { useLecturer } from "@/hooks/lecturer-context";
import { getLecturerGroup, sendGroupFeedback } from "@/lib/server/lecturers";
import type { ActivityItem, GroupDetail } from "@/lib/lecturers/data";
import { attentionFor, FEEDBACK_PHRASES } from "@/lib/lecturers/insights";
import { formatGhs } from "@/sim/index";
import { Button } from "@/components/ui/button";
import { Card, EmptyNote } from "@/components/ui/badge";
import { FormMessages, Loading } from "@/components/ui/feedback";
import { Textarea } from "@/components/ui/input";
import { ClassificationStamp, Stamp } from "@/components/ui/stamp";
import { eventWords, timeAgo } from "@/components/lecturer/words";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/lecturer/groups/$groupId")({ component: GroupPage });

type Tab = "overview" | "work" | "simulation" | "activity";

function GroupPage() {
  const { groupId } = Route.useParams();
  const { home, refresh: refreshHome } = useLecturer();
  const [data, setData] = useState<{ detail: GroupDetail; activity: ActivityItem[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");

  const load = useCallback(async () => {
    try {
      setData(await getLecturerGroup({ data: { groupId } }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open this group.");
    }
  }, [groupId]);
  useEffect(() => {
    void load();
  }, [load]);

  const back = (
    <Link to="/lecturer" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-muted">
      <ArrowLeft className="size-4" aria-hidden /> All groups
    </Link>
  );
  if (error) return <div className="space-y-3 pt-2">{back}<FormMessages error={error} /></div>;
  if (!data) return <Loading />;

  const d = data.detail;
  const signals = home.groups.find((g) => g.groupId === groupId);
  const reasons = signals ? attentionFor(signals) : [];

  return (
    <div className="flow-enter space-y-4 pt-1">
      {back}
      <div>
        <p className="text-xs font-semibold text-muted">
          Group {d.groupNumber} · {d.groupName} · {d.members.length} members
        </p>
        <h1 className="font-display text-[30px] leading-tight font-extrabold">{d.venture?.name ?? d.groupName}</h1>
      </div>

      {reasons.length ? (
        <ul className="space-y-1 rounded-[14px] bg-gold-soft p-3 text-sm text-gold-deep">
          {reasons.map((r) => (
            <li key={r.code} className="flex gap-2 leading-6">
              <span className="mt-2 size-2 shrink-0 rounded-full bg-gold-deep" aria-hidden />
              {r.text}
            </li>
          ))}
        </ul>
      ) : null}

      <FeedbackBox groupId={groupId} feedback={d.feedback} onSent={() => void Promise.all([load(), refreshHome()])} />

      <div role="tablist" aria-label="Group" className="grid grid-cols-4 gap-1 rounded-full bg-bg-subtle p-1">
        {(
          [
            ["overview", "People"],
            ["work", "Work"],
            ["simulation", "Money"],
            ["activity", "Activity"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn("min-h-11 rounded-full text-sm font-semibold", tab === id ? "bg-bg-elevated shadow-sm" : "text-muted")}
          >
            {label}
          </button>
        ))}
      </div>

      <div key={tab} className="flow-enter">
        {tab === "overview" ? <People d={d} /> : null}
        {tab === "work" ? <Work d={d} /> : null}
        {tab === "simulation" ? <Money d={d} /> : null}
        {tab === "activity" ? <ActivityList items={data.activity} /> : null}
      </div>
    </div>
  );
}

function FeedbackBox({ groupId, feedback, onSent }: { groupId: string; feedback: GroupDetail["feedback"]; onSent: () => void }) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  return (
    <Card className="space-y-3">
      <h2 className="font-display text-lg font-bold">Feedback to the group</h2>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {FEEDBACK_PHRASES.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setBody(p)}
            className="min-h-9 max-w-[16rem] shrink-0 truncate rounded-full border border-line-strong bg-bg-elevated px-3 text-left text-xs text-ink-soft hover:border-ink/40"
            title={p}
          >
            {p}
          </button>
        ))}
      </div>
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Tap a phrase above or write your own. The whole group sees it on their Today screen."
        className="min-h-20"
        maxLength={1000}
      />
      <FormMessages error={error} notice={notice} />
      <Button
        className="w-full"
        disabled={busy || !body.trim()}
        onClick={() => {
          setBusy(true);
          setError(null);
          setNotice(null);
          sendGroupFeedback({ data: { groupId, body } })
            .then(() => {
              setBody("");
              setNotice("Sent. The group sees it on their Today screen.");
              onSent();
            })
            .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not send."))
            .finally(() => setBusy(false));
        }}
      >
        <Send className="size-4" aria-hidden /> {busy ? "Sending…" : "Send to the group"}
      </Button>
      {feedback.length ? (
        <details>
          <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-muted">
            Sent so far ({feedback.length})
          </summary>
          <ul className="space-y-2">
            {feedback.map((f) => (
              <li key={f.id} className="rounded-[14px] bg-bg-subtle px-3 py-2 text-sm leading-6">
                {f.body}
                <span className="block text-xs text-faint">
                  {f.author} · {timeAgo(f.at)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </Card>
  );
}

function People({ d }: { d: GroupDetail }) {
  const max = Math.max(1, ...d.members.map((m) => m.events));
  return (
    <div className="space-y-4">
      <Card className="space-y-1">
        <h2 className="font-display text-lg font-bold">Who is doing what</h2>
        <p className="text-xs text-muted">Bars show each person’s logged actions in this group.</p>
        <ul className="divide-y divide-line">
          {d.members.map((m) => (
            <li key={m.studentId} className="py-3">
              <div className="flex items-center justify-between gap-2">
                <p className="min-w-0 truncate font-semibold">
                  {m.fullName} {m.isSynthetic ? <span className="text-xs font-normal text-faint">practice peer</span> : null}
                </p>
                <span className="shrink-0 text-sm tabular-nums">{m.events}</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-bg-subtle" aria-hidden>
                <div className={cn("h-full rounded-full", m.events ? "bg-ink" : m.isSynthetic ? "bg-line-strong" : "bg-clay")} style={{ width: `${Math.max(3, (m.events / max) * 100)}%` }} />
              </div>
              <p className="mt-1 text-xs text-muted">
                {m.submitted ? "Submitted a problem" : "No problem submitted"} · {m.evidence} evidence · {m.assumptions} assumptions ·{" "}
                {m.advisorQuestions} advisor questions
              </p>
            </li>
          ))}
        </ul>
      </Card>
      {d.venture ? (
        <Card className="space-y-2">
          <Stamp tone="forest">Chosen problem</Stamp>
          <p className="font-display text-lg leading-snug font-bold">{d.venture.problem}</p>
          {d.venture.author ? <p className="text-xs text-muted">Spotted by {d.venture.author}</p> : null}
          <p className="text-sm leading-6 text-ink-soft">
            <strong className="text-ink">Why this one: </strong>
            {d.venture.rationale}
          </p>
        </Card>
      ) : null}
      {d.preferences.length ? (
        <Card className="space-y-2">
          <h2 className="font-display text-lg font-bold">Individual picks</h2>
          <ul className="divide-y divide-line text-sm">
            {d.preferences.map((p, i) => (
              <li key={i} className="py-2 leading-6">
                <strong>{p.studentName}</strong> <span className="text-muted">picked “{p.problem.slice(0, 80)}”</span>
                <span className="block text-ink-soft">{p.rationale}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

function Work({ d }: { d: GroupDetail }) {
  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <h2 className="font-display text-lg font-bold">Problems submitted ({d.opportunities.length})</h2>
        {d.opportunities.length ? (
          <ul className="space-y-2">
            {d.opportunities.map((o) => (
              <li key={o.id} className="rounded-[14px] border border-line bg-bg-elevated p-3 text-sm leading-6">
                <span className="flex items-center gap-2 text-xs font-semibold text-muted">
                  {o.author}
                  {o.status === "selected" ? <Stamp tone="forest" size="xs">chosen</Stamp> : null}
                </span>
                {o.problem}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyNote>Nothing submitted yet. Drafts stay private to their authors.</EmptyNote>
        )}
      </section>
      <section className="space-y-2">
        <h2 className="font-display text-lg font-bold">Evidence ({d.evidence.length})</h2>
        {d.evidence.length ? (
          <ul className="space-y-2">
            {d.evidence.map((e) => (
              <li key={e.id} className="rounded-[14px] border border-line bg-bg-elevated p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold">{e.title}</p>
                  <ClassificationStamp value={e.classification} />
                </div>
                <p className="text-sm leading-6 text-ink-soft">{e.content}</p>
                <p className="text-xs text-faint">
                  <span className="capitalize">{e.sourceType}</span> · {e.author} · {timeAgo(e.at)}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyNote>No evidence logged yet.</EmptyNote>
        )}
      </section>
      <section className="space-y-2">
        <h2 className="font-display text-lg font-bold">Assumptions ({d.assumptions.length})</h2>
        {d.assumptions.length ? (
          <ul className="space-y-2">
            {d.assumptions.map((a) => (
              <li key={a.id} className="rounded-[14px] border border-line bg-bg-elevated p-3">
                <p className="text-sm leading-6">{a.statement}</p>
                <p className="mt-1 flex flex-wrap gap-1.5">
                  <Stamp tone={a.importance === "critical" ? "clay" : "muted"} size="xs">{a.importance}</Stamp>
                  <Stamp tone="muted" size="xs">{a.confidence} confidence</Stamp>
                  {a.supports + a.challenges === 0 ? (
                    <Stamp tone="gold" size="xs">untested</Stamp>
                  ) : (
                    <Stamp tone="forest" size="xs">
                      {a.supports} backing · {a.challenges} against
                    </Stamp>
                  )}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyNote>No assumptions written yet.</EmptyNote>
        )}
      </section>
    </div>
  );
}

function Money({ d }: { d: GroupDetail }) {
  if (!d.sim) return <EmptyNote>The group has not launched its simulated venture yet.</EmptyNote>;
  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold">Simulation</h2>
        <Stamp tone={d.sim.status === "cash_out" ? "clay" : "gold"} size="xs">
          {d.sim.status === "cash_out" ? "out of cash" : `week ${Math.min(d.sim.completedPeriod + 1, d.sim.periodCount)} of ${d.sim.periodCount}`}
        </Stamp>
      </div>
      {d.weeks.length ? (
        <ul className="divide-y divide-line">
          {d.weeks.map((w) => (
            <li key={w.period} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 py-2.5">
              <span className="flex size-9 items-center justify-center rounded-full bg-bg-subtle font-mono text-sm">{w.period}</span>
              <span className="text-xs leading-5 text-muted">
                Revenue <span className="font-mono text-ink">{formatGhs(w.revenue)}</span>
                <br />
                Profit <span className={cn("font-mono", w.profit < 0 ? "text-clay" : "text-ink")}>{formatGhs(w.profit)}</span>
              </span>
              <span className="text-right">
                <span className="block text-[11px] font-semibold text-muted">Cash at end</span>
                <span className={cn("font-mono text-sm", w.closingCash < 0 && "text-clay")}>{formatGhs(w.closingCash)}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">Launched, but no week submitted yet.</p>
      )}
    </Card>
  );
}

function ActivityList({ items }: { items: ActivityItem[] }) {
  if (!items.length) return <EmptyNote>No activity yet.</EmptyNote>;
  return (
    <ul className="divide-y divide-line rounded-[14px] border border-line bg-bg-elevated">
      {items.map((it) => (
        <li key={it.id} className="flex items-start gap-3 px-4 py-3 text-sm leading-6">
          <span className="min-w-0 flex-1">
            <strong>{it.studentName ?? "Someone"}</strong> {eventWords(it.eventType)}
          </span>
          <span className="shrink-0 text-xs text-faint">{timeAgo(it.at)}</span>
        </li>
      ))}
    </ul>
  );
}
