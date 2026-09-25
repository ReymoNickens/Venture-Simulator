import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronDown, Hourglass, Vote } from "lucide-react";
import { useStudioWorkspace } from "@/hooks/workspace-context";
import { useAction } from "@/hooks/use-action";
import { recordPreference } from "@/lib/server/mutations";
import { proposeVenture, voteOnProposal, withdrawProposal } from "@/lib/server/governance";
import type { Opportunity, VentureProposal, WorkspaceSnapshot } from "@/lib/domain/types";
import { WHY } from "@/lib/domain/copy";
import { AdvisorPanel } from "@/components/advisor/AdvisorPanel";
import { StageHeader } from "@/components/stage/StageHeader";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Why } from "@/components/ui/why";
import { Card, Eyebrow, EmptyNote } from "@/components/ui/badge";
import { Stamp } from "@/components/ui/stamp";
import { FormMessages, Loading } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/studio/select")({ component: SelectPage });

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function SelectPage() {
  const { data, loading, refresh } = useStudioWorkspace();
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
  if (!data.canOpenSelection) return <Waiting data={data} />;
  return <Selection data={data} refresh={refresh} />;
}

function Waiting({ data }: { data: WorkspaceSnapshot }) {
  const active = data.members.filter((m) => m.membershipStatus === "active");
  return (
    <div className="space-y-5">
      <StageHeader stage="choose" data={data} />
      <Card className="space-y-3">
        <div className="flex items-center gap-2">
          <Hourglass className="size-5 text-gold-deep" aria-hidden />
          <h2 className="font-display text-xl font-bold">Waiting for every submission</h2>
        </div>
        <p className="text-sm leading-6 text-muted">
          {data.submissionProgress.submitted} of {data.submissionProgress.required} active members have
          submitted. Everyone’s ideas stay sealed until the last one is in, so nobody copies. If a
          member has dropped out, they can leave the group — or your lecturer can mark them inactive.
        </p>
        <ul className="flex flex-wrap gap-2">
          {active.map((m) => (
            <li key={m.id}>
              {m.hasSubmittedOpportunity ? (
                <Stamp tone="forest" size="xs" tilt={-2}>
                  {m.fullName.split(" ")[0]} ✓
                </Stamp>
              ) : (
                <span className="rounded-[4px] border-2 border-dashed border-line-strong px-1.5 py-[1px] text-[10px] font-semibold tracking-wide text-faint uppercase">
                  {m.fullName.split(" ")[0]}
                </span>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function Selection({ data, refresh }: { data: WorkspaceSnapshot; refresh: () => Promise<unknown> }) {
  const opps = data.visibleOpportunities.filter((o) => o.status !== "draft");
  const letter = (id: string) => LETTERS[opps.findIndex((o) => o.id === id)] ?? "?";
  const [preferred, setPreferred] = useState(data.myPreference?.opportunityId ?? "");
  const [prefWhy, setPrefWhy] = useState(data.myPreference?.rationale ?? "");
  const pref = useAction();
  const openProposal = data.proposals.find((p) => p.status === "open") ?? null;
  const past = data.proposals.filter((p) => p.status !== "open");
  // Other members' preferences are shown only after you have recorded yours,
  // so your first judgement is your own and not a vote for the crowd.
  const showTally = Boolean(data.myPreference) || Boolean(data.venture);
  const tally = new Map<string, number>();
  for (const p of data.preferences) tally.set(p.opportunityId, (tally.get(p.opportunityId) ?? 0) + 1);

  return (
    <div className="space-y-6">
      <StageHeader stage="choose" data={data} />

      {data.venture ? (
        <section className="rounded-[12px] border-2 border-ink bg-accent-soft p-4">
          <Stamp tone="forest" tilt={-4}>Ratified</Stamp>
          <h2 className="mt-2 font-display text-2xl font-extrabold">{data.venture.name}</h2>
          <p className="mt-1 text-sm leading-6">{data.venture.selectionRationale}</p>
          <Link to="/studio/venture" className="mt-3 inline-block text-sm font-semibold text-accent underline">
            Next stop: what must be true? →
          </Link>
        </section>
      ) : null}

      <section className="space-y-2">
        <div className="flex items-end justify-between">
          <Eyebrow>
            {opps.length} opportunities · {data.preferenceProgress.recorded}/{data.preferenceProgress.required} preferences in
          </Eyebrow>
        </div>
        <ul className="space-y-2">
          {opps.map((o) => (
            <OpportunityCard
              key={o.id}
              o={o}
              letter={letter(o.id)}
              mine={o.studentId === data.student?.id}
              votes={showTally ? (tally.get(o.id) ?? 0) : null}
              picked={preferred === o.id}
              onPick={!data.venture ? () => setPreferred(o.id) : undefined}
            />
          ))}
        </ul>
      </section>

      {!data.venture ? (
        <Card as="section" className="space-y-3">
          <Eyebrow>Step 1 · on your own</Eyebrow>
          <h2 className="font-display text-xl font-bold">Your preference</h2>
          {preferred ? (
            <p className="text-sm">
              You picked <strong>Opportunity {letter(preferred)}</strong>. Tap a different card to change.
            </p>
          ) : (
            <p className="text-sm text-muted">Tap “I prefer this” on one card above.</p>
          )}
          <Field label="Why this one, for you?">
            <Textarea value={prefWhy} onChange={(e) => setPrefWhy(e.target.value)} placeholder="Point to evidence, not enthusiasm." />
            <Why text={WHY.preference} />
          </Field>
          <FormMessages error={pref.error} notice={pref.notice} />
          <Button
            disabled={Boolean(pref.pending) || !preferred || prefWhy.trim().length < 10}
            onClick={() =>
              void pref.run(
                "pref",
                async () => {
                  await recordPreference({ data: { opportunityId: preferred, rationale: prefWhy } });
                  await refresh();
                },
                "Preference recorded.",
              )
            }
          >
            {pref.pending ? "Saving…" : data.myPreference ? "Update my preference" : "Record my preference"}
          </Button>
        </Card>
      ) : null}

      {showTally && data.preferences.length ? (
        <Card as="section">
          <Eyebrow>What each member preferred, and why</Eyebrow>
          <ul className="mt-3 space-y-2 text-sm">
            {data.preferences.map((p) => (
              <li key={p.id} className="leading-6">
                <span className="font-semibold">{p.studentName}</span>{" "}
                <span className="font-mono text-xs text-muted">→ {letter(p.opportunityId)}</span>
                <span className="text-ink-soft"> — {p.rationale}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {!data.venture && openProposal ? (
        <ProposalCard data={data} proposal={openProposal} letter={letter} refresh={refresh} />
      ) : null}
      {!data.venture && !openProposal && data.canRecordGroupDecision ? (
        <ProposeForm data={data} opps={opps} letter={letter} refresh={refresh} />
      ) : null}
      {!data.venture && !openProposal && !data.canRecordGroupDecision && data.myPreference ? (
        <EmptyNote>
          Once every active member has recorded a preference, anyone can put one opportunity to the
          group.
        </EmptyNote>
      ) : null}

      {past.length ? (
        <Card as="section">
          <Eyebrow>Earlier proposals — kept on the record</Eyebrow>
          <ul className="mt-2 space-y-1.5 text-sm">
            {past.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{p.name}</span>
                <Stamp tone={p.status === "ratified" ? "forest" : "muted"} size="xs">
                  {p.status}
                </Stamp>
                <span className="text-xs text-muted">by {p.proposedByName}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <AdvisorPanel data={data} stage="selection" onSent={() => void refresh()} />
    </div>
  );
}

function OpportunityCard({
  o,
  letter,
  mine,
  votes,
  picked,
  onPick,
}: {
  o: Opportunity;
  letter: string;
  mine: boolean;
  votes: number | null;
  picked: boolean;
  onPick?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rows: [string, string][] = [
    ["Who", o.affectedPeople],
    ["Where", o.context],
    ["What they saw", o.observedEvidence],
    ["How people cope", o.currentAlternatives],
    ["Why it matters", o.whyItMatters],
    ["Possible customer", o.potentialCustomer || "Not stated"],
    ["Still unknown", o.uncertainties],
  ];
  return (
    <li
      className={cn(
        "rounded-[10px] border-2 bg-bg-elevated transition-shadow",
        picked ? "border-ink shadow-[3px_3px_0_0_var(--color-accent)]" : "border-line-strong/70",
      )}
    >
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-start gap-3 p-3 text-left">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-[8px] border-2 font-display text-lg font-extrabold",
            picked ? "border-ink bg-accent text-accent-fg" : "border-ink bg-gold-soft",
          )}
        >
          {letter}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-[15px] leading-snug font-bold">{o.problem}</span>
          <span className="mt-0.5 block text-xs text-muted">
            {o.authorName}
            {mine ? " (yours)" : ""}
            {votes !== null ? ` · ${votes} preference${votes === 1 ? "" : "s"}` : ""}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          {o.status === "selected" ? <Stamp tone="forest" size="xs">Selected</Stamp> : null}
          {o.status === "rejected" ? <Stamp tone="muted" size="xs">Not chosen</Stamp> : null}
          <ChevronDown className={cn("size-4 text-muted transition-transform", open && "rotate-180")} aria-hidden />
        </span>
      </button>
      {open ? (
        <dl className="grid gap-2 border-t border-line px-3 pt-2 pb-3 text-sm">
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt className="font-mono text-[10.5px] tracking-[0.12em] text-faint uppercase">{k}</dt>
              <dd className="leading-6">{v}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {onPick ? (
        <div className="border-t border-line px-3 py-2">
          <button
            type="button"
            onClick={onPick}
            aria-pressed={picked}
            className={cn(
              "text-sm font-semibold",
              picked ? "text-accent" : "text-ink-soft underline underline-offset-2",
            )}
          >
            {picked ? "✓ Your preference" : "I prefer this"}
          </button>
        </div>
      ) : null}
    </li>
  );
}

function ProposeForm({
  data,
  opps,
  letter,
  refresh,
}: {
  data: WorkspaceSnapshot;
  opps: Opportunity[];
  letter: (id: string) => string;
  refresh: () => Promise<unknown>;
}) {
  const [selectedId, setSelectedId] = useState(data.myPreference?.opportunityId ?? "");
  const [name, setName] = useState("");
  const [rationale, setRationale] = useState("");
  const { pending, error, run } = useAction();
  return (
    <Card as="section" className="space-y-3 border-ink">
      <Eyebrow>Step 2 · as a group</Eyebrow>
      <h2 className="font-display text-xl font-bold">Put one opportunity to the group</h2>
      <p className="text-sm leading-6 text-muted">
        One person proposes; the group decides. It becomes your venture only when a majority of
        active members endorse it. Objections, with reasons, stay on the record.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {opps.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => setSelectedId(o.id)}
            aria-pressed={selectedId === o.id}
            className={cn(
              "size-10 rounded-[8px] border-2 font-display text-lg font-extrabold",
              selectedId === o.id ? "border-ink bg-ink text-bg-elevated" : "border-line-strong bg-bg-elevated",
            )}
          >
            {letter(o.id)}
          </button>
        ))}
      </div>
      <Field label="Working name for the venture">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Hall Water Roster" />
      </Field>
      <Field label="Why this rather than the alternatives?">
        <Textarea value={rationale} onChange={(e) => setRationale(e.target.value)} className="min-h-32" />
        <Why text={WHY.rationale} />
      </Field>
      <FormMessages error={error} />
      <Button
        disabled={Boolean(pending) || !selectedId}
        onClick={() =>
          void run("propose", async () => {
            await proposeVenture({ data: { opportunityId: selectedId, name, rationale } });
            await refresh();
          })
        }
      >
        <Vote className="size-4" aria-hidden /> {pending ? "Proposing…" : "Put it to the group"}
      </Button>
    </Card>
  );
}

function ProposalCard({
  data,
  proposal,
  letter,
  refresh,
}: {
  data: WorkspaceSnapshot;
  proposal: VentureProposal;
  letter: (id: string) => string;
  refresh: () => Promise<unknown>;
}) {
  const [comment, setComment] = useState("");
  const { pending, error, run } = useAction();
  const endorse = proposal.votes.filter((v) => v.vote === "endorse").length;
  const object = proposal.votes.filter((v) => v.vote === "object").length;
  const myVote = proposal.votes.find((v) => v.studentId === data.student?.id);
  const vote = (v: "endorse" | "object") =>
    void run("vote", async () => {
      await voteOnProposal({ data: { proposalId: proposal.id, vote: v, comment } });
      setComment("");
      await refresh();
    });
  return (
    <section className="rounded-[12px] border-2 border-ink bg-bg-elevated p-4 shadow-[4px_4px_0_0_var(--color-gold)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Stamp tone="clay" tilt={-3}>On the table</Stamp>
        <span className="font-mono text-xs text-muted">Opportunity {letter(proposal.opportunityId)}</span>
      </div>
      <h2 className="mt-2 font-display text-2xl font-extrabold">{proposal.name}</h2>
      <p className="text-xs text-muted">Proposed by {proposal.proposedByName}</p>
      <p className="mt-2 text-sm leading-6">{proposal.rationale}</p>

      <div className="mt-4">
        <div className="flex items-center justify-between text-xs font-semibold">
          <span>
            {endorse} endorse · {object} object
          </span>
          <span className="text-muted">{proposal.threshold} needed</span>
        </div>
        <div className="mt-1 flex h-3 overflow-hidden rounded-full border-2 border-ink bg-bg-subtle">
          <div className="bg-accent" style={{ width: `${Math.min(100, (endorse / proposal.threshold) * 100)}%` }} />
        </div>
      </div>

      <ul className="mt-3 space-y-1 text-sm">
        {proposal.votes.map((v) => (
          <li key={v.studentId}>
            <span className="font-medium">{v.studentName}</span>{" "}
            <span className={v.vote === "endorse" ? "font-semibold text-accent" : "font-semibold text-clay"}>
              {v.vote === "endorse" ? "endorses" : "objects"}
            </span>
            {v.comment ? <span className="text-muted"> — {v.comment}</span> : null}
          </li>
        ))}
      </ul>

      <div className="mt-4 space-y-2 border-t border-line pt-3">
        <Field label={myVote ? `You ${myVote.vote === "endorse" ? "endorsed" : "objected"}. Change your vote?` : "Your vote"}>
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="A reason is required to object, and welcome either way."
            className="min-h-20"
          />
        </Field>
        <FormMessages error={error} />
        <div className="flex flex-wrap gap-2">
          <Button disabled={Boolean(pending)} onClick={() => vote("endorse")}>
            Endorse
          </Button>
          <Button variant="secondary" disabled={Boolean(pending)} onClick={() => vote("object")}>
            Object
          </Button>
          {proposal.proposedByStudentId === data.student?.id ? (
            <Button
              variant="ghost"
              disabled={Boolean(pending)}
              onClick={() =>
                void run("withdraw", async () => {
                  await withdrawProposal({ data: { proposalId: proposal.id } });
                  await refresh();
                })
              }
            >
              Withdraw
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
