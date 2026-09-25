import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, ChevronDown, Hourglass, Lock, ThumbsDown, ThumbsUp, Trophy, Users, Vote } from "lucide-react";
import { toast } from "sonner";
import { useStudioWorkspace } from "@/hooks/workspace-context";
import { recordPreference } from "@/lib/server/mutations";
import { proposeVenture, respondToProposal, withdrawProposal } from "@/lib/server/decisions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Badge, Card, SectionTitle } from "@/components/ui/badge";
import { Avatar, AvatarStack } from "@/components/ui/avatar";
import { Bar, Ring } from "@/components/ui/progress";
import { Empty, Skeleton } from "@/components/ui/empty";
import { Sheet } from "@/components/ui/sheet";
import { Confetti } from "@/components/ui/confetti";
import { Why } from "@/components/ui/why";
import { WHY } from "@/lib/domain/copy";
import type { Opportunity, VentureProposal, WorkspaceSnapshot } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/studio/select")({ component: SelectPage });

const first = (n: string) => n.split(" ")[0];
const errMsg = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

function SelectPage() {
  const { data, loading } = useStudioWorkspace();
  const [party, setParty] = useState(0);
  if (loading || !data) return <Skeleton className="h-72" />;
  if (!data.group) {
    return <Empty icon={<Users className="size-5" />} title="Join a team first" action={<Link to="/studio/group" className={buttonVariants({})}>Find my team</Link>} />;
  }

  const phase = data.venture ? 3 : !data.canOpenSelection ? 0 : data.preferencesRevealed ? 2 : 1;

  return (
    <div className="space-y-5">
      <Confetti fire={party} />
      <div className="animate-rise">
        <Badge tone="neutral" className="bg-ch-decide/15 text-ch-decide">Chapter 3 · Decide</Badge>
        <h1 className="mt-2 font-display text-[2rem] leading-tight">Choose one venture, together</h1>
        <p className="mt-2 max-w-[54ch] text-[15px] leading-6 text-muted">
          Read every idea, vote privately, then agree as a group. The app never picks a winner — and the ideas you don't pick stay in the record.
        </p>
      </div>

      <Stepper current={phase === 0 ? 0 : phase === 1 ? (data.myPreference ? 2 : 1) : phase === 2 ? 3 : 4} />

      {phase === 0 ? <NotYet data={data} /> : null}
      {phase === 1 ? <Compare data={data} /> : null}
      {phase === 2 ? <Decide data={data} onAccepted={() => setParty((n) => n + 1)} /> : null}
      {phase === 3 ? <Chosen data={data} /> : null}
    </div>
  );
}

function Stepper({ current }: { current: number }) {
  const steps = ["Compare", "Vote privately", "Agree"];
  return (
    <ol className="flex items-center gap-1.5 text-[11px] font-semibold sm:gap-2 sm:text-xs">
      {steps.map((s, i) => {
        const done = i + 1 < current;
        const on = i + 1 === current;
        return (
          <li key={s} className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2">
            <span
              className={cn(
                "grid size-6 shrink-0 place-items-center rounded-full border-2 text-[11px]",
                done ? "border-ch-decide bg-ch-decide text-white" : on ? "border-ch-decide text-ch-decide" : "border-line text-faint",
              )}
            >
              {done ? <Check className="size-3.5" /> : i + 1}
            </span>
            <span className={cn("truncate", !done && !on && "text-faint")}>{s}</span>
          </li>
        );
      })}
    </ol>
  );
}

function NotYet({ data }: { data: WorkspaceSnapshot }) {
  const p = data.submissionProgress;
  const waiting = data.members.filter((m) => m.membershipStatus === "active" && !m.hasSubmittedOpportunity);
  return (
    <Card className="animate-rise space-y-4 text-center">
      <div className="flex justify-center">
        <Ring value={p.submitted} max={p.required} size={84} stroke={7} color="var(--color-ch-decide)" label={`${p.submitted} of ${p.required} sealed`} />
      </div>
      <div>
        <h2 className="font-display text-xl">Ideas are still sealed</h2>
        <p className="mx-auto mt-1 max-w-[44ch] text-sm leading-6 text-muted">
          Comparison opens when everyone has sealed an idea{data.offering && !data.offering.selectionRequiresAllActive ? " (or at least half the group)" : ""}, or when your lecturer opens it.
          Until then nobody can see anyone else's.
        </p>
      </div>
      {waiting.length ? (
        <div className="flex flex-col items-center gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Still writing</p>
          <AvatarStack names={waiting.map((m) => m.fullName)} max={7} size={32} />
        </div>
      ) : null}
      {!data.myOpportunity || data.myOpportunity.status === "draft" ? (
        <Link to="/studio/opportunity" className={buttonVariants({ variant: "sun" })}>Finish my idea first</Link>
      ) : null}
    </Card>
  );
}

function IdeaCard({ o, me, votes, children }: { o: Opportunity; me: boolean; votes?: number; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Card as="article" className={cn("space-y-3", me && "border-sun/70")}>
      <div className="flex items-center gap-2.5">
        <Avatar name={o.authorName} size={30} ring={me ? "you" : "none"} />
        <p className="min-w-0 flex-1 truncate text-sm font-semibold">{me ? "Your idea" : `${first(o.authorName)}'s idea`}</p>
        {o.context ? <Badge>{o.context.length > 24 ? `${o.context.slice(0, 22)}…` : o.context}</Badge> : null}
      </div>
      <h3 className="font-display text-[1.2rem] leading-snug">{o.problem}</h3>
      <dl className="grid gap-2.5 text-sm leading-6">
        <Row label="Who" value={o.affectedPeople} />
        <Row label="What they saw" value={o.observedEvidence} clamp={!open} />
        {open ? (
          <>
            <Row label="Why it matters" value={o.whyItMatters} />
            <Row label="How people cope today" value={o.currentAlternatives} />
            <Row label="A first guess" value={o.possibleSolution} />
            <Row label="Who might pay" value={o.potentialCustomer} />
            <Row label="What they don't know" value={o.uncertainties} />
          </>
        ) : null}
      </dl>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-1 text-sm font-semibold text-ch-decide" aria-expanded={open}>
          {open ? "Show less" : "Read all of it"} <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
        </button>
        {typeof votes === "number" ? <span className="ml-auto text-sm font-semibold tabular-nums">{votes} vote{votes === 1 ? "" : "s"}</span> : null}
      </div>
      {children}
    </Card>
  );
}

function Row({ label, value, clamp }: { label: string; value: string; clamp?: boolean }) {
  if (!value?.trim()) return null;
  return (
    <div>
      <dt className="text-[11px] font-bold uppercase tracking-[0.12em] text-faint">{label}</dt>
      <dd className={cn("whitespace-pre-line", clamp && "line-clamp-3")}>{value}</dd>
    </div>
  );
}

function Compare({ data }: { data: WorkspaceSnapshot }) {
  const { refresh } = useStudioWorkspace();
  const [target, setTarget] = useState<Opportunity | null>(null);
  const [why, setWhy] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const opps = data.visibleOpportunities.filter((o) => o.status !== "draft");
  const eligible = data.eligibleVoterIds.includes(data.student?.id ?? "");
  const p = data.preferenceProgress;
  const voted = data.myPreference;

  async function vote() {
    if (!target) return;
    setPending(true);
    setError(null);
    try {
      await recordPreference({ data: { opportunityId: target.id, rationale: why.trim() } });
      await refresh();
      setTarget(null);
      setWhy("");
      toast.success("Vote sealed. It's revealed when everyone has voted.");
    } catch (e) {
      setError(errMsg(e, "Could not record your vote."));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className={cn("animate-rise flex items-center gap-4", voted ? "border-ch-decide/40 bg-ch-decide/5" : "")}>
        <Ring value={p.recorded} max={p.required} size={56} color="var(--color-ch-decide)" label={`${p.recorded} of ${p.required} voted`} />
        <div className="min-w-0 flex-1">
          {voted ? (
            <>
              <p className="flex items-center gap-1.5 font-semibold"><Lock className="size-4 text-ch-decide" /> Your vote is sealed</p>
              <p className="text-sm text-muted">
                You chose {first(opps.find((o) => o.id === voted.opportunityId)?.authorName ?? "an")}'s idea. Everyone's votes appear together once the last person votes.
              </p>
            </>
          ) : eligible ? (
            <>
              <p className="font-semibold">Read each idea, then vote for one</p>
              <p className="text-sm text-muted">Your vote stays hidden until everyone has voted — so nobody follows the crowd.</p>
            </>
          ) : (
            <>
              <p className="font-semibold">You're following this decision</p>
              <p className="text-sm text-muted">Only members who sealed an idea vote on this one.</p>
            </>
          )}
        </div>
      </Card>

      <div className="space-y-4">
        {opps.map((o) => {
          const me = o.studentId === data.student?.id;
          const mine = voted?.opportunityId === o.id;
          return (
            <IdeaCard key={o.id} o={o} me={me}>
              {eligible && !voted ? (
                <Button block variant={me ? "secondary" : "primary"} onClick={() => setTarget(o)}>
                  <Vote className="size-4" /> Vote for this idea
                </Button>
              ) : mine ? (
                <p className="flex items-center gap-1.5 rounded-[12px] bg-ch-decide/10 px-3 py-2 text-sm font-semibold text-ch-decide"><Check className="size-4" /> Your vote</p>
              ) : null}
            </IdeaCard>
          );
        })}
      </div>

      <Sheet open={Boolean(target)} onOpenChange={(v) => !v && setTarget(null)} title="Why this one?" description={target ? `Voting for ${target.studentId === data.student?.id ? "your own" : `${first(target.authorName)}'s`} idea.` : undefined}>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void vote();
          }}
        >
          {target ? <p className="rounded-[14px] bg-bg-subtle p-3 text-sm leading-6">{target.problem}</p> : null}
          <Field label="Your reason" hint={`${why.trim().length}/15 characters minimum. Your group reads this after the reveal.`}>
            <Textarea value={why} onChange={(e) => setWhy(e.target.value)} placeholder="e.g. It's the only one with real numbers, and we can test it on campus this week." maxLength={1000} autoFocus />
            <Why text={WHY.preference} />
          </Field>
          {target?.studentId === data.student?.id ? (
            <p className="rounded-[12px] bg-warn-soft px-3 py-2 text-sm text-warn">It's your own idea. That's allowed — just make the reason convincing to others.</p>
          ) : null}
          {error ? <p role="alert" className="text-sm text-bad">{error}</p> : null}
          <Button type="submit" block size="lg" disabled={pending || why.trim().length < 15}>
            <Lock className="size-4" /> {pending ? "Sealing…" : "Seal my vote"}
          </Button>
          <p className="text-center text-xs text-muted">You can't change it once sealed.</p>
        </form>
      </Sheet>
    </div>
  );
}

function Decide({ data, onAccepted }: { data: WorkspaceSnapshot; onAccepted: () => void }) {
  const opps = data.visibleOpportunities.filter((o) => o.status !== "draft");
  const tally = useMemo(() => {
    const m = new Map<string, typeof data.preferences>();
    for (const p of data.preferences) m.set(p.opportunityId, [...(m.get(p.opportunityId) ?? []), p]);
    return m;
  }, [data]);
  const ranked = [...opps].sort((a, b) => (tally.get(b.id)?.length ?? 0) - (tally.get(a.id)?.length ?? 0));
  const max = Math.max(1, ...ranked.map((o) => tally.get(o.id)?.length ?? 0));

  return (
    <div className="space-y-5">
      <Card className="animate-rise">
        <SectionTitle kicker="Votes revealed" title="Where the group landed" />
        <ul className="mt-4 space-y-4">
          {ranked.map((o, i) => {
            const votes = tally.get(o.id) ?? [];
            return <VoteRow key={o.id} o={o} votes={votes} max={max} lead={i === 0 && votes.length > 0} />;
          })}
        </ul>
      </Card>

      {data.proposal ? (
        <ProposalCard data={data} proposal={data.proposal} onAccepted={onAccepted} />
      ) : (
        <ProposeForm data={data} ranked={ranked} onAccepted={onAccepted} />
      )}

      {data.pastProposals.length ? (
        <Card className="animate-rise">
          <SectionTitle kicker="History" title="Earlier proposals" />
          <ul className="mt-3 space-y-3">
            {data.pastProposals.map((p) => (
              <li key={p.id} className="rounded-[14px] bg-bg-subtle/70 p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">{p.name}</p>
                  <Badge tone={p.status === "rejected" ? "bad" : "neutral"}>{p.status === "rejected" ? "Not agreed" : p.status}</Badge>
                </div>
                <p className="mt-1 text-muted">
                  By {first(p.proposedByName)} · {p.responses.filter((r) => r.stance === "endorse").length} for, {p.responses.filter((r) => r.stance === "object").length} against
                </p>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

function VoteRow({ o, votes, max, lead }: { o: Opportunity; votes: WorkspaceSnapshot["preferences"]; max: number; lead: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <li>
      <button type="button" className="w-full text-left" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 text-sm font-semibold leading-5">
            {lead ? <Trophy className="mr-1 inline size-4 -translate-y-px text-sun" /> : null}
            {o.problem.length > 110 ? `${o.problem.slice(0, 108)}…` : o.problem}
          </p>
          <span className="shrink-0 text-sm font-bold tabular-nums">{votes.length}</span>
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <Bar value={votes.length} max={max} color={lead ? "var(--color-ch-decide)" : "color-mix(in oklab, var(--color-ch-decide) 45%, white)"} />
          <span className="shrink-0 text-xs text-muted">{first(o.authorName)}</span>
        </div>
      </button>
      {open && votes.length ? (
        <ul className="mt-2 space-y-2 border-l-2 border-ch-decide/30 pl-3">
          {votes.map((v) => (
            <li key={v.id} className="text-sm leading-5">
              <span className="font-semibold">{first(v.studentName)}:</span> <span className="text-ink-soft">{v.rationale}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function ProposeForm({ data, ranked, onAccepted }: { data: WorkspaceSnapshot; ranked: Opportunity[]; onAccepted: () => void }) {
  const { refresh } = useStudioWorkspace();
  const [oppId, setOppId] = useState(ranked[0]?.id ?? "");
  const [name, setName] = useState("");
  const [why, setWhy] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eligible = data.eligibleVoterIds.includes(data.student?.id ?? "");
  const needed = data.offering?.decisionRule === "all" ? "everyone who voted" : "a majority of those who voted";

  async function submit() {
    setPending(true);
    setError(null);
    try {
      const r = await proposeVenture({ data: { opportunityId: oppId, name: name.trim(), rationale: why.trim() } });
      await refresh();
      if (r.outcome === "accepted") {
        onAccepted();
        toast.success("Agreed! Your group has its venture.");
      } else if (r.outcome === "rejected") toast.error("The group didn't back that proposal. Read their reasons and try again.");
      else toast.success("Proposal shared with your group.");
    } catch (e) {
      setError(errMsg(e, "Could not propose."));
    } finally {
      setPending(false);
    }
  }

  if (!eligible) {
    return <Card className="text-sm text-muted">Members who voted will propose and agree the venture. You'll see it here.</Card>;
  }

  return (
    <Card className="animate-rise space-y-4 border-ch-decide/40">
      <SectionTitle kicker="Next" title="Propose the group's venture" />
      <p className="text-sm leading-6 text-muted">Anyone can propose. It becomes the venture when {needed} endorse it — objections need a reason.</p>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div role="radiogroup" aria-label="Which idea" className="space-y-2">
          {ranked.map((o) => (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={oppId === o.id}
              onClick={() => setOppId(o.id)}
              className={cn(
                "flex w-full items-start gap-3 rounded-[14px] border p-3 text-left text-sm transition-colors",
                oppId === o.id ? "border-ch-decide bg-ch-decide/8" : "border-line hover:border-line-strong",
              )}
            >
              <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2", oppId === o.id ? "border-ch-decide bg-ch-decide text-white" : "border-line")}>
                {oppId === o.id ? <Check className="size-3" /> : null}
              </span>
              <span className="min-w-0 flex-1 leading-5">
                <span className="line-clamp-2">{o.problem}</span>
                <span className="text-xs text-muted">{first(o.authorName)}</span>
              </span>
            </button>
          ))}
        </div>
        <Field label="A working name" hint="Short. You can change the venture later — this is just what you'll call it.">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. WashLine" maxLength={80} />
        </Field>
        <Field label="Why this one rather than the others?" hint={`${why.trim().length}/60 characters minimum. Name what the other ideas lacked.`}>
          <Textarea value={why} onChange={(e) => setWhy(e.target.value)} className="min-h-32" maxLength={3000} placeholder="e.g. It had the most votes and the only counted evidence (14 people queueing). The market idea had no numbers; the transport one is hard to test on campus." />
          <Why text={WHY.rationale} />
        </Field>
        {error ? <p role="alert" className="text-sm text-bad">{error}</p> : null}
        <Button type="submit" block size="lg" disabled={pending || !oppId || why.trim().length < 60}>
          {pending ? "Proposing…" : "Propose to the group"}
        </Button>
      </form>
    </Card>
  );
}

function ProposalCard({ data, proposal, onAccepted }: { data: WorkspaceSnapshot; proposal: VentureProposal; onAccepted: () => void }) {
  const { refresh } = useStudioWorkspace();
  const [objecting, setObjecting] = useState(false);
  const [comment, setComment] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const me = data.student?.id ?? "";
  const mine = proposal.responses.find((r) => r.studentId === me);
  const endorse = proposal.responses.filter((r) => r.stance === "endorse");
  const object = proposal.responses.filter((r) => r.stance === "object");
  const eligible = data.eligibleVoterIds.includes(me);
  const opp = data.visibleOpportunities.find((o) => o.id === proposal.opportunityId);
  const waitingOn = data.members.filter((m) => data.eligibleVoterIds.includes(m.studentId) && !proposal.responses.some((r) => r.studentId === m.studentId));

  async function respond(stance: "endorse" | "object") {
    setPending(stance);
    setError(null);
    try {
      const r = await respondToProposal({ data: { proposalId: proposal.id, stance, comment: comment.trim() } });
      await refresh();
      setObjecting(false);
      if (r.outcome === "accepted") {
        onAccepted();
        toast.success("Agreed! Your group has its venture.");
      } else if (r.outcome === "rejected") toast("The proposal didn't get enough support.");
      else toast.success(stance === "endorse" ? "Endorsed." : "Objection recorded.");
    } catch (e) {
      setError(errMsg(e, "Could not record your response."));
    } finally {
      setPending(null);
    }
  }

  async function withdraw() {
    setPending("withdraw");
    try {
      await withdrawProposal({ data: { proposalId: proposal.id } });
      await refresh();
      toast("Proposal withdrawn.");
    } catch (e) {
      setError(errMsg(e, "Could not withdraw."));
    } finally {
      setPending(null);
    }
  }

  return (
    <Card className="animate-pop space-y-4 overflow-hidden border-ch-decide/50 p-0">
      <div className="bg-ch-decide px-5 py-4 text-white">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/75">Proposal from {first(proposal.proposedByName)}</p>
        <h2 className="font-display text-2xl text-white">{proposal.name}</h2>
        {opp ? <p className="mt-1 line-clamp-2 text-sm text-white/85">{opp.problem}</p> : null}
      </div>
      <div className="space-y-4 px-5 pb-5">
        <p className="whitespace-pre-line text-[15px] leading-6">{proposal.rationale}</p>
        <div>
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-semibold">{endorse.length} of {proposal.needed} endorsements needed</span>
            {object.length ? <span className="text-bad">{object.length} against</span> : null}
          </div>
          <Bar value={endorse.length} max={proposal.needed} className="mt-1.5" color="var(--color-ch-decide)" />
        </div>
        <ul className="space-y-2.5">
          {proposal.responses.map((r) => (
            <li key={r.studentId} className="flex gap-2.5 text-sm">
              <Avatar name={r.studentName} size={28} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {r.studentId === me ? "You" : first(r.studentName)}{" "}
                  <span className={r.stance === "endorse" ? "text-accent" : "text-bad"}>{r.stance === "endorse" ? "endorsed" : "objected"}</span>
                </p>
                {r.comment && r.comment !== "Proposed this." ? <p className="leading-5 text-ink-soft">{r.comment}</p> : null}
              </div>
            </li>
          ))}
        </ul>
        {waitingOn.length ? (
          <p className="flex items-center gap-2 text-xs text-muted">
            <Hourglass className="size-3.5" /> Waiting on {waitingOn.map((m) => (m.studentId === me ? "you" : first(m.fullName))).join(", ")}
          </p>
        ) : null}

        {eligible && !mine ? (
          objecting ? (
            <div className="space-y-3 rounded-[16px] bg-bad-soft/50 p-3">
              <Field label="Why do you object?" hint="Your group sees this. Be specific — what's missing or wrong?">
                <Textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} autoFocus placeholder="e.g. We haven't shown anyone would pay. The other idea had a pre-order already." />
              </Field>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setObjecting(false)}>Back</Button>
                <Button variant="danger" className="flex-1" disabled={Boolean(pending) || comment.trim().length < 10} onClick={() => void respond("object")}>
                  <ThumbsDown className="size-4" /> {pending === "object" ? "Sending…" : "Object"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Textarea value={comment} onChange={(e) => setComment(e.target.value)} className="min-h-16" maxLength={1000} placeholder="Add a comment (optional for endorsing)" aria-label="Comment" />
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" onClick={() => setObjecting(true)} disabled={Boolean(pending)}>
                  <ThumbsDown className="size-4" /> Object
                </Button>
                <Button onClick={() => void respond("endorse")} disabled={Boolean(pending)}>
                  <ThumbsUp className="size-4" /> {pending === "endorse" ? "Sending…" : "Endorse"}
                </Button>
              </div>
            </div>
          )
        ) : null}
        {proposal.proposedByStudentId === me ? (
          <Button variant="ghost" size="sm" onClick={() => void withdraw()} disabled={Boolean(pending)}>
            Withdraw my proposal
          </Button>
        ) : null}
        {error ? <p role="alert" className="text-sm text-bad">{error}</p> : null}
      </div>
    </Card>
  );
}

function Chosen({ data }: { data: WorkspaceSnapshot }) {
  const v = data.venture!;
  const opp = data.visibleOpportunities.find((o) => o.id === v.opportunityId);
  const others = data.visibleOpportunities.filter((o) => o.id !== v.opportunityId && o.status !== "draft");
  const agreed = data.pastProposals.find((p) => p.status === "accepted");
  return (
    <div className="space-y-4">
      <Card className="animate-pop overflow-hidden border-0 bg-night p-0 text-accent-fg">
        <div className="kente h-2" />
        <div className="space-y-3 p-6">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-sun"><Trophy className="size-3.5" /> Your group's venture</p>
          <h2 className="font-display text-3xl text-accent-fg">{v.name}</h2>
          {opp ? <p className="text-[15px] leading-6 text-accent-fg/80">{opp.problem}</p> : null}
          <p className="whitespace-pre-line border-l-2 border-sun/60 pl-3 text-sm leading-6 text-accent-fg/75">{v.selectionRationale}</p>
          <Link to="/studio/venture" className={buttonVariants({ variant: "sun", size: "lg" })}>Start building the evidence</Link>
        </div>
      </Card>
      {agreed ? (
        <Card>
          <SectionTitle kicker="The decision" title="How your group agreed" />
          <p className="mt-1 text-sm text-muted">
            Proposed by {first(agreed.proposedByName)} · {agreed.responses.filter((r) => r.stance === "endorse").length} endorsed, {agreed.responses.filter((r) => r.stance === "object").length} objected
          </p>
          <ul className="mt-3 space-y-2.5">
            {agreed.responses.map((r) => (
              <li key={r.studentId} className="flex gap-2.5 text-sm">
                <Avatar name={r.studentName} size={26} />
                <p className="min-w-0 flex-1 leading-5">
                  <b>{r.studentId === data.student?.id ? "You" : first(r.studentName)}</b>{" "}
                  <span className={r.stance === "endorse" ? "text-accent" : "text-bad"}>{r.stance === "endorse" ? "endorsed" : "objected"}</span>
                  {r.comment && r.comment !== "Proposed this." ? <span className="block text-ink-soft">{r.comment}</span> : null}
                </p>
              </li>
            ))}
          </ul>
          {agreed.responses.some((r) => r.stance === "object") ? (
            <p className="mt-3 rounded-[12px] bg-sun-soft/70 px-3 py-2 text-xs leading-5 text-[#8a5a0f]">The objections are worth testing — they're often your riskiest assumptions.</p>
          ) : null}
        </Card>
      ) : null}
      {others.length ? (
        <Card>
          <SectionTitle kicker="Kept in the record" title="Ideas you didn't choose" />
          <p className="mt-1 text-sm text-muted">If your venture fails its tests, one of these might be your pivot.</p>
          <ul className="mt-3 divide-y divide-line/70">
            {others.map((o) => (
              <li key={o.id} className="py-2.5 text-sm">
                <p className="line-clamp-2">{o.problem}</p>
                <p className="text-xs text-muted">{first(o.authorName)}</p>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
