import { useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormMessages } from "@/components/ui/feedback";
import { Input, Select } from "@/components/ui/input";
import { saveVentureNumbers } from "@/lib/server/simulation";
import { checkVentureNumbers, type VentureNumbers } from "@/sim/scenarios/own-venture";
import { cn } from "@/lib/utils";
import { BigChoice, Question, Stepper } from "./controls";
import { cedisText, ghs, typedCedis } from "./money";

type SourceKey = "costPerUnit" | "price" | "peoplePerWeek";

interface Draft {
  offer: string;
  unit: string;
  kind: "goods" | "service" | "";
  costPerUnit: string;
  price: string;
  alternatives: { name: string; price: string }[];
  peoplePerWeek: string;
  buysPerWeek: string;
  capacityPerWeek: string;
  wasteShare: number;
  fixedCosts: { label: string; amount: string }[];
  sources: Partial<Record<SourceKey, string | null>>;
}

function draftFrom(numbers: VentureNumbers | null, ventureName: string): Draft {
  if (!numbers) {
    return {
      offer: ventureName,
      unit: "",
      kind: "",
      costPerUnit: "0",
      price: "0",
      alternatives: [{ name: "", price: "" }],
      peoplePerWeek: "100",
      buysPerWeek: "1",
      capacityPerWeek: "100",
      wasteShare: 0.1,
      fixedCosts: [{ label: "Transport", amount: "" }],
      sources: {},
    };
  }
  return {
    offer: numbers.offer,
    unit: numbers.unit,
    kind: numbers.kind,
    costPerUnit: cedisText(numbers.costPerUnit),
    price: cedisText(numbers.price),
    alternatives: numbers.alternatives.length ? numbers.alternatives.map((a) => ({ name: a.name, price: cedisText(a.price) })) : [{ name: "", price: "" }],
    peoplePerWeek: String(numbers.peoplePerWeek),
    buysPerWeek: String(numbers.buysPerWeek),
    capacityPerWeek: String(numbers.capacityPerWeek),
    wasteShare: numbers.wasteShare,
    fixedCosts: numbers.fixedCosts.map((f) => ({ label: f.label, amount: cedisText(f.amount) })),
    sources: numbers.sources ?? {},
  };
}

function toNumbers(d: Draft): VentureNumbers {
  return {
    offer: d.offer.trim(),
    unit: d.unit.trim(),
    kind: d.kind === "goods" ? "goods" : "service",
    costPerUnit: typedCedis(d.costPerUnit) ?? 0,
    price: typedCedis(d.price) ?? 0,
    alternatives: d.alternatives
      .filter((a) => a.name.trim() || a.price.trim())
      .map((a) => ({ name: a.name.trim(), price: typedCedis(a.price) ?? 0 })),
    peoplePerWeek: Math.round(Number(d.peoplePerWeek) || 0),
    buysPerWeek: Number(d.buysPerWeek) || 0,
    capacityPerWeek: Math.round(Number(d.capacityPerWeek) || 0),
    wasteShare: d.kind === "goods" ? d.wasteShare : 0,
    fixedCosts: d.fixedCosts.filter((f) => f.label.trim() || f.amount.trim()).map((f) => ({ label: f.label.trim(), amount: typedCedis(f.amount) ?? 0 })),
    sources: d.sources,
  };
}

const UNIT_IDEAS = ["seat", "meal", "print", "bag", "trip", "booking", "pack", "item"];
const COST_IDEAS = ["Transport", "Data and airtime", "Rent", "Wages", "Equipment hire"];

/**
 * The group's own numbers, one question per screen. They become the market
 * the venture runs in (src/sim/scenarios/own-venture.ts). The three numbers
 * that matter most each ask where they came from: a piece of the group's
 * evidence, or an honest guess.
 */
export function NumbersWizard({
  ventureName,
  hints,
  numbers,
  evidence,
  onSaved,
  onCancel,
}: {
  ventureName: string;
  hints: { problem: string; alternatives: string };
  numbers: VentureNumbers | null;
  evidence: { id: string; title: string }[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [d, setD] = useState<Draft>(() => draftFrom(numbers, ventureName));
  const [at, setAt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setD((x) => ({ ...x, [key]: value }));
  const unit = d.unit.trim() || "one";

  const screens = ["offer", "kind", "cost", "price", "alternatives", "people", "buys", "capacity", ...(d.kind === "goods" ? ["waste"] : []), "fixed", "review"] as const;
  type Screen = (typeof screens)[number];
  const screen: Screen = screens[Math.min(at, screens.length - 1)];
  const isLast = screen === "review";

  const canNext: Record<Screen, boolean> = {
    offer: Boolean(d.offer.trim() && d.unit.trim()),
    kind: d.kind !== "",
    cost: (typedCedis(d.costPerUnit) ?? 0) > 0,
    price: (typedCedis(d.price) ?? 0) > 0,
    alternatives: true,
    people: Number(d.peoplePerWeek) >= 10,
    buys: Number(d.buysPerWeek) > 0,
    capacity: Number(d.capacityPerWeek) >= 1,
    waste: true,
    fixed: true,
    review: true,
  };

  const n = toNumbers(d);
  const problems = checkVentureNumbers(n);
  const margin = n.price - n.costPerUnit;
  const weekly = n.fixedCosts.reduce((a, f) => a + f.amount, 0);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await saveVentureNumbers({ data: { numbers: n } });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your numbers.");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5 pt-2">
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={at === 0 ? onCancel : () => setAt(at - 1)} className="flex min-h-11 items-center gap-1.5 text-sm font-bold text-muted">
          <ArrowLeft className="size-4" aria-hidden /> {at === 0 ? "Not now" : "Back"}
        </button>
        <p className="text-sm font-bold">
          Your numbers · {at + 1} of {screens.length}
        </p>
      </div>
      <ol className="flex gap-1" aria-hidden>
        {screens.map((_, i) => (
          <li key={i} className={cn("h-1.5 flex-1 rounded-full", i <= at ? "bg-gold" : "bg-bg-subtle")} />
        ))}
      </ol>

      <div key={screen} className="flow-enter min-h-[360px]">
        {screen === "offer" ? (
          <Question title="What will you sell?" help="Your venture as a customer would pay for it.">
            <Labelled label="What you sell">
              <Input value={d.offer} onChange={(e) => set("offer", e.target.value)} placeholder="Shuttle seat booking" />
            </Labelled>
            <Labelled label="What is one of them called?">
              <Input value={d.unit} onChange={(e) => set("unit", e.target.value)} placeholder="seat" />
            </Labelled>
            <Chips options={UNIT_IDEAS} onPick={(v) => set("unit", v)} selected={d.unit} />
          </Question>
        ) : null}

        {screen === "kind" ? (
          <Question title="Can you keep it for next week?" help="This decides what happens to what you don’t sell.">
            <div className="grid gap-2">
              <BigChoice
                selected={d.kind === "goods"}
                onClick={() => set("kind", "goods")}
                title="Yes, it’s a product"
                sub="You make or buy stock. What you don’t sell can wait, though some may go to waste."
              />
              <BigChoice
                selected={d.kind === "service"}
                onClick={() => set("kind", "service")}
                title="No, it’s a service"
                sub="Like a seat on a bus or an hour of your time: if nobody takes it this week, it’s gone."
              />
            </div>
          </Question>
        ) : null}

        {screen === "cost" ? (
          <Question title={`What does one ${unit} cost you to provide?`} help="Materials, fuel, packaging: whatever you spend for each one.">
            <Stepper value={d.costPerUnit} onChange={(v) => set("costPerUnit", v)} step={1} money />
            <Source label="Where did this number come from?" value={d.sources.costPerUnit} evidence={evidence} onChange={(v) => set("sources", { ...d.sources, costPerUnit: v })} />
          </Question>
        ) : null}

        {screen === "price" ? (
          <Question title={`What would customers pay for one ${unit}?`} help="What people told you, not what you hope.">
            <Stepper value={d.price} onChange={(v) => set("price", v)} step={1} money />
            {(typedCedis(d.price) ?? 0) > 0 && (typedCedis(d.costPerUnit) ?? 0) > 0 ? (
              <p className={cn("text-center text-[15px] font-bold", margin < 0 && "text-clay")}>
                {margin >= 0 ? `You’d keep ${ghs(margin)} on each one` : `You’d lose ${ghs(-margin)} on each one`}
              </p>
            ) : null}
            <Source label="Where did this number come from?" value={d.sources.price} evidence={evidence} onChange={(v) => set("sources", { ...d.sources, price: v })} />
          </Question>
        ) : null}

        {screen === "alternatives" ? (
          <Question title="What do people use now?" help="Who else solves this problem, and what does it cost? Leave out anything free.">
            {hints.alternatives ? <p className="rounded-[14px] bg-bg-subtle px-3 py-2 text-sm text-ink-soft">You wrote: “{hints.alternatives}”</p> : null}
            <div className="space-y-2">
              {d.alternatives.map((a, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={a.name}
                    onChange={(e) => set("alternatives", d.alternatives.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                    placeholder="Dropping taxi"
                    aria-label="Alternative"
                  />
                  <span className="text-sm font-bold text-muted">GHS</span>
                  <Input
                    inputMode="decimal"
                    className="w-24"
                    value={a.price}
                    onChange={(e) => set("alternatives", d.alternatives.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))}
                    placeholder="6"
                    aria-label="Its price"
                  />
                  <button type="button" aria-label="Remove" className="flex size-11 shrink-0 items-center justify-center text-muted" onClick={() => set("alternatives", d.alternatives.filter((_, j) => j !== i))}>
                    <X className="size-4" aria-hidden />
                  </button>
                </div>
              ))}
            </div>
            {d.alternatives.length < 4 ? (
              <Button variant="secondary" size="sm" onClick={() => set("alternatives", [...d.alternatives, { name: "", price: "" }])}>
                <Plus className="size-4" aria-hidden /> Add another
              </Button>
            ) : null}
          </Question>
        ) : null}

        {screen === "people" ? (
          <Question
            title="How many people have this problem each week?"
            help="Around where you would sell. Use your counts: 60 people at the stop each morning, 5 days a week, is about 300."
          >
            <Stepper value={d.peoplePerWeek} onChange={(v) => set("peoplePerWeek", v)} step={50} presets={[100, 300, 500, 1000]} />
            <Source label="Where did this number come from?" value={d.sources.peoplePerWeek} evidence={evidence} onChange={(v) => set("sources", { ...d.sources, peoplePerWeek: v })} />
          </Question>
        ) : null}

        {screen === "buys" ? (
          <Question title={`How many times a week would one customer buy?`} help={`One ${unit} each time.`}>
            <Stepper value={d.buysPerWeek} onChange={(v) => set("buysPerWeek", v)} step={1} presets={[1, 2, 3, 5]} />
          </Question>
        ) : null}

        {screen === "capacity" ? (
          <Question title={`What’s the most ${unit}s you could provide in a week?`} help="With the people, time and equipment you really have.">
            <Stepper value={d.capacityPerWeek} onChange={(v) => set("capacityPerWeek", v)} step={10} presets={[50, 100, 300, 500]} />
          </Question>
        ) : null}

        {screen === "waste" ? (
          <Question title="How much unsold stock goes to waste each week?" help="Food spoils, fashions change, things get damaged.">
            <div className="grid gap-2">
              {[
                [0, "None", "It keeps"],
                [0.1, "A little", "About 1 in 10"],
                [0.3, "Quite a lot", "About 1 in 3"],
                [1, "All of it", "It doesn’t last a week"],
              ].map(([share, title, sub]) => (
                <BigChoice key={String(share)} selected={d.wasteShare === share} onClick={() => set("wasteShare", share as number)} title={String(title)} sub={String(sub)} />
              ))}
            </div>
          </Question>
        ) : null}

        {screen === "fixed" ? (
          <Question title="What will you pay every week, whatever you sell?" help="Rent, transport, data, wages. Leave it empty if there’s nothing.">
            <div className="space-y-2">
              {d.fixedCosts.map((f, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={f.label}
                    onChange={(e) => set("fixedCosts", d.fixedCosts.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                    placeholder="Transport"
                    aria-label="Cost"
                  />
                  <span className="text-sm font-bold text-muted">GHS</span>
                  <Input
                    inputMode="decimal"
                    className="w-24"
                    value={f.amount}
                    onChange={(e) => set("fixedCosts", d.fixedCosts.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))}
                    placeholder="50"
                    aria-label="Amount a week"
                  />
                  <button type="button" aria-label="Remove" className="flex size-11 shrink-0 items-center justify-center text-muted" onClick={() => set("fixedCosts", d.fixedCosts.filter((_, j) => j !== i))}>
                    <X className="size-4" aria-hidden />
                  </button>
                </div>
              ))}
            </div>
            <Chips
              options={COST_IDEAS.filter((c) => !d.fixedCosts.some((f) => f.label === c))}
              onPick={(v) => set("fixedCosts", [...d.fixedCosts, { label: v, amount: "" }])}
              prefix="+ "
            />
          </Question>
        ) : null}

        {screen === "review" ? (
          <div className="space-y-4">
            <h2 className="font-display text-[28px] leading-tight font-extrabold">
              <span className="mark">{n.offer || "Your venture"}</span> in numbers
            </h2>
            <div className="paper space-y-2 rounded-[18px] p-4 text-[15px]">
              <Line left={`Each ${unit} costs you`} right={ghs(n.costPerUnit)} guess={d.sources.costPerUnit === null} />
              <Line left="Customers would pay" right={ghs(n.price)} guess={d.sources.price === null} />
              <Line left="You keep on each one" right={ghs(margin)} bold danger={margin <= 0} />
              <Line left="People with the problem, each week" right={String(n.peoplePerWeek)} guess={d.sources.peoplePerWeek === null} />
              <Line left="Most you can provide in a week" right={String(n.capacityPerWeek)} />
              <Line left="Running costs each week" right={ghs(weekly)} />
              {margin > 0 ? (
                <p className="border-t-2 border-dashed border-ink/30 pt-2 text-sm">
                  To cover your running costs you need to sell about <strong>{Math.ceil(weekly / margin)}</strong> a week.
                </p>
              ) : null}
            </div>
            {Object.values(d.sources).some((v) => v === null) ? (
              <p className="text-sm text-muted">“Guess” marks a number with no evidence behind it yet. Your lecturer can see which.</p>
            ) : null}
            {problems.length ? (
              <ul className="space-y-1 rounded-[14px] bg-clay-soft px-3 py-2 text-sm text-clay">
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            ) : null}
            <FormMessages error={error} />
          </div>
        ) : null}
      </div>

      {isLast ? (
        <Button size="lg" className="w-full" disabled={busy || problems.length > 0} onClick={() => void save()}>
          {busy ? "Saving…" : "Save our numbers"}
        </Button>
      ) : (
        <Button size="lg" className="w-full" disabled={!canNext[screen]} onClick={() => setAt(at + 1)}>
          Next <ArrowRight className="size-4" aria-hidden />
        </Button>
      )}
    </div>
  );
}

function Labelled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-bold">{label}</span>
      {children}
    </label>
  );
}

function Chips({ options, onPick, selected, prefix = "" }: { options: string[]; onPick: (v: string) => void; selected?: string; prefix?: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onPick(o)}
          className={cn("min-h-10 rounded-full border-2 px-3 text-sm font-bold", selected === o ? "border-ink bg-gold" : "border-line-strong bg-bg-elevated")}
        >
          {prefix}
          {o}
        </button>
      ))}
    </div>
  );
}

/** "Where did this number come from?": one of the group's evidence items, or an honest guess. */
function Source({
  label,
  value,
  evidence,
  onChange,
}: {
  label: string;
  value: string | null | undefined;
  evidence: { id: string; title: string }[];
  onChange: (v: string | null) => void;
}) {
  return (
    <label className="block space-y-1.5 rounded-[16px] border-2 border-dashed border-ink/30 p-3">
      <span className="text-sm font-bold">{label}</span>
      <Select value={value === undefined ? "" : value === null ? "__guess" : value} onChange={(e) => onChange(e.target.value === "__guess" ? null : e.target.value || null)}>
        <option value="">Choose…</option>
        {evidence.map((e) => (
          <option key={e.id} value={e.id}>
            From our evidence: {e.title}
          </option>
        ))}
        <option value="__guess">It’s our best guess</option>
      </Select>
      {!evidence.length ? <span className="block text-xs text-muted">Log evidence in the Venture tab to point to it here.</span> : null}
    </label>
  );
}

function Line({ left, right, bold, danger, guess }: { left: string; right: string; bold?: boolean; danger?: boolean; guess?: boolean }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3", bold && "font-bold")}>
      <span className="min-w-0">
        {left}
        {guess ? <span className="ml-1.5 rounded-full bg-gold-soft px-1.5 py-0.5 text-xs font-bold text-gold-deep">guess</span> : null}
      </span>
      <span className={cn("shrink-0 tabular-nums", danger && "text-clay")}>{right}</span>
    </div>
  );
}
