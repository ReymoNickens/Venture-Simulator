import type { Opportunity, OpportunityFields } from "@/lib/domain/types";
import { CONTEXTS } from "@/lib/domain/copy";
import { ALL_PLACES, PEOPLE_TO_ASK } from "@/lib/domain/places";
import { ASSUMPTION_LANGUAGE } from "@/lib/domain/config";
import { saveOpportunity } from "@/lib/offline/actions";
import { BigInput, BigText, Pick, StepFlow, Suggest, type Step } from "@/components/flow/StepFlow";

type V = OpportunityFields;

const empty: V = {
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

function fromOpp(o: Opportunity | null): V {
  if (!o) return empty;
  const { problem, affectedPeople, context, observedEvidence, currentAlternatives, whyItMatters, possibleSolution, potentialCustomer, revenueMechanism, uncertainties } = o;
  return { problem, affectedPeople, context, observedEvidence, currentAlternatives, whyItMatters, possibleSolution, potentialCustomer, revenueMechanism, uncertainties };
}

const min = (n: number, msg: string) => (v: string) => v.trim().length >= n || msg;

const assumedWarning = (text: string) =>
  ASSUMPTION_LANGUAGE.test(text) ? (
    <p className="mt-2 rounded-[8px] border-2 border-gold/60 bg-gold-soft px-3 py-2 text-sm">
      “Everyone”, “most students”, “will buy” — that is a guess, not something you saw. It is allowed, but
      say what you actually observed.
    </p>
  ) : null;

// Ordered like fieldwork: what you saw → who → where → the proof → how they
// cope → why it matters → your hunch → what you don't know.
const STEPS: Step<V>[] = [
  {
    id: "problem",
    section: "What you saw",
    question: "What problem did you notice?",
    hint: "Something you saw happen — not a business you wish existed.",
    render: (v, set) => (
      <>
        <BigText label="The problem" value={v.problem} onChange={(problem) => set({ problem })} placeholder="Every morning the shuttle stop at Science is packed and students miss their 8am…" />
        {assumedWarning(v.problem)}
      </>
    ),
    valid: (v) => min(20, "Describe it in a full sentence or two.")(v.problem),
    summary: (v) => v.problem,
  },
  {
    id: "who",
    section: "What you saw",
    question: "Who has this problem?",
    hint: "Be specific. “Students” is too broad — which students, when?",
    render: (v, set) => (
      <>
        <BigInput label="Who has it" value={v.affectedPeople} onChange={(affectedPeople) => set({ affectedPeople })} placeholder="Level 100 students in the halls with early lectures" />
        <Suggest items={PEOPLE_TO_ASK} onPick={(p) => set({ affectedPeople: v.affectedPeople ? `${v.affectedPeople}, ${p}` : p })} />
      </>
    ),
    valid: (v) => min(5, "Name who it affects.")(v.affectedPeople),
    summary: (v) => v.affectedPeople,
  },
  {
    id: "where",
    section: "What you saw",
    question: "Where did you see it?",
    hint: "Tap a place or type your own.",
    render: (v, set) => (
      <>
        <BigInput label="Where" value={v.context} onChange={(context) => set({ context })} placeholder="Science Market" list="places" />
        <datalist id="places">
          {ALL_PLACES.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
        <Suggest items={CONTEXTS} onPick={(context) => set({ context })} />
      </>
    ),
    valid: (v) => min(3, "Say where.")(v.context),
    summary: (v) => v.context,
  },
  {
    id: "evidence",
    section: "The proof",
    question: "What did you actually see, hear or count?",
    hint: "Numbers, times, quotes. If you haven’t looked yet, go and look — then come back.",
    render: (v, set) => (
      <BigText label="What you observed" value={v.observedEvidence} onChange={(observedEvidence) => set({ observedEvidence })} placeholder="Counted 40+ people at 7:10am on Tuesday and Thursday. Two buses in 25 minutes." />
    ),
    valid: (v) => min(20, "Write what you observed — this is the heart of it.")(v.observedEvidence),
    summary: (v) => v.observedEvidence,
  },
  {
    id: "cope",
    section: "How they cope",
    question: "What do people do about it today?",
    hint: "They already manage somehow. That is your real competition.",
    render: (v, set) => (
      <BigText label="Current alternatives" value={v.currentAlternatives} onChange={(currentAlternatives) => set({ currentAlternatives })} placeholder="Walk to Old Site, take a dropping taxi, or skip the lecture." rows={3} />
    ),
    valid: (v) => min(10, "How do they get by today?")(v.currentAlternatives),
    summary: (v) => v.currentAlternatives,
  },
  {
    id: "why",
    section: "How they cope",
    question: "Why does it matter to them?",
    hint: "What does it cost them — money, time, marks, safety?",
    render: (v, set) => (
      <BigText label="Why it matters" value={v.whyItMatters} onChange={(whyItMatters) => set({ whyItMatters })} rows={3} />
    ),
    valid: (v) => min(10, "Say what it costs them.")(v.whyItMatters),
    summary: (v) => v.whyItMatters,
  },
  {
    id: "hunch",
    section: "Your hunch",
    question: "If you had to guess — what might help?",
    hint: "A rough guess is fine. You are not committing to anything.",
    optional: true,
    render: (v, set) => (
      <BigText label="Possible solution" value={v.possibleSolution} onChange={(possibleSolution) => set({ possibleSolution })} rows={3} />
    ),
    summary: (v) => v.possibleSolution,
  },
  {
    id: "customer",
    section: "Your hunch",
    question: "Who would pay for it?",
    hint: "Sometimes the person with the problem isn’t the one who pays.",
    optional: true,
    render: (v, set) => (
      <BigInput label="Who would pay" value={v.potentialCustomer} onChange={(potentialCustomer) => set({ potentialCustomer })} placeholder="Students, hall management, parents…" />
    ),
    summary: (v) => v.potentialCustomer,
  },
  {
    id: "money",
    section: "Your hunch",
    question: "How might money change hands?",
    optional: true,
    render: (v, set, next) => (
      <Pick
        value={(v.revenueMechanism as string) || ""}
        onChange={(revenueMechanism) => set({ revenueMechanism })}
        onPicked={next}
        options={[
          { value: "Pay each time (cash or MoMo)", label: "Pay each time", hint: "cash or MoMo" },
          { value: "Weekly or monthly subscription", label: "Weekly or monthly subscription" },
          { value: "Someone else pays (hall, sponsor, advertiser)", label: "Someone else pays", hint: "hall, sponsor, advertiser" },
          { value: "Not sure yet", label: "Not sure yet" },
        ]}
      />
    ),
    summary: (v) => v.revenueMechanism,
  },
  {
    id: "unknown",
    section: "Be honest",
    question: "What don’t you know yet?",
    hint: "This is not a weakness. The whole course is about finding out.",
    render: (v, set) => (
      <BigText label="Uncertainties" value={v.uncertainties} onChange={(uncertainties) => set({ uncertainties })} placeholder="Whether it happens every day, or only at exam time…" rows={3} />
    ),
    valid: (v) => min(10, "Name at least one thing you are unsure about.")(v.uncertainties),
    summary: (v) => v.uncertainties,
  },
];

export function OpportunityForm({
  existing,
  onSaved,
  onCancel,
}: {
  existing: Opportunity | null;
  onSaved: (result: { submitted: boolean; queued: boolean }) => void;
  onCancel?: () => void;
}) {
  return (
    <StepFlow<V>
      steps={STEPS}
      initial={fromOpp(existing)}
      draftKey="opportunity"
      finishLabel={existing && existing.status !== "draft" ? "Update my submission" : "Seal and submit"}
      reviewTitle="Read it once more. Then seal it."
      onCancel={onCancel}
      onFinish={async (v) => {
        const r = await saveOpportunity(v, true);
        onSaved({ submitted: true, queued: "queued" in r && Boolean(r.queued) });
      }}
      extraFinish={
        existing && existing.status !== "draft"
          ? undefined
          : {
              label: "Save as draft",
              run: async (v) => {
                const r = await saveOpportunity(v, false);
                onSaved({ submitted: false, queued: "queued" in r && Boolean(r.queued) });
              },
            }
      }
    />
  );
}
