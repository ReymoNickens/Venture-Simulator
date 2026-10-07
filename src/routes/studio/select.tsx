import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Check } from "lucide-react";
import { useStudioWorkspace } from "@/hooks/workspace-context";
import { recordPreference, createVenture } from "@/lib/server/mutations";
import { AdvisorPanel } from "@/components/advisor/AdvisorPanel";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Why } from "@/components/ui/why";
import { Card, EmptyNote } from "@/components/ui/badge";
import { FormMessages, Loading } from "@/components/ui/feedback";
import { Stamp } from "@/components/ui/stamp";
import { StepHeader } from "@/components/shell/StepHeader";
import { WHY } from "@/lib/domain/copy";
import type { Opportunity } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/studio/select")({ component: SelectPage });

function SelectPage() {
  const { data, loading, refresh } = useStudioWorkspace();
  const [picked, setPicked] = useState("");
  const [prefWhy, setPrefWhy] = useState("");
  const [ventureName, setVentureName] = useState("");
  const [rationale, setRationale] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"pref" | "venture" | null>(null);

  if (loading || !data) return <Loading />;
  if (!data.group) {
    return (
      <div>
        <StepHeader step="select" title="Pick one problem together" />
        <EmptyNote>
          Join a group first.{" "}
          <Link to="/studio/group" className="font-semibold text-accent underline underline-offset-2">
            Find your group
          </Link>
        </EmptyNote>
      </div>
    );
  }
  if (!data.canOpenSelection) {
    const { submitted, required } = data.submissionProgress;
    return (
      <div>
        <StepHeader
          step="select"
          title="Not open yet"
          lead={`${submitted} of ${required} members have submitted. Everyone’s problems stay private until the whole group is in, so nobody copies anybody.`}
        />
        <div className="h-2.5 overflow-hidden rounded-full bg-bg-subtle" aria-hidden>
          <div className="h-full rounded-full bg-ink" style={{ width: `${(submitted / Math.max(1, required)) * 100}%` }} />
        </div>
      </div>
    );
  }

  // The chosen problem leads once there is one; the rest stay on record below it.
  const opps = data.visibleOpportunities
    .filter((o) => o.status !== "draft")
    .sort((a, b) => Number(b.status === "selected") - Number(a.status === "selected"));
  const picks = new Map<string, number>();
  for (const p of data.preferences) picks.set(p.opportunityId, (picks.get(p.opportunityId) ?? 0) + 1);

  // What tapping a card means right now: your own pick first, then the group's.
  const mode: "pref" | "decide" | null = data.venture
    ? null
    : !data.myPreference
      ? "pref"
      : data.canRecordGroupDecision
        ? "decide"
        : null;
  const chosen = picked || (mode === "decide" ? data.myPreference?.opportunityId ?? "" : "");

  async function savePref() {
    if (!chosen) return setError("Tap the problem you would pick first.");
    setPending("pref");
    setError(null);
    try {
      await recordPreference({ data: { opportunityId: chosen, rationale: prefWhy } });
      setPicked("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record your pick.");
    } finally {
      setPending(null);
    }
  }

  async function decide() {
    if (!chosen) return setError("Tap the problem the group is choosing.");
    setPending("venture");
    setError(null);
    try {
      await createVenture({
        data: { opportunityId: chosen, name: ventureName, selectionRationale: rationale },
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

  const { recorded, required } = data.preferenceProgress;

  return (
    <div className="space-y-5">
      <StepHeader
        step="select"
        aside={`${recorded} of ${required} picks in`}
        title={data.venture ? data.venture.name : mode === "decide" ? "Now decide as a group" : "Which would you pick?"}
        lead={
          data.venture
            ? "Your group has chosen. The other problems stay on record."
            : mode === "pref"
              ? "Read everyone’s problem, then tap the one you would choose. Say why before the group decides, so every voice is on record."
              : mode === "decide"
                ? "Your pick is in. Tap the problem the group is choosing and write down why it beat the others."
                : "Your pick is in. The group decision can be recorded once enough picks are in."
        }
      />

      {data.venture ? (
        <Card className="space-y-3 border-ink">
          <Stamp tone="forest">Chosen</Stamp>
          <p className="text-[15px] leading-6">{data.venture.selectionRationale}</p>
          <Link to="/studio/simulation" className={cn(buttonVariants({ size: "lg" }), "w-full")}>
            Next: run the venture <ArrowRight className="size-4" aria-hidden />
          </Link>
        </Card>
      ) : null}

      <div role={mode ? "radiogroup" : undefined} aria-label="Group problems" className="space-y-3">
        {opps.map((o) => (
          <ProblemCard
            key={o.id}
            opp={o}
            picks={picks.get(o.id) ?? 0}
            mine={data.myPreference?.opportunityId === o.id}
            selectable={Boolean(mode)}
            selected={chosen === o.id}
            onSelect={() => setPicked(o.id)}
          />
        ))}
      </div>

      {mode === "pref" ? (
        <Card className="sticky bottom-24 z-10 space-y-3 shadow-[0_18px_40px_-20px_rgba(17,17,17,0.45)] lg:bottom-4">
          <Field label={chosen ? "Why this one, for you?" : "Tap a problem above to pick it"}>
            <Textarea value={prefWhy} onChange={(e) => setPrefWhy(e.target.value)} disabled={!chosen} className="min-h-20" />
          </Field>
          <Why text={WHY.preference} />
          <Button size="lg" className="w-full" disabled={Boolean(pending) || !chosen || !prefWhy.trim()} onClick={() => void savePref()}>
            {pending === "pref" ? "Saving…" : "Record my pick"}
          </Button>
          <FormMessages error={error} />
        </Card>
      ) : null}

      {mode === "decide" ? (
        <Card className="space-y-3">
          <h2 className="font-display text-xl font-bold">Record the group decision</h2>
          <Field label="Working name for the venture">
            <Input value={ventureName} onChange={(e) => setVentureName(e.target.value)} placeholder="e.g. ShuttleBoard" />
          </Field>
          <Field
            label="Why this problem rather than the others?"
            hint={
              rationale.trim().length < 40
                ? `Name the problems you did not choose and why. ${40 - rationale.trim().length} more characters at least.`
                : undefined
            }
          >
            <Textarea value={rationale} onChange={(e) => setRationale(e.target.value)} />
          </Field>
          <Why text={WHY.rationale} />
          <Button
            size="lg"
            className="w-full"
            disabled={Boolean(pending) || !chosen || !ventureName.trim() || rationale.trim().length < 40}
            onClick={() => void decide()}
          >
            {pending === "venture" ? "Recording…" : "Record group decision"}
          </Button>
          <FormMessages error={error} />
        </Card>
      ) : null}

      {data.preferences.length > 0 ? (
        <Card>
          <h2 className="font-display text-lg font-bold">Why people picked what they picked</h2>
          <ul className="mt-2 divide-y divide-line text-sm">
            {data.preferences.map((p) => (
              <li key={p.id} className="py-2.5 leading-6">
                <span className="font-semibold">{p.studentName}</span>
                <span className="text-muted"> · {p.rationale}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <AdvisorPanel data={data} stage="selection" onSent={() => void refresh()} />
    </div>
  );
}

function ProblemCard({
  opp,
  picks,
  mine,
  selectable,
  selected,
  onSelect,
}: {
  opp: Opportunity;
  picks: number;
  mine: boolean;
  selectable: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const rejected = opp.status === "rejected";
  return (
    <article
      className={cn(
        "rounded-[14px] border bg-bg-elevated transition-[border-color,box-shadow]",
        selected ? "border-ink shadow-[0_0_0_2px_var(--color-ink)]" : "border-line",
        rejected && "opacity-70",
      )}
    >
      <button
        type="button"
        role={selectable ? "radio" : undefined}
        aria-checked={selectable ? selected : undefined}
        disabled={!selectable}
        onClick={onSelect}
        className="flex w-full items-start gap-3 p-4 text-left disabled:cursor-default"
      >
        {selectable ? (
          <span
            aria-hidden
            className={cn(
              "mt-1 flex size-6 shrink-0 items-center justify-center rounded-full border-2",
              selected ? "border-ink bg-ink text-white" : "border-line-strong",
            )}
          >
            {selected ? <Check className="size-3.5" strokeWidth={3} /> : null}
          </span>
        ) : null}
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-muted">
            {opp.authorName}
            {mine ? <Stamp tone="gold" size="xs">your pick</Stamp> : null}
            {opp.status === "selected" ? <Stamp tone="forest" size="xs">chosen</Stamp> : null}
            {rejected ? <Stamp tone="muted" size="xs">not chosen</Stamp> : null}
            {picks ? <span className="ml-auto text-faint">{picks} {picks === 1 ? "pick" : "picks"}</span> : null}
          </span>
          <span className="mt-1 block font-display text-[17px] leading-snug font-bold">{opp.problem}</span>
          <span className="mt-1.5 block text-sm leading-6 text-ink-soft">
            <span className="font-semibold">Seen: </span>
            {opp.observedEvidence}
          </span>
        </span>
      </button>
      <details className="group border-t border-line px-4">
        <summary className="flex min-h-11 cursor-pointer list-none items-center text-sm font-semibold text-muted">
          <span className="group-open:hidden">More: who, how they cope, unknowns</span>
          <span className="hidden group-open:inline">Less</span>
        </summary>
        <dl className="grid gap-2.5 pb-4 text-sm leading-6">
          <Row label="Who">{opp.affectedPeople}</Row>
          <Row label="Where">{opp.context}</Row>
          <Row label="How they cope today">{opp.currentAlternatives}</Row>
          <Row label="Why it matters">{opp.whyItMatters}</Row>
          <Row label="Who might pay">{opp.potentialCustomer || "Not stated"}</Row>
          <Row label="Still unknown">{opp.uncertainties}</Row>
        </dl>
      </details>
    </article>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-faint">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
