import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Choice, Field, Select, Textarea } from "@/components/ui/input";
import { Why } from "@/components/ui/why";
import { FormMessages } from "@/components/ui/feedback";
import { CONFIDENCE_LEVELS, IMPORTANCE_LEVELS } from "@/lib/domain/config";
import { WHY } from "@/lib/domain/copy";
import type { Assumption, Confidence, EvidenceItem, Importance, RelationshipType } from "@/lib/domain/types";
import { saveAssumption, saveLink } from "@/lib/offline/actions";

export function AssumptionForm({ onSaved }: { onSaved: () => void }) {
  const [statement, setStatement] = useState("");
  const [importance, setImportance] = useState<Importance>("critical");
  const [confidence, setConfidence] = useState<Confidence>("low");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const r = await saveAssumption({ statement, importance, confidence });
      setStatement("");
      setNotice("queued" in r && r.queued ? "Saved on this phone — will sync when connected." : "Added to the ledger.");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={(e) => void submit(e)}>
      <Field label="Something that must be true — written so it could be tested">
        <Textarea
          required
          value={statement}
          onChange={(e) => setStatement(e.target.value)}
          placeholder="Hall residents will pay GH₵25 a week for a guaranteed morning water slot."
        />
        <Why text={WHY.importance} />
      </Field>
      <Choice label="If it turned out false, how bad?" value={importance} options={IMPORTANCE_LEVELS} onChange={setImportance} />
      <Choice label="How sure are you, honestly?" value={confidence} options={CONFIDENCE_LEVELS} onChange={setConfidence} />
      <FormMessages error={error} notice={notice} />
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Add to the ledger"}
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
