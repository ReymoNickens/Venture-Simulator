import { useEffect, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Presentation, Printer, X } from "lucide-react";
import { useStudioWorkspace } from "@/hooks/workspace-context";
import { useAction } from "@/hooks/use-action";
import { savePlanSection } from "@/lib/server/venture-work";
import { CANVAS_BLOCKS, FEASIBILITY_LENSES, PLAN_SECTIONS, type PlanSectionKey } from "@/lib/domain/stages";
import { computeFinance, formatCedis, parseFinanceInputs } from "@/lib/domain/finance";
import type { WorkspaceSnapshot } from "@/lib/domain/types";
import { StageHeader } from "@/components/stage/StageHeader";
import { NeedsVenture } from "@/components/stage/NeedsVenture";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Stamp } from "@/components/ui/stamp";
import { LogoMark, Sparkle } from "@/components/ui/sticker";
import { FormMessages, Loading } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/studio/pitch")({ component: PitchPage });

function PitchPage() {
  const { data, loading, refresh } = useStudioWorkspace();
  const [presenting, setPresenting] = useState(false);
  if (loading || !data) return <Loading />;
  if (!data.venture) return <NeedsVenture />;
  return (
    <div className="space-y-6">
      <div className="no-print">
        <StageHeader stage="pitch" data={data} />
        <div className="flex flex-wrap gap-2">
          <Button variant="gold" onClick={() => setPresenting(true)}>
            <Presentation className="size-4" aria-hidden /> Pitch mode
          </Button>
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer className="size-4" aria-hidden /> Print / save as PDF
          </Button>
        </div>
      </div>
      <Plan data={data} onSaved={() => void refresh()} />
      {presenting ? <PitchDeck data={data} onClose={() => setPresenting(false)} /> : null}
    </div>
  );
}

function Strength({ n }: { n: number }) {
  const tone = n >= 5 ? "forest" : n >= 2 ? "gold" : "clay";
  return (
    <Stamp tone={tone} size="xs" tilt={-2} className="no-print">
      {n ? `${n} evidence` : "no evidence"}
    </Stamp>
  );
}

function Section({ n, title, evidence, children }: { n: number; title: string; evidence?: number; children: ReactNode }) {
  return (
    <section className="break-inside-avoid border-t border-line pt-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-xl font-extrabold">
          <span className="mr-2 font-mono text-sm text-muted">{String(n).padStart(2, "0")}</span>
          {title}
        </h2>
        {evidence !== undefined ? <Strength n={evidence} /> : null}
      </div>
      <div className="mt-2 space-y-2 text-[15px] leading-7">{children}</div>
    </section>
  );
}

function Written({ data, section, onSaved }: { data: WorkspaceSnapshot; section: PlanSectionKey; onSaved: () => void }) {
  const current = data.work.plan.find((p) => p.section === section);
  const meta = PLAN_SECTIONS.find((p) => p.key === section)!;
  const [editing, setEditing] = useState(!current);
  const [body, setBody] = useState(current?.body ?? "");
  const { pending, error, run } = useAction();
  if (!editing && current) {
    return (
      <div>
        <p className="whitespace-pre-line">{current.body}</p>
        <p className="no-print mt-1 text-xs text-faint">
          Written by {current.authorName}
          {current.revisions ? ` · revised ${current.revisions}×` : ""} ·{" "}
          <button type="button" onClick={() => setEditing(true)} className="font-semibold text-accent underline">
            Edit
          </button>
        </p>
      </div>
    );
  }
  return (
    <div className="no-print space-y-2 rounded-[14px] border-2 border-dashed border-line-strong p-3">
      <p className="text-sm text-muted">{meta.prompt}</p>
      <Textarea aria-label={meta.title} value={body} onChange={(e) => setBody(e.target.value)} className="min-h-32" />
      <FormMessages error={error} />
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={Boolean(pending) || body.trim().length < 60}
          onClick={() =>
            void run("save", async () => {
              await savePlanSection({ data: { section, body } });
              setEditing(false);
              onSaved();
            })
          }
        >
          {pending ? "Saving…" : body.trim().length < 60 ? `${body.trim().length}/60` : "Save section"}
        </Button>
        {current ? (
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function Plan({ data, onSaved }: { data: WorkspaceSnapshot; onSaved: () => void }) {
  const v = data.venture!;
  const opp = data.visibleOpportunities.find((o) => o.id === v.opportunityId);
  const members = data.members.filter((m) => m.membershipStatus === "active" && !m.isSynthetic);
  const interviews = data.work.interviews;
  const canvas = data.work.canvas.filter((c) => c.status === "active");
  const finInputs = data.work.finance ? parseFinanceInputs(data.work.finance.inputs) : null;
  const fin = finInputs ? computeFinance(finInputs) : null;
  const tests = data.work.prototypeTests;
  const decision = data.work.decisions.find((d) => d.status === "ratified");
  const quotes = interviews.filter((i) => i.keyQuotes).slice(0, 3);
  const contributions = new Map<string, number>();
  for (const e of data.activity) if (e.studentId) contributions.set(e.studentId, (contributions.get(e.studentId) ?? 0) + 1);
  const canvasEvidence = canvas.reduce((n, c) => n + c.evidenceIds.length, 0);
  const feasEvidence = data.work.feasibility.reduce((n, f) => n + f.evidenceIds.length, 0);
  const finEvidence = finInputs
    ? [finInputs.priceEvidenceId, ...finInputs.variableCosts.map((l) => l.evidenceId), ...finInputs.fixedCosts.map((l) => l.evidenceId)].filter(Boolean).length
    : 0;

  return (
    <article className="rounded-[28px] bg-bg-elevated px-5 pt-4 pb-8 ring-1 ring-line sm:px-10 print:ring-0">
      <header className="py-8 text-center">
        <LogoMark className="mx-auto size-12" />
        <p className="mt-3 font-mono text-xs tracking-[0.2em] text-muted uppercase">Business plan · {data.offering?.courseCode}</p>
        <h1 className="mt-2 font-display text-4xl font-extrabold sm:text-5xl">{v.name}</h1>
        <p className="mt-2 text-sm text-muted">
          {data.group?.groupName} · {members.map((m) => m.fullName).join(", ")}
        </p>
        {decision ? (
          <div className="mt-4">
            <Stamp tone={decision.decision === "stop" ? "clay" : decision.decision === "pivot" ? "gold" : "forest"} size="md" tilt={-6}>
              Decision: {decision.decision}
            </Stamp>
          </div>
        ) : null}
        <p className="mt-4 text-xs text-muted">
          Every claim below is drawn from the group’s record: {data.evidence.length} evidence items,{" "}
          {interviews.length} interviews, {tests.length} prototype tests.
        </p>
      </header>

      <div className="space-y-8">
        <Section n={1} title="Executive summary">
          <Written data={data} section="summary" onSaved={onSaved} />
        </Section>

        <Section n={2} title="The problem" evidence={interviews.length + (opp?.observedEvidence ? 1 : 0)}>
          {opp ? (
            <>
              <p className="font-semibold">{opp.problem}</p>
              <p><span className="font-semibold">Who:</span> {opp.affectedPeople}</p>
              <p><span className="font-semibold">What we observed:</span> {opp.observedEvidence}</p>
              <p><span className="font-semibold">How people cope today:</span> {opp.currentAlternatives}</p>
            </>
          ) : null}
          {quotes.length ? (
            <div className="space-y-2 pt-2">
              {quotes.map((q) => (
                <blockquote key={q.id} className="border-l-4 border-gold pl-3 font-display font-semibold">
                  “{q.keyQuotes}”
                  <span className="block font-sans text-xs font-normal text-muted">— {q.intervieweeProfile}</span>
                </blockquote>
              ))}
            </div>
          ) : null}
          <p className="text-sm text-muted">Why we chose this over the alternatives: {v.selectionRationale}</p>
        </Section>

        <Section n={3} title="Business model" evidence={canvasEvidence}>
          <div className="grid gap-2 sm:grid-cols-3">
            {CANVAS_BLOCKS.map((b) => {
              const entries = canvas.filter((c) => c.block === b.key);
              return (
                <div key={b.key} className="rounded-[12px] border border-line p-2">
                  <p className="font-mono text-[10.5px] tracking-wide text-muted uppercase">{b.title}</p>
                  {entries.length ? (
                    <ul className="mt-1 space-y-1 text-sm leading-5">
                      {entries.map((e) => (
                        <li key={e.id} className={cn(!e.evidenceIds.length && "text-muted italic")}>
                          {e.body}
                          {!e.evidenceIds.length ? " (untested)" : ""}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-sm text-faint">—</p>
                  )}
                </div>
              );
            })}
          </div>
        </Section>

        <Section n={4} title="Feasibility" evidence={feasEvidence}>
          <ul className="space-y-2">
            {FEASIBILITY_LENSES.map((l) => {
              const f = data.work.feasibility.find((x) => x.lens === l.key);
              return (
                <li key={l.key}>
                  <span className="font-semibold">{l.title}:</span>{" "}
                  {f ? (
                    <>
                      <span className="font-semibold capitalize">{f.verdict}</span> — {f.reasoning}
                    </>
                  ) : (
                    <span className="text-muted">not yet assessed</span>
                  )}
                </li>
              );
            })}
          </ul>
        </Section>

        <Section n={5} title="The numbers" evidence={finEvidence}>
          {fin && finInputs ? (
            <div className="grid gap-x-6 gap-y-1 font-mono text-sm sm:grid-cols-2">
              <p>Price: {formatCedis(finInputs.price)} per {finInputs.unitName || "unit"}</p>
              <p>Cost per unit: {formatCedis(fin.variableCostPerUnit)}</p>
              <p>Monthly costs: {formatCedis(fin.fixedPerMonth)}</p>
              <p>Break-even: {fin.breakEvenUnits ?? "never"} units/month</p>
              <p>Expected: {finInputs.expectedUnitsPerMonth} units/month</p>
              <p>Profit: {formatCedis(fin.monthlyProfit)}/month</p>
              <p>Start-up: {formatCedis(fin.startupTotal)}</p>
              <p>Payback: {fin.paybackMonths ?? "never"} months</p>
              <p>If costs rise 15%: {formatCedis(fin.profitIfCostsRise)}/month</p>
              <p>Sourced from evidence: {Math.round(fin.sourcedShare * 100)}%</p>
            </div>
          ) : (
            <p className="text-muted">No numbers saved yet.</p>
          )}
        </Section>

        <Section n={6} title="Prototype and tests" evidence={tests.length}>
          {data.work.prototypes.length ? (
            <ul className="space-y-1">
              {data.work.prototypes.map((p) => {
                const t = tests.filter((x) => x.prototypeId === p.id);
                return (
                  <li key={p.id}>
                    <span className="font-semibold">{p.title}</span> ({formatCedis(p.costGhs)}) — tested with {t.length}{" "}
                    {t.length === 1 ? "person" : "people"}: {t.filter((x) => x.outcome === "succeeded").length} easily,{" "}
                    {t.filter((x) => x.outcome === "struggled").length} struggled, {t.filter((x) => x.outcome === "failed").length} could not.
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-muted">No prototype recorded yet.</p>
          )}
        </Section>

        <Section n={7} title="Risks and what we will do">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left font-mono text-[10.5px] tracking-wide text-muted uppercase">
                <th className="py-1 pr-2">Assumption</th>
                <th className="py-1 pr-2">Importance</th>
                <th className="py-1">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.assumptions.map((a) => (
                <tr key={a.id} className="border-t border-line align-top">
                  <td className="py-1.5 pr-2">{a.statement}</td>
                  <td className="py-1.5 pr-2 capitalize">{a.importance}</td>
                  <td className="py-1.5 capitalize">
                    {a.status === "supported" ? "held up" : a.status === "challenged" ? "broke" : a.status === "open" ? "untested" : a.status}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Written data={data} section="risks" onSaved={onSaved} />
        </Section>

        <Section n={8} title="The team">
          <ul className="text-sm">
            {members.map((m) => (
              <li key={m.id}>
                {m.fullName} — {contributions.get(m.studentId) ?? 0} recorded contributions
              </li>
            ))}
          </ul>
          <Written data={data} section="team" onSaved={onSaved} />
        </Section>

        <Section n={9} title="The ask">
          <Written data={data} section="ask" onSaved={onSaved} />
        </Section>
      </div>
    </article>
  );
}

function PitchDeck({ data, onClose }: { data: WorkspaceSnapshot; onClose: () => void }) {
  const v = data.venture!;
  const opp = data.visibleOpportunities.find((o) => o.id === v.opportunityId);
  const fin = data.work.finance ? computeFinance(parseFinanceInputs(data.work.finance.inputs)) : null;
  const finIn = data.work.finance ? parseFinanceInputs(data.work.finance.inputs) : null;
  const quote = data.work.interviews.find((i) => i.keyQuotes);
  const tests = data.work.prototypeTests;
  const plan = (k: PlanSectionKey) => data.work.plan.find((p) => p.section === k)?.body;
  const value = data.work.canvas.filter((c) => c.status === "active" && c.block === "value").map((c) => c.body);
  const segments = data.work.canvas.filter((c) => c.status === "active" && c.block === "segments").map((c) => c.body);
  const slides: { kicker: string; title: string; body: ReactNode }[] = [
    { kicker: data.group?.groupName ?? "", title: v.name, body: <p className="text-2xl">{opp?.problem}</p> },
    {
      kicker: "The problem",
      title: "What we saw",
      body: (
        <>
          <p>{opp?.observedEvidence}</p>
          {quote ? <blockquote className="mt-6 border-l-8 border-gold pl-4 font-display text-3xl font-bold">“{quote.keyQuotes}”</blockquote> : null}
        </>
      ),
    },
    {
      kicker: "The customer",
      title: segments[0] ?? opp?.affectedPeople ?? "Who has it",
      body: (
        <p>
          We spoke to {data.work.interviews.length} people.{" "}
          {data.work.interviews.filter((i) => i.wouldPay === "yes").length} showed they would pay.
        </p>
      ),
    },
    { kicker: "What we offer", title: value[0] ?? "Our value", body: <p>{value.slice(1).join(" · ")}</p> },
    {
      kicker: "What we tested",
      title: data.work.prototypes[0]?.title ?? "Prototype",
      body: (
        <p>
          {tests.length} real tests: {tests.filter((t) => t.outcome === "succeeded").length} easy,{" "}
          {tests.filter((t) => t.outcome === "struggled").length} struggled, {tests.filter((t) => t.outcome === "failed").length} failed.
        </p>
      ),
    },
    {
      kicker: "The numbers",
      title: fin?.breakEvenUnits != null ? `Break-even at ${fin.breakEvenUnits} a month` : "The numbers",
      body: fin && finIn ? (
        <p className="font-mono">
          {formatCedis(finIn.price)} price · {formatCedis(fin.contributionPerUnit)} left per sale · {formatCedis(fin.monthlyProfit)} profit/month
        </p>
      ) : (
        <p>Not yet modelled.</p>
      ),
    },
    { kicker: "The ask", title: "What we need", body: <p className="whitespace-pre-line">{plan("ask") ?? "Write your ask in the plan."}</p> },
  ];
  const [i, setI] = useState(0);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") setI((x) => Math.min(slides.length - 1, x + 1));
      if (e.key === "ArrowLeft") setI((x) => Math.max(0, x - 1));
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [slides.length, onClose]);
  const s = slides[i];
  return (
    <div role="dialog" aria-modal aria-label="Pitch mode" className="fixed inset-0 z-50 flex flex-col bg-ink text-bg-elevated">
      <Sparkle className="absolute top-6 right-8 size-6 text-gold" />
      <div className="flex items-center justify-between px-4 py-3">
        <span className="font-mono text-sm text-bg-elevated/60">
          {i + 1} / {slides.length}
        </span>
        <button type="button" onClick={onClose} aria-label="Close pitch mode" className="rounded-full p-2 hover:bg-white/10">
          <X className="size-6" aria-hidden />
        </button>
      </div>
      <button
        type="button"
        className="flex flex-1 flex-col justify-center px-6 text-left sm:px-16"
        onClick={() => setI((x) => Math.min(slides.length - 1, x + 1))}
      >
        <p className="font-mono text-sm tracking-[0.25em] text-gold uppercase">{s.kicker}</p>
        <h2 className="mt-3 max-w-[18ch] font-display text-5xl leading-[1] font-extrabold sm:text-7xl">{s.title}</h2>
        <div className="mt-6 max-w-[40ch] text-xl leading-relaxed text-bg-elevated/85 sm:text-2xl">{s.body}</div>
      </button>
      <div className="flex justify-between px-4 pb-6">
        <button type="button" onClick={() => setI((x) => Math.max(0, x - 1))} className="rounded-full border-2 border-bg-elevated/40 p-3" aria-label="Previous slide">
          <ChevronLeft className="size-6" aria-hidden />
        </button>
        <button type="button" onClick={() => setI((x) => Math.min(slides.length - 1, x + 1))} className="rounded-full border-2 border-gold bg-gold p-3 text-ink" aria-label="Next slide">
          <ChevronRight className="size-6" aria-hidden />
        </button>
      </div>
    </div>
  );
}
