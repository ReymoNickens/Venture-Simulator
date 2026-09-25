import { useState, type FormEvent } from "react";
import { BigText, Pick, StepFlow, type Step } from "@/components/flow/StepFlow";
import { Button } from "@/components/ui/button";
import { Choice, Field, Select } from "@/components/ui/input";
import { FormMessages } from "@/components/ui/feedback";
import type { Assumption, Confidence, EvidenceItem, Importance, RelationshipType } from "@/lib/domain/types";
import { saveAssumption, saveLink } from "@/lib/offline/actions";

type AV = { statement: string; importance: Importance | ""; confidence: Confidence | "" };

const ASSUMPTION_STEPS: Step<AV>[] = [
  {
    id: "statement",
    question: "What must be true for this to work?",
    hint: "Write it so someone could prove it wrong: who, what, how much.",
    render: (v, set) => (
      <BigText
        label="Assumption"
        value={v.statement}
        onChange={(statement) => set({ statement })}
        rows={3}
        placeholder="At least 30 Level 100 students in Atlantic Hall will pay GH₵10 a week for…"
      />
    ),
    valid: (v) => v.statement.trim().length >= 15 || "Write it as a full, testable sentence.",
    summary: (v) => v.statement,
  },
  {
    id: "importance",
    question: "If it turned out false…",
    render: (v, set, next) => (
      <Pick
        value={v.importance}
        onChange={(importance) => set({ importance })}
        onPicked={next}
        options={[
          { value: "critical", label: "The venture dies", hint: "critical" },
          { value: "high", label: "It badly hurts", hint: "high" },
          { value: "medium", label: "We adjust", hint: "medium" },
          { value: "low", label: "Barely matters", hint: "low" },
        ]}
      />
    ),
    valid: (v) => Boolean(v.importance) || "Pick one.",
    summary: (v) => v.importance,
  },
  {
    id: "confidence",
    question: "How sure are you, honestly?",
    hint: "Low is the right answer if you haven’t checked yet.",
    render: (v, set, next) => (
      <Pick
        value={v.confidence}
        onChange={(confidence) => set({ confidence })}
        onPicked={next}
        options={[
          { value: "low", label: "Not sure — haven’t checked" },
          { value: "medium", label: "Some signs it’s true" },
          { value: "high", label: "Strong evidence" },
        ]}
      />
    ),
    valid: (v) => Boolean(v.confidence) || "Pick one.",
    summary: (v) => v.confidence,
  },
];

export function AssumptionForm({ onSaved, onCancel }: { onSaved: (queued: boolean) => void; onCancel?: () => void }) {
  return (
    <StepFlow<AV>
      steps={ASSUMPTION_STEPS}
      initial={{ statement: "", importance: "", confidence: "" }}
      finishLabel="Add to the ledger"
      reviewTitle="Add this assumption?"
      onCancel={onCancel}
      onFinish={async (v) => {
        const r = await saveAssumption({
          statement: v.statement,
          importance: v.importance || "medium",
          confidence: v.confidence || "low",
        });
        onSaved("queued" in r && Boolean(r.queued));
      }}
    />
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
        Add at least one assumption and log one piece of evidence before linking them.
      </p>
    );
  }

  return (
    <form className="space-y-3" onSubmit={(e) => void submit(e)}>
      <Field label="This evidence">
        <Select value={evidenceItemId} onChange={(e) => setEvidenceItemId(e.target.value)}>
          {evidence.map((ev) => (
            <option key={ev.id} value={ev.id}>
              {ev.title}
            </option>
          ))}
        </Select>
      </Field>
      <Choice
        label="…"
        value={relationshipType}
        options={[
          { value: "supports", label: "supports" },
          { value: "challenges", label: "challenges" },
        ]}
        onChange={setRelationshipType}
      />
      <Field label="this assumption">
        <Select value={assumptionId} onChange={(e) => setAssumptionId(e.target.value)}>
          {assumptions.map((a) => (
            <option key={a.id} value={a.id}>
              {a.statement.slice(0, 90)}
            </option>
          ))}
        </Select>
      </Field>
      <FormMessages error={error} notice={notice} />
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Linking…" : "Link them"}
      </Button>
    </form>
  );
}
