import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Info } from "lucide-react";
import { Card } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { FormMessages, Loading } from "@/components/ui/feedback";
import { Choice, Field, Input } from "@/components/ui/input";
import { Stamp } from "@/components/ui/stamp";
import { StepHeader } from "@/components/shell/StepHeader";
import { useStudioWorkspace } from "@/hooks/workspace-context";
import { outboxAll } from "@/lib/offline/idb";
import { saveSimDecisions } from "@/lib/offline/actions";
import { isEffectivelyOnline, subscribeConnection } from "@/lib/offline/status";
import {
  getSimulation,
  getSimulationPeriod,
  startGroupSimulation,
  type SimulationPageData,
} from "@/lib/server/simulation";
import { buildDecisions, initialForm, type DecisionForm } from "@/lib/simulation/form";
import type { SimulationView } from "@/lib/simulation/service";
import { formatGhs, type StudentPeriodView } from "@/sim/index";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/studio/simulation")({ component: SimulationPage });

type Step = "market" | "decide" | "results";

function SimulationPage() {
  const { data: workspace, refresh: refreshWorkspace } = useStudioWorkspace();
  const [page, setPage] = useState<SimulationPageData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingPeriod, setPendingPeriod] = useState<number | null>(null);
  const [step, setStep] = useState<Step>("market");

  const load = useCallback(async () => {
    setError(null);
    try {
      if (!(await isEffectivelyOnline())) {
        setError("You are offline. The simulation needs a connection to show results; decisions you submit will be sent when you reconnect.");
      } else {
        const next = await getSimulation();
        setPage(next);
        // Once results exist for a queued submission, it is no longer pending.
        if (next.view && pendingPeriod !== null && next.view.completedPeriod >= pendingPeriod) {
          setPendingPeriod(null);
          setStep("results");
        }
      }
      const queued = (await outboxAll()).find((i) => i.type === "submit_sim_decisions");
      if (queued) {
        const p = queued.payload as { decisions?: { period?: number } };
        setPendingPeriod(p.decisions?.period ?? null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the simulation.");
    }
  }, [pendingPeriod]);

  useEffect(() => {
    void load();
    return subscribeConnection(() => void load());
  }, [load]);

  const ventureName = workspace?.venture?.name ?? null;

  if (!page) {
    return error ? (
      <div>
        <StepHeader step="simulate" title="Run the venture" />
        <FormMessages error={error} />
      </div>
    ) : (
      <Loading />
    );
  }

  if (!page.view) {
    return (
      <StartCard
        page={page}
        ventureName={ventureName}
        onStarted={() => void Promise.all([load(), refreshWorkspace()])}
      />
    );
  }

  const view = page.view;
  return (
    <div className="space-y-5 pt-2">
      <StatusHeader view={view} pendingPeriod={pendingPeriod} ventureName={ventureName} />
      <FormMessages error={error} />
      <nav aria-label="This week" className="sticky top-16 z-20 grid grid-cols-3 gap-1 rounded-full bg-bg-subtle/95 p-1 backdrop-blur-md">
        {(
          [
            ["market", "1 · Market"],
            ["decide", "2 · Decide"],
            ["results", "3 · Results"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setStep(id)}
            aria-current={step === id ? "step" : undefined}
            className={cn(
              "min-h-11 rounded-full text-sm font-semibold transition-colors",
              step === id ? "bg-ink text-white" : "text-muted",
            )}
          >
            {label}
          </button>
        ))}
      </nav>
      {step === "market" ? <MarketStep view={view} onNext={() => setStep("decide")} /> : null}
      {step === "decide" ? (
        <DecideStep
          view={view}
          pendingPeriod={pendingPeriod}
          onSubmitted={(queuedPeriod) => {
            if (queuedPeriod !== null) setPendingPeriod(queuedPeriod);
            else setStep("results");
            void Promise.all([load(), refreshWorkspace()]);
          }}
        />
      ) : null}
      {step === "results" ? <ResultsStep view={view} /> : null}
    </div>
  );
}

function StartCard({
  page,
  ventureName,
  onStarted,
}: {
  page: SimulationPageData;
  ventureName: string | null;
  onStarted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <StepHeader
        step="simulate"
        title="Run the venture"
        lead="Your group runs a small business in a simulated market, one week at a time. Each week you set a price, order stock and spend on marketing. The market answers, and the cash is real to the simulation."
      />
      <PracticeBridge ventureName={ventureName} />
      <Card className="mt-4 space-y-3">
        <ul className="space-y-2 text-sm leading-6 text-ink-soft">
          <li>
            <strong className="text-ink">Decisions lock.</strong> Once someone in the group submits a week, it cannot be
            changed.
          </li>
          <li>
            <strong className="text-ink">The server does the maths.</strong> Every number comes with an explanation you can
            open.
          </li>
          <li>
            <strong className="text-ink">Running out of cash is allowed.</strong> Working out why is the lesson.
          </li>
        </ul>
        {page.blockedReason ? (
          <p className="rounded-[14px] bg-gold-soft px-3 py-2 text-sm text-gold-deep">{page.blockedReason}</p>
        ) : null}
        <FormMessages error={error} />
        {page.canStart ? (
          <Button
            size="lg"
            className="w-full"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setError(null);
              startGroupSimulation()
                .then(onStarted)
                .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not start."))
                .finally(() => setBusy(false));
            }}
          >
            {busy ? "Starting…" : "Launch the venture"}
          </Button>
        ) : (
          <Link to="/studio/select" className={cn(buttonVariants({ variant: "secondary", size: "lg" }), "w-full")}>
            Pick a venture first <ArrowRight className="size-4" aria-hidden />
          </Link>
        )}
      </Card>
    </div>
  );
}

/**
 * Students arrive here having chosen their own problem (a shuttle queue,
 * print shops...) and meet a food stall. Say so plainly, and say why, so
 * the switch does not read as their work being thrown away.
 */
function PracticeBridge({ ventureName, compact = false }: { ventureName: string | null; compact?: boolean }) {
  if (compact) {
    return (
      <p className="flex items-start gap-2 text-xs leading-5 text-muted">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        A practice market for the money side of {ventureName ?? "your venture"}. Keep testing the real idea in your
        notebook.
      </p>
    );
  }
  return (
    <div className="note p-4">
      <p className="text-xs font-semibold text-muted">Why a food stall?</p>
      <p className="mt-1 text-[15px] leading-6">
        {ventureName ? (
          <>
            You will not simulate <strong>{ventureName}</strong> itself. Everyone practises on the same campus food stall,
            so groups can be compared fairly and nobody is judged on how well a made-up market fits their idea.
          </>
        ) : (
          <>
            Everyone practises on the same campus food stall, so groups can be compared fairly and nobody is judged on how
            well a made-up market fits their idea.
          </>
        )}
      </p>
      <p className="mt-2 text-sm leading-6 text-ink-soft">
        The levers are the ones every venture needs: price against cost, stock against demand, and cash against time. Keep
        logging evidence for your own idea in the notebook alongside.
      </p>
    </div>
  );
}

function StatusHeader({
  view,
  pendingPeriod,
  ventureName,
}: {
  view: SimulationView;
  pendingPeriod: number | null;
  ventureName: string | null;
}) {
  const label = view.market.periodLabel;
  const finished = view.completedPeriod >= view.periodCount || view.status === "exited";
  let todo: string;
  if (pendingPeriod !== null) todo = `Your ${label} ${pendingPeriod} decisions are saved on this phone. Results come once you are back online.`;
  else if (finished) todo = "All weeks are done. Look back over your results.";
  else if (view.nextPeriod) todo = `Look at the market, then decide ${label} ${view.nextPeriod}.`;
  else if (view.cohortStatus !== "running") todo = "Your lecturer has paused the simulation.";
  else todo = `${label[0].toUpperCase()}${label.slice(1)} ${view.completedPeriod + 1} is not open yet.`;
  const current = Math.min(view.completedPeriod + (finished ? 0 : 1), view.periodCount);
  return (
    <div className="space-y-3">
      <div className="rounded-[24px] bg-ink p-5 text-white shadow-[0_18px_40px_-24px_rgba(17,17,17,0.7)]">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-white/60">
            {view.market.scenarioName} · {label} {current} of {view.periodCount}
          </p>
          {view.status === "cash_out" ? (
            <Stamp tone="clay" size="xs">out of cash</Stamp>
          ) : view.status === "exited" ? (
            <Stamp tone="muted" size="xs">closed</Stamp>
          ) : (
            <Stamp tone="gold" size="xs">trading</Stamp>
          )}
        </div>
        <p className="mt-3 text-xs text-white/60">Cash now</p>
        <p className={cn("font-display text-[32px] leading-none font-extrabold whitespace-nowrap tabular-nums sm:text-[40px]", view.cash < 0 && "text-clay")}>
          {formatGhs(view.cash)}
        </p>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-sm">
          {view.market.products.map((p) => (
            <span key={p.id} className="text-white/80">
              {p.name}: <strong className="font-mono text-white tabular-nums">{view.stock[p.id] ?? 0}</strong> in stock
            </span>
          ))}
        </div>
        <ol className="mt-4 flex gap-1.5" aria-label={`${label}s`}>
          {Array.from({ length: view.periodCount }, (_, i) => (
            <li
              key={i}
              aria-label={`${label} ${i + 1}${i < view.completedPeriod ? " done" : i + 1 === current && !finished ? " now" : ""}`}
              className={cn(
                "h-1.5 flex-1 rounded-full",
                i < view.completedPeriod ? "bg-gold" : i + 1 === current && !finished ? "bg-white" : "bg-white/20",
              )}
            />
          ))}
        </ol>
      </div>
      <p className="text-[15px] font-semibold">{todo}</p>
      <PracticeBridge ventureName={ventureName} compact />
      {view.status === "cash_out" ? (
        <p className="rounded-[14px] bg-clay-soft px-3 py-2 text-sm leading-6 text-clay">
          The venture could not pay what it owed. This is not the end of the course: look at the warning signs in your
          results and work out what caused it. (Post-mortem, restart and pivot arrive in a later release.)
        </p>
      ) : null}
    </div>
  );
}

function MarketStep({ view, onNext }: { view: SimulationView; onNext: () => void }) {
  const m = view.market;
  const awaiting = view.latest?.events.filter((e) => e.availableResponses.length) ?? [];
  return (
    <div className="space-y-4">
      <Card className="space-y-2">
        <h2 className="font-display text-xl font-bold">The market</h2>
        <p className="text-[15px] leading-6 text-ink-soft">{m.description}</p>
        <p className="text-sm text-muted">Customers: {m.segments.map((s) => s.name).join(", ")}.</p>
      </Card>
      {awaiting.length ? (
        <Card className="space-y-2 border-clay bg-clay-soft/40">
          <h2 className="font-display text-xl font-bold">Something happened: respond this week</h2>
          {awaiting.map((e) => (
            <p key={e.instanceId} className="text-sm">
              <strong>{e.name}.</strong> {e.description} Choose your response in the Decide step.
            </p>
          ))}
        </Card>
      ) : null}
      <Card className="space-y-3">
        <h2 className="font-display text-xl font-bold">Suppliers</h2>
        <ul className="divide-y divide-line">
          {m.suppliers.map((s) => (
            <li key={s.id} className="py-3 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{s.name}</span>
                <Stamp tone={s.informal ? "gold" : "indigo"} size="xs">
                  {s.informal ? "informal" : "registered"}
                </Stamp>
              </div>
              <dl className="mt-2 grid grid-cols-3 gap-2">
                {m.qualityTiers.map((t) => (
                  <div key={t.id} className="rounded-[12px] bg-bg-subtle px-2.5 py-2">
                    <dt className="text-[11px] font-semibold text-muted">{t.label}</dt>
                    <dd className="font-mono text-sm tabular-nums">
                      {formatGhs(s.unitPrice[m.products[0].id]?.[t.id] ?? 0)}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="mt-2 text-xs text-muted">
                Delivers {s.leadTimePeriods === 0 ? "the same week" : `after ${s.leadTimePeriods} ${m.periodLabel}`} · up to{" "}
                <span className="font-mono tabular-nums">{s.capacityUnits}</span> units
              </p>
            </li>
          ))}
        </ul>
        <p className="text-xs leading-5 text-muted">
          Prices are per unit. Stock is paid for when it arrives. Unsold food spoils, and a supplier may not always deliver
          everything you order.
        </p>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="space-y-2">
          <h2 className="font-display text-xl font-bold">Competitors</h2>
          <ul className="space-y-1 text-sm">
            {m.competitors.map((c) => (
              <li key={c.id} className="flex justify-between gap-2">
                <span>{c.name}</span>
                <span className="font-mono tabular-nums text-muted">{c.price === null ? "—" : formatGhs(c.price)}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-faint">Prices you would see if you walked past this {m.periodLabel}.</p>
        </Card>
        <Card className="space-y-2">
          <h2 className="font-display text-xl font-bold">Your costs each {m.periodLabel}</h2>
          <ul className="space-y-1 text-sm">
            {m.fixedCosts.map((f) => (
              <li key={f.label} className="flex justify-between gap-2">
                <span>{f.label}</span>
                <span className="font-mono tabular-nums text-muted">{formatGhs(f.amount)}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-faint">You can prepare at most {m.capacityUnitsPerPeriod} units a {m.periodLabel}.</p>
        </Card>
      </div>
      {view.nextPeriod ? (
        <Button size="lg" className="w-full" onClick={onNext}>
          Decide {m.periodLabel} {view.nextPeriod} <ArrowRight className="size-4" aria-hidden />
        </Button>
      ) : null}
    </div>
  );
}

function DecideStep({
  view,
  pendingPeriod,
  onSubmitted,
}: {
  view: SimulationView;
  pendingPeriod: number | null;
  onSubmitted: (queuedPeriod: number | null) => void;
}) {
  const m = view.market;
  const [form, setForm] = useState<DecisionForm>(() =>
    initialForm(m.products, { qualityTier: m.qualityTiers[1]?.id ?? m.qualityTiers[0].id, supplierId: m.suppliers[0].id, price: 2500 }, view.lastDecisions),
  );
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const awaiting = view.latest?.events.filter((e) => e.availableResponses.length) ?? [];
  const period = view.nextPeriod;
  const names = useMemo(() => Object.fromEntries(m.products.map((p) => [p.id, p.name])), [m.products]);

  if (pendingPeriod !== null) {
    return (
      <p className="rounded-[14px] bg-gold-soft px-4 py-3 text-sm leading-6 text-gold-deep">
        Your decisions for {m.periodLabel} {pendingPeriod} are saved on this phone and will send when you are back online.
        Results appear after that.
      </p>
    );
  }
  if (!period) {
    return (
      <p className="rounded-[16px] bg-bg-subtle px-4 py-5 text-center text-sm text-muted">
        There is no {m.periodLabel} open for decisions right now.
      </p>
    );
  }

  const built = buildDecisions(period, form, names);
  const orderCost = m.products.reduce((a, p) => {
    const f = form.products[p.id];
    const unit = m.suppliers.find((s) => s.id === f.supplierId)?.unitPrice[p.id]?.[f.qualityTier] ?? 0;
    return a + unit * (Number(f.units) || 0);
  }, 0);

  const setProduct = (pid: string, key: keyof DecisionForm["products"][string], value: string) =>
    setForm((f) => ({ ...f, products: { ...f.products, [pid]: { ...f.products[pid], [key]: value } } }));

  async function submit() {
    if (!built.ok) return;
    setBusy(true);
    setErrors([]);
    try {
      const r = await saveSimDecisions({ simulationId: view.simulationId, decisions: built.decisions });
      onSubmitted(r.queued ? period : null);
    } catch (err) {
      setErrors([err instanceof Error ? err.message : "Could not submit."]);
      setReviewing(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {m.products.map((p) => {
        const f = form.products[p.id];
        return (
          <Card key={p.id} className="space-y-3">
            <h2 className="font-display text-xl font-bold">{p.name}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={`Price per ${p.unit} (GHS)`}>
                <Input inputMode="decimal" value={f.price} onChange={(e) => setProduct(p.id, "price", e.target.value)} />
              </Field>
              <Field label={`Units to order (you have ${view.stock[p.id] ?? 0})`}>
                <Input inputMode="numeric" value={f.units} onChange={(e) => setProduct(p.id, "units", e.target.value)} />
              </Field>
            </div>
            <Choice
              label="Quality"
              value={f.qualityTier}
              options={m.qualityTiers.map((t) => ({ value: t.id, label: t.label }))}
              onChange={(v) => setProduct(p.id, "qualityTier", v)}
            />
            <Choice
              label="Supplier"
              value={f.supplierId}
              options={m.suppliers.map((sp) => ({
                value: sp.id,
                label: `${sp.name} · ${formatGhs(sp.unitPrice[p.id]?.[f.qualityTier] ?? 0)}`,
              }))}
              onChange={(v) => setProduct(p.id, "supplierId", v)}
            />
          </Card>
        );
      })}
      <Card className="space-y-3">
        <h2 className="font-display text-xl font-bold">Marketing</h2>
        <Field label={`Marketing spend this ${m.periodLabel} (GHS)`} hint="Flyers, WhatsApp status, samples. It raises awareness; it does not guarantee sales.">
          <Input inputMode="decimal" value={form.marketing} onChange={(e) => setForm((f) => ({ ...f, marketing: e.target.value }))} />
        </Field>
      </Card>
      {awaiting.map((e) => (
        <Card key={e.instanceId} className="space-y-2">
          <h2 className="font-display text-xl font-bold">{e.name}</h2>
          <p className="text-sm leading-6 text-ink-soft">{e.description}</p>
          <fieldset className="space-y-2">
            <legend className="text-xs text-faint">
              Choose a response. If you choose nothing, the default applies. You cannot change it later.
            </legend>
            {e.availableResponses.map((r) => (
              <label
                key={r.id}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-[14px] border p-3 text-sm leading-6",
                  form.eventResponses[e.instanceId] === r.id ? "border-ink bg-bg-subtle" : "border-line",
                )}
              >
                <input
                  className="mt-1.5 size-4 accent-[var(--color-ink)]"
                  type="radio"
                  name={e.instanceId}
                  checked={form.eventResponses[e.instanceId] === r.id}
                  onChange={() => setForm((f) => ({ ...f, eventResponses: { ...f.eventResponses, [e.instanceId]: r.id } }))}
                />
                <span>
                  <strong>{r.label}</strong> ({formatGhs(r.cost)}) — {r.description}
                </span>
              </label>
            ))}
          </fieldset>
        </Card>
      ))}
      {!built.ok ? (
        <ul className="space-y-1 rounded-[14px] bg-clay-soft px-3 py-2 text-sm text-clay" aria-live="polite">
          {built.errors.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      ) : null}
      <FormMessages error={errors[0] ?? null} />
      {reviewing && built.ok ? (
        <Card className="flow-enter space-y-3 border-ink">
          <h2 className="font-display text-xl font-bold">Submit {m.periodLabel} {period}?</h2>
          <p className="text-sm">
            Stock ordered costs about <strong>{formatGhs(orderCost)}</strong> plus <strong>{formatGhs(built.decisions.marketingBudget)}</strong> of
            marketing, against <strong>{formatGhs(view.cash)}</strong> cash. Rent and wages are due as well.
          </p>
          <p className="text-xs text-muted">
            Submitting locks these decisions for your whole group. Until your group elects a leader (coming soon), any member
            can submit.
          </p>
          <div className="flex flex-col gap-2">
            <Button size="lg" className="w-full" disabled={busy} onClick={() => void submit()}>
              {busy ? "Submitting…" : `Submit and lock ${m.periodLabel} ${period}`}
            </Button>
            <Button variant="secondary" className="w-full" onClick={() => setReviewing(false)}>
              Keep editing
            </Button>
          </div>
        </Card>
      ) : (
        <Button size="lg" className="w-full" disabled={!built.ok} onClick={() => setReviewing(true)}>
          Review before submitting
        </Button>
      )}
    </div>
  );
}

function ResultsStep({ view }: { view: SimulationView }) {
  const latestPeriod = view.latest?.period ?? null;
  const [selected, setSelected] = useState<number | null>(latestPeriod);
  const [fetched, setFetched] = useState<StudentPeriodView | null>(null);
  const [showTrail, setShowTrail] = useState(false);
  const label = view.market.periodLabel;

  // This step can open before a just-submitted period's results arrive:
  // jump to each new period as it lands.
  useEffect(() => {
    setSelected(latestPeriod);
  }, [latestPeriod]);

  // Earlier periods are fetched on demand. A response that arrives after the
  // selection has moved on is dropped, so it can never overwrite the view.
  useEffect(() => {
    if (selected === null || selected === latestPeriod) return;
    let live = true;
    void getSimulationPeriod({ data: { period: selected } }).then((d) => {
      if (live) setFetched(d);
    });
    return () => {
      live = false;
    };
  }, [selected, latestPeriod]);

  const detail = selected === latestPeriod ? view.latest : fetched?.period === selected ? fetched : null;

  if (!view.periods.length) {
    return (
      <p className="rounded-[16px] bg-bg-subtle px-4 py-5 text-center text-sm text-muted">
        No results yet. Submit your first {label}’s decisions to see what happens.
      </p>
    );
  }
  if (!detail) return <Loading />;
  const o = detail.outcomes;
  const kpis: [string, string, boolean?][] = [
    ["Revenue", formatGhs(o.revenue)],
    ["Profit", formatGhs(o.profit), o.profit < 0],
    ["Cash change", formatGhs(o.netCashFlow), o.netCashFlow < 0],
    ["Sold / wanted", `${o.unitsSold} / ${o.unitsDemanded}`],
    ["Customers", String(o.customers)],
    ["Market share", `${(o.marketShare * 100).toFixed(1)}%`],
  ];
  return (
    <div className="space-y-4">
      <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label={`Choose a ${label}`}>
        {view.periods.map((p) => (
          <button
            key={p.period}
            type="button"
            role="tab"
            aria-selected={selected === p.period}
            onClick={() => setSelected(p.period)}
            className={cn(
              "min-h-10 shrink-0 rounded-full border px-4 text-sm font-semibold capitalize",
              selected === p.period ? "border-ink bg-ink text-white" : "border-line-strong bg-bg-elevated text-ink-soft",
            )}
          >
            {label} {p.period}
          </button>
        ))}
      </div>
      <Card className="space-y-3">
        <h2 className="font-display text-xl font-bold">
          What happened in {label} {detail.period}
        </h2>
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {kpis.map(([k, v, bad]) => (
            <div key={k} className={cn("rounded-[14px] px-3 py-2.5", bad ? "bg-clay-soft" : "bg-bg-subtle")}>
              <dt className="text-xs font-semibold text-muted">{k}</dt>
              <dd className={cn("font-mono text-[15px] font-medium tabular-nums", bad && "text-clay")}>{v}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs leading-5 text-muted">
          Cash and profit are not the same: stock is paid for when bought but counted as a cost when sold or spoiled.
          {o.breakEvenUnits !== null ? ` Break-even this ${label}: about ${o.breakEvenUnits} units.` : " At this price, no volume breaks even."}
        </p>
      </Card>
      {detail.events.length ? (
        <Card className="space-y-2">
          <h2 className="font-display text-xl font-bold">What happened around you</h2>
          {detail.events.map((e) => (
            <p key={e.instanceId} className="text-sm">
              <strong>{e.name}</strong> ({e.status}){e.response ? ` — response: ${e.response}${e.responseWasDefault ? " (default, none chosen)" : ""}` : ""}. {e.description}
            </p>
          ))}
        </Card>
      ) : null}
      {detail.learningSignals.length ? (
        <Card className="space-y-3">
          <h2 className="font-display text-xl font-bold">Warning signs to talk about</h2>
          {detail.learningSignals.map((s) => (
            <div key={s.code} className="border-l-4 border-gold pl-3">
              <p className="text-sm font-semibold leading-6">{s.message}</p>
              <p className="text-sm leading-6 text-ink-soft">{s.prompt}</p>
            </div>
          ))}
        </Card>
      ) : null}
      <Card className="space-y-2">
        <button
          type="button"
          className="min-h-11 w-full text-left text-sm font-semibold text-accent"
          onClick={() => setShowTrail((v) => !v)}
          aria-expanded={showTrail}
        >
          {showTrail ? "Hide" : "Show"} how every number was worked out
        </button>
        {showTrail ? (
          <ol className="space-y-1.5 text-sm">
            {detail.explanation.map((l) => (
              <li key={l.id} className="text-ink-soft">
                <span className="mr-1 text-xs uppercase tracking-[0.08em] text-faint">{l.module}</span>
                {l.text}
              </li>
            ))}
          </ol>
        ) : null}
      </Card>
      <Card className="space-y-2">
        <h2 className="font-display text-xl font-bold">
          All {label}s so far
        </h2>
        <ul className="divide-y divide-line">
          {view.periods.map((p) => (
            <li key={p.period} className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 py-2.5">
              <span className="flex size-9 items-center justify-center rounded-full bg-bg-subtle font-mono text-sm font-medium">
                {p.period}
              </span>
              <span className="min-w-0 text-xs leading-5 text-muted">
                Revenue <span className="font-mono text-ink tabular-nums">{formatGhs(p.outcomes.revenue)}</span>
                <br />
                Profit{" "}
                <span className={cn("font-mono tabular-nums", p.outcomes.profit < 0 ? "text-clay" : "text-ink")}>
                  {formatGhs(p.outcomes.profit)}
                </span>
                {p.submittedBy ? <span className="block truncate">by {p.submittedBy}</span> : null}
              </span>
              <span className="text-right">
                <span className="block text-[11px] font-semibold text-muted">Cash at end</span>
                <span className={cn("font-mono text-sm font-medium tabular-nums", p.outcomes.closingCash < 0 && "text-clay")}>
                  {formatGhs(p.outcomes.closingCash)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
