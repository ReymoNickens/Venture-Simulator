import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { FormMessages } from "@/components/ui/feedback";
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

type Question = {
  key: keyof OpportunityFields;
  label: string;
  short: string;
  multiline: boolean;
  required: boolean;
  placeholder?: string;
};

/** One question per screen, in the order a field investigator would think. */
const QUESTIONS: readonly Question[] = [
  {
    key: "problem",
    label: "What problem, gap or unmet need did you notice?",
    short: "The problem",
    multiline: true,
    required: true,
    placeholder: "Something you saw happen, not a business you wish existed.",
  },
  {
    key: "affectedPeople",
    label: "Who experiences it?",
    short: "Who",
    multiline: false,
    required: true,
    placeholder: "Be specific. “Students” is too broad.",
  },
  {
    key: "context",
    label: "Where did you see it?",
    short: "Where",
    multiline: false,
    required: true,
    placeholder: "Pick one below or type your own",
  },
  {
    key: "observedEvidence",
    label: "What did you actually see, hear or count?",
    short: "What you saw",
    multiline: true,
    required: true,
    placeholder: "Numbers, times, what people said. “Counted 23 people at 6am” beats “long queue”.",
  },
  {
    key: "currentAlternatives",
    label: "How do people deal with it today?",
    short: "How people cope",
    multiline: true,
    required: true,
  },
  {
    key: "whyItMatters",
    label: "Why does it matter to them?",
    short: "Why it matters",
    multiline: true,
    required: true,
  },
  {
    key: "possibleSolution",
    label: "What might help, if you had to guess?",
    short: "A guess at a fix",
    multiline: true,
    required: false,
    placeholder: "A guess is fine. Treat it as an assumption, not a plan.",
  },
  {
    key: "potentialCustomer",
    label: "Who would use or pay for a fix?",
    short: "Who would pay",
    multiline: false,
    required: false,
  },
  {
    key: "revenueMechanism",
    label: "If this became a venture, how might it be paid for?",
    short: "How it’s paid for",
    multiline: false,
    required: false,
  },
  {
    key: "uncertainties",
    label: "What do you not know yet?",
    short: "What you don’t know",
    multiline: true,
    required: true,
    placeholder: "The honest list. This is the most useful answer on the page.",
  },
];

const REVIEW = QUESTIONS.length;

function fromOpp(o: Opportunity | null): OpportunityFields {
  if (!o) return empty;
  const out = { ...empty };
  for (const q of QUESTIONS) out[q.key] = o[q.key];
  return out;
}

type LocalDraft = { fields: OpportunityFields; at: number };

function readLocal(key: string): LocalDraft | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as LocalDraft) : null;
  } catch {
    return null;
  }
}

function writeLocal(key: string, draft: LocalDraft | null) {
  try {
    if (draft) localStorage.setItem(key, JSON.stringify(draft));
    else localStorage.removeItem(key);
  } catch {
    // Private mode or storage full: the server draft is still the record.
  }
}

export function OpportunityForm({
  existing,
  storageKey,
  onSaved,
}: {
  existing: Opportunity | null;
  /** Per-student key for keeping unsaved answers on this phone across a refresh. */
  storageKey: string;
  onSaved: () => void;
}) {
  const submitted = Boolean(existing?.status && existing.status !== "draft");
  const [fields, setFields] = useState<OpportunityFields>(() => fromOpp(existing));
  // Submitted work opens on the review screen; a fresh one on question 1.
  const [step, setStep] = useState(submitted ? REVIEW : 0);
  const [tried, setTried] = useState(false);
  const [pending, setPending] = useState<"save" | "submit" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const restored = useRef(false);

  // After hydration, bring back answers typed on this phone but never saved
  // (a refresh, a dead battery), if they are newer than the saved draft.
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const local = readLocal(storageKey);
    const savedAt = existing ? Date.parse(existing.updatedAt) : 0;
    if (local && local.at > savedAt) {
      setFields(local.fields);
      if (!submitted) {
        const firstEmpty = QUESTIONS.findIndex((q) => q.required && !local.fields[q.key].trim());
        setStep(firstEmpty === -1 ? REVIEW : firstEmpty);
      }
      setNotice("We kept the answers you typed on this phone.");
    }
  }, [storageKey, existing, submitted]);

  const assumptionHit = useMemo(() => {
    const blob = `${fields.problem} ${fields.observedEvidence} ${fields.whyItMatters}`;
    return ASSUMPTION_LANGUAGE.test(blob);
  }, [fields]);

  function set(key: keyof OpportunityFields, value: string) {
    setFields((f) => {
      const next = { ...f, [key]: value };
      writeLocal(storageKey, { fields: next, at: Date.now() });
      return next;
    });
  }

  const missing = QUESTIONS.filter((q) => q.required && !fields[q.key].trim());

  async function save(submit: boolean) {
    setError(null);
    setNotice(null);
    if (submit && missing.length) {
      setError(`Answer ${missing.map((q) => `“${q.short}”`).join(", ")} before submitting.`);
      return;
    }
    setPending(submit ? "submit" : "save");
    try {
      const result = await saveOpportunity(fields, submit);
      if ("queued" in result && result.queued) {
        setNotice("Saved on this phone. It will send when you are back online.");
      } else {
        writeLocal(storageKey, null);
        setNotice(
          submit
            ? "Submitted. Your group sees it once everyone has submitted."
            : submitted
              ? "Changes saved."
              : "Draft saved.",
        );
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save. Your answers are still on this phone.");
    } finally {
      setPending(null);
    }
  }

  if (step === REVIEW) {
    return (
      <div className="flow-enter space-y-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-display text-xl font-bold">{submitted ? "What you sent" : "Check it, then submit"}</h2>
          <span className="text-xs font-semibold text-muted">
            {QUESTIONS.length - missing.length} of {QUESTIONS.length} answered
          </span>
        </div>
        <ol className="divide-y divide-line rounded-[14px] border border-line bg-bg-elevated">
          {QUESTIONS.map((q, i) => {
            const value = fields[q.key].trim();
            const gap = q.required && !value;
            return (
              <li key={q.key}>
                <button
                  type="button"
                  onClick={() => {
                    setStep(i);
                    setTried(false);
                  }}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-bg-subtle"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold text-muted">
                      {q.short}
                      {!q.required ? <span className="font-normal text-faint"> · optional</span> : null}
                    </span>
                    <span className={cn("mt-0.5 block text-sm leading-6", gap ? "font-semibold text-clay" : value ? "text-ink" : "text-faint")}>
                      {value || (gap ? "Still needs an answer" : "Skipped")}
                    </span>
                  </span>
                  <Pencil className="mt-1 size-4 shrink-0 text-faint" aria-label={`Edit ${q.short}`} />
                </button>
              </li>
            );
          })}
        </ol>

        {assumptionHit ? (
          <p className="rounded-[14px] bg-gold-soft px-3 py-2 text-sm leading-6 text-gold-deep">
            Some of this reads like an assumption (“everyone”, “will buy”, “most students”). That is allowed, but it
            is not evidence. Put it under “What you don’t know”.
          </p>
        ) : null}
        <FormMessages error={error} notice={notice} />

        <div className="flex flex-col gap-2">
          {submitted ? (
            <Button size="lg" className="w-full" disabled={Boolean(pending)} onClick={() => void save(false)}>
              {pending === "save" ? "Saving…" : "Save changes"}
            </Button>
          ) : (
            <>
              <Button size="lg" className="w-full" disabled={Boolean(pending)} onClick={() => void save(true)}>
                {pending === "submit" ? "Submitting…" : "Submit my problem"}
              </Button>
              <Button variant="secondary" className="w-full" disabled={Boolean(pending)} onClick={() => void save(false)}>
                {pending === "save" ? "Saving…" : "Save draft for later"}
              </Button>
            </>
          )}
        </div>
        <p className="text-xs leading-5 text-muted">
          Stays private until every member has submitted. A submitted problem is never deleted, and you can still
          improve it until the group picks a venture.
        </p>
      </div>
    );
  }

  const q = QUESTIONS[step];
  const value = fields[q.key];
  const blocked = q.required && !value.trim();
  const pct = Math.round((step / QUESTIONS.length) * 100);

  function next() {
    if (blocked) {
      setTried(true);
      return;
    }
    setTried(false);
    setStep((s) => s + 1);
  }

  return (
    <form
      key={q.key}
      className="flow-enter space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        next();
      }}
    >
      <div>
        <div className="flex items-center justify-between text-xs font-semibold text-muted">
          <span>
            Question {step + 1} of {QUESTIONS.length}
          </span>
          {!q.required ? <span className="text-faint">optional</span> : null}
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-bg-subtle" aria-hidden>
          <div className="h-full rounded-full bg-ink transition-[width] duration-300" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <label className="block space-y-3">
        <span className="block font-display text-[26px] leading-tight font-semibold">{q.label}</span>
        {q.multiline ? (
          <Textarea
            autoFocus
            value={value}
            onChange={(e) => set(q.key, e.target.value)}
            placeholder={q.placeholder}
            className="min-h-40"
            aria-invalid={tried && blocked}
          />
        ) : (
          <Input
            autoFocus
            value={value}
            onChange={(e) => set(q.key, e.target.value)}
            placeholder={q.placeholder}
            className="h-13"
            aria-invalid={tried && blocked}
          />
        )}
      </label>

      {q.key === "context" ? (
        <div className="flex flex-wrap gap-1.5">
          {CONTEXTS.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={value === c}
              onClick={() => set("context", c)}
              className={cn(
                "min-h-9 rounded-full border px-3.5 py-1 text-sm transition-colors",
                value === c ? "border-ink bg-ink text-white" : "border-line-strong bg-bg-elevated text-ink-soft",
              )}
            >
              {c}
            </button>
          ))}
        </div>
      ) : null}

      {tried && blocked ? (
        <p role="alert" className="text-sm font-semibold text-clay">
          This one needs an answer. If you have not seen anything yet, write that honestly.
        </p>
      ) : null}

      <Why text={WHY[q.key]} />

      <div className="flex items-center gap-2 pt-2">
        <Button
          type="button"
          variant="secondary"
          size="lg"
          className="w-13 px-0"
          aria-label="Previous question"
          disabled={step === 0}
          onClick={() => setStep((s) => s - 1)}
        >
          <ArrowLeft className="size-5" aria-hidden />
        </Button>
        <Button type="submit" size="lg" className="flex-1">
          {!q.required && !value.trim() ? "Skip" : step === QUESTIONS.length - 1 ? "Review" : "Next"}
          <ArrowRight className="size-4" aria-hidden />
        </Button>
      </div>
      <FormMessages error={error} notice={notice} />
      <button
        type="button"
        onClick={() => setStep(REVIEW)}
        className="min-h-11 w-full text-center text-sm font-semibold text-muted underline underline-offset-2"
      >
        See all answers
      </button>
    </form>
  );
}
