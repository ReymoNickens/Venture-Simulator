import { useState, type FormEvent } from "react";
import { StepScreen, ChoiceCard } from "@/components/flow/StepScreen";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { Assumption, EvidenceItem, RelationshipType } from "@/lib/domain/types";
import { saveAssumption, saveLink } from "@/lib/offline/actions";
import { loadStepDraft, saveStepDraft, clearStepDraft } from "@/lib/offline/step-draft";

type Draft = { statement: string; importance: string; confidence: string };
const emptyDraft: Draft = { statement: "", importance: "", confidence: "" };

// §16 — "How important would it be if we were wrong?" mapped onto the
// existing four importance values.
const IMPORTANCE_CHOICES: { label: string; value: string }[] = [
  { label: "Wouldn't matter much", value: "low" },
  { label: "It would hurt", value: "medium" },
  { label: "It could change the idea", value: "high" },
  { label: "It could kill the idea", value: "critical" },
];

// §16 — "How sure are you?" mapped onto the existing three confidence values.
const CONFIDENCE_CHOICES: { label: string; value: string }[] = [
  { label: "Not sure", value: "low" },
  { label: "Somewhat sure", value: "medium" },
  { label: "Very sure", value: "high" },
];

const STEPS = ["statement", "importance", "confidence"] as const;
type Step = (typeof STEPS)[number];

export function AssumptionForm({ onSaved }: { onSaved: () => void }) {
  const draftKey = "assumption";
  const [draft, setDraft] = useState<Draft>(() => loadStepDraft<Draft>(draftKey) ?? emptyDraft);
  const [stepIndex, setStepIndex] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const step: Step = STEPS[stepIndex];

  function persist(next: Draft) {
    saveStepDraft(draftKey, next);
    setDraft(next);
  }
  function goNext() {
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
  }
  function goBack() {
    setStepIndex((i) => Math.max(i - 1, 0));
  }

  async function finish(confidence: string) {
    setError(null);
    setPending(true);
    try {
      await saveAssumption({ statement: draft.statement, importance: draft.importance, confidence });
      clearStepDraft(draftKey);
      setSaved(true);
      setDraft(emptyDraft);
      setStepIndex(0);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setPending(false);
    }
  }

  if (saved) {
    return (
      <div className="space-y-3">
        <div role="status" className="flex items-center gap-2">
          <Badge tone="accent">Saved</Badge>
          <span className="text-sm text-muted">It's in the list below.</span>
        </div>
        <button type="button" onClick={() => setSaved(false)} className="text-sm text-accent">
          Name another
        </button>
      </div>
    );
  }

  if (step === "statement") {
    return (
      <StepScreen
        step={1}
        total={3}
        heading="What are we taking for granted?"
        prompt="These are things you believe might be true but haven't proved yet."
        onContinue={goNext}
        continueDisabled={!draft.statement.trim()}
      >
        <Field label="We think…">
          <Textarea
            autoFocus
            value={draft.statement}
            onChange={(e) => persist({ ...draft, statement: e.target.value })}
            placeholder="Students will pay GH₵25 each week."
          />
        </Field>
      </StepScreen>
    );
  }

  if (step === "importance") {
    return (
      <StepScreen
        step={2}
        total={3}
        heading="How important would it be if we were wrong?"
        onBack={goBack}
        onContinue={goNext}
        continueDisabled={!draft.importance}
      >
        <div className="space-y-2">
          {IMPORTANCE_CHOICES.map((o) => (
            <ChoiceCard
              key={o.value}
              label={o.label}
              selected={draft.importance === o.value}
              onClick={() => persist({ ...draft, importance: o.value })}
            />
          ))}
        </div>
      </StepScreen>
    );
  }

  // step === "confidence"
  return (
    <StepScreen
      step={3}
      total={3}
      heading="How sure are you?"
      onBack={goBack}
      onContinue={() => void finish(draft.confidence)}
      continueDisabled={!draft.confidence}
      continueLabel="Save"
      pending={pending}
    >
      <div className="space-y-2">
        {CONFIDENCE_CHOICES.map((o) => (
          <ChoiceCard
            key={o.value}
            label={o.label}
            selected={draft.confidence === o.value}
            onClick={() => persist({ ...draft, confidence: o.value })}
          />
        ))}
      </div>
      {error ? <p className="text-sm text-bad">{error}</p> : null}
    </StepScreen>
  );
}

export function LinkEvidenceForm({
  assumptions,
  evidence,
  onSaved,
}: {
  assumptions: Assumption[];
  evidence: EvidenceItem[];
  onSaved: () => void;
}) {
  const [assumptionId, setAssumptionId] = useState(assumptions[0]?.id ?? "");
  const [evidenceItemId, setEvidenceItemId] = useState(evidence[0]?.id ?? "");
  const [relationshipType, setRelationshipType] = useState<RelationshipType>("supports");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      await saveLink({ assumptionId, evidenceItemId, relationshipType });
      setNotice("Linked.");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not link.");
    } finally {
      setPending(false);
    }
  }

  if (!assumptions.length || !evidence.length) {
    return (
      <p className="text-sm text-muted">
        Log at least one thing you think might be true and one finding before linking them.
      </p>
    );
  }

  return (
    <form className="space-y-3" onSubmit={(e) => void submit(e)}>
      <Field label="What you think might be true">
        <select
          className="h-11 w-full rounded-[10px] border border-line bg-bg-elevated px-3 text-sm"
          value={assumptionId}
          onChange={(e) => setAssumptionId(e.target.value)}
        >
          {assumptions.map((a) => (
            <option key={a.id} value={a.id}>
              {a.statement.slice(0, 80)}
            </option>
          ))}
        </select>
      </Field>
      <Field label="What you found">
        <select
          className="h-11 w-full rounded-[10px] border border-line bg-bg-elevated px-3 text-sm"
          value={evidenceItemId}
          onChange={(e) => setEvidenceItemId(e.target.value)}
        >
          {evidence.map((ev) => (
            <option key={ev.id} value={ev.id}>
              {ev.title}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Does this support or challenge it?">
        <select
          className="h-11 w-full rounded-[10px] border border-line bg-bg-elevated px-3 text-sm"
          value={relationshipType}
          onChange={(e) => setRelationshipType(e.target.value as RelationshipType)}
        >
          <option value="supports">Supports</option>
          <option value="challenges">Challenges</option>
        </select>
      </Field>
      {error ? <p className="text-sm text-bad">{error}</p> : null}
      {notice ? <p className="text-sm text-accent">{notice}</p> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Linking…" : "Link evidence"}
      </Button>
    </form>
  );
}
