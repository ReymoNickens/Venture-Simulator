import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useStudioWorkspace } from "@/hooks/workspace-context";
import { recordPreference, createVenture } from "@/lib/server/mutations";
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

  async function decide() {
    const opportunityId = selectedId || data?.myPreference?.opportunityId;
    if (!opportunityId) {
      setError("Choose the opportunity the group is selecting.");
      return;
    }
    setPending("venture");
    setError(null);
    try {
      await createVenture({
        data: {
          opportunityId,
          name: ventureName,
          selectionRationale: rationale,
        },
      });
      await refresh();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err && "message" in err
            ? String((err as { message: unknown }).message)
            : "Could not record the decision.";
      setError(message);
    } finally {
      setPending(null);
    }
  }

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

      {data.canRecordGroupDecision ? (
        <Card className="space-y-3">
          <h2 className="font-display text-xl">Group decision</h2>
          <p className="text-sm text-muted">
            This records the group’s choice. It should not be silent. Write why this over the alternatives.
          </p>
          <Field label="Selected opportunity">
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
          <Button type="button" disabled={Boolean(pending)} onClick={() => void decide()}>
            {pending === "venture" ? "Recording…" : "Record group decision"}
          </Button>
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
