import { useEffect, useMemo, useState } from "react";
import { StepScreen } from "@/components/flow/StepScreen";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Badge, Card } from "@/components/ui/badge";
import { CONTEXTS } from "@/lib/domain/copy";
import { ASSUMPTION_LANGUAGE } from "@/lib/domain/config";
import type { Opportunity, OpportunityFields } from "@/lib/domain/types";
import { saveOpportunity } from "@/lib/offline/actions";
import { loadStepDraft, saveStepDraft, clearStepDraft } from "@/lib/offline/step-draft";

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

// The guided discovery flow (brief §7): one question per screen. These seven
// are the required core — the same fields the old single-page form marked
// required. Three optional strategic fields follow in a lighter second
// round, then a summary screen before submit (§8).
type StepKey = keyof OpportunityFields;
const CORE_STEPS: { key: StepKey; heading: string; prompt: string; placeholder: string }[] = [
  {
    key: "problem",
    heading: "What have you noticed?",
    prompt:
      "Think about something that regularly frustrates, wastes time, costs money, creates inconvenience, or seems unnecessarily difficult.",
    placeholder: "Something I've noticed around campus is…",
  },
  {
    key: "affectedPeople",
    heading: "Who experiences this?",
    prompt: "Think about the people you actually observed. Be specific — “students” is too broad.",
    placeholder: "Students living in…",
  },
  {
    key: "observedEvidence",
    heading: "What actually happened?",
    prompt: "Don't tell us what you think. Tell us what you saw or heard.",
    placeholder: "",
  },
  {
    key: "currentAlternatives",
    heading: "How do people deal with it now?",
    prompt: "Before imagining a new solution, find out what people already do.",
    placeholder: "",
  },
  {
    key: "whyItMatters",
    heading: "Why might this matter?",
    prompt: "What makes this worth investigating?",
    placeholder: "",
  },
  {
    key: "uncertainties",
    heading: "What are you still unsure about?",
    prompt: "The point of this course is the unknown. Name what you can't yet defend.",
    placeholder: "",
  },
];

const OPTIONAL_STEPS: { key: StepKey; heading: string; prompt: string; placeholder: string }[] = [
  {
    key: "possibleSolution",
    heading: "What might help — if you had to guess?",
    prompt: "Optional. Treat this as an assumption, not a plan.",
    placeholder: "",
  },
  {
    key: "potentialCustomer",
    heading: "Who might pay for this?",
    prompt: "Optional. Be specific if you can.",
    placeholder: "",
  },
  {
    key: "revenueMechanism",
    heading: "If this became a venture, how might it be paid for?",
    prompt: "Optional. This is a guess, not a model.",
    placeholder: "",
  },
];

// Screen indices: 0 = context picker (a light middle step, not a full
// question), 1..6 = CORE_STEPS[1..], handled as one contiguous sequence
// below via a single `screen` index over a flattened list.
type Screen =
  | { kind: "core"; index: number }
  | { kind: "context" }
  | { kind: "optional"; index: number }
  | { kind: "summary" };

function buildScreens(): Screen[] {
  return [
    { kind: "core", index: 0 }, // problem
    { kind: "core", index: 1 }, // affectedPeople
    { kind: "context" },
    { kind: "core", index: 2 }, // observedEvidence
    { kind: "core", index: 3 }, // currentAlternatives
    { kind: "core", index: 4 }, // whyItMatters
    { kind: "core", index: 5 }, // uncertainties
    { kind: "optional", index: 0 },
    { kind: "optional", index: 1 },
    { kind: "optional", index: 2 },
    { kind: "summary" },
  ];
}

const SCREENS = buildScreens();

export function OpportunityForm({
  existing,
  onSaved,
}: {
  existing: Opportunity | null;
  onSaved: () => void;
}) {
  const draftKey = "opportunity";
  const [fields, setFields] = useState<OpportunityFields>(
    () => loadStepDraft<OpportunityFields>(draftKey) ?? fromOpp(existing),
  );
  const [screenIndex, setScreenIndex] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const assumptionHit = useMemo(() => {
    const blob = `${fields.problem} ${fields.observedEvidence} ${fields.whyItMatters}`;
    return ASSUMPTION_LANGUAGE.test(blob);
  }, [fields]);

  const submitted = existing?.status && existing.status !== "draft";
  useEffect(() => {
    if (submitted) clearStepDraft(draftKey);
  }, [submitted]);
  if (submitted) return null;

  function set<K extends keyof OpportunityFields>(key: K, value: string) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  async function persistDraft(next: OpportunityFields) {
    saveStepDraft(draftKey, next);
    try {
      await saveOpportunity(next, false);
    } catch {
      // Local draft already saved above; a transient server hiccup on an
      // intermediate step shouldn't block the student from continuing.
    }
  }

  async function goNext() {
    await persistDraft(fields);
    setScreenIndex((i) => Math.min(i + 1, SCREENS.length - 1));
  }

  function goBack() {
    setScreenIndex((i) => Math.max(i - 1, 0));
  }

  async function submit() {
    setError(null);
    setPending(true);
    try {
      await saveOpportunity(fields, true);
      clearStepDraft(draftKey);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit.");
    } finally {
      setPending(false);
    }
  }

  const screen = SCREENS[screenIndex];
  const total = SCREENS.length;
  const stepNum = screenIndex + 1;

  if (screen.kind === "core" || screen.kind === "optional") {
    const s = screen.kind === "core" ? CORE_STEPS[screen.index] : OPTIONAL_STEPS[screen.index];
    const value = fields[s.key];
    const isRequired = screen.kind === "core";
    return (
      <StepScreen
        step={stepNum}
        total={total}
        heading={s.heading}
        prompt={s.prompt}
        onBack={screenIndex > 0 ? goBack : undefined}
        onContinue={() => void goNext()}
        continueDisabled={isRequired && !value.trim()}
      >
        <Textarea
          autoFocus
          value={value}
          onChange={(e) => set(s.key, e.target.value)}
          placeholder={s.placeholder}
          required={isRequired}
        />
        {screen.kind === "core" && screen.index === 5 && assumptionHit ? (
          <p className="rounded-[12px] bg-warn-soft px-3 py-2 text-sm text-warn">
            Some of this reads like an assumption (“everyone”, “will buy”, “most students”). That's
            allowed — but it isn't evidence. Name it here.
          </p>
        ) : null}
      </StepScreen>
    );
  }

  if (screen.kind === "context") {
    return (
      <StepScreen
        step={stepNum}
        total={total}
        heading="Where did you notice it?"
        onBack={goBack}
        onContinue={() => void goNext()}
        continueDisabled={!fields.context.trim()}
      >
        <div className="flex flex-wrap gap-2">
          {CONTEXTS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => set("context", c)}
              aria-pressed={fields.context === c}
              className={
                "rounded-full border px-3 py-1.5 text-sm transition-colors " +
                (fields.context === c
                  ? "border-accent bg-accent-soft text-ink"
                  : "border-line bg-bg-elevated text-ink hover:border-line-strong")
              }
            >
              {c}
            </button>
          ))}
        </div>
        {!CONTEXTS.includes(fields.context as (typeof CONTEXTS)[number]) ? (
          <Input
            value={fields.context}
            onChange={(e) => set("context", e.target.value)}
            placeholder="Or describe it in your own words"
          />
        ) : null}
      </StepScreen>
    );
  }

  // Summary screen (§8) — "YOUR FINDING". No new questions, just what was
  // gathered, and the one action that matters here: submit.
  return (
    <div className="space-y-4">
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-faint" aria-hidden="true">
        {stepNum} / {total}
      </p>
      <Card className="space-y-4">
        <div>
          <Badge>Your finding</Badge>
          <h1 className="mt-2 font-display text-2xl sm:text-3xl">Your problem is taking shape.</h1>
        </div>
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-[0.1em] text-faint">The problem</dt>
            <dd className="mt-0.5 leading-6">{fields.problem}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.1em] text-faint">What you noticed</dt>
            <dd className="mt-0.5 leading-6">{fields.observedEvidence}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.1em] text-faint">What people currently do</dt>
            <dd className="mt-0.5 leading-6">{fields.currentAlternatives}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.1em] text-faint">Why it matters</dt>
            <dd className="mt-0.5 leading-6">{fields.whyItMatters}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.1em] text-faint">What we don't know yet</dt>
            <dd className="mt-0.5 leading-6">{fields.uncertainties}</dd>
          </div>
        </dl>
        {error ? <p className="text-sm text-bad">{error}</p> : null}
        <div className="flex items-center gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={goBack} disabled={pending}>
            Back
          </Button>
          <Button type="button" className="ml-auto" onClick={() => void submit()} disabled={pending}>
            {pending ? "Submitting…" : "Submit this finding"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
