import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { BigChoice, Question, Stepper } from "./controls";
import { Button } from "@/components/ui/button";
import { FormMessages } from "@/components/ui/feedback";
import { saveSimDecisions } from "@/lib/offline/actions";
import { buildDecisions, initialForm, type DecisionForm } from "@/lib/simulation/form";
import type { SimulationView } from "@/lib/simulation/service";
import { cn } from "@/lib/utils";
import { cap, cedisText, ghs, typedCedis } from "./money";

type Q =
  | { kind: "units" | "quality" | "supplier" | "price"; productId: string }
  | { kind: "marketing" }
  | { kind: "event"; eventId: string }
  | { kind: "review" };

/**
 * Planning a week as a short run of questions, one per screen: how many to
 * make, what quality, who to buy from, what price, how much marketing, and
 * any event to respond to. Each screen carries the one fact needed to
 * answer it. A receipt at the end shows the money before it is locked in.
 */
export function PlanWeek({
  view,
  onDone,
  onCancel,
}: {
  view: SimulationView;
  onDone: (queuedPeriod: number | null) => void;
  onCancel: () => void;
}) {
  const m = view.market;
  const period = view.nextPeriod!;
  const label = m.periodLabel;
  const [form, setForm] = useState<DecisionForm>(() =>
    initialForm(
      m.products,
      { qualityTier: m.qualityTiers[1]?.id ?? m.qualityTiers[0].id, supplierId: m.suppliers[0].id, price: m.products[0]?.startingPrice ?? 2500 },
      view.lastDecisions,
    ),
  );
  const [at, setAt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const awaiting = view.latest?.events.filter((e) => e.availableResponses.length) ?? [];
  const names = useMemo(() => Object.fromEntries(m.products.map((p) => [p.id, p.name])), [m.products]);

  const questions: Q[] = [
    // One supplier (a group's own cost) needs no question.
    ...m.products.flatMap((p) =>
      (m.suppliers.length > 1 ? (["units", "quality", "supplier", "price"] as const) : (["units", "quality", "price"] as const)).map(
        (kind) => ({ kind, productId: p.id }),
      ),
    ),
    { kind: "marketing" },
    ...awaiting.map((e) => ({ kind: "event" as const, eventId: e.instanceId })),
    { kind: "review" },
  ];
  const q = questions[at];
  const isLast = at === questions.length - 1;

  const setProduct = (pid: string, key: keyof DecisionForm["products"][string], value: string) =>
    setForm((f) => ({ ...f, products: { ...f.products, [pid]: { ...f.products[pid], [key]: value } } }));

  const unitCost = (pid: string) => {
    const f = form.products[pid];
    return m.suppliers.find((s) => s.id === f.supplierId)?.unitPrice[pid]?.[f.qualityTier] ?? 0;
  };
  const fixed = m.fixedCosts.reduce((a, c) => a + c.amount, 0);
  const marketing = typedCedis(form.marketing) ?? 0;
  const stockNow = m.products.reduce((a, p) => {
    const f = form.products[p.id];
    const lead = m.suppliers.find((s) => s.id === f.supplierId)?.leadTimePeriods ?? 0;
    return lead === 0 ? a + unitCost(p.id) * (Number(f.units) || 0) : a;
  }, 0);
  const stockLater = m.products.reduce((a, p) => {
    const f = form.products[p.id];
    const lead = m.suppliers.find((s) => s.id === f.supplierId)?.leadTimePeriods ?? 0;
    return lead > 0 ? a + unitCost(p.id) * (Number(f.units) || 0) : a;
  }, 0);
  const goingOut = stockNow + marketing + fixed;
  const left = view.cash - goingOut;

  const built = buildDecisions(period, form, names);

  async function submit() {
    if (!built.ok) return;
    setBusy(true);
    setError(null);
    try {
      const r = await saveSimDecisions({ simulationId: view.simulationId, decisions: built.decisions });
      onDone(r.queued ? period : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not lock in this week.");
      setBusy(false);
    }
  }

  const productOf = (pid: string) => m.products.find((p) => p.id === pid)!;

  return (
    <div className="space-y-5 pt-2">
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={at === 0 ? onCancel : () => setAt(at - 1)} className="flex min-h-11 items-center gap-1.5 text-sm font-bold text-muted">
          <ArrowLeft className="size-4" aria-hidden /> {at === 0 ? "Not now" : "Back"}
        </button>
        <p className="text-sm font-bold">
          Plan {label} {period} · {Math.min(at + 1, questions.length)} of {questions.length}
        </p>
      </div>
      <ol className="flex gap-1" aria-hidden>
        {questions.map((_, i) => (
          <li key={i} className={cn("h-1.5 flex-1 rounded-full", i <= at ? "bg-accent" : "bg-bg-subtle")} />
        ))}
      </ol>

      <div key={at} className="flow-enter min-h-[340px]">
        {q.kind === "units" ? (
          <Question
            title={`How many ${productOf(q.productId).unit}s will you ${m.kind === "service" ? "offer" : "prepare"} this ${label}?`}
            help={
              view.latest
                ? `Last ${label}, ${view.latest.outcomes.unitsDemanded} people wanted one and you sold ${view.latest.outcomes.unitsSold}. You have ${view.stock[q.productId] ?? 0} left.`
                : m.kind === "service"
                  ? `It’s your first ${label}. Any you offer but don’t sell are lost, and you pay for each one you offer.`
                  : `It’s your first ${label}. Some of what you don’t sell goes to waste, so don’t overdo it.`
            }
          >
            <Stepper
              value={form.products[q.productId].units}
              onChange={(v) => setProduct(q.productId, "units", v)}
              step={10}
              presets={[50, 100, 150, 200]}
              max={m.capacityUnitsPerPeriod}
            />
            <p className="text-center text-sm text-muted">You can provide at most {m.capacityUnitsPerPeriod} a {label}.</p>
          </Question>
        ) : null}

        {q.kind === "quality" ? (
          <Question title="What quality?" help={`A better version costs you more per ${productOf(q.productId).unit}. What do you think your customers will pay for?`}>
            <div className="grid gap-2">
              {m.qualityTiers.map((t) => {
                const from = Math.min(...m.suppliers.map((s) => s.unitPrice[q.productId]?.[t.id] ?? Infinity));
                return (
                  <BigChoice
                    key={t.id}
                    selected={form.products[q.productId].qualityTier === t.id}
                    onClick={() => setProduct(q.productId, "qualityTier", t.id)}
                    title={t.label}
                    side={Number.isFinite(from) ? `from ${ghs(from)}` : ""}
                  />
                );
              })}
            </div>
          </Question>
        ) : null}

        {q.kind === "supplier" ? (
          <Question title="Who will you buy from?" help="Some suppliers are cheaper but slower, or may not have everything you ask for.">
            <div className="grid gap-2">
              {m.suppliers.map((s) => (
                <BigChoice
                  key={s.id}
                  selected={form.products[q.productId].supplierId === s.id}
                  onClick={() => setProduct(q.productId, "supplierId", s.id)}
                  title={s.name}
                  side={`${ghs(s.unitPrice[q.productId]?.[form.products[q.productId].qualityTier] ?? 0)} each`}
                  sub={[
                    s.leadTimePeriods === 0 ? "Ready this week" : `Arrives next ${label}, paid then`,
                    `up to ${s.capacityUnits}`,
                    s.informal ? "informal seller" : "registered business",
                  ].join(" · ")}
                />
              ))}
            </div>
          </Question>
        ) : null}

        {q.kind === "price" ? (
          <Question title="What price will you charge?" help={`Each ${productOf(q.productId).unit} costs you ${ghs(unitCost(q.productId))} to provide.`}>
            <Stepper
              value={form.products[q.productId].price}
              onChange={(v) => setProduct(q.productId, "price", v)}
              step={1}
              money
            />
            {(() => {
              const price = typedCedis(form.products[q.productId].price);
              if (price === null) return null;
              const margin = price - unitCost(q.productId);
              return (
                <p className={cn("text-center text-[15px] font-bold", margin < 0 && "text-clay")}>
                  {margin >= 0 ? `You keep ${ghs(margin)} on each one sold` : `You lose ${ghs(-margin)} on each one sold`}
                </p>
              );
            })()}
            {m.competitors.some((c) => c.price !== null) ? (
              <div className="space-y-2">
                <p className="text-center text-sm text-muted">Others nearby charge:</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {m.competitors
                    .filter((c) => c.price !== null)
                    .map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setProduct(q.productId, "price", cedisText(c.price!))}
                        className="min-h-11 rounded-full border-2 border-ink bg-bg-elevated px-3 text-sm font-semibold"
                      >
                        {c.name} · {ghs(c.price!)}
                      </button>
                    ))}
                </div>
              </div>
            ) : null}
          </Question>
        ) : null}

        {q.kind === "marketing" ? (
          <Question title="How much on marketing?" help="Flyers, WhatsApp status, free samples. It helps people find you; it doesn’t guarantee they buy.">
            <Stepper value={form.marketing} onChange={(v) => setForm((f) => ({ ...f, marketing: v }))} step={10} presets={[0, 50, 100, 200]} money />
          </Question>
        ) : null}

        {q.kind === "event" ? (
          (() => {
            const e = awaiting.find((x) => x.instanceId === q.eventId)!;
            return (
              <Question title={`Something happened: ${e.name}`} help={e.description}>
                <div className="grid gap-2">
                  {e.availableResponses.map((r) => (
                    <BigChoice
                      key={r.id}
                      selected={form.eventResponses[e.instanceId] === r.id}
                      onClick={() => setForm((f) => ({ ...f, eventResponses: { ...f.eventResponses, [e.instanceId]: r.id } }))}
                      title={r.label}
                      side={r.cost ? ghs(r.cost) : "free"}
                      sub={r.description}
                    />
                  ))}
                </div>
                <p className="text-sm text-muted">If you don’t choose, the default happens.</p>
              </Question>
            );
          })()
        ) : null}

        {q.kind === "review" ? (
          <div className="space-y-4">
            <h2 className="font-display text-[28px] leading-tight font-extrabold">
              Your plan for <span className="mark">{cap(label)} {period}</span>
            </h2>
            <div className="paper rounded-[18px] p-4">
              <div className="space-y-2 text-[15px]">
                {m.products.map((p) => {
                  const f = form.products[p.id];
                  const tier = m.qualityTiers.find((t) => t.id === f.qualityTier)?.label;
                  const sup = m.suppliers.find((s) => s.id === f.supplierId)?.name;
                  return (
                    <div key={p.id} className="space-y-2">
                      <Row left={`${Number(f.units) || 0} ${p.unit}s (${tier}${m.suppliers.length > 1 ? `, ${sup}` : ""})`} right={ghs(unitCost(p.id) * (Number(f.units) || 0))} />
                      <Row left={`Selling at`} right={`${ghs(typedCedis(f.price) ?? 0)} each`} muted />
                    </div>
                  );
                })}
                <Row left="Marketing" right={ghs(marketing)} />
                {m.fixedCosts.map((c) => (
                  <Row key={c.label} left={c.label} right={ghs(c.amount)} />
                ))}
              </div>
              <div className="mt-3 space-y-1 border-t-2 border-dashed border-ink/30 pt-3 text-[15px]">
                <Row left="Cash in the box now" right={ghs(view.cash)} />
                <Row left="Cash left before you sell anything" right={ghs(left)} bold danger={left < 0} />
                {stockLater ? <Row left={`Paid next ${label} when stock arrives`} right={ghs(stockLater)} muted /> : null}
              </div>
            </div>
            {left < 0 ? (
              <p className="rounded-[14px] bg-clay-soft px-3 py-2 text-sm leading-6 text-clay">
                This spends more than you have. You can still lock it in, but if sales don’t cover the gap, the stall runs
                out of cash.
              </p>
            ) : null}
            {!built.ok ? (
              <ul className="space-y-1 rounded-[14px] bg-clay-soft px-3 py-2 text-sm text-clay">
                {built.errors.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            ) : null}
            <FormMessages error={error} />
            <p className="text-sm text-muted">Locking in counts for your whole group, and it can’t be changed.</p>
          </div>
        ) : null}
      </div>

      {isLast ? (
        <Button size="lg" className="w-full" disabled={busy || !built.ok} onClick={() => void submit()}>
          {busy ? "Locking in…" : `Lock in ${label} ${period}`}
        </Button>
      ) : (
        <Button size="lg" className="w-full" onClick={() => setAt(at + 1)}>
          Next <ArrowRight className="size-4" aria-hidden />
        </Button>
      )}
      {!isLast ? (
        <p className="text-center text-sm text-muted">
          Cash {ghs(view.cash)} · this plan spends about {ghs(goingOut)} this {label}
        </p>
      ) : null}
    </div>
  );
}

function Row({ left, right, bold, muted, danger }: { left: string; right: string; bold?: boolean; muted?: boolean; danger?: boolean }) {
  return (
    <div className={cn("flex justify-between gap-3", muted && "text-muted", bold && "font-bold")}>
      <span className="min-w-0">{left}</span>
      <span className={cn("shrink-0 tabular-nums", danger && "text-clay")}>{right}</span>
    </div>
  );
}
