import { useCallback, useEffect, useState, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ChevronDown, Lock, MessageSquareQuote, Send } from "lucide-react";
import { assignGroup, getGroupDetail, giveFeedback, setMemberStatus } from "@/lib/server/lecturer";
import { markThreadRead, sendStaffMessage } from "@/lib/server/messages";
import { Thread } from "@/components/messages/Thread";
import { useStaff } from "@/hooks/lecturer-context";
import { errorMessage, useAction } from "@/hooks/use-action";
import { STAGES, STAGE_BY_ID, CANVAS_BLOCKS, type StageId } from "@/lib/domain/stages";
import { computeFinance, formatCedis, parseFinanceInputs } from "@/lib/domain/finance";
import { Button } from "@/components/ui/button";
import { EmptyNote } from "@/components/ui/badge";
import { Choice, Select } from "@/components/ui/input";
import { ClassificationStamp, Stamp } from "@/components/ui/stamp";
import { StopSticker } from "@/components/ui/sticker";
import { FormMessages, Loading } from "@/components/ui/feedback";
import { daysAgo, shortDate, shortDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/lecturer/groups/$groupId")({ component: GroupDetail });

type Detail = Awaited<ReturnType<typeof getGroupDetail>>;

const LEVELS = [
  { value: "1", label: "Getting started" },
  { value: "2", label: "Developing" },
  { value: "3", label: "Strong" },
  { value: "4", label: "Excellent" },
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
  const [panel, setPanel] = useState<"message" | "feedback" | null>(null);
  const [showWork, setShowWork] = useState(false);
  const load = useCallback(() => {
    getGroupDetail({ data: { groupId } }).then(setD, (e) => setError(errorMessage(e)));
  }, [groupId]);
  useEffect(load, [load]);
  useEffect(() => {
    void markThreadRead({ data: { groupId } }).catch(() => undefined);
  }, [groupId]);

  if (error) return <FormMessages error={error} />;
  if (!d) return <Loading />;
  const g = d.group;
  const def = d.currentStage ? STAGE_BY_ID[d.currentStage as StageId] : null;
  const mine = g.assignedStaffId === staff.id;

  return (
    <div className="space-y-6">
      <Link to="/lecturer" className="inline-flex items-center gap-1 text-sm font-semibold text-muted">
        <ArrowLeft className="size-4" aria-hidden /> All groups
      </Link>

      <div className="flex items-center gap-4">
        {def ? <StopSticker stage={def.id} size="lg" /> : null}
        <div className="min-w-0">
          <h1 className="font-display text-[30px] leading-tight font-extrabold">{g.ventureName ?? g.groupName}</h1>
          <p className="text-[15px] text-muted">
            Group {g.groupNumber} · {def ? `Stop ${def.stop}: ${def.title}` : "Finished the journey"}
            {d.pulse ? ` · ${d.pulse}` : ""}
          </p>
        </div>
      </div>

      {d.flags.length ? (
        <section className="rounded-[22px] bg-clay-soft p-4">
          <p className="text-sm font-semibold text-clay">Why this group may need you</p>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-[15px] leading-6">
            {d.flags.map((f) => (
              <li key={f.code}>{f.message}</li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="rounded-[22px] bg-mint-soft p-4 text-[15px] text-ink">This group is on track. 👍</p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setPanel(panel === "message" ? null : "message")}>
          <Send className="size-4" aria-hidden /> Message
        </Button>
        <Button variant="secondary" onClick={() => setPanel(panel === "feedback" ? null : "feedback")}>
          <MessageSquareQuote className="size-4" aria-hidden /> Give feedback
        </Button>
        <AssignButton groupId={g.id} mine={mine} onDone={load} />
      </div>

      {panel === "feedback" ? (
        <FeedbackComposer
          d={d}
          onSaved={() => {
            setPanel(null);
            load();
          }}
        />
      ) : null}

      <Conversation d={d} composing={panel === "message"} onSent={load} />
      <Members d={d} onChanged={load} />

      <section>
        <button type="button" onClick={() => setShowWork((v) => !v)} aria-expanded={showWork} className="inline-flex items-center gap-1 font-display text-lg font-bold">
          See their work <ChevronDown className={cn("size-5 transition-transform", showWork && "rotate-180")} aria-hidden />
        </button>
        {showWork ? (
          <div className="rise mt-3 space-y-2">
            <Section title={`Ideas (${d.opportunities.length})`}>
              <ul className="space-y-2 text-sm">
                {d.opportunities.map((o) => (
                  <li key={o.id} className={cn("rounded-[14px] p-3", o.id === g.selectedOpportunityId ? "bg-mint-soft" : "bg-bg")}>
                    <p className="font-semibold">{o.problem}</p>
                    <p className="text-xs text-muted">{o.fullName}{o.id === g.selectedOpportunityId ? " · chosen" : ""}</p>
                  </li>
                ))}
              </ul>
              {g.selectionRationale ? <p className="mt-2 text-sm"><span className="font-semibold">Why they chose it:</span> {g.selectionRationale}</p> : null}
            </Section>
            <Section title={`Assumptions (${d.assumptions.length})`}>
              <ul className="space-y-2 text-sm">
                {d.assumptions.map((a) => (
                  <li key={a.id}>
                    {a.statement} <span className="text-xs text-muted">· {a.importance} · {a.status === "open" ? "not tested" : a.status}</span>
                  </li>
                ))}
              </ul>
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
                    <p className="text-xs text-faint">{e.fullName} · {shortDate(e.createdAt)}</p>
                  </li>
                ))}
              </ul>
            </Section>
            {d.work ? <Work work={d.work} /> : null}
            <Section title={`Private reflections (${d.reflections.length})`} icon={<Lock className="size-4" aria-hidden />}>
              <ul className="space-y-2 text-sm">
                {d.reflections.map((r) => (
                  <li key={r.id}>
                    <p className="text-xs text-muted">{r.fullName} · {STAGE_BY_ID[r.stage as StageId]?.title ?? r.stage}</p>
                    <p className="leading-6">{r.body}</p>
                  </li>
                ))}
              </ul>
            </Section>
            <Section title="AI advisor chat">
              <ul className="space-y-2 text-sm">
                {d.advisor.map((m, i) => (
                  <li key={i} className={m.role === "advisor" ? "rounded-[12px] bg-gold-soft p-2" : "p-2"}>
                    <p className="text-xs text-muted">{m.role === "advisor" ? "Advisor" : m.fullName}</p>
                    <p>{m.content}</p>
                  </li>
                ))}
              </ul>
            </Section>
            <Section title="Everything they did">
              <ul className="space-y-1 text-sm">
                {d.timeline.map((t, i) => (
                  <li key={i}>
                    <span className="text-faint">{shortDateTime(t.createdAt)}</span> — {t.fullName ?? "system"}:{" "}
                    {t.eventType.toLowerCase().replaceAll("_", " ")}
                  </li>
                ))}
              </ul>
            </Section>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function Section({ title, children, icon }: { title: string; children: ReactNode; icon?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-[20px] bg-bg-elevated ring-1 ring-line">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center justify-between px-4 py-3 text-left">
        <span className="flex items-center gap-2 font-semibold">{icon}{title}</span>
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
      variant="ghost"
      disabled={Boolean(pending)}
      onClick={() =>
        void run("assign", async () => {
          await assignGroup({ data: { groupId, assign: !mine } });
          onDone();
        })
      }
    >
      {mine ? "Remove from my groups" : "Add to my groups"}
    </Button>
  );
}

function Members({ d, onChanged }: { d: Detail; onChanged: () => void }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [privateMsg, setPrivateMsg] = useState("");
  const { pending, error, notice, run } = useAction();
  const real = d.members.filter((m) => !m.isSynthetic);
  return (
    <section className="space-y-2">
      <h2 className="font-display text-lg font-bold">Students</h2>
      <ul className="overflow-hidden rounded-[22px] bg-bg-elevated ring-1 ring-line">
        {real.map((m) => {
          const open = openId === m.memberId;
          const last = m.lastActivityAt ? daysAgo(m.lastActivityAt) : null;
          return (
            <li key={m.memberId} className="border-b border-line last:border-0">
              <button
                type="button"
                onClick={() => {
                  setOpenId(open ? null : m.memberId);
                  setReason("");
                  setPrivateMsg("");
                }}
                aria-expanded={open}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
              >
                <span className="min-w-0">
                  <span className={cn("block font-semibold", m.status !== "active" && "text-muted line-through")}>{m.fullName}</span>
                  <span className={cn("block text-sm", last !== null && last >= 14 ? "text-clay" : "text-muted")}>
                    {m.status !== "active" ? (m.status === "left" ? "Left the group" : "Marked inactive") : last === null ? "Hasn’t started" : last === 0 ? "Active today" : `Last active ${last} days ago`}
                    {` · ${m.total} action${m.total === 1 ? "" : "s"}`}
                  </span>
                </span>
                <ChevronDown className={cn("size-4 shrink-0 text-muted transition-transform", open && "rotate-180")} aria-hidden />
              </button>
              {open ? (
                <div className="rise space-y-3 px-4 pb-4 text-sm">
                  <p className="text-muted">
                    {m.indexNumber} · {m.programme}
                    {m.peerAvg !== null ? ` · teammates rate them ${m.peerAvg.toFixed(1)}/5` : ""}
                  </p>
                  {m.peerComments ? <p className="rounded-[12px] bg-bg p-2 text-xs text-ink-soft">What teammates said: {m.peerComments}</p> : null}
                  <div className="flex gap-2">
                    <input
                      aria-label={`Private message to ${m.fullName}`}
                      value={privateMsg}
                      onChange={(e) => setPrivateMsg(e.target.value)}
                      placeholder={`Private message to ${m.fullName.split(" ")[0]}…`}
                      className="h-10 min-w-0 flex-1 rounded-full bg-bg px-4 ring-1 ring-line focus:outline-none"
                    />
                    <Button
                      size="sm"
                      disabled={Boolean(pending) || !privateMsg.trim()}
                      onClick={() =>
                        void run(
                          "pm",
                          async () => {
                            await sendStaffMessage({ data: { groupId: d.group.id, body: privateMsg, recipientStudentId: m.studentId } });
                            setPrivateMsg("");
                            onChanged();
                          },
                          "Sent privately.",
                        )
                      }
                    >
                      Send
                    </Button>
                  </div>
                  {m.status !== "left" ? (
                    <div className="space-y-2 rounded-[14px] bg-bg p-3">
                      <p className="font-semibold">
                        {m.status === "active" ? "Not taking part?" : "Bring them back?"}
                      </p>
                      <p className="text-xs text-muted">
                        {m.status === "active"
                          ? "Marking them inactive means the group stops waiting for them. The group sees your reason."
                          : "They will count as a group member again."}
                      </p>
                      <input
                        aria-label="Reason"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Reason, e.g. hasn’t attended since week 3"
                        className="h-10 w-full rounded-full bg-bg-elevated px-4 ring-1 ring-line focus:outline-none"
                      />
                      <Button
                        size="sm"
                        variant={m.status === "active" ? "danger" : "secondary"}
                        disabled={Boolean(pending) || reason.trim().length < 5}
                        onClick={() =>
                          void run("status", async () => {
                            await setMemberStatus({
                              data: { groupId: d.group.id, memberId: m.memberId, status: m.status === "active" ? "inactive" : "active", reason },
                            });
                            setOpenId(null);
                            onChanged();
                          })
                        }
                      >
                        {m.status === "active" ? "Mark inactive" : "Reactivate"}
                      </Button>
                    </div>
                  ) : null}
                  <FormMessages error={error} notice={notice} />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function FeedbackComposer({ d, onSaved }: { d: Detail; onSaved: () => void }) {
  const [stage, setStage] = useState<string>(d.currentStage ?? "choose");
  const [level, setLevel] = useState<"" | "1" | "2" | "3" | "4">("");
  const [body, setBody] = useState("");
  const [pickStage, setPickStage] = useState(false);
  const { pending, error, run } = useAction();
  const stageTitle = STAGE_BY_ID[stage as StageId]?.title ?? "";
  return (
    <section className="rise space-y-3 rounded-[22px] bg-bg-elevated p-4 ring-2 ring-ink">
      <p className="text-sm">
        Feedback on <span className="font-semibold">{stageTitle}</span>{" "}
        <button type="button" onClick={() => setPickStage((v) => !v)} className="font-semibold text-accent">
          {pickStage ? "done" : "change"}
        </button>
      </p>
      {pickStage ? (
        <Select value={stage} onChange={(e) => setStage(e.target.value)} aria-label="Stop">
          {STAGES.map((s2) => (
            <option key={s2.id} value={s2.id}>
              {s2.stop}. {s2.title}
            </option>
          ))}
        </Select>
      ) : null}
      <textarea
        aria-label="Feedback"
        autoFocus
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        placeholder="What should they do next?"
        className="w-full rounded-[14px] bg-bg px-3 py-2.5 text-[15px] ring-1 ring-line focus:outline-none"
      />
      <div className="flex flex-wrap gap-1.5">
        {TEMPLATES.map((t) => (
          <button key={t} type="button" onClick={() => setBody((b) => (b ? `${b} ${t}` : t))} className="rounded-full bg-bg px-3 py-1 text-left text-xs ring-1 ring-line hover:ring-ink">
            {t}
          </button>
        ))}
      </div>
      <Choice label="How are they doing? (optional)" value={level} options={[{ value: "", label: "Skip" }, ...LEVELS]} onChange={setLevel} />
      <FormMessages error={error} />
      <Button
        disabled={Boolean(pending) || body.trim().length < 10}
        onClick={() =>
          void run("fb", async () => {
            await giveFeedback({ data: { groupId: d.group.id, stage, body, level: level ? Number(level) : null } });
            onSaved();
          })
        }
      >
        {pending ? "Sending…" : "Send feedback"}
      </Button>
    </section>
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

function Conversation({ d, composing, onSent }: { d: Detail; composing: boolean; onSent: () => void }) {
  const [body, setBody] = useState("");
  const [all, setAll] = useState(false);
  const { pending, error, run } = useAction();
  const shown = all ? d.thread : d.thread.slice(-3);
  if (!d.thread.length && !composing) return null;
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold">Messages</h2>
        {d.thread.length > 3 ? (
          <button type="button" onClick={() => setAll((v) => !v)} className="text-sm font-semibold text-accent">
            {all ? "Show fewer" : `See all ${d.thread.length}`}
          </button>
        ) : null}
      </div>
      <div className="rounded-[22px] bg-bg-elevated px-3 ring-1 ring-line">
        <Thread messages={shown} viewer="staff" />
      </div>
      {composing ? (
        <div className="rise flex gap-2">
          <input
            aria-label="Message"
            autoFocus
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write to the whole group…"
            className="h-11 min-w-0 flex-1 rounded-full bg-bg-elevated px-4 ring-1 ring-line focus:ring-2 focus:ring-accent focus:outline-none"
          />
          <Button
            disabled={Boolean(pending) || !body.trim()}
            onClick={() =>
              void run("send", async () => {
                await sendStaffMessage({ data: { groupId: d.group.id, body } });
                setBody("");
                onSent();
              })
            }
          >
            Send
          </Button>
        </div>
      ) : null}
      <FormMessages error={error} />
    </section>
  );
}
