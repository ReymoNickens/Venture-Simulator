import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronDown, Quote } from "lucide-react";
import { useStudioWorkspace } from "@/hooks/workspace-context";
import { useAction } from "@/hooks/use-action";
import { saveOffline } from "@/lib/offline/actions";
import type { WorkspaceSnapshot, WouldPay } from "@/lib/domain/types";
import { StageHeader } from "@/components/stage/StageHeader";
import { Reflect } from "@/components/stage/Reflect";
import { NeedsVenture } from "@/components/stage/NeedsVenture";
import { Button } from "@/components/ui/button";
import { Choice, Field, Input, Select, Textarea } from "@/components/ui/input";
import { Card, Eyebrow, EmptyNote } from "@/components/ui/badge";
import { Stamp } from "@/components/ui/stamp";
import { FormMessages, Loading } from "@/components/ui/feedback";
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
  if (loading || !data) return <Loading />;
  if (!data.venture) return <NeedsVenture />;
  const interviews = data.work.interviews;
  return (
    <div className="space-y-6">
      <StageHeader stage="listen" data={data} />
      <Guide />
      <Patterns data={data} />
      <InterviewForm data={data} onSaved={() => void refresh()} />
      <section className="space-y-3">
        <h2 className="font-display text-xl font-bold">Interview log ({interviews.length})</h2>
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
                  {i.pains ? <Row k="Pains" v={i.pains} /> : null}
                  {i.currentSolution ? <Row k="Today they" v={i.currentSolution} /> : null}
                  {i.spendSignal ? <Row k="Spend" v={i.spendSignal} /> : null}
                  {i.surprise ? <Row k="Surprise" v={i.surprise} /> : null}
                  {i.painLevel ? <Row k="Pain" v={`${"●".repeat(i.painLevel)}${"○".repeat(5 - i.painLevel)}`} /> : null}
                </dl>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyNote>No interviews yet. The first one is the hardest — go and knock.</EmptyNote>
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
              student, Pentagon hostel”), not their name or number.
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

function InterviewForm({ data, onSaved }: { data: WorkspaceSnapshot; onSaved: () => void }) {
  const blank = {
    intervieweeProfile: "",
    segment: "",
    location: "",
    conductedOn: new Date().toISOString().slice(0, 10),
    channel: "in_person",
    consent: false,
    keyQuotes: "",
    pains: "",
    currentSolution: "",
    spendSignal: "",
    wouldPay: "not_asked" as WouldPay,
    painLevel: 3,
    surprise: "",
    assumptionId: "",
    relationship: "supports",
  };
  const [f, setF] = useState(blank);
  const [open, setOpen] = useState(data.work.interviews.length === 0);
  const { pending, error, notice, run, setNotice } = useAction();
  const set = <K extends keyof typeof blank>(k: K, v: (typeof blank)[K]) => setF((x) => ({ ...x, [k]: v }));
  const segments = [...new Set(data.work.interviews.map((i) => i.segment).filter(Boolean))];

  if (!open) {
    return (
      <Button variant="gold" size="lg" className="w-full" onClick={() => setOpen(true)}>
        + Log an interview
      </Button>
    );
  }
  return (
    <section className="notebook rounded-[10px] border-2 border-ink py-4 pr-4 pl-10">
      <h2 className="font-display text-xl font-bold">Log an interview</h2>
      <p className="text-xs text-muted">Works without a connection — it syncs later.</p>
      <div className="mt-3 space-y-4">
        <label className="flex items-start gap-2 rounded-[8px] border-2 border-ink bg-bg-elevated p-3 text-sm">
          <input
            type="checkbox"
            checked={f.consent}
            onChange={(e) => set("consent", e.target.checked)}
            className="mt-1 size-4 accent-[var(--color-accent)]"
          />
          <span>They agreed to be interviewed for a class project, and I am not recording their name.</span>
        </label>
        <Field label="Who did you speak to?" hint="A description, not a name: “Level 200 student, commutes from Madina”.">
          <Input value={f.intervieweeProfile} onChange={(e) => set("intervieweeProfile", e.target.value)} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Customer segment" optional>
            <Input list="segments" value={f.segment} onChange={(e) => set("segment", e.target.value)} placeholder="Commuting students" />
            <datalist id="segments">
              {segments.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </Field>
          <Field label="Where" optional>
            <Input value={f.location} onChange={(e) => set("location", e.target.value)} placeholder="Night market, Hall B…" />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="When">
            <Input type="date" value={f.conductedOn} onChange={(e) => set("conductedOn", e.target.value)} />
          </Field>
          <Choice label="How" value={f.channel as (typeof CHANNELS)[number]["value"]} options={CHANNELS} onChange={(v) => set("channel", v)} />
        </div>
        <Field label="What did they actually say? Their words, in quotes.">
          <Textarea value={f.keyQuotes} onChange={(e) => set("keyQuotes", e.target.value)} className="min-h-28" placeholder="“Last Tuesday I waited forty minutes and still missed my 8am…”" />
        </Field>
        <Field label="What problems or frustrations came up?" optional>
          <Textarea value={f.pains} onChange={(e) => set("pains", e.target.value)} />
        </Field>
        <Field label="How do they deal with it today?" optional>
          <Input value={f.currentSolution} onChange={(e) => set("currentSolution", e.target.value)} />
        </Field>
        <Field label="What do they already spend on it — money or time?" optional hint="GH₵ per week, hours lost, trips made.">
          <Input value={f.spendSignal} onChange={(e) => set("spendSignal", e.target.value)} />
        </Field>
        <Choice
          label="How painful is it for them?"
          value={String(f.painLevel) as "1" | "2" | "3" | "4" | "5"}
          options={[
            { value: "1", label: "1 · barely" },
            { value: "2", label: "2" },
            { value: "3", label: "3" },
            { value: "4", label: "4" },
            { value: "5", label: "5 · desperate" },
          ]}
          onChange={(v) => set("painLevel", Number(v))}
        />
        <Choice label="Did they show they would pay?" value={f.wouldPay} options={WOULD_PAY} onChange={(v) => set("wouldPay", v)} />
        <Field label="What surprised you?" optional>
          <Input value={f.surprise} onChange={(e) => set("surprise", e.target.value)} />
        </Field>
        {data.assumptions.length ? (
          <div className="space-y-2 rounded-[8px] border-2 border-dashed border-line-strong p-3">
            <Field label="Did this test one of your assumptions?" optional>
              <Select value={f.assumptionId} onChange={(e) => set("assumptionId", e.target.value)}>
                <option value="">No / not sure</option>
                {data.assumptions.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.statement.slice(0, 90)}
                  </option>
                ))}
              </Select>
            </Field>
            {f.assumptionId ? (
              <Choice
                label="It…"
                value={f.relationship as "supports" | "challenges"}
                options={[
                  { value: "supports", label: "supports it" },
                  { value: "challenges", label: "challenges it" },
                ]}
                onChange={(v) => set("relationship", v)}
              />
            ) : null}
          </div>
        ) : null}
        <FormMessages error={error} notice={notice} />
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={Boolean(pending) || !f.consent}
            onClick={() =>
              void run("save", async () => {
                const r = await saveOffline("logInterview", {
                  ...f,
                  conductedOn: f.conductedOn || null,
                  assumptionId: f.assumptionId || null,
                });
                setF(blank);
                onSaved();
                setNotice(
                  r.queued
                    ? "Saved on this phone — it will sync when you are connected."
                    : "Interview logged — and added to your notebook as evidence.",
                );
              })
            }
          >
            {pending ? "Saving…" : "Save interview"}
          </Button>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Close
          </Button>
        </div>
      </div>
    </section>
  );
}
