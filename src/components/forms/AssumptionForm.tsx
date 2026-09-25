import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/input";
import { ChoiceGrid } from "@/components/ui/choice";
import { Why } from "@/components/ui/why";
import { CONFIDENCE_LEVELS, IMPORTANCE_LEVELS } from "@/lib/domain/config";
import { WHY } from "@/lib/domain/copy";
import type { Confidence, Importance } from "@/lib/domain/types";
import { saveAssumption } from "@/lib/offline/actions";
import { reviseAssumption } from "@/lib/server/experiments";

const IMPORTANCE_HINT: Record<Importance, string> = {
  critical: "If wrong, the venture dies",
  high: "If wrong, big changes",
  medium: "Would hurt, not fatal",
  low: "Nice to know",
};
export const CONFIDENCE_HINT: Record<Confidence, string> = {
  high: "Strong evidence",
  medium: "Some signs",
  low: "Mostly a guess",
};

const STARTERS = [
  "Students in … will pay GH₵… for …",
  "… happens at least … times a week",
  "People now use … and are unhappy because …",
  "We can deliver … for under GH₵… each",
];

export function AssumptionForm({ onSaved }: { onSaved: (queued: boolean) => void }) {
  const [statement, setStatement] = useState("");
  const [importance, setImportance] = useState<Importance>("critical");
  const [confidence, setConfidence] = useState<Confidence>("low");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const r = await saveAssumption({ statement: statement.trim(), importance, confidence });
      onSaved("queued" in r && Boolean(r.queued));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="space-y-5" onSubmit={(e) => void submit(e)}>
      <Field label="What must be true for this venture to work?" hint="Write it so a test could prove it wrong.">
        <Textarea required value={statement} onChange={(e) => setStatement(e.target.value)} maxLength={1000} placeholder="e.g. At least 10 Hall B students will pay GH₵5 per load for a booked washing slot." />
      </Field>
      <div className="flex flex-wrap gap-1.5">
        {STARTERS.map((s) => (
          <button key={s} type="button" onClick={() => setStatement(s)} className="rounded-full border border-dashed border-line-strong px-2.5 py-1 text-xs text-muted hover:border-accent hover:text-accent">
            {s}
          </button>
        ))}
      </div>
      <div className="space-y-2">
        <p className="text-sm font-semibold text-ink-soft">How much depends on it?</p>
        <ChoiceGrid label="Importance" value={importance} onChange={setImportance} options={IMPORTANCE_LEVELS.map((l) => ({ ...l, hint: IMPORTANCE_HINT[l.value] }))} />
        <Why text={WHY.importance} />
      </div>
      <div className="space-y-2">
        <p className="text-sm font-semibold text-ink-soft">How sure are you right now?</p>
        <ChoiceGrid label="Confidence" columns={3} value={confidence} onChange={setConfidence} options={CONFIDENCE_LEVELS.map((l) => ({ ...l, hint: CONFIDENCE_HINT[l.value] }))} />
      </div>
      {error ? <p role="alert" className="rounded-[12px] bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p> : null}
      <Button type="submit" block size="lg" disabled={pending || statement.trim().length < 10}>
        {pending ? "Saving…" : "Add assumption"}
      </Button>
    </form>
  );
}

/** Changing your mind is fine — the reason is kept, so the change is visible to the group and lecturer. */
export function ReviseForm({ assumptionId, current, onSaved }: { assumptionId: string; current: Confidence; onSaved: () => void }) {
  const [confidence, setConfidence] = useState<Confidence>(current);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        setError(null);
        try {
          await reviseAssumption({ data: { assumptionId, confidence, reason: reason.trim() } });
          onSaved();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Could not save.");
        } finally {
          setPending(false);
        }
      }}
    >
      <ChoiceGrid label="Confidence" columns={3} value={confidence} onChange={setConfidence} options={CONFIDENCE_LEVELS.map((l) => ({ ...l, hint: CONFIDENCE_HINT[l.value] }))} />
      <Field label="What changed your mind?">
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} className="min-h-20" maxLength={1000} placeholder="e.g. Three of the five people we asked already pay a laundry man." />
      </Field>
      {error ? <p role="alert" className="text-sm text-bad">{error}</p> : null}
      <Button type="submit" block disabled={pending || reason.trim().length < 10 || confidence === current}>
        {pending ? "Saving…" : "Update confidence"}
      </Button>
    </form>
  );
}
