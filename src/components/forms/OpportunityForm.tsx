import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Why } from "@/components/ui/why";
import { CONTEXTS, WHY } from "@/lib/domain/copy";
import { ASSUMPTION_LANGUAGE } from "@/lib/domain/config";
import type { Opportunity, OpportunityFields } from "@/lib/domain/types";
import { saveOpportunity } from "@/lib/offline/actions";
import { cn } from "@/lib/utils";

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
  const f = { ...empty };
  for (const k of Object.keys(empty) as (keyof OpportunityFields)[]) f[k] = o[k] ?? "";
  return f;
}

type Key = keyof OpportunityFields;
type Step = { title: string; lead: string; fields: Key[]; required: Key[] };

/** Five short screens instead of one ten-field form — each one a question a student can answer on a phone. */
export const STEPS: Step[] = [
  { title: "The problem", lead: "What did you notice, and where?", fields: ["problem", "context"], required: ["problem", "context"] },
  { title: "The people", lead: "Who lives with it, and why do they care?", fields: ["affectedPeople", "whyItMatters"], required: ["affectedPeople", "whyItMatters"] },
  { title: "What you saw", lead: "Your proof — and how people cope today.", fields: ["observedEvidence", "currentAlternatives"], required: ["observedEvidence", "currentAlternatives"] },
  { title: "A first guess", lead: "Optional. A guess is fine — it becomes an assumption to test.", fields: ["possibleSolution", "potentialCustomer", "revenueMechanism"], required: [] },
  { title: "What you don't know", lead: "Honesty here is worth marks.", fields: ["uncertainties"], required: ["uncertainties"] },
];

const COPY: Record<Key, { label: string; placeholder: string; long: boolean }> = {
  problem: { label: "What problem or gap did you notice?", placeholder: "e.g. Students on the 3rd floor of Hall B queue 20+ minutes for the one working washing line on Saturdays.", long: true },
  context: { label: "Where did you see it?", placeholder: "Pick one or type your own", long: false },
  affectedPeople: { label: "Who experiences this?", placeholder: "e.g. First-year students in Hall B without their own buckets", long: false },
  whyItMatters: { label: "Why does it matter to them?", placeholder: "What does it cost them — time, money, grades, safety, dignity?", long: true },
  observedEvidence: { label: "What did you actually see, hear or count?", placeholder: "e.g. Counted 14 people waiting at 8am on Saturday. Two said they skip washing and buy new socks.", long: true },
  currentAlternatives: { label: "How do people deal with it today?", placeholder: "e.g. Pay a laundry man GH₵30 a load, wash at night, borrow buckets…", long: true },
  possibleSolution: { label: "What might help? (a guess)", placeholder: "Treat this as an assumption, not a plan.", long: true },
  potentialCustomer: { label: "Who would use or pay for it?", placeholder: "Which people, specifically?", long: false },
  revenueMechanism: { label: "How might it be paid for?", placeholder: "e.g. GH₵5 per load via MoMo", long: false },
  uncertainties: { label: "What don't you know yet?", placeholder: "e.g. Whether it's only a weekend problem. Whether they'd pay rather than wait.", long: true },
};

const draftKey = (sid: string) => `vs:opp-draft:${sid}`;

export function OpportunityForm({
  existing,
  studentId,
  onSaved,
  onSealed,
}: {
  existing: Opportunity | null;
  studentId: string;
  onSaved: () => void;
  onSealed: () => void;
}) {
  const [fields, setFields] = useState<OpportunityFields>(() => {
    const base = fromOpp(existing);
    if (typeof window === "undefined") return base;
    try {
      const raw = localStorage.getItem(draftKey(studentId));
      if (raw) {
        const local = JSON.parse(raw) as { at: number; fields: OpportunityFields };
        const serverAt = existing ? new Date(existing.updatedAt).getTime() : 0;
        if (local.at > serverAt) return { ...base, ...local.fields };
      }
    } catch {
      /* private mode or corrupt draft: fall back to the server copy */
    }
    return base;
  });
  const firstIncomplete = STEPS.findIndex((s) => s.required.some((k) => !fields[k].trim()));
  const [step, setStep] = useState(existing && existing.status !== "draft" ? 0 : Math.max(0, firstIncomplete));
  const [pending, setPending] = useState<"save" | "submit" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const dirty = useRef(false);
  const top = useRef<HTMLDivElement>(null);

  // Every keystroke is kept on the device, so a dropped connection or a closed tab never costs work.
  useEffect(() => {
    if (!dirty.current) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(draftKey(studentId), JSON.stringify({ at: Date.now(), fields }));
      } catch {
        /* storage full or blocked: the server save on "Next" still covers it */
      }
    }, 400);
    return () => clearTimeout(t);
  }, [fields, studentId]);

  const assumptionHit = useMemo(
    () => ASSUMPTION_LANGUAGE.test(`${fields.problem} ${fields.observedEvidence} ${fields.whyItMatters}`),
    [fields],
  );

  function set(key: Key, value: string) {
    dirty.current = true;
    setFields((f) => ({ ...f, [key]: value }));
  }

  const isSealed = Boolean(existing && existing.status !== "draft");

  async function persist(submit: boolean) {
    setError(null);
    setPending(submit ? "submit" : "save");
    try {
      const result = await saveOpportunity(fields, submit);
      setSavedAt("queued" in result && result.queued ? "Saved on this phone — will sync when you're back online" : "Saved");
      try {
        localStorage.removeItem(draftKey(studentId));
      } catch {
        /* ignore */
      }
      dirty.current = false;
      onSaved();
      if (submit) onSealed();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
      return false;
    } finally {
      setPending(null);
    }
  }

  async function go(next: number) {
    // Drafts save to the server as you move between steps; sealed ideas only save when you re-seal.
    if (dirty.current && !isSealed) await persist(false);
    setStep(next);
    top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const s = STEPS[step];
  const stepDone = s.required.every((k) => fields[k].trim());
  const allDone = STEPS.every((st) => st.required.every((k) => fields[k].trim()));
  const last = step === STEPS.length - 1;

  return (
    <div ref={top} className="scroll-mt-20 space-y-5">
      {/* Step dots */}
      <ol className="flex items-center gap-1.5" aria-label="Steps">
        {STEPS.map((st, i) => {
          const complete = st.required.every((k) => fields[k].trim()) && (st.required.length > 0 || st.fields.some((k) => fields[k].trim()));
          return (
            <li key={st.title} className="flex-1">
              <button
                type="button"
                onClick={() => void go(i)}
                aria-current={i === step ? "step" : undefined}
                aria-label={`Step ${i + 1}: ${st.title}`}
                className={cn(
                  "block h-2 w-full rounded-full transition-colors",
                  i === step ? "bg-ch-idea" : complete ? "bg-ch-idea/45" : "bg-bg-subtle",
                )}
              />
            </li>
          );
        })}
      </ol>

      <div key={step} className="animate-rise space-y-5">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ch-idea">
            Step {step + 1} of {STEPS.length}
          </p>
          <h2 className="font-display text-2xl leading-tight">{s.title}</h2>
          <p className="mt-1 text-sm text-muted">{s.lead}</p>
        </div>

        {s.fields.map((k) =>
          k === "context" ? (
            <div key={k} className="space-y-2">
              <p className="text-sm font-semibold text-ink-soft">{COPY.context.label}</p>
              <div className="flex flex-wrap gap-2">
                {CONTEXTS.filter((c) => c !== "Other").map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => set("context", c)}
                    aria-pressed={fields.context === c}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                      fields.context === c ? "border-ch-idea bg-ch-idea text-white" : "border-line bg-bg-elevated hover:border-line-strong",
                    )}
                  >
                    {c}
                  </button>
                ))}
              </div>
              <Input aria-label="Or describe the place" value={fields.context} onChange={(e) => set("context", e.target.value)} placeholder="…or describe it: e.g. Madina market, lorry station" maxLength={200} />
              <Why text={WHY.context} />
            </div>
          ) : (
            <Field key={k} label={COPY[k].label}>
              {COPY[k].long ? (
                <Textarea value={fields[k]} onChange={(e) => set(k, e.target.value)} placeholder={COPY[k].placeholder} maxLength={2000} />
              ) : (
                <Input value={fields[k]} onChange={(e) => set(k, e.target.value)} placeholder={COPY[k].placeholder} maxLength={2000} />
              )}
              <Why text={WHY[k]} />
            </Field>
          ),
        )}

        {step <= 2 && assumptionHit ? (
          <p className="rounded-[12px] bg-warn-soft px-3 py-2 text-sm leading-5 text-warn">
            Words like “everyone”, “most students” or “will buy” are guesses, not evidence. That's fine — just name them in the last step.
          </p>
        ) : null}
      </div>

      {error ? <p role="alert" className="rounded-[12px] bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p> : null}

      <div className="flex items-center gap-2 pt-1">
        {step > 0 ? (
          <Button type="button" variant="ghost" onClick={() => void go(step - 1)} disabled={Boolean(pending)} aria-label="Previous step">
            <ArrowLeft className="size-4" />
          </Button>
        ) : null}
        {!last ? (
          <Button type="button" className="flex-1" size="lg" onClick={() => void go(step + 1)} disabled={Boolean(pending)}>
            {pending === "save" ? "Saving…" : stepDone ? "Next" : "Skip for now"} <ArrowRight className="size-4" />
          </Button>
        ) : (
          <Button type="button" className="flex-1" size="lg" variant="sun" onClick={() => void persist(true)} disabled={Boolean(pending) || !allDone}>
            <Lock className="size-4" /> {pending === "submit" ? "Sealing…" : isSealed ? "Save and re-seal" : "Seal my idea"}
          </Button>
        )}
      </div>
      <p className="flex min-h-5 items-center gap-1.5 text-xs text-muted">
        {savedAt ? (
          <>
            <Check className="size-3.5 text-accent" /> {savedAt}
          </>
        ) : last && !allDone ? (
          `Still missing: ${STEPS.filter((st) => st.required.some((k) => !fields[k].trim())).map((st) => st.title.toLowerCase()).join(", ")}.`
        ) : (
          "Your answers are kept on this phone as you type."
        )}
      </p>
    </div>
  );
}
