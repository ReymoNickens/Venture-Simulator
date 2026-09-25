import { useCallback, useEffect, useState, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ChevronDown, Lock } from "lucide-react";
import { assignGroup, getGroupDetail, giveFeedback, setMemberStatus } from "@/lib/server/lecturer";
import { useStaff } from "@/hooks/lecturer-context";
import { errorMessage, useAction } from "@/hooks/use-action";
import { STAGES, STAGE_BY_ID, CANVAS_BLOCKS, type StageId } from "@/lib/domain/stages";
import { computeFinance, formatCedis, parseFinanceInputs } from "@/lib/domain/finance";
import { FlagList } from "@/components/lecturer/FlagList";
import { Button } from "@/components/ui/button";
import { Card, Eyebrow, EmptyNote } from "@/components/ui/badge";
import { Choice, Field, Input, Select, Textarea } from "@/components/ui/input";
import { ClassificationStamp, Stamp } from "@/components/ui/stamp";
import { Emblem } from "@/components/ui/emblem";
import { FormMessages, Loading } from "@/components/ui/feedback";
import { daysAgo, shortDate, shortDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/lecturer/groups/$groupId")({ component: GroupDetail });

type Detail = Awaited<ReturnType<typeof getGroupDetail>>;

const LEVELS = [
  { value: "1", label: "1 · Beginning" },
  { value: "2", label: "2 · Developing" },
  { value: "3", label: "3 · Proficient" },
  { value: "4", label: "4 · Exemplary" },
] as const;

// Reusable comments: at 1:400 the lecturer should be typing judgement, not boilerplate.
const TEMPLATES = [
  "Your evidence is mostly opinion. Go and observe or count something this week.",
  "Strong interviews — now link them to the assumptions they test.",
  "Your riskiest assumption is still untested. Design the cheapest test for it.",
  "The numbers use guessed prices. Get three real quotes before you revise them.",
  "Good reasoning. Push further: what would change your mind?",
  "Not everyone is contributing. Agree who does what before the next milestone.",
];

function GroupDetail() {
  const { groupId } = Route.useParams();
  const { staff } = useStaff();
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    getGroupDetail({ data: { groupId } }).then(setD, (e) => setError(errorMessage(e)));
  }, [groupId]);
  useEffect(load, [load]);

  if (error) return <FormMessages error={error} />;
  if (!d) return <Loading />;
  const g = d.group;
  const def = d.currentStage ? STAGE_BY_ID[d.currentStage as StageId] : null;
  const mine = g.assignedStaffId === staff.id;

  return (
    <div className="space-y-6">
      <Link to="/lecturer" className="inline-flex items-center gap-1 text-sm font-semibold text-accent">
        <ArrowLeft className="size-4" aria-hidden /> Attention queue
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Eyebrow>Group {g.groupNumber} · code {g.joinCode}</Eyebrow>
          <h1 className="mt-1 font-display text-3xl font-extrabold">{g.ventureName ?? g.groupName}</h1>
          <p className="text-sm text-muted">
            {g.ventureName ? `${g.groupName} · ` : ""}
            {d.stagesDone}/11 stops done
            {g.ventureStatus && g.ventureStatus !== "active" ? ` · venture ${g.ventureStatus}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {def ? (
            <span className="flex items-center gap-2 rounded-[8px] border-2 border-ink bg-gold-soft px-3 py-1.5 text-sm font-semibold">
              <Emblem emblem={def.emblem} className="size-5" /> Stop {def.stop}: {def.title}
            </span>
          ) : null}
          <AssignButton groupId={g.id} mine={mine} onDone={load} />
        </div>
      </div>

      <Card as="section">
        <Eyebrow>Why this group is flagged</Eyebrow>
        <div className="mt-2">
          <FlagList flags={d.flags} full />
        </div>
      </Card>

      <Members d={d} onChanged={load} />
      <FeedbackComposer d={d} onSaved={load} />

      <Section title={`Opportunities (${d.opportunities.length})`}>
        <ul className="space-y-2 text-sm">
          {d.opportunities.map((o) => (
            <li key={o.id} className={cn("rounded-[6px] border p-2", o.id === g.selectedOpportunityId ? "border-accent bg-accent-soft/50" : "border-line")}>
              <p className="font-semibold">{o.problem}</p>
              <p className="text-xs text-muted">{o.fullName} · {o.status}</p>
              <p className="mt-1 text-ink-soft">Evidence: {o.observedEvidence}</p>
            </li>
          ))}
        </ul>
        {g.selectionRationale ? <p className="mt-2 text-sm"><span className="font-semibold">Why chosen:</span> {g.selectionRationale}</p> : null}
      </Section>

      <Section title={`Assumptions (${d.assumptions.length})`}>
        <table className="w-full text-sm">
          <tbody>
            {d.assumptions.map((a) => (
              <tr key={a.id} className="border-b border-line align-top last:border-0">
                <td className="py-1.5 pr-2">{a.statement}</td>
                <td className="py-1.5 pr-2 text-xs whitespace-nowrap text-muted uppercase">{a.importance}/{a.confidence}</td>
                <td className="py-1.5 pr-2 text-xs whitespace-nowrap">+{a.supports} −{a.challenges}</td>
                <td className="py-1.5 text-xs whitespace-nowrap capitalize">{a.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title={`Evidence (${d.evidence.length})`}>
        <ul className="divide-y divide-line text-sm">
          {d.evidence.map((e) => (
            <li key={e.id} className="py-2">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold">{e.title}</p>
                <ClassificationStamp value={e.classification} />
              </div>
              <p className="whitespace-pre-line text-ink-soft">{e.content}</p>
              <p className="text-xs text-faint">{e.sourceType} · {e.fullName} · {shortDate(e.createdAt)}</p>
            </li>
          ))}
        </ul>
      </Section>

      {d.work ? <Work work={d.work} /> : null}

      <Section title={`Private reflections (${d.reflections.length})`} icon={<Lock className="size-4" aria-hidden />}>
        <ul className="space-y-2 text-sm">
          {d.reflections.map((r) => (
            <li key={r.id}>
              <p className="text-xs text-muted">
                {r.fullName} · {STAGE_BY_ID[r.stage as StageId]?.title ?? r.stage} · {shortDate(r.createdAt)}
              </p>
              <p className="leading-6">{r.body}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section title={`Advisor conversation (latest ${d.advisor.length})`}>
        <ul className="space-y-2 text-sm">
          {d.advisor.map((m, i) => (
            <li key={i} className={m.role === "advisor" ? "rounded-[6px] bg-gold-soft p-2" : "p-2"}>
              <p className="text-xs text-muted">{m.role === "advisor" ? "Advisor" : m.fullName} · {shortDateTime(m.createdAt)}</p>
              <p>{m.content}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Activity timeline">
        <ul className="space-y-0.5 font-mono text-xs">
          {d.timeline.map((t, i) => (
            <li key={i}>
              <span className="text-faint">{shortDateTime(t.createdAt)}</span> {t.fullName ?? "system"} —{" "}
              {t.eventType.toLowerCase().replaceAll("_", " ")}
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

function Section({ title, children, icon }: { title: string; children: ReactNode; icon?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-[10px] border-2 border-line-strong/70 bg-bg-elevated">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center justify-between px-4 py-3 text-left">
        <span className="flex items-center gap-2 font-display text-lg font-bold">{icon}{title}</span>
        <ChevronDown className={cn("size-5 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open ? <div className="border-t border-line px-4 py-3">{children}</div> : null}
    </section>
  );
}

function AssignButton({ groupId, mine, onDone }: { groupId: string; mine: boolean; onDone: () => void }) {
  const { pending, run } = useAction();
  return (
    <Button
      size="sm"
      variant={mine ? "secondary" : "primary"}
      disabled={Boolean(pending)}
      onClick={() =>
        void run("assign", async () => {
          await assignGroup({ data: { groupId, assign: !mine } });
          onDone();
        })
      }
    >
      {mine ? "Release group" : "Take this group"}
    </Button>
  );
}

function Members({ d, onChanged }: { d: Detail; onChanged: () => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const { pending, error, run } = useAction();
  const real = d.members.filter((m) => !m.isSynthetic);
  const maxTotal = Math.max(1, ...real.map((m) => m.total));
  return (
    <Card as="section" className="space-y-3">
      <div>
        <Eyebrow>Members and contribution</Eyebrow>
        <p className="mt-1 text-xs text-muted">
          Contribution counts every recorded action. Peer ratings are confidential averages (1–5). Marking a
          member inactive stops the group waiting on them; the group sees your reason.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="text-left font-mono text-[10.5px] tracking-wide text-muted uppercase">
              <th className="py-1 pr-2">Student</th>
              <th className="py-1 pr-2">Last active</th>
              <th className="py-1 pr-2">Contribution</th>
              <th className="py-1 pr-2">Peers</th>
              <th className="py-1" />
            </tr>
          </thead>
          <tbody>
            {real.map((m) => (
              <tr key={m.memberId} className={cn("border-t border-line align-top", m.status !== "active" && "text-muted")}>
                <td className="py-2 pr-2">
                  <p className="font-semibold">{m.fullName}</p>
                  <p className="text-xs text-muted">{m.indexNumber} · {m.programme}</p>
                  {m.status !== "active" ? (
                    <p className="text-xs text-clay">{m.status}{m.statusReason ? `: ${m.statusReason}` : ""}</p>
                  ) : null}
                </td>
                <td className="py-2 pr-2 text-xs whitespace-nowrap">
                  {m.lastActivityAt ? `${daysAgo(m.lastActivityAt)}d ago` : "never"}
                </td>
                <td className="py-2 pr-2">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 rounded-r-[3px] bg-accent" style={{ width: `${(m.total / maxTotal) * 80}px`, minWidth: m.total ? 3 : 0 }} />
                    <span className="font-mono text-xs tabular">{m.total}</span>
                  </div>
                  <p className="text-[11px] text-muted">
                    {["EVIDENCE_CREATED", "INTERVIEW_LOGGED", "PROTOTYPE_TESTED", "ASSUMPTION_CREATED"]
                      .filter((k) => m.byType[k])
                      .map((k) => `${m.byType[k]} ${k.split("_")[0].toLowerCase()}`)
                      .join(" · ")}
                  </p>
                </td>
                <td className="py-2 pr-2 text-xs">
                  {m.peerAvg !== null ? (
                    <span title={m.peerComments ?? undefined} className={cn("font-semibold", m.peerAvg < 2.5 && "text-clay")}>
                      {m.peerAvg.toFixed(1)} <span className="font-normal text-muted">({m.peerCount})</span>
                    </span>
                  ) : (
                    <span className="text-faint">—</span>
                  )}
                </td>
                <td className="py-2 text-right">
                  {m.status === "left" ? null : (
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(m.memberId);
                        setReason("");
                      }}
                      className="text-xs font-semibold text-accent underline"
                    >
                      {m.status === "active" ? "Mark inactive" : "Reactivate"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing ? (
        <div className="space-y-2 rounded-[8px] border-2 border-ink p-3">
          <Field label={`Reason (visible to the group) — ${d.members.find((m) => m.memberId === editing)?.fullName}`}>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Has not attended or contributed since week 3" />
          </Field>
          <FormMessages error={error} />
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={Boolean(pending)}
              onClick={() => {
                const m = d.members.find((x) => x.memberId === editing)!;
                void run("status", async () => {
                  await setMemberStatus({
                    data: { groupId: d.group.id, memberId: editing, status: m.status === "active" ? "inactive" : "active", reason },
                  });
                  setEditing(null);
                  onChanged();
                });
              }}
            >
              Confirm
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}

function FeedbackComposer({ d, onSaved }: { d: Detail; onSaved: () => void }) {
  const [stage, setStage] = useState<string>(d.currentStage ?? "choose");
  const [level, setLevel] = useState<"" | "1" | "2" | "3" | "4">("");
  const [body, setBody] = useState("");
  const { pending, error, notice, run } = useAction();
  return (
    <Card as="section" className="space-y-3 border-indigo/50">
      <Eyebrow>Feedback to the group</Eyebrow>
      <Field label="About which stop?">
        <Select value={stage} onChange={(e) => setStage(e.target.value)}>
          {STAGES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.stop}. {s.title}
            </option>
          ))}
        </Select>
      </Field>
      <div className="flex flex-wrap gap-1.5">
        {TEMPLATES.map((t) => (
          <button key={t} type="button" onClick={() => setBody((b) => (b ? `${b} ${t}` : t))} className="rounded-full border border-line-strong px-2.5 py-1 text-left text-xs hover:border-ink">
            {t}
          </button>
        ))}
      </div>
      <Field label="Comment">
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} />
      </Field>
      <Choice
        label="Rubric level (optional)"
        value={level}
        options={[{ value: "", label: "None" }, ...LEVELS]}
        onChange={setLevel}
      />
      <FormMessages error={error} notice={notice} />
      <Button
        disabled={Boolean(pending) || body.trim().length < 10}
        onClick={() =>
          void run(
            "fb",
            async () => {
              await giveFeedback({ data: { groupId: d.group.id, stage, body, level: level ? Number(level) : null } });
              setBody("");
              setLevel("");
              onSaved();
            },
            "Sent. The group sees it on that stop and on their Today screen.",
          )
        }
      >
        {pending ? "Sending…" : "Send feedback"}
      </Button>
      {d.feedback.length ? (
        <ul className="space-y-2 border-t border-line pt-3 text-sm">
          {d.feedback.map((f) => (
            <li key={f.id}>
              <p className="text-xs text-muted">
                {f.staffName} · {STAGE_BY_ID[f.stage as StageId]?.title} · {shortDate(f.createdAt)}
                {f.level ? ` · level ${f.level}` : ""}
              </p>
              <p>{f.body}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}

function Work({ work }: { work: NonNullable<Detail["work"]> }) {
  const fin = work.finance ? computeFinance(parseFinanceInputs(work.finance.inputs)) : null;
  return (
    <>
      <Section title={`Interviews (${work.interviews.length})`}>
        <ul className="space-y-2 text-sm">
          {work.interviews.map((i) => (
            <li key={i.id}>
              <p className="text-xs text-muted">{i.intervieweeProfile} · by {i.authorName} · would pay: {i.wouldPay}</p>
              <p className="font-semibold">“{i.keyQuotes}”</p>
            </li>
          ))}
        </ul>
      </Section>
      <Section title={`Canvas (${work.canvas.filter((c) => c.status === "active").length} entries)`}>
        <div className="grid gap-2 sm:grid-cols-3">
          {CANVAS_BLOCKS.map((b) => (
            <div key={b.key} className="rounded-[6px] border border-line p-2 text-sm">
              <p className="font-mono text-[10.5px] text-muted uppercase">{b.title}</p>
              {work.canvas
                .filter((c) => c.block === b.key && c.status === "active")
                .map((c) => (
                  <p key={c.id} className={c.evidenceIds.length ? "" : "text-muted italic"}>
                    {c.body} {c.evidenceIds.length ? `(${c.evidenceIds.length} ev.)` : "(guess)"}
                  </p>
                ))}
            </div>
          ))}
        </div>
      </Section>
      <Section title={`Feasibility (${work.feasibility.length}/4) · Numbers · Tests (${work.prototypeTests.length})`}>
        <ul className="space-y-1 text-sm">
          {work.feasibility.map((f) => (
            <li key={f.id}>
              <span className="font-semibold capitalize">{f.lens}</span>: <Stamp size="xs" tone={f.verdict === "promising" ? "forest" : f.verdict === "concerning" ? "clay" : "gold"}>{f.verdict}</Stamp> {f.reasoning}
            </li>
          ))}
        </ul>
        {fin ? (
          <p className="mt-2 font-mono text-sm">
            Break-even {fin.breakEvenUnits ?? "never"}/mo · profit {formatCedis(fin.monthlyProfit)}/mo · {Math.round(fin.sourcedShare * 100)}% costs sourced · v{work.finance?.versions}
          </p>
        ) : (
          <EmptyNote>No numbers yet.</EmptyNote>
        )}
        <p className="mt-2 text-sm">
          Tests: {work.prototypeTests.filter((t) => t.outcome === "succeeded").length} easy ·{" "}
          {work.prototypeTests.filter((t) => t.outcome === "struggled").length} struggled ·{" "}
          {work.prototypeTests.filter((t) => t.outcome === "failed").length} failed
        </p>
        {work.decisions.length ? (
          <p className="mt-2 text-sm">
            Decision: {work.decisions.map((x) => `${x.decision} (${x.status})`).join(", ")}
          </p>
        ) : null}
      </Section>
    </>
  );
}
