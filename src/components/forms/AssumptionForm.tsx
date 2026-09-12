import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/input";
import { Why } from "@/components/ui/why";
import { CONFIDENCE_LEVELS, IMPORTANCE_LEVELS } from "@/lib/domain/config";
import { WHY } from "@/lib/domain/copy";
import type { Assumption, EvidenceItem, RelationshipType } from "@/lib/domain/types";
import { saveAssumption, saveLink } from "@/lib/offline/actions";

export function AssumptionForm({ onSaved }: { onSaved: () => void }) {
  const [statement, setStatement] = useState("");
  const [importance, setImportance] = useState("critical");
  const [confidence, setConfidence] = useState("low");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await saveAssumption({ statement, importance, confidence });
      setStatement("");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={(e) => void submit(e)}>
      <Field label="Assumption (write it so it could be tested)">
        <Textarea
          required
          value={statement}
          onChange={(e) => setStatement(e.target.value)}
          placeholder="Example: Students will pay GH₵25 for a weekly water roster."
        />
        <Why text={WHY.importance} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Importance">
          <select
            className="h-11 w-full rounded-[10px] border border-line bg-bg-elevated px-3 text-sm"
            value={importance}
            onChange={(e) => setImportance(e.target.value)}
          >
            {IMPORTANCE_LEVELS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Confidence">
          <select
            className="h-11 w-full rounded-[10px] border border-line bg-bg-elevated px-3 text-sm"
            value={confidence}
            onChange={(e) => setConfidence(e.target.value)}
          >
            {CONFIDENCE_LEVELS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {error ? <p className="text-sm text-bad">{error}</p> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Add assumption"}
      </Button>
    </form>
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

  async function submit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await saveLink({ assumptionId, evidenceItemId, relationshipType });
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
        Log at least one assumption and one evidence item before linking them.
      </p>
    );
  }

  return (
    <form className="space-y-3" onSubmit={(e) => void submit(e)}>
      <Field label="Assumption">
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
      <Field label="Evidence">
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
      <Field label="Relationship">
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
      <Button type="submit" disabled={pending}>
        {pending ? "Linking…" : "Link evidence"}
      </Button>
    </form>
  );
}
