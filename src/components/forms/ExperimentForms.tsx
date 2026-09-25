import { useState } from "react";
import { Check, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { ChoiceGrid } from "@/components/ui/choice";
import { CONFIDENCE_LEVELS, EXPERIMENT_METHODS, EXPERIMENT_RESULTS } from "@/lib/domain/config";
import type { Assumption, Confidence, EvidenceItem, Experiment, ExperimentMethod, ExperimentResult, RelationshipType } from "@/lib/domain/types";
import { saveExperimentPlan, saveLink } from "@/lib/offline/actions";
import { completeExperiment } from "@/lib/server/experiments";
import { cn } from "@/lib/utils";
import { CONFIDENCE_HINT } from "./AssumptionForm";

const errMsg = (e: unknown, f: string) => (e instanceof Error ? e.message : f);

/**
 * A test card: we believe → to check, we will → we're right if. Deciding the
 * success line *before* running the test is the whole point.
 */
export function PlanTestForm({ assumptions, initialAssumptionId, onSaved }: { assumptions: Assumption[]; initialAssumptionId?: string; onSaved: (queued: boolean) => void }) {
  const [assumptionId, setAssumptionId] = useState(initialAssumptionId && assumptions.some((a) => a.id === initialAssumptionId) ? initialAssumptionId : (assumptions[0]?.id ?? ""));
  const a = assumptions.find((x) => x.id === assumptionId);
  const [hypothesis, setHypothesis] = useState(a?.statement ?? "");
  const [method, setMethod] = useState<ExperimentMethod | "">("");
  const [successCriteria, setSuccess] = useState("");
  const [sample, setSample] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        setError(null);
        try {
          const r = await saveExperimentPlan({ assumptionId, hypothesis: hypothesis.trim(), method, successCriteria: successCriteria.trim(), sampleTarget: sample ? Number(sample) : null });
          onSaved("queued" in r && Boolean(r.queued));
        } catch (err) {
          setError(errMsg(err, "Could not save the test."));
        } finally {
          setPending(false);
        }
      }}
    >
      <Field label="Which assumption are you testing?">
        <Select
          value={assumptionId}
          onChange={(e) => {
            setAssumptionId(e.target.value);
            setHypothesis(assumptions.find((x) => x.id === e.target.value)?.statement ?? "");
          }}
        >
          {assumptions.map((x) => (
            <option key={x.id} value={x.id}>
              {x.statement.length > 70 ? `${x.statement.slice(0, 68)}…` : x.statement}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="We believe that…" hint="Make it specific enough to be wrong.">
        <Textarea value={hypothesis} onChange={(e) => setHypothesis(e.target.value)} className="min-h-20" maxLength={600} />
      </Field>
      <div className="space-y-2">
        <p className="text-sm font-semibold text-ink-soft">To check, we will…</p>
        <ChoiceGrid label="Method" value={method} onChange={setMethod} options={EXPERIMENT_METHODS} />
      </div>
      <div className="grid grid-cols-[1fr_7rem] gap-3">
        <Field label="We're right if…" hint="Decide this now, before you look.">
          <Input value={successCriteria} onChange={(e) => setSuccess(e.target.value)} maxLength={600} placeholder="e.g. 6 of 10 say they'd pay GH₵5" />
        </Field>
        <Field label="How many?">
          <Input type="number" inputMode="numeric" min={1} max={10000} value={sample} onChange={(e) => setSample(e.target.value)} placeholder="10" />
        </Field>
      </div>
      {error ? <p role="alert" className="rounded-[12px] bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p> : null}
      <Button type="submit" block size="lg" disabled={pending || !assumptionId || !method || hypothesis.trim().length < 10 || successCriteria.trim().length < 10}>
        <FlaskConical className="size-4" /> {pending ? "Saving…" : "Save the test plan"}
      </Button>
    </form>
  );
}

/** The learning card: what happened, what we learned, which evidence proves it. */
export function RecordResultForm({ experiment, assumption, evidence, onSaved, onAddEvidence }: { experiment: Experiment; assumption?: Assumption; evidence: EvidenceItem[]; onSaved: (result: ExperimentResult) => void; onAddEvidence: () => void }) {
  const [result, setResult] = useState<ExperimentResult | "">("");
  const [learning, setLearning] = useState("");
  const [confidence, setConfidence] = useState<Confidence | "">("");
  const [picked, setPicked] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const needsEvidence = result !== "" && result !== "inconclusive";

  return (
    <form
      className="space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!result) return;
        setPending(true);
        setError(null);
        try {
          await completeExperiment({ data: { experimentId: experiment.id, result, learning: learning.trim(), confidenceAfter: confidence || null, evidenceIds: picked } });
          onSaved(result);
        } catch (err) {
          setError(errMsg(err, "Could not save the result."));
        } finally {
          setPending(false);
        }
      }}
    >
      <div className="rounded-[14px] bg-bg-subtle p-3 text-sm leading-6">
        <p><span className="font-semibold">We believed:</span> {experiment.hypothesis}</p>
        <p><span className="font-semibold">Right if:</span> {experiment.successCriteria}</p>
      </div>
      <div className="space-y-2">
        <p className="text-sm font-semibold text-ink-soft">What happened?</p>
        <ChoiceGrid label="Result" columns={3} value={result} onChange={setResult} options={EXPERIMENT_RESULTS} />
      </div>
      <Field label="What did you learn?" hint="What did you actually see — and what does it change about the venture?">
        <Textarea value={learning} onChange={(e) => setLearning(e.target.value)} maxLength={2000} placeholder="e.g. Only 3 of 10 would pay; most would rather wash at night for free. Price may need to be GH₵2, or the problem is only weekends." />
      </Field>
      <div className="space-y-2">
        <p className="text-sm font-semibold text-ink-soft">
          Evidence from this test {needsEvidence ? <span className="text-bad">*</span> : <span className="font-normal text-muted">(optional if not sure yet)</span>}
        </p>
        {evidence.length ? (
          <ul className="max-h-56 space-y-1.5 overflow-y-auto">
            {evidence.map((ev) => {
              const on = picked.includes(ev.id);
              return (
                <li key={ev.id}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => setPicked((p) => (on ? p.filter((x) => x !== ev.id) : [...p, ev.id]))}
                    className={cn("flex w-full items-center gap-3 rounded-[12px] border p-2.5 text-left text-sm", on ? "border-accent bg-accent-soft" : "border-line")}
                  >
                    <span className={cn("grid size-5 shrink-0 place-items-center rounded-[6px] border-2", on ? "border-accent bg-accent text-white" : "border-line")}>{on ? <Check className="size-3" /> : null}</span>
                    {ev.photoThumb ? <img src={ev.photoThumb} alt="" className="size-9 shrink-0 rounded-[8px] object-cover" /> : null}
                    <span className="min-w-0 flex-1 truncate">{ev.title}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted">No evidence logged yet.</p>
        )}
        <Button type="button" variant="ghost" size="sm" onClick={onAddEvidence}>+ Log new evidence first</Button>
      </div>
      {assumption ? (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-ink-soft">How sure are you now that “{assumption.statement.length > 60 ? `${assumption.statement.slice(0, 58)}…` : assumption.statement}”?</p>
          <ChoiceGrid label="Confidence after" columns={3} value={confidence} onChange={setConfidence} options={CONFIDENCE_LEVELS.map((l) => ({ ...l, hint: CONFIDENCE_HINT[l.value] }))} />
        </div>
      ) : null}
      {error ? <p role="alert" className="rounded-[12px] bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p> : null}
      <Button type="submit" block size="lg" disabled={pending || !result || learning.trim().length < 20 || (needsEvidence && !picked.length)}>
        {pending ? "Saving…" : "Save what we learned"}
      </Button>
    </form>
  );
}

export function LinkEvidenceForm({ assumption, evidence, onSaved }: { assumption: Assumption; evidence: EvidenceItem[]; onSaved: () => void }) {
  const [evidenceItemId, setEvidenceItemId] = useState(evidence[0]?.id ?? "");
  const [rel, setRel] = useState<RelationshipType>("supports");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!evidence.length) return <p className="text-sm text-muted">Log some evidence first, then link it here.</p>;
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        setError(null);
        try {
          await saveLink({ assumptionId: assumption.id, evidenceItemId, relationshipType: rel });
          onSaved();
        } catch (err) {
          setError(errMsg(err, "Could not link."));
        } finally {
          setPending(false);
        }
      }}
    >
      <Select value={evidenceItemId} onChange={(e) => setEvidenceItemId(e.target.value)} aria-label="Evidence">
        {evidence.map((ev) => (
          <option key={ev.id} value={ev.id}>{ev.title}</option>
        ))}
      </Select>
      <ChoiceGrid<RelationshipType> label="Relationship" value={rel} onChange={setRel} options={[{ value: "supports", label: "Supports it" }, { value: "challenges", label: "Challenges it" }]} />
      {error ? <p role="alert" className="text-sm text-bad">{error}</p> : null}
      <Button type="submit" block variant="secondary" disabled={pending || !evidenceItemId}>{pending ? "Linking…" : "Link evidence"}</Button>
    </form>
  );
}
