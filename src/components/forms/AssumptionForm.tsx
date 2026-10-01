import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Choice, Field, Select, Textarea } from "@/components/ui/input";
import { FormMessages } from "@/components/ui/feedback";
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
      <Field label="What are you assuming? Write it so it could be tested.">
        <Textarea
          required
          value={statement}
          onChange={(e) => setStatement(e.target.value)}
          placeholder="e.g. At least 20 students a morning would pay GH₵2 to book a shuttle seat."
        />
        <Why text={WHY.importance} />
      </Field>
      <Choice
        label="If it turned out wrong, how bad?"
        value={importance}
        options={IMPORTANCE_LEVELS}
        onChange={setImportance}
      />
      <Choice
        label="How sure are you right now?"
        value={confidence}
        options={CONFIDENCE_LEVELS}
        onChange={setConfidence}
        hint={
          importance === "critical" && confidence === "low"
            ? "Critical and unsure: this is the one to test first."
            : undefined
        }
      />
      <FormMessages error={error} />
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Saving…" : "Add assumption"}
      </Button>
    </form>
  );
}

const RELATIONSHIPS = [
  { value: "supports", label: "Backs it up" },
  { value: "challenges", label: "Cuts against it" },
] as const satisfies readonly { value: RelationshipType; label: string }[];

export function LinkEvidenceForm({
  assumptions,
  evidence,
  onSaved,
}: {
  assumptions: Assumption[];
  evidence: EvidenceItem[];
  onSaved: () => void;
}) {
  // Empty until the student picks; fall back to the first item at use time,
  // because items logged after this form mounted would otherwise leave the
  // initial state pointing at nothing.
  const [pickedAssumption, setAssumptionId] = useState("");
  const [pickedEvidence, setEvidenceItemId] = useState("");
  const assumptionId = pickedAssumption || assumptions[0]?.id || "";
  const evidenceItemId = pickedEvidence || evidence[0]?.id || "";
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
        Once you have at least one piece of evidence and one assumption, link them here.
      </p>
    );
  }

  return (
    <form className="space-y-3" onSubmit={(e) => void submit(e)}>
      <Field label="Assumption">
        <Select
          value={assumptionId}
          onChange={(e) => setAssumptionId(e.target.value)}
        >
          {assumptions.map((a) => (
            <option key={a.id} value={a.id}>
              {a.statement.slice(0, 80)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Evidence">
        <Select
          value={evidenceItemId}
          onChange={(e) => setEvidenceItemId(e.target.value)}
        >
          {evidence.map((ev) => (
            <option key={ev.id} value={ev.id}>
              {ev.title}
            </option>
          ))}
        </Select>
      </Field>
      <Choice
        label="Does it back the assumption up or cut against it?"
        value={relationshipType}
        options={RELATIONSHIPS}
        onChange={setRelationshipType}
      />
      <FormMessages error={error} />
      <Button type="submit" variant="secondary" className="w-full" disabled={pending}>
        {pending ? "Linking…" : "Link evidence"}
      </Button>
    </form>
  );
}
