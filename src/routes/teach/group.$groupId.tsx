import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, CircleHelp, DoorOpen, MessageSquarePlus, XCircle } from "lucide-react";
import { toast } from "sonner";
import { addLecturerNote, getGroupDetail, openSelectionEarly } from "@/lib/server/lecturer";
import { Badge, Card, SectionTitle } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, Skeleton } from "@/components/ui/empty";
import { Textarea } from "@/components/ui/input";
import { Tabs, TabList, TabPanel } from "@/components/ui/tabs";
import { Avatar } from "@/components/ui/avatar";
import { Sheet } from "@/components/ui/sheet";
import { CLASSIFICATIONS, EXPERIMENT_METHODS, SOURCE_TYPES } from "@/lib/domain/config";
import { describeEvent, timeAgo } from "@/lib/domain/story";
import type { ActivityEvent } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/teach/group/$groupId")({ component: GroupDetail });

type Detail = Awaited<ReturnType<typeof getGroupDetail>>;
type R = Record<string, string | number | boolean | null>;
const s = (v: unknown) => (v == null ? "" : String(v));
const first = (n: unknown) => s(n).split(" ")[0];
const label = <T extends readonly { value: string; label: string }[]>(list: T, v: unknown) => list.find((x) => x.value === v)?.label ?? s(v);

const STATUS_TEXT: Record<string, string> = {
  forming: "Forming",
  opportunity_collection: "Writing ideas",
  selection_ready: "Comparing ideas",
  selection: "Deciding",
  venture_created: "Building the venture",
};

function GroupDetail() {
  const { groupId } = Route.useParams();
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => getGroupDetail({ data: { groupId } }).then(setD, (e: unknown) => setError(e instanceof Error ? e.message : "Could not load this group.")), [groupId]);
  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <Empty title="Couldn't open this group" body={error} action={<Link to="/teach" className="text-sm font-semibold text-accent">Back to cohort</Link>} />;
  if (!d) return <div className="space-y-4"><Skeleton className="h-16 w-80" /><Skeleton className="h-72" /></div>;

  const g = d.group as R;
  const submitted = d.opportunities.filter((o) => o.status !== "draft").length;
  const canOpenEarly = g.status === "opportunity_collection" && submitted >= 2 && !g.selection_opened_by;
  const oppAuthor = new Map(d.opportunities.map((o) => [s(o.id), s(o.author)]));

  async function openEarly() {
    if (!confirm(`Open comparison now? Only the ${submitted} members who sealed an idea will vote. Others can no longer join.`)) return;
    setBusy("open");
    try {
      await openSelectionEarly({ data: { groupId } });
      toast.success("Comparison opened for this group.");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open comparison.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <Link to="/teach" className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink"><ArrowLeft className="size-4" /> Cohort</Link>
      <div className="flex flex-wrap items-start justify-between gap-3 animate-rise">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-muted">Group {s(g.group_number)} · code <span className="font-mono">{s(g.join_code)}</span></p>
          <h1 className="mt-1 font-display text-[2rem] leading-tight">{s(g.group_name)}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Badge tone="night">{STATUS_TEXT[s(g.status)] ?? s(g.status)}</Badge>
            {d.venture ? <span className="text-sm">Venture: <b>{s((d.venture as R).name)}</b></span> : null}
            {g.selection_opened_by ? <Badge tone="sun">Opened early by lecturer</Badge> : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canOpenEarly ? (
            <Button variant="secondary" onClick={() => void openEarly()} disabled={Boolean(busy)}><DoorOpen className="size-4" /> Open comparison now</Button>
          ) : null}
          <Button variant="dark" onClick={() => setNoteOpen(true)}><MessageSquarePlus className="size-4" /> Note to group</Button>
        </div>
      </div>

      <Tabs defaultValue="people">
        <TabList
          tabs={[
            { value: "people", label: "Contribution" },
            { value: "ideas", label: "Ideas & decision", count: d.opportunities.length },
            { value: "evidence", label: "Evidence", count: d.evidence.length },
            { value: "tests", label: "Assumptions & tests", count: d.assumptions.length },
            { value: "ai", label: "Advisor log", count: d.messages.length },
            { value: "timeline", label: "Timeline" },
          ]}
        />
        <TabPanel value="people" className="mt-4 space-y-4 outline-none">
          <Contribution d={d} />
          {d.notes.length ? (
            <Card>
              <SectionTitle kicker="Your notes" title="What you've told this group" />
              <ul className="mt-3 space-y-2">
                {d.notes.map((n) => <li key={s(n.id)} className="rounded-[14px] bg-sun-soft/60 p-3 text-sm"><p className="whitespace-pre-line">{s(n.body)}</p><p className="mt-1 text-xs text-muted">{timeAgo(s(n.created_at))}</p></li>)}
              </ul>
            </Card>
          ) : null}
        </TabPanel>

        <TabPanel value="ideas" className="mt-4 space-y-4 outline-none">
          {d.opportunities.length ? d.opportunities.map((o) => {
            const votes = d.preferences.filter((p) => p.opportunity_id === o.id);
            return (
              <Card key={s(o.id)} as="article" className={cn("space-y-2", o.status === "selected" && "border-accent")}>
                <div className="flex flex-wrap items-center gap-2">
                  <Avatar name={s(o.author)} size={26} />
                  <p className="mr-auto text-sm font-semibold">{s(o.author)}</p>
                  <Badge tone={o.status === "selected" ? "accent" : o.status === "draft" ? "warn" : "neutral"}>{s(o.status)}</Badge>
                  <Badge tone="neutral">{votes.length} vote{votes.length === 1 ? "" : "s"}</Badge>
                </div>
                <p className="font-display text-lg leading-snug">{s(o.problem)}</p>
                <dl className="grid gap-2 text-sm md:grid-cols-2">
                  {([["Where", o.context], ["Who", o.affected_people], ["What they saw", o.observed_evidence], ["How people cope", o.current_alternatives], ["Why it matters", o.why_it_matters], ["Unknowns", o.uncertainties]] as [string, unknown][]).filter(([, v]) => s(v).trim()).map(([k, v]) => (
                    <div key={k}><dt className="text-[11px] font-bold uppercase tracking-[0.1em] text-faint">{k}</dt><dd className="whitespace-pre-line">{s(v)}</dd></div>
                  ))}
                </dl>
                {votes.length ? (
                  <ul className="space-y-1 border-l-2 border-ch-decide/30 pl-3 text-sm">
                    {votes.map((p) => <li key={s(p.student_id)}><b>{first(p.student)}:</b> {s(p.rationale)}</li>)}
                  </ul>
                ) : null}
              </Card>
            );
          }) : <Empty title="No ideas yet" />}
          {d.proposals.length ? (
            <Card>
              <SectionTitle kicker="The decision" title="Proposals" />
              <ul className="mt-3 space-y-4">
                {d.proposals.map((p) => (
                  <li key={s(p.id)} className="space-y-2 rounded-[14px] bg-bg-subtle/70 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="mr-auto font-semibold">{s(p.name)} <span className="font-normal text-muted">by {s(p.proposer)} · {first(oppAuthor.get(s(p.opportunity_id)))}'s idea</span></p>
                      <Badge tone={p.status === "accepted" ? "accent" : p.status === "rejected" ? "bad" : "neutral"}>{s(p.status)}</Badge>
                    </div>
                    <p className="whitespace-pre-line text-sm leading-6">{s(p.rationale)}</p>
                    <ul className="space-y-1 text-sm">
                      {d.responses.filter((r) => r.proposal_id === p.id).map((r, i) => (
                        <li key={i}><span className={r.stance === "endorse" ? "text-accent" : "text-bad"}>{r.stance === "endorse" ? "✓" : "✗"} {first(r.student)}</span>{r.comment && r.comment !== "Proposed this." ? ` — ${s(r.comment)}` : ""}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </TabPanel>

        <TabPanel value="evidence" className="mt-4 outline-none">
          {d.evidence.length ? (
            <ul className="grid gap-3 md:grid-cols-2">
              {d.evidence.map((e) => (
                <li key={s(e.id)} className="flex gap-3 rounded-[18px] border border-line/80 bg-bg-elevated p-3">
                  {e.photo_thumb ? <img src={s(e.photo_thumb)} alt="" loading="lazy" className="size-20 shrink-0 rounded-[12px] object-cover" /> : null}
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-semibold">{s(e.title)}</p>
                    <p className="line-clamp-4 text-ink-soft">{s(e.content)}</p>
                    <div className="mt-1 flex flex-wrap gap-1"><Badge>{label(SOURCE_TYPES, e.source_type)}</Badge><Badge tone="accent">{label(CLASSIFICATIONS, e.classification)}</Badge></div>
                    <p className="mt-1 text-xs text-muted">{s(e.author)} · {timeAgo(s(e.created_at))}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : <Empty title="No evidence yet" body={d.venture ? "The group has chosen a venture but not logged evidence." : "Evidence starts once the group chooses its venture."} />}
        </TabPanel>

        <TabPanel value="tests" className="mt-4 space-y-3 outline-none">
          {d.assumptions.length ? d.assumptions.map((a) => {
            const tests = d.experiments.filter((x) => x.assumption_id === a.id);
            return (
              <Card key={s(a.id)} as="article" className="space-y-2">
                <div className="flex items-start gap-2">
                  <p className="min-w-0 flex-1 font-semibold leading-6">{s(a.statement)}</p>
                  <Badge tone={a.status === "supported" ? "accent" : a.status === "challenged" ? "bad" : a.status === "testing" ? "sun" : "neutral"}>{s(a.status)}</Badge>
                </div>
                <p className="text-xs text-muted">{s(a.importance)} importance · {s(a.confidence)} confidence · {s(a.supports)} for / {s(a.challenges)} against · {first(a.author)}</p>
                {tests.map((x) => (
                  <div key={s(x.id)} className="flex gap-2 rounded-[12px] bg-bg-subtle/70 p-2.5 text-sm">
                    {x.result === "supports" ? <CheckCircle2 className="size-4 shrink-0 text-accent" /> : x.result === "challenges" ? <XCircle className="size-4 shrink-0 text-bad" /> : <CircleHelp className="size-4 shrink-0 text-muted" />}
                    <div>
                      <p><b>{label(EXPERIMENT_METHODS, x.method)}</b> — right if: {s(x.success_criteria)}{x.sample_target ? ` (n=${s(x.sample_target)})` : ""}</p>
                      {x.learning ? <p className="text-ink-soft">Learned: {s(x.learning)}</p> : <p className="text-muted">Planned by {first(x.author)}, not finished</p>}
                    </div>
                  </div>
                ))}
              </Card>
            );
          }) : <Empty title="No assumptions yet" />}
        </TabPanel>

        <TabPanel value="ai" className="mt-4 outline-none">
          {d.messages.length ? (
            <Card className="space-y-3">
              <p className="text-xs text-muted">Every student question and advisor reply, including private idea-stage chats. Use it to see how students used the advisor — not to grade their questions.</p>
              <ul className="space-y-2.5">
                {d.messages.map((m, i) => (
                  <li key={i} className={cn("rounded-[14px] px-3 py-2 text-sm leading-6", m.role === "advisor" ? "bg-accent-soft" : "border border-line")}>
                    <p className="text-[11px] font-semibold text-muted">{m.role === "advisor" ? "Advisor" : s(m.student)} · {s(m.stage)} · {timeAgo(s(m.created_at))}</p>
                    <p className="whitespace-pre-line">{s(m.content)}</p>
                  </li>
                ))}
              </ul>
            </Card>
          ) : <Empty title="No advisor use yet" />}
        </TabPanel>

        <TabPanel value="timeline" className="mt-4 outline-none">
          <Card>
            <ul className="divide-y divide-line/70">
              {d.timeline.map((e, i) => {
                const ev = { id: String(i), studentId: e.student_id, groupId: null, ventureId: null, eventType: e.event_type, entityType: e.entity_type, entityId: null, metadata: safeJson(e.metadata), createdAt: e.created_at } as ActivityEvent;
                const desc = describeEvent(ev, new Map(e.student_id && e.student ? [[e.student_id, e.student]] : []));
                return (
                  <li key={i} className="flex items-center gap-3 py-2 text-sm">
                    <span className="min-w-0 flex-1">{desc ? <>{desc.who ? <b>{desc.who} </b> : null}{desc.text}</> : <span className="text-muted">{e.event_type.toLowerCase().replaceAll("_", " ")}{e.student ? ` · ${e.student}` : ""}</span>}</span>
                    <span className="shrink-0 text-xs text-faint">{timeAgo(e.created_at)}</span>
                  </li>
                );
              })}
            </ul>
          </Card>
        </TabPanel>
      </Tabs>

      <Sheet open={noteOpen} onOpenChange={setNoteOpen} title="Note to the group" description="Shown at the top of every member's studio home.">
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy("note");
            try {
              await addLecturerNote({ data: { groupId, body: note } });
              toast.success("Note sent to the group.");
              setNote("");
              setNoteOpen(false);
              await load();
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Could not send.");
            } finally {
              setBusy(null);
            }
          }}
        >
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} autoFocus placeholder="e.g. Good start. Before Friday, count how many people use the washing lines at 8am and 8pm." />
          <Button type="submit" block disabled={busy === "note" || note.trim().length < 3}>{busy === "note" ? "Sending…" : "Send note"}</Button>
        </form>
      </Sheet>
    </div>
  );
}

function safeJson(v: string | null): ActivityEvent["metadata"] {
  if (!v) return null;
  if (typeof v === "object") return v;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

const COLS: { key: string; label: string }[] = [
  { key: "idea", label: "Idea" },
  { key: "vote", label: "Vote" },
  { key: "response", label: "Decision" },
  { key: "evidence", label: "Evidence" },
  { key: "assumption", label: "Assumptions" },
  { key: "test", label: "Tests" },
];

function Contribution({ d }: { d: Detail }) {
  const rows = d.contribution.map((c) => ({ ...c, total: Object.values(c.counts).reduce((a, b) => a + b, 0) }));
  const max = Math.max(1, ...rows.map((r) => r.total));
  return (
    <Card className="overflow-hidden p-0">
      <div className="p-5 pb-3">
        <SectionTitle kicker="Who did what" title="Contribution" />
        <p className="mt-1 text-xs text-muted">Counted from the activity log. A low count is a reason to ask, not a verdict.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-y border-line bg-bg-subtle/60 text-left text-[11px] uppercase tracking-[0.08em] text-muted">
              <th className="px-5 py-2 font-semibold">Student</th>
              {COLS.map((c) => <th key={c.key} className="px-2 py-2 text-center font-semibold">{c.label}</th>)}
              <th className="px-2 py-2 text-center font-semibold">Advisor</th>
              <th className="px-5 py-2 text-right font-semibold">Last active</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/70">
            {rows.map((r) => (
              <tr key={r.studentId} className={cn(r.total === 0 && "bg-warn-soft/40")}>
                <td className="px-5 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <Avatar name={r.name} size={28} />
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{r.name}{r.isSynthetic ? <span className="ml-1 text-xs font-normal text-muted">(practice)</span> : null}</p>
                      <p className="truncate text-xs text-muted">{r.indexNumber} · {r.programme}</p>
                      <div className="mt-1 h-1 w-24 overflow-hidden rounded-full bg-bg-subtle"><div className="h-full rounded-full bg-accent" style={{ width: `${(100 * r.total) / max}%` }} /></div>
                    </div>
                  </div>
                </td>
                {COLS.map((c) => {
                  const n = r.counts[c.key] ?? 0;
                  return <td key={c.key} className={cn("px-2 py-2.5 text-center tabular-nums", n === 0 ? "text-faint" : "font-semibold")}>{n || "–"}</td>;
                })}
                <td className="px-2 py-2.5 text-center tabular-nums">{r.advisorMessages || "–"}</td>
                <td className="px-5 py-2.5 text-right text-xs text-muted">{r.lastActiveAt ? timeAgo(r.lastActiveAt) : "never"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
