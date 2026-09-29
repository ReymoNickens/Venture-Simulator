import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Card } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
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

const SELECT =
  "h-11 w-full rounded-[10px] border border-line bg-bg-elevated px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40";

function SimulationPage() {
  const { refresh: refreshWorkspace } = useStudioWorkspace();
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

  if (!page) {
    return error ? (
      <Card>
        <p className="text-sm text-muted">{error}</p>
      </Card>
    ) : (
      <div className="h-40 animate-pulse rounded-[28px] bg-bg-subtle" />
    );
  }

  if (!page.view) {
    return <StartCard page={page} onStarted={() => void Promise.all([load(), refreshWorkspace()])} />;
  }

  const view = page.view;
  return (
    <div className="space-y-5">
      <StatusHeader view={view} pendingPeriod={pendingPeriod} />
      {error ? <p className="text-sm text-bad">{error}</p> : null}
      <nav aria-label="Period steps" className="flex gap-2">
        {(
          [
            ["market", "1. Market"],
            ["decide", "2. Decide & submit"],
            ["results", "3. Results"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setStep(id)}
            aria-current={step === id ? "step" : undefined}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs",
              step === id ? "border-ink/20 bg-bg-elevated text-ink" : "border-transparent text-faint",
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

function StartCard({ page, onStarted }: { page: SimulationPageData; onStarted: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Card className="space-y-3">
      <h1 className="font-display text-2xl">Run your venture</h1>
      <p className="text-sm leading-6 text-muted">
        Your group launches the venture into a simulated market for a number of weeks. Each week you set prices, order stock
        and spend on marketing; the market responds. Results are computed on the server, and decisions are final once
        submitted.
      </p>
      {page.blockedReason ? <p className="text-sm text-warn">{page.blockedReason}</p> : null}
      {error ? <p className="text-sm text-bad">{error}</p> : null}
      {page.canStart ? (
        <Button
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
        <Link to="/studio/select" className="text-sm text-accent">
          Go to venture selection
        </Link>
      )}
    </Card>
  );
}

function StatusHeader({ view, pendingPeriod }: { view: SimulationView; pendingPeriod: number | null }) {
  const label = view.market.periodLabel;
  const finished = view.completedPeriod >= view.periodCount || view.status === "exited";
  let todo: string;
  if (pendingPeriod !== null) todo = `Your ${label} ${pendingPeriod} decisions are saved on this device. Results are pending until you reconnect.`;
  else if (finished) todo = "The simulation is complete. Review your results.";
  else if (view.nextPeriod) todo = `Study the market, then decide and submit for ${label} ${view.nextPeriod}.`;
  else if (view.cohortStatus !== "running") todo = "Your lecturer has paused the simulation.";
  else todo = `${label[0].toUpperCase()}${label.slice(1)} ${view.completedPeriod + 1} is not open yet.`;
  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={view.status === "cash_out" ? "bad" : "accent"}>{view.status.replace("_", " ")}</Badge>
        <span className="text-xs text-faint">
          {view.market.scenarioName} · {label} {Math.min(view.completedPeriod + (finished ? 0 : 1), view.periodCount)} of {view.periodCount}
        </span>
      </div>
      <p className="text-sm font-medium">{todo}</p>
      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-faint">Cash now</dt>
          <dd className={cn("font-mono tabular-nums", view.cash < 0 && "text-bad")}>{formatGhs(view.cash)}</dd>
        </div>
        {view.market.products.map((p) => (
          <div key={p.id}>
            <dt className="text-xs text-faint">{p.name} in stock</dt>
            <dd className="font-mono tabular-nums">{view.stock[p.id] ?? 0}</dd>
          </div>
        ))}
      </dl>
      {view.status === "cash_out" ? (
        <p className="rounded-[12px] bg-bad-soft px-3 py-2 text-xs leading-5 text-bad">
          The venture could not pay what it owed. This is not the end of the course: look at the signals in your results and
          work out what caused it. (Post-mortem, restart and pivot arrive in a later release.)
        </p>
      ) : null}
    </Card>
  );
}

function MarketStep({ view, onNext }: { view: SimulationView; onNext: () => void }) {
  const m = view.market;
  const awaiting = view.latest?.events.filter((e) => e.availableResponses.length) ?? [];
  return (
    <div className="space-y-4">
      <Card className="space-y-2">
        <h2 className="font-display text-xl">The market</h2>
        <p className="text-sm leading-6 text-muted">{m.description}</p>
        <p className="text-xs text-faint">Customers: {m.segments.map((s) => s.name).join(", ")}.</p>
      </Card>
      {awaiting.length ? (
        <Card className="space-y-2 border-warn/40">
          <h2 className="font-display text-xl">Needs a response</h2>
          {awaiting.map((e) => (
            <p key={e.instanceId} className="text-sm">
              <strong>{e.name}.</strong> {e.description} Choose your response in the Decide step.
            </p>
          ))}
        </Card>
      ) : null}
      <Card className="space-y-3">
        <h2 className="font-display text-xl">Suppliers</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-faint">
              <tr>
                <th className="py-1 pr-3 font-normal">Supplier</th>
                {m.qualityTiers.map((t) => (
                  <th key={t.id} className="py-1 pr-3 font-normal">
                    {t.label} / unit
                  </th>
                ))}
                <th className="py-1 pr-3 font-normal">Delivery</th>
                <th className="py-1 font-normal">Max order</th>
              </tr>
            </thead>
            <tbody>
              {m.suppliers.map((s) => (
                <tr key={s.id} className="border-t border-line">
                  <td className="py-2 pr-3">
                    {s.name} <span className="text-xs text-faint">({s.informal ? "informal" : "registered"})</span>
                  </td>
                  {m.qualityTiers.map((t) => (
                    <td key={t.id} className="py-2 pr-3 font-mono tabular-nums">
                      {formatGhs(s.unitPrice[m.products[0].id]?.[t.id] ?? 0)}
                    </td>
                  ))}
                  <td className="py-2 pr-3">{s.leadTimePeriods === 0 ? "same week" : `after ${s.leadTimePeriods} ${m.periodLabel}`}</td>
                  <td className="py-2 font-mono tabular-nums">{s.capacityUnits}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted">
          Stock is paid for when it arrives. Unsold food spoils, and a supplier may not always deliver everything you order.
        </p>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="space-y-2">
          <h2 className="font-display text-xl">Competitors</h2>
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
          <h2 className="font-display text-xl">Your costs each {m.periodLabel}</h2>
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
      {view.nextPeriod ? <Button onClick={onNext}>Go to decisions</Button> : null}
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
      <Card>
        <p className="text-sm">Your decisions for {m.periodLabel} {pendingPeriod} are waiting to be sent. Results appear once you reconnect.</p>
      </Card>
    );
  }
  if (!period) {
    return (
      <Card>
        <p className="text-sm text-muted">There is no {m.periodLabel} open for decisions right now.</p>
      </Card>
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
            <h2 className="font-display text-xl">{p.name}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={`Price per ${p.unit} (GHS)`}>
                <Input inputMode="decimal" value={f.price} onChange={(e) => setProduct(p.id, "price", e.target.value)} />
              </Field>
              <Field label="Quality">
                <select className={SELECT} value={f.qualityTier} onChange={(e) => setProduct(p.id, "qualityTier", e.target.value)}>
                  {m.qualityTiers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Supplier">
                <select className={SELECT} value={f.supplierId} onChange={(e) => setProduct(p.id, "supplierId", e.target.value)}>
                  {m.suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={`Units to order (you have ${view.stock[p.id] ?? 0})`}>
                <Input inputMode="numeric" value={f.units} onChange={(e) => setProduct(p.id, "units", e.target.value)} />
              </Field>
            </div>
          </Card>
        );
      })}
      <Card className="space-y-3">
        <h2 className="font-display text-xl">Marketing</h2>
        <Field label="Marketing spend this period (GHS)" hint="Flyers, WhatsApp status, samples. It raises awareness; it does not guarantee sales.">
          <Input inputMode="decimal" value={form.marketing} onChange={(e) => setForm((f) => ({ ...f, marketing: e.target.value }))} />
        </Field>
      </Card>
      {awaiting.map((e) => (
        <Card key={e.instanceId} className="space-y-2">
          <h2 className="font-display text-xl">{e.name}</h2>
          <p className="text-sm text-muted">{e.description}</p>
          <fieldset className="space-y-2">
            <legend className="text-xs text-faint">
              Choose a response. If you choose nothing, the default applies. You cannot change it later.
            </legend>
            {e.availableResponses.map((r) => (
              <label key={r.id} className="flex items-start gap-2 text-sm">
                <input
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
        <ul className="space-y-1 text-sm text-bad">
          {built.errors.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      ) : null}
      {errors.map((x) => (
        <p key={x} className="text-sm text-bad">
          {x}
        </p>
      ))}
      {reviewing && built.ok ? (
        <Card className="space-y-3 border-accent/40">
          <h2 className="font-display text-xl">Submit {m.periodLabel} {period}?</h2>
          <p className="text-sm">
            Stock ordered costs about <strong>{formatGhs(orderCost)}</strong> plus <strong>{formatGhs(built.decisions.marketingBudget)}</strong> of
            marketing, against <strong>{formatGhs(view.cash)}</strong> cash. Rent and wages are due as well.
          </p>
          <p className="text-xs text-muted">
            Submitting locks these decisions for your whole group. Until your group elects a leader (coming soon), any member
            can submit.
          </p>
          <div className="flex gap-2">
            <Button disabled={busy} onClick={() => void submit()}>
              {busy ? "Submitting…" : `Submit and lock ${m.periodLabel} ${period}`}
            </Button>
            <Button variant="secondary" onClick={() => setReviewing(false)}>
              Keep editing
            </Button>
          </div>
        </Card>
      ) : (
        <Button disabled={!built.ok} onClick={() => setReviewing(true)}>
          Review decisions
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
      <Card>
        <p className="text-sm text-muted">No results yet. Submit your first {label}'s decisions to see what happens.</p>
      </Card>
    );
  }
  if (!detail) return <div className="h-40 animate-pulse rounded-[28px] bg-bg-subtle" />;
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
      <div className="flex flex-wrap gap-2" role="tablist" aria-label={`Choose a ${label}`}>
        {view.periods.map((p) => (
          <button
            key={p.period}
            type="button"
            role="tab"
            aria-selected={selected === p.period}
            onClick={() => setSelected(p.period)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs",
              selected === p.period ? "border-ink/20 bg-bg-elevated" : "border-transparent text-faint",
            )}
          >
            {label} {p.period}
          </button>
        ))}
      </div>
      <Card className="space-y-3">
        <h2 className="font-display text-xl">
          What happened in {label} {detail.period}
        </h2>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {kpis.map(([k, v, bad]) => (
            <div key={k}>
              <dt className="text-xs text-faint">{k}</dt>
              <dd className={cn("font-mono tabular-nums", bad && "text-bad")}>{v}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-muted">
          Cash and profit are not the same: stock is paid for when bought but counted as a cost when sold or spoiled.
          {o.breakEvenUnits !== null ? ` Break-even this ${label}: about ${o.breakEvenUnits} units.` : " At this price, no volume breaks even."}
        </p>
      </Card>
      {detail.events.length ? (
        <Card className="space-y-2">
          <h2 className="font-display text-xl">Events</h2>
          {detail.events.map((e) => (
            <p key={e.instanceId} className="text-sm">
              <strong>{e.name}</strong> ({e.status}){e.response ? ` — response: ${e.response}${e.responseWasDefault ? " (default, none chosen)" : ""}` : ""}. {e.description}
            </p>
          ))}
        </Card>
      ) : null}
      {detail.learningSignals.length ? (
        <Card className="space-y-3">
          <h2 className="font-display text-xl">Things worth thinking about</h2>
          {detail.learningSignals.map((s) => (
            <div key={s.code} className="space-y-1">
              <p className="text-sm">{s.message}</p>
              <p className="text-sm italic text-muted">{s.prompt}</p>
            </div>
          ))}
        </Card>
      ) : null}
      <Card className="space-y-2">
        <button type="button" className="text-sm font-medium text-accent" onClick={() => setShowTrail((v) => !v)} aria-expanded={showTrail}>
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
        <h2 className="font-display text-xl">All {label}s so far</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-faint">
              <tr>
                <th className="py-1 pr-3 font-normal">{label}</th>
                <th className="py-1 pr-3 font-normal">Revenue</th>
                <th className="py-1 pr-3 font-normal">Profit</th>
                <th className="py-1 pr-3 font-normal">Cash at end</th>
                <th className="py-1 font-normal">Submitted by</th>
              </tr>
            </thead>
            <tbody>
              {view.periods.map((p) => (
                <tr key={p.period} className="border-t border-line">
                  <td className="py-2 pr-3">{p.period}</td>
                  <td className="py-2 pr-3 font-mono tabular-nums">{formatGhs(p.outcomes.revenue)}</td>
                  <td className="py-2 pr-3 font-mono tabular-nums">{formatGhs(p.outcomes.profit)}</td>
                  <td className="py-2 pr-3 font-mono tabular-nums">{formatGhs(p.outcomes.closingCash)}</td>
                  <td className="py-2 text-muted">{p.submittedBy ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
