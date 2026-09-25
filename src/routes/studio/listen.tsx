import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronDown, Mic, Quote } from "lucide-react";
import { useStudioWorkspace } from "@/hooks/workspace-context";
import { saveOffline } from "@/lib/offline/actions";
import type { WorkspaceSnapshot, WouldPay } from "@/lib/domain/types";
import { StageHeader } from "@/components/stage/StageHeader";
import { Reflect } from "@/components/stage/Reflect";
import { NeedsVenture } from "@/components/stage/NeedsVenture";
import { BigInput, BigText, Pick, Scale, StepFlow, Suggest, type Step } from "@/components/flow/StepFlow";
import { ALL_PLACES, PEOPLE_TO_ASK, SUGGESTED_PLACES } from "@/lib/domain/places";
import { Card, Eyebrow, EmptyNote } from "@/components/ui/badge";
import { Stamp } from "@/components/ui/stamp";
import { Loading } from "@/components/ui/feedback";
import { shortDate } from "@/lib/dates";

export const Route = createFileRoute("/studio/listen")({ component: ListenPage });

const WOULD_PAY: { value: WouldPay; label: string; hint?: string }[] = [
  { value: "not_asked", label: "Didn’t ask", hint: "Fine — past spending tells you more than a promise." },
  { value: "yes", label: "Yes, and showed it", hint: "Only if they did something: paid a deposit, gave a number, asked when." },
  { value: "maybe", label: "Maybe" },
  { value: "no", label: "No" },
];

const CHANNELS = [
  { value: "in_person", label: "In person" },
  { value: "phone", label: "Phone call" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "other", label: "Other" },
] as const;

function ListenPage() {
  const { data, loading, refresh } = useStudioWorkspace();
  const [saved, setSaved] = useState<string | null>(null);
  const [logging, setLogging] = useState(false);
  if (loading || !data) return <Loading />;
  if (!data.venture) return <NeedsVenture />;
  const interviews = data.work.interviews;
  // Focus mode: while logging, the interview is the only thing on screen.
  if (logging) {
    return (
      <InterviewForm
        data={data}
        open
        setOpen={setLogging}
        onSaved={(queued) => {
          setSaved(queued ? "Saved on this phone — it will sync when you are back online." : "Interview saved. It is in your notebook as evidence.");
          void refresh();
        }}
      />
    );
  }
  return (
    <div className="space-y-6">
      <StageHeader stage="listen" data={data} />
      <InterviewForm
        data={data}
        open={false}
        setOpen={setLogging}
        onSaved={(queued) => {
          setSaved(queued ? "Saved on this phone — it will sync when you are back online." : "Interview saved. It is in your notebook as evidence.");
          void refresh();
        }}
      />
      {saved ? <p className="text-sm font-semibold text-accent">{saved}</p> : null}
      <Guide />
      <Patterns data={data} />
      <section className="space-y-3">
        <h2 className="font-display text-xl font-bold">What you have heard ({interviews.length})</h2>
        {interviews.length ? (
          <ul className="space-y-3">
            {interviews.map((i) => (
              <li key={i.id} className="notebook rounded-[10px] border-2 border-ink/80 py-3 pr-4 pl-10">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-display text-base leading-tight font-bold">{i.intervieweeProfile}</p>
                    <p className="font-mono text-[11px] text-faint">
                      {[i.segment, i.location, i.conductedOn ? shortDate(i.conductedOn) : null, i.authorName]
                        .filter(Boolean)
                        .join(" · ")}
                      {i.syncState === "pending" ? " · saved on phone" : ""}
                    </p>
                  </div>
                  {i.wouldPay === "yes" ? (
                    <Stamp tone="forest" size="xs">Would pay</Stamp>
                  ) : i.wouldPay === "no" ? (
                    <Stamp tone="clay" size="xs">Wouldn’t pay</Stamp>
                  ) : null}
                </div>
                <blockquote className="mt-2 flex gap-2 font-display text-[17px] leading-7 font-semibold">
                  <Quote className="mt-1 size-4 shrink-0 text-gold-deep" aria-hidden />
                  <span>{i.keyQuotes}</span>
                </blockquote>
                <dl className="mt-2 grid gap-1 text-sm">
                  {i.currentSolution ? <Row k="Today they" v={i.currentSolution} /> : null}
                  {i.spendSignal ? <Row k="Spend" v={i.spendSignal} /> : null}
                  {i.surprise ? <Row k="Surprise" v={i.surprise} /> : null}
                  {i.painLevel ? <Row k="Pain" v={`${"●".repeat(i.painLevel)}${"○".repeat(5 - i.painLevel)}`} /> : null}
                </dl>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyNote>Nothing yet. The first conversation is the hardest — go and knock.</EmptyNote>
        )}
      </section>
      <Reflect
        stage="listen"
        data={data}
        prompt="What did people say that you did not want to hear?"
        onSaved={() => void refresh()}
      />
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-20 shrink-0 font-mono text-[10.5px] tracking-wide text-faint uppercase">{k}</dt>
      <dd className="leading-6 text-ink-soft">{v}</dd>
    </div>
  );
}

function Guide() {
  const [open, setOpen] = useState(false);
  return (
    <Card as="section">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center justify-between text-left">
        <span>
          <Eyebrow>Before you go</Eyebrow>
          <span className="font-display text-lg font-bold">How to interview without fooling yourself</span>
        </span>
        <ChevronDown className={`size-5 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open ? (
        <div className="mt-3 space-y-4 text-sm leading-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-[8px] border-2 border-clay/40 bg-clay-soft/50 p-3">
              <p className="font-semibold text-clay">Questions that lie to you</p>
              <ul className="mt-1 list-disc space-y-1 pl-4">
                <li>“Would you buy this?” — people are polite.</li>
                <li>“Do you think it’s a good idea?” — opinions are free.</li>
                <li>“How much would you pay?” — a guess about the future.</li>
              </ul>
            </div>
            <div className="rounded-[8px] border-2 border-accent/40 bg-accent-soft/60 p-3">
              <p className="font-semibold text-accent">Questions that teach you</p>
              <ul className="mt-1 list-disc space-y-1 pl-4">
                <li>“Tell me about the last time this happened.”</li>
                <li>“What did you do about it? What did that cost?”</li>
                <li>“What have you already tried? Why did you stop?”</li>
              </ul>
            </div>
          </div>
          <div>
            <p className="font-semibold">Ask for consent first</p>
            <p className="mt-1 rounded-[8px] bg-bg-subtle px-3 py-2 italic">
              “Good day. I’m a student doing a class project on [the problem]. Could I ask you a few
              questions about your experience? I won’t use your name, and you can stop at any time.”
            </p>
            <p className="mt-1 text-xs text-muted">
              Use whichever language they are most comfortable in. Record who they are (“Level 200
              student, Kwaprow hostel”), not their name or number.
            </p>
          </div>
          <ul className="list-disc space-y-1 pl-4">
            <li>Talk less than they do. Don’t pitch your idea until the end, if at all.</li>
            <li>Write down their exact words — quotes are evidence, your summary is not.</li>
            <li>Listen for money and time already being spent on the problem.</li>
          </ul>
        </div>
      ) : null}
    </Card>
  );
}

function Patterns({ data }: { data: WorkspaceSnapshot }) {
  const list = data.work.interviews;
  if (list.length < 2) return null;
  const pay = { yes: 0, maybe: 0, no: 0, not_asked: 0 } as Record<WouldPay, number>;
  for (const i of list) pay[i.wouldPay] += 1;
  const pains = list.map((i) => i.painLevel).filter((p): p is number => typeof p === "number");
  const avgPain = pains.length ? pains.reduce((a, b) => a + b, 0) / pains.length : null;
  const byMember = new Map<string, number>();
  for (const i of list) byMember.set(i.authorName, (byMember.get(i.authorName) ?? 0) + 1);
  const segments = new Map<string, number>();
  for (const i of list) if (i.segment) segments.set(i.segment, (segments.get(i.segment) ?? 0) + 1);
  const asked = list.length - pay.not_asked;
  return (
    <Card as="section" className="space-y-3">
      <Eyebrow>Patterns so far</Eyebrow>
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat n={String(list.length)} label="interviews" />
        <Stat n={avgPain ? avgPain.toFixed(1) : "—"} label="avg pain /5" />
        <Stat n={asked ? `${Math.round((pay.yes / asked) * 100)}%` : "—"} label="showed they’d pay" />
      </div>
      {segments.size ? (
        <p className="text-xs text-muted">
          Segments: {[...segments.entries()].map(([s, n]) => `${s} (${n})`).join(", ")}
        </p>
      ) : null}
      <p className="text-xs text-muted">
        By member: {[...byMember.entries()].map(([m, n]) => `${m.split(" ")[0]} ${n}`).join(" · ")}
      </p>
    </Card>
  );
}

function Stat({ n, label }: { n: string; label: string }) {
  return (
    <div className="rounded-[8px] border-2 border-line-strong/60 bg-bg px-2 py-2">
      <p className="font-display text-2xl font-extrabold tabular">{n}</p>
      <p className="text-[11px] text-muted">{label}</p>
    </div>
  );
}

type IV = {
  consent: boolean;
  intervieweeProfile: string;
  segment: string;
  location: string;
  conductedOn: string;
  channel: "in_person" | "phone" | "whatsapp" | "other";
  keyQuotes: string;
  currentSolution: string;
  spendSignal: string;
  painLevel: number | null;
  wouldPay: WouldPay | "";
  surprise: string;
  assumptionId: string;
  relationship: "supports" | "challenges";
};

function interviewSteps(data: WorkspaceSnapshot): Step<IV>[] {
  const segments = [...new Set(data.work.interviews.map((i) => i.segment).filter(Boolean))];
  const steps: Step<IV>[] = [
    {
      id: "consent",
      question: "Did they agree to talk to you?",
      hint: "Tell them it is a class project, you won’t use their name, and they can stop any time.",
      render: (v, set, next) => (
        <Pick
          value={v.consent ? "yes" : ""}
          onChange={(x) => set({ consent: x === "yes" })}
          onPicked={next}
          options={[{ value: "yes", label: "Yes, they agreed", hint: "and I am not recording their name" }]}
        />
      ),
      valid: (v) => v.consent || "Only log interviews with people who agreed.",
      summary: (v) => (v.consent ? "Yes" : ""),
    },
    {
      id: "who",
      question: "Who did you talk to?",
      hint: "Describe them, don’t name them: “Level 200 nursing student, Adehye Hall”.",
      render: (v, set) => (
        <>
          <BigInput label="Who" value={v.intervieweeProfile} onChange={(intervieweeProfile) => set({ intervieweeProfile })} placeholder="Fish seller, Kotokuraba, about 40" />
          <p className="mt-4 text-sm font-semibold text-ink-soft">Which group do they belong to?</p>
          <Suggest items={segments.length ? segments : PEOPLE_TO_ASK.slice(0, 6)} onPick={(segment) => set({ segment })} />
          <input
            aria-label="Customer segment"
            value={v.segment}
            onChange={(e) => set({ segment: e.target.value })}
            placeholder="or type a group"
            className="mt-2 h-10 w-full rounded-[8px] border-2 border-line-strong/70 bg-bg px-3 text-sm"
          />
        </>
      ),
      valid: (v) => v.intervieweeProfile.trim().length >= 5 || "Describe who they are.",
      summary: (v) => [v.intervieweeProfile, v.segment].filter(Boolean).join(" · "),
    },
    {
      id: "where",
      question: "Where and how?",
      render: (v, set) => (
        <div className="space-y-3">
          <BigInput label="Where" value={v.location} onChange={(location) => set({ location })} placeholder="Kotokuraba Market" list="places-iv" />
          <datalist id="places-iv">
            {ALL_PLACES.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
          <Suggest items={SUGGESTED_PLACES} onPick={(location) => set({ location })} />
          <div className="flex flex-wrap gap-2 pt-2">
            {CHANNELS.map((c) => (
              <button
                key={c.value}
                type="button"
                aria-pressed={v.channel === c.value}
                onClick={() => set({ channel: c.value })}
                className={`rounded-full border-2 px-3 py-1 text-sm ${v.channel === c.value ? "border-ink bg-ink text-bg-elevated" : "border-line-strong"}`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      ),
      summary: (v) => [v.location, CHANNELS.find((c) => c.value === v.channel)?.label].filter(Boolean).join(" · "),
      optional: true,
    },
    {
      id: "quote",
      section: "The part that matters",
      question: "What did they say? Their exact words.",
      hint: "Quotes are evidence. Your summary is not.",
      render: (v, set) => (
        <BigText label="Their words" value={v.keyQuotes} onChange={(keyQuotes) => set({ keyQuotes })} rows={5} placeholder="“Last Friday I waited from 6 till 7 and still missed my quiz…”" />
      ),
      valid: (v) => v.keyQuotes.trim().length >= 15 || "Write down at least one thing they said.",
      summary: (v) => v.keyQuotes,
    },
    {
      id: "cope",
      question: "What do they do about it today?",
      render: (v, set) => (
        <BigInput label="What they do today" value={v.currentSolution} onChange={(currentSolution) => set({ currentSolution })} placeholder="Buys sachet water, walks to Old Site…" />
      ),
      optional: true,
      summary: (v) => v.currentSolution,
    },
    {
      id: "spend",
      question: "What does it already cost them?",
      hint: "Money or time they already spend is the strongest signal you can find.",
      render: (v, set) => (
        <BigInput label="What it costs them" value={v.spendSignal} onChange={(spendSignal) => set({ spendSignal })} placeholder="GH₵20 a week on dropping taxis" />
      ),
      optional: true,
      summary: (v) => v.spendSignal,
    },
    {
      id: "pain",
      question: "How much does it bother them?",
      render: (v, set, next) => (
        <Scale value={v.painLevel} onChange={(painLevel) => set({ painLevel })} low="Barely" high="Desperate" onPicked={next} />
      ),
      summary: (v) => (v.painLevel ? `${v.painLevel} of 5` : ""),
      valid: (v) => Boolean(v.painLevel) || "Tap a number.",
    },
    {
      id: "pay",
      question: "Did they show they would pay?",
      hint: "“Yes” counts only if they did something — named a price, asked when, offered a deposit.",
      render: (v, set, next) => (
        <Pick value={v.wouldPay} onChange={(wouldPay) => set({ wouldPay })} onPicked={next} options={WOULD_PAY} />
      ),
      valid: (v) => Boolean(v.wouldPay) || "Pick one.",
      summary: (v) => WOULD_PAY.find((w) => w.value === v.wouldPay)?.label ?? "",
    },
    {
      id: "surprise",
      question: "What surprised you?",
      hint: "The surprise is usually the most valuable thing you heard.",
      render: (v, set) => <BigInput label="Surprise" value={v.surprise} onChange={(surprise) => set({ surprise })} />,
      optional: true,
      summary: (v) => v.surprise,
    },
  ];
  if (data.assumptions.length) {
    steps.push({
      id: "assumption",
      question: "Did it test one of your assumptions?",
      optional: true,
      render: (v, set) => (
        <div className="space-y-2">
          <Pick
            value={v.assumptionId}
            onChange={(assumptionId) => set({ assumptionId })}
            options={data.assumptions.map((a) => ({ value: a.id, label: a.statement }))}
          />
          {v.assumptionId ? (
            <div className="flex gap-2 pt-2">
              {(["supports", "challenges"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={v.relationship === r}
                  onClick={() => set({ relationship: r })}
                  className={`flex-1 rounded-[10px] border-2 py-3 font-semibold ${v.relationship === r ? (r === "supports" ? "border-ink bg-accent text-accent-fg" : "border-ink bg-clay text-accent-fg") : "border-line-strong"}`}
                >
                  It {r === "supports" ? "supports" : "challenges"} it
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ),
      summary: (v) => {
        const a = data.assumptions.find((x) => x.id === v.assumptionId);
        return a ? `${v.relationship}: ${a.statement}` : "";
      },
    });
  }
  return steps;
}

function InterviewForm({
  data,
  onSaved,
  open,
  setOpen,
}: {
  data: WorkspaceSnapshot;
  onSaved: (queued: boolean) => void;
  open: boolean;
  setOpen: (v: boolean) => void;
}) {
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-between rounded-[14px] border-2 border-ink bg-gold p-5 text-left shadow-[4px_4px_0_0_var(--color-ink)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
      >
        <span>
          <span className="block font-display text-2xl font-extrabold">Log an interview</span>
          <span className="block text-sm text-ink-soft">Two minutes, right after you talk. Works offline.</span>
        </span>
        <Mic className="size-8" aria-hidden />
      </button>
    );
  }
  return (
    <StepFlow<IV>
      steps={interviewSteps(data)}
      draftKey="interview"
      initial={{
        consent: false,
        intervieweeProfile: "",
        segment: "",
        location: "",
        conductedOn: new Date().toISOString().slice(0, 10),
        channel: "in_person",
        keyQuotes: "",
        currentSolution: "",
        spendSignal: "",
        painLevel: null,
        wouldPay: "",
        surprise: "",
        assumptionId: "",
        relationship: "supports",
      }}
      finishLabel="Save interview"
      reviewTitle="Good. Anything to fix?"
      onCancel={() => setOpen(false)}
      onFinish={async (v) => {
        const r = await saveOffline("logInterview", {
          ...v,
          wouldPay: v.wouldPay || "not_asked",
          conductedOn: v.conductedOn || null,
          assumptionId: v.assumptionId || null,
        });
        setOpen(false);
        onSaved(r.queued);
      }}
    />
  );
}
