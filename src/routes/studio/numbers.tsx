import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronDown, Plus, Trash2, TriangleAlert } from "lucide-react";
import { useStudioWorkspace } from "@/hooks/workspace-context";
import { useAction } from "@/hooks/use-action";
import { saveFinanceModel } from "@/lib/server/venture-work";
import {
  computeFinance,
  formatCedis,
  parseFinanceInputs,
  type CostLine,
  type FinanceInputs,
  type FinanceResult,
} from "@/lib/domain/finance";
import type { EvidenceItem } from "@/lib/domain/types";
import { StageHeader } from "@/components/stage/StageHeader";
import { Reflect } from "@/components/stage/Reflect";
import { NeedsVenture } from "@/components/stage/NeedsVenture";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { FormMessages, Loading } from "@/components/ui/feedback";
import { newId, cn } from "@/lib/utils";
import { shortDateTime } from "@/lib/dates";

export const Route = createFileRoute("/studio/numbers")({ component: NumbersPage });

function NumbersPage() {
  const { data, loading, refresh } = useStudioWorkspace();
  if (loading || !data) return <Loading />;
  if (!data.venture) return <NeedsVenture />;
  return (
    <div className="space-y-6">
      <StageHeader stage="numbers" data={data} />
      <Editor
        key={data.work.finance?.id ?? "new"}
        initial={parseFinanceInputs(data.work.finance?.inputs)}
        evidence={data.evidence}
        saved={data.work.finance}
        onSaved={() => void refresh()}
      />
      <Reflect
        stage="numbers"
        data={data}
        prompt="Which number are you least sure of — and where would you go to check it?"
        onSaved={() => void refresh()}
      />
    </div>
  );
}

function Editor({
  initial,
  evidence,
  saved,
  onSaved,
}: {
  initial: FinanceInputs;
  evidence: EvidenceItem[];
  saved: { authorName: string; createdAt: string; versions: number; note: string } | null;
  onSaved: () => void;
}) {
  const [f, setF] = useState<FinanceInputs>(initial);
  const [show, setShow] = useState<"receipt" | "warnings" | null>(null);
  const result = useMemo(() => computeFinance(f), [f]);
  const { pending, error, notice, run } = useAction();
  const set = <K extends keyof FinanceInputs>(k: K, v: FinanceInputs[K]) => setF((x) => ({ ...x, [k]: v }));

  const sum = (ls: CostLine[]) => ls.reduce((n, l) => n + (l.amount || 0), 0);
  return (
    <div className="space-y-4">
      <section className="rounded-[28px] bg-ink p-6 text-white">
        <p className="text-sm text-white/60">Break-even</p>
        <p className="font-display text-[40px] leading-none font-extrabold">
          {result.breakEvenUnits === null ? "Not yet" : `${result.breakEvenUnits} a month`}
        </p>
        <p className="mt-2 text-[15px] text-white/75">
          {f.price > 0
            ? `At ${formatCedis(f.price)} each, you keep ${formatCedis(result.contributionPerUnit)} per sale. Monthly profit at your expected sales: ${formatCedis(result.monthlyProfit)}.`
            : "Set a price and your costs to see where you stop losing money."}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => setShow(show === "receipt" ? null : "receipt")} className="rounded-full bg-white/10 px-4 py-2 text-sm font-semibold">
            {show === "receipt" ? "Hide receipt" : "Full receipt"}
          </button>
          {result.warnings.length ? (
            <button type="button" onClick={() => setShow(show === "warnings" ? null : "warnings")} className="rounded-full bg-gold px-4 py-2 text-sm font-semibold text-ink">
              {result.warnings.length} thing{result.warnings.length === 1 ? "" : "s"} to check
            </button>
          ) : null}
        </div>
      </section>
      {show === "receipt" ? (
        <div className="rise space-y-3">
          <Receipt f={f} r={result} />
          <BreakEvenChart r={result} expected={f.expectedUnitsPerMonth} />
        </div>
      ) : null}
      {show === "warnings" ? (
        <ul className="rise space-y-2">
          {result.warnings.map((w) => (
            <li key={w.code} className="flex gap-2 rounded-[18px] bg-gold-soft px-4 py-3 text-sm">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-gold-deep" aria-hidden />
              {w.message}
            </li>
          ))}
        </ul>
      ) : null}

      <Fold title="What you sell" summary={f.price ? `${formatCedis(f.price)} per ${f.unitName || "unit"}` : "Not set"}>
        <Field label="One unit is…" hint="Be concrete: “one plate of kenkey and fish”, “one weekly laundry bag”.">
          <Input value={f.unitName} onChange={(e) => set("unitName", e.target.value)} />
        </Field>
        <Field label="Price per unit (GH₵)">
          <MoneyInput value={f.price} onChange={(v) => set("price", v)} />
        </Field>
        <Field label="Who told you they’d pay this?">
          <EvidenceSelect evidence={evidence} value={f.priceEvidenceId ?? null} onChange={(v) => set("priceEvidenceId", v)} />
        </Field>
      </Fold>
      <Fold title="Cost of each unit" summary={`${formatCedis(sum(f.variableCosts))} · ${f.variableCosts.length} item${f.variableCosts.length === 1 ? "" : "s"}`}>
        <Lines hint="Ingredients, packaging, transport, MoMo charges — per unit sold." lines={f.variableCosts} evidence={evidence} onChange={(v) => set("variableCosts", v)} unit="per unit" />
      </Fold>
      <Fold title="Monthly costs" summary={`${formatCedis(sum(f.fixedCosts))} a month`}>
        <Lines hint="Rent for a stall or space, data bundles, storage — even with no sales." lines={f.fixedCosts} evidence={evidence} onChange={(v) => set("fixedCosts", v)} unit="per month" />
      </Fold>
      <Fold title="Start-up costs" summary={formatCedis(sum(f.startupCosts))}>
        <Lines hint="Equipment, first stock, registration, signage — paid once." lines={f.startupCosts} evidence={evidence} onChange={(v) => set("startupCosts", v)} unit="once" />
      </Fold>
      <Fold title="Expected sales" summary={f.expectedUnitsPerMonth ? `${f.expectedUnitsPerMonth} a month` : "Not set"}>
        <Field label="Units you expect to sell in a normal month" hint="Base it on your interviews and tests, not on hope.">
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            value={f.expectedUnitsPerMonth || ""}
            onChange={(e) => set("expectedUnitsPerMonth", Number(e.target.value) || 0)}
          />
        </Field>
      </Fold>

      <div className="space-y-2 pt-2">
        <FormMessages error={error} notice={notice} />
        <Button
          size="lg"
          className="w-full"
          disabled={Boolean(pending)}
          onClick={() =>
            void run(
              "save",
              async () => {
                await saveFinanceModel({ data: { inputs: JSON.stringify(f), note: "" } });
                onSaved();
              },
              "Saved. Earlier versions are kept.",
            )
          }
        >
          {pending ? "Saving…" : "Save these numbers"}
        </Button>
        {saved ? (
          <p className="text-center text-xs text-muted">
            Last saved by {saved.authorName}, {shortDateTime(saved.createdAt)}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function Fold({ title, summary, children }: { title: string; summary: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <section className={cn("rounded-[22px] bg-bg-elevated ring-1", open ? "ring-ink" : "ring-line")}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{title}</span>
          <span className="block text-sm text-muted">{summary}</span>
        </span>
        <ChevronDown className={cn("size-5 shrink-0 text-muted transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open ? <div className="rise space-y-3 px-4 pb-4">{children}</div> : null}
    </section>
  );
}

function MoneyInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center rounded-[14px] border-2 border-line-strong/70 bg-bg-elevated focus-within:border-accent">
      <span className="pl-3 font-mono text-sm text-muted">GH₵</span>
      <input
        type="number"
        inputMode="decimal"
        step="0.01"
        min={0}
        value={value || ""}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="h-11 w-full bg-transparent px-2 text-[15px] tabular focus:outline-none"
      />
    </div>
  );
}

function EvidenceSelect({
  evidence,
  value,
  onChange,
}: {
  evidence: EvidenceItem[];
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  return (
    <Select value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} className={cn(!value && "text-muted")}>
      <option value="">No source yet</option>
      {evidence.map((e) => (
        <option key={e.id} value={e.id}>
          {e.title.slice(0, 60)}
        </option>
      ))}
    </Select>
  );
}

function Lines({
  hint,
  lines,
  evidence,
  onChange,
  unit,
}: {
  hint: string;
  lines: CostLine[];
  evidence: EvidenceItem[];
  onChange: (v: CostLine[]) => void;
  unit: string;
}) {
  const update = (id: string, patch: Partial<CostLine>) =>
    onChange(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">{hint}</p>
      {lines.map((l) => (
        <div key={l.id} className="grid gap-2 rounded-[14px] border border-line p-2 sm:grid-cols-[1fr_130px_1fr_auto] sm:items-center sm:border-0 sm:p-0">
          <Input aria-label="Cost item" value={l.label} placeholder="Item" onChange={(e) => update(l.id, { label: e.target.value })} />
          <MoneyInput value={l.amount} onChange={(v) => update(l.id, { amount: v })} />
          <EvidenceSelect evidence={evidence} value={l.evidenceId ?? null} onChange={(v) => update(l.id, { evidenceId: v })} />
          <button
            type="button"
            aria-label="Remove line"
            onClick={() => onChange(lines.filter((x) => x.id !== l.id))}
            className="flex size-9 items-center justify-center justify-self-end rounded-[12px] text-muted hover:bg-bg-subtle hover:text-clay"
          >
            <Trash2 className="size-4" aria-hidden />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...lines, { id: newId(), label: "", amount: 0, evidenceId: null }])}
        className="inline-flex items-center gap-1 text-sm font-semibold text-accent"
      >
        <Plus className="size-4" aria-hidden /> Add a cost ({unit})
      </button>
    </div>
  );
}

/** Results printed like a shop receipt — the form every trader already reads. */
function Receipt({ f, r }: { f: FinanceInputs; r: FinanceResult }) {
  const line = (k: string, v: string, strong = false) => (
    <div className={cn("flex justify-between gap-3", strong && "font-semibold")}>
      <span>{k}</span>
      <span className="tabular">{v}</span>
    </div>
  );
  return (
    <div className="relative bg-[#fffdf7] px-4 pt-4 pb-6 font-mono text-[12.5px] leading-6 text-ink shadow-[0_2px_0_rgba(0,0,0,0.06),0_10px_24px_-14px_rgba(0,0,0,0.4)] [mask-image:linear-gradient(#000,#000),radial-gradient(circle_at_6px_100%,transparent_5px,#000_5.5px)] [mask-size:100%_calc(100%-6px),12px_6px] [mask-position:top,bottom] [mask-repeat:no-repeat,repeat-x]">
      <p className="text-center font-semibold tracking-[0.2em] uppercase">*** The numbers ***</p>
      <p className="mb-2 text-center text-[11px] text-muted">{f.unitName || "one unit"}</p>
      {line("Price", formatCedis(f.price))}
      {line("− Cost per unit", formatCedis(r.variableCostPerUnit))}
      <div className="my-1 border-t border-dashed border-ink/40" />
      {line("= Left per sale", formatCedis(r.contributionPerUnit), true)}
      {r.contributionMargin !== null ? line("  margin", `${Math.round(r.contributionMargin * 100)}%`) : null}
      <div className="my-1 border-t border-dashed border-ink/40" />
      {line("Monthly costs", formatCedis(r.fixedPerMonth))}
      {line("Break-even", r.breakEvenUnits === null ? "never" : `${r.breakEvenUnits} units/mo`, true)}
      {line("Expected", `${f.expectedUnitsPerMonth || 0} units/mo`)}
      <div className="my-1 border-t border-dashed border-ink/40" />
      {line("Profit / month", formatCedis(r.monthlyProfit), true)}
      {line("Start-up", formatCedis(r.startupTotal))}
      {line("Payback", r.paybackMonths === null ? "never" : `${r.paybackMonths} months`)}
      <div className="my-1 border-t border-dashed border-ink/40" />
      <p className="text-[11px] text-muted">STRESS TEST</p>
      {line("Costs +15% (cedi)", formatCedis(r.profitIfCostsRise))}
      {line("Price −10% (rival)", formatCedis(r.profitIfPriceDrops))}
      <div className="my-1 border-t border-dashed border-ink/40" />
      {line("Sourced from evidence", `${Math.round(r.sourcedShare * 100)}%`)}
      <p className="mt-2 text-center text-[11px] text-muted">Thank you. Come again with receipts.</p>
    </div>
  );
}

function BreakEvenChart({ r, expected }: { r: FinanceResult; expected: number }) {
  if (r.breakEvenUnits === null || r.contributionPerUnit <= 0) return null;
  const maxUnits = Math.max(10, Math.ceil(Math.max(r.breakEvenUnits * 2, expected * 1.2)));
  const W = 300;
  const H = 150;
  const pad = { l: 8, r: 8, t: 10, b: 22 };
  const profit = (u: number) => r.contributionPerUnit * u - r.fixedPerMonth;
  const minP = profit(0);
  const maxP = profit(maxUnits);
  const x = (u: number) => pad.l + (u / maxUnits) * (W - pad.l - pad.r);
  const y = (p: number) => pad.t + ((maxP - p) / (maxP - minP || 1)) * (H - pad.t - pad.b);
  return (
    <figure className="rounded-[18px] ring-1 ring-line bg-bg-elevated p-3">
      <figcaption className="text-xs font-semibold">Monthly profit as sales grow</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 w-full" role="img" aria-label={`Break-even at ${r.breakEvenUnits} units a month`}>
        <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} stroke="var(--color-line-strong)" strokeWidth="1.5" />
        <polygon
          points={`${x(0)},${y(0)} ${x(r.breakEvenUnits)},${y(0)} ${x(0)},${y(minP)}`}
          fill="var(--color-clay-soft)"
        />
        <polygon
          points={`${x(r.breakEvenUnits)},${y(0)} ${x(maxUnits)},${y(0)} ${x(maxUnits)},${y(maxP)}`}
          fill="var(--color-accent-soft)"
        />
        <line x1={x(0)} y1={y(minP)} x2={x(maxUnits)} y2={y(maxP)} stroke="var(--color-ink)" strokeWidth="2.5" />
        <line x1={x(r.breakEvenUnits)} x2={x(r.breakEvenUnits)} y1={pad.t} y2={H - pad.b} stroke="var(--color-gold)" strokeWidth="2" strokeDasharray="4 3" />
        <text x={x(r.breakEvenUnits) + 4} y={pad.t + 10} fontSize="10" fill="var(--color-ink)">
          break-even {r.breakEvenUnits}
        </text>
        {expected > 0 ? (
          <>
            <circle cx={x(Math.min(expected, maxUnits))} cy={y(profit(Math.min(expected, maxUnits)))} r="4.5" fill="var(--color-gold)" stroke="var(--color-ink)" strokeWidth="1.5" />
            <text x={x(Math.min(expected, maxUnits))} y={H - 6} fontSize="10" textAnchor="middle" fill="var(--color-muted)">
              expected {expected}
            </text>
          </>
        ) : null}
        <text x={pad.l} y={H - 6} fontSize="10" fill="var(--color-muted)">0</text>
        <text x={W - pad.r} y={H - 6} fontSize="10" textAnchor="end" fill="var(--color-muted)">{maxUnits}</text>
      </svg>
      <p className="text-[11px] text-muted">Red: losing money. Green: profit. Units sold per month.</p>
    </figure>
  );
}
