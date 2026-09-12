import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Why } from "@/components/ui/why";
import { CONTEXTS, WHY } from "@/lib/domain/copy";
import { ASSUMPTION_LANGUAGE } from "@/lib/domain/config";
import type { Opportunity, OpportunityFields } from "@/lib/domain/types";
import { saveOpportunity } from "@/lib/offline/actions";

const empty: OpportunityFields = {
  problem: "",
  affectedPeople: "",
  context: "",
  observedEvidence: "",
  currentAlternatives: "",
  whyItMatters: "",
  possibleSolution: "",
  potentialCustomer: "",
  revenueMechanism: "",
  uncertainties: "",
};

function fromOpp(o: Opportunity | null): OpportunityFields {
  if (!o) return empty;
  return {
    problem: o.problem,
    affectedPeople: o.affectedPeople,
    context: o.context,
    observedEvidence: o.observedEvidence,
    currentAlternatives: o.currentAlternatives,
    whyItMatters: o.whyItMatters,
    possibleSolution: o.possibleSolution,
    potentialCustomer: o.potentialCustomer,
    revenueMechanism: o.revenueMechanism,
    uncertainties: o.uncertainties,
  };
}

export function OpportunityForm({
  existing,
  onSaved,
}: {
  existing: Opportunity | null;
  onSaved: () => void;
}) {
  const [fields, setFields] = useState<OpportunityFields>(() => fromOpp(existing));
  const [pending, setPending] = useState<"save" | "submit" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const assumptionHit = useMemo(() => {
    const blob = `${fields.problem} ${fields.observedEvidence} ${fields.whyItMatters}`;
    return ASSUMPTION_LANGUAGE.test(blob);
  }, [fields]);

  function set<K extends keyof OpportunityFields>(key: K, value: string) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  async function save(submit: boolean) {
    setError(null);
    setNotice(null);
    setPending(submit ? "submit" : "save");
    try {
      const result = await saveOpportunity(fields, submit);
      if ("queued" in result && result.queued) {
        setNotice("Saved locally — will sync when connected.");
      } else {
        setNotice(submit ? "Submitted. Your group can only see this once selection opens." : "Draft saved.");
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setPending(null);
    }
  }

  const submitted = existing?.status && existing.status !== "draft";

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        void save(true);
      }}
    >
      <Field label="What problem, gap, or unmet need did you notice?">
        <Textarea
          required
          value={fields.problem}
          onChange={(e) => set("problem", e.target.value)}
          placeholder="Something you observed — not a business you wish existed."
        />
        <Why text={WHY.problem} />
      </Field>
      <Field label="Who experiences this?">
        <Input
          required
          value={fields.affectedPeople}
          onChange={(e) => set("affectedPeople", e.target.value)}
          placeholder="Be specific. “Students” is too broad."
        />
        <Why text={WHY.affectedPeople} />
      </Field>
      <Field label="Where did you observe this?">
        <Input
          required
          list="contexts"
          value={fields.context}
          onChange={(e) => set("context", e.target.value)}
        />
        <datalist id="contexts">
          {CONTEXTS.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <Why text={WHY.context} />
      </Field>
      <Field label="What did you actually see, hear, or count?">
        <Textarea
          required
          value={fields.observedEvidence}
          onChange={(e) => set("observedEvidence", e.target.value)}
        />
        <Why text={WHY.observedEvidence} />
      </Field>
      <Field label="How do people deal with this today?">
        <Textarea
          required
          value={fields.currentAlternatives}
          onChange={(e) => set("currentAlternatives", e.target.value)}
        />
        <Why text={WHY.currentAlternatives} />
      </Field>
      <Field label="Why does this matter to them?">
        <Textarea
          required
          value={fields.whyItMatters}
          onChange={(e) => set("whyItMatters", e.target.value)}
        />
        <Why text={WHY.whyItMatters} />
      </Field>
      <Field label="What might help — if you had to guess? (optional)">
        <Textarea
          value={fields.possibleSolution}
          onChange={(e) => set("possibleSolution", e.target.value)}
          placeholder="Treat this as an assumption, not a plan."
        />
        <Why text={WHY.possibleSolution} />
      </Field>
      <Field label="Who would use or pay for a solution? (optional)">
        <Input
          value={fields.potentialCustomer}
          onChange={(e) => set("potentialCustomer", e.target.value)}
        />
        <Why text={WHY.potentialCustomer} />
      </Field>
      <Field label="If this became a venture, how might it be paid for? (optional)">
        <Input
          value={fields.revenueMechanism}
          onChange={(e) => set("revenueMechanism", e.target.value)}
        />
        <Why text={WHY.revenueMechanism} />
      </Field>
      <Field label="What do you not know yet?">
        <Textarea
          required
          value={fields.uncertainties}
          onChange={(e) => set("uncertainties", e.target.value)}
        />
        <Why text={WHY.uncertainties} />
      </Field>

      {assumptionHit ? (
        <p className="rounded-[12px] bg-warn-soft px-3 py-2 text-sm text-warn">
          Some of this language reads like an assumption (“everyone”, “will buy”, “most students”).
          That is allowed — but it is not evidence. Name it in uncertainties.
        </p>
      ) : null}
      {error ? <p className="text-sm text-bad">{error}</p> : null}
      {notice ? <p className="text-sm text-accent">{notice}</p> : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          variant="secondary"
          disabled={Boolean(pending)}
          onClick={() => void save(false)}
        >
          {pending === "save" ? "Saving…" : "Save draft"}
        </Button>
        <Button type="submit" disabled={Boolean(pending) || Boolean(submitted)}>
          {pending === "submit" ? "Submitting…" : submitted ? "Already submitted" : "Submit opportunity"}
        </Button>
      </div>
      <p className="text-xs text-muted">
        Submissions stay private until every active member has submitted and selection opens.
        A submitted opportunity is not deleted.
      </p>
    </form>
  );
}
