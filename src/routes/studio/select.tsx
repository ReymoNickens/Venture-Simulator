import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useStudioWorkspace } from "@/hooks/workspace-context";
import { recordPreference } from "@/lib/server/mutations";
import { proposeVenture, voteOnProposal, withdrawProposal } from "@/lib/server/governance";
import { AdvisorPanel } from "@/components/advisor/AdvisorPanel";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Why } from "@/components/ui/why";
import { Badge, Card } from "@/components/ui/badge";
import { WHY } from "@/lib/domain/copy";

export const Route = createFileRoute("/studio/select")({ component: SelectPage });

function SelectPage() {
  const { data, loading, refresh } = useStudioWorkspace();
  const [preferred, setPreferred] = useState("");
  const [prefWhy, setPrefWhy] = useState("");
  const [ventureName, setVentureName] = useState("");
  const [rationale, setRationale] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [voteComment, setVoteComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  if (loading || !data) return <div className="h-40 animate-pulse rounded-[28px] bg-bg-subtle" />;
  if (!data.group) {
    return (
      <Card>
        Join a group first.{" "}
        <Link to="/studio/group" className="text-accent">
          Groups
        </Link>
      </Card>
    );
  }
  if (!data.canOpenSelection) {
    return (
      <Card className="space-y-2">
        <h1 className="font-display text-2xl">Selection is closed</h1>
        <p className="text-sm leading-6 text-muted">
          {data.submissionProgress.submitted} of {data.submissionProgress.required} active members have
          submitted. Peer opportunities stay private until this threshold is met. Missing students are
          not treated as submitted.
        </p>
      </Card>
    );
  }

  const opps = data.visibleOpportunities.filter((o) => o.status !== "draft");

  async function savePref() {
    setPending("pref");
    setError(null);
    try {
      await recordPreference({ data: { opportunityId: preferred, rationale: prefWhy } });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record preference.");
    } finally {
      setPending(null);
    }
  }

  async function act(kind: string, fn: () => Promise<unknown>) {
    setPending(kind);
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not work.");
    } finally {
      setPending(null);
    }
  }

  function propose() {
    const opportunityId = selectedId || data?.myPreference?.opportunityId;
    if (!opportunityId) {
      setError("Choose the opportunity you are proposing.");
      return;
    }
    void act("propose", () =>
      proposeVenture({ data: { opportunityId, name: ventureName, rationale } }),
    );
  }

  const openProposal = data.proposals.find((p) => p.status === "open") ?? null;
  const myVote = openProposal?.votes.find((v) => v.studentId === data.student?.id) ?? null;
  const pastProposals = data.proposals.filter((p) => p.status !== "open");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-3xl">Compare, then decide</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          The platform will not pick a winner. Record your own preference before the group decision.
          Rejected opportunities remain in the record.
        </p>
      </div>
      <div className="grid gap-4">
        {opps.map((o) => (
          <Card key={o.id} className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-medium text-muted">{o.authorName}</p>
              <Badge tone={o.status === "selected" ? "accent" : "neutral"}>{o.status}</Badge>
            </div>
            <h2 className="font-display text-xl leading-snug">{o.problem}</h2>
            <dl className="grid gap-2 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-[0.12em] text-faint">Who</dt>
                <dd>{o.affectedPeople}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-[0.12em] text-faint">Evidence</dt>
                <dd>{o.observedEvidence}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-[0.12em] text-faint">Alternatives</dt>
                <dd>{o.currentAlternatives}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-[0.12em] text-faint">Customer</dt>
                <dd>{o.potentialCustomer || "Not stated"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-[0.12em] text-faint">Unknowns</dt>
                <dd>{o.uncertainties}</dd>
              </div>
            </dl>
          </Card>
        ))}
      </div>

      {!data.venture ? (
        <Card className="space-y-3">
          <h2 className="font-display text-xl">Your preference (individual)</h2>
          <p className="text-sm text-muted">
            {data.preferenceProgress.recorded} of {data.preferenceProgress.required} members have recorded a preference.
          </p>
          <Field label="Preferred opportunity">
            <select
              className="h-11 w-full rounded-[10px] border border-line bg-bg-elevated px-3 text-sm"
              value={preferred || data.myPreference?.opportunityId || ""}
              onChange={(e) => setPreferred(e.target.value)}
            >
              <option value="">Select one</option>
              {opps.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.authorName}: {o.problem.slice(0, 80)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Why this one, for you?">
            <Textarea value={prefWhy} onChange={(e) => setPrefWhy(e.target.value)} />
            <Why text={WHY.preference} />
          </Field>
          <Button
            type="button"
            disabled={Boolean(pending)}
            onClick={() => void savePref()}
          >
            {pending === "pref" ? "Saving…" : "Record my preference"}
          </Button>
        </Card>
      ) : null}

      {data.canOpenSelection && data.preferences.length > 0 ? (
        <Card>
          <h2 className="font-display text-xl">Recorded preferences</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {data.preferences.map((p) => (
              <li key={p.id}>
                <span className="font-medium">{p.studentName}</span>
                <span className="text-muted"> — {p.rationale}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {openProposal && !data.venture ? (
        <Card className="space-y-3">
          <Badge tone="warn">Proposal on the table</Badge>
          <h2 className="font-display text-xl">{openProposal.name}</h2>
          <p className="text-sm text-muted">
            Proposed by {openProposal.proposedByName}. It becomes the group’s venture once{" "}
            {openProposal.threshold} active members endorse it.
          </p>
          <p className="text-sm leading-6">{openProposal.rationale}</p>
          <ul className="space-y-1 text-sm">
            {openProposal.votes.map((v) => (
              <li key={v.studentId}>
                <span className="font-medium">{v.studentName}</span>{" "}
                <span className={v.vote === "endorse" ? "text-accent" : "text-bad"}>
                  {v.vote === "endorse" ? "endorses" : "objects"}
                </span>
                {v.comment ? <span className="text-muted"> — {v.comment}</span> : null}
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">
            {openProposal.votes.filter((v) => v.vote === "endorse").length} of {openProposal.threshold}{" "}
            endorsements needed.
          </p>
          <Field label={myVote ? "Change your vote (optional comment)" : "Your comment (required to object)"}>
            <Textarea value={voteComment} onChange={(e) => setVoteComment(e.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={Boolean(pending)}
              onClick={() =>
                void act("vote", () =>
                  voteOnProposal({
                    data: { proposalId: openProposal.id, vote: "endorse", comment: voteComment },
                  }),
                )
              }
            >
              Endorse
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={Boolean(pending)}
              onClick={() =>
                void act("vote", () =>
                  voteOnProposal({
                    data: { proposalId: openProposal.id, vote: "object", comment: voteComment },
                  }),
                )
              }
            >
              Object
            </Button>
            {openProposal.proposedByStudentId === data.student?.id ? (
              <Button
                type="button"
                variant="ghost"
                disabled={Boolean(pending)}
                onClick={() =>
                  void act("withdraw", () =>
                    withdrawProposal({ data: { proposalId: openProposal.id } }),
                  )
                }
              >
                Withdraw
              </Button>
            ) : null}
          </div>
        </Card>
      ) : null}

      {data.canRecordGroupDecision && !openProposal ? (
        <Card className="space-y-3">
          <h2 className="font-display text-xl">Propose the group’s venture</h2>
          <p className="text-sm text-muted">
            One person proposes; the group decides. A majority of active members must endorse
            before the venture exists. Objections, with reasons, stay on the record.
          </p>
          <Field label="Opportunity">
            <select
              className="h-11 w-full rounded-[10px] border border-line bg-bg-elevated px-3 text-sm"
              value={selectedId || data.myPreference?.opportunityId || ""}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              <option value="">Select one</option>
              {opps.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.authorName}: {o.problem.slice(0, 80)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Working name">
            <Input value={ventureName} onChange={(e) => setVentureName(e.target.value)} />
          </Field>
          <Field label="Why this rather than the alternatives?">
            <Textarea value={rationale} onChange={(e) => setRationale(e.target.value)} />
            <Why text={WHY.rationale} />
          </Field>
          <Button type="button" disabled={Boolean(pending)} onClick={propose}>
            {pending === "propose" ? "Proposing…" : "Put it to the group"}
          </Button>
        </Card>
      ) : null}

      {pastProposals.length ? (
        <Card className="space-y-2">
          <h2 className="font-display text-lg">Earlier proposals</h2>
          <ul className="space-y-1 text-sm">
            {pastProposals.map((p) => (
              <li key={p.id}>
                <span className="font-medium">{p.name}</span>{" "}
                <span className="text-muted">
                  — {p.status} · proposed by {p.proposedByName}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {data.venture ? (
        <Card className="space-y-2">
          <Badge tone="accent">Venture created</Badge>
          <h2 className="font-display text-2xl">{data.venture.name}</h2>
          <p className="text-sm leading-6">{data.venture.selectionRationale}</p>
          <Link to="/studio/venture" className="text-sm text-accent">
            Collect evidence
          </Link>
        </Card>
      ) : null}

      {error ? <p className="text-sm text-bad">{error}</p> : null}

      <AdvisorPanel data={data} stage="selection" onSent={() => void refresh()} />
    </div>
  );
}
