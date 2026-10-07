import type { MarketBrief } from "@/lib/simulation/service";
import { ghs } from "./money";

/** The market details, for anyone who wants them; nobody has to read this to play. */
export function MarketInfo({ market }: { market: MarketBrief }) {
  const product = market.products[0];
  return (
    <details className="group rounded-[18px] border-2 border-ink bg-bg-elevated">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 font-display font-extrabold">
        About the market
        <span className="text-sm font-bold text-muted group-open:hidden">Open</span>
        <span className="hidden text-sm font-bold text-muted group-open:inline">Close</span>
      </summary>
      <div className="space-y-4 px-4 pb-4 text-[15px] leading-6">
        <p className="text-ink-soft">{market.description}</p>
        <Section title="Who buys">{market.segments.map((s) => s.name).join(", ")}</Section>
        {product ? (
          <Section title={`Suppliers (price per ${product.unit})`}>
            <ul className="space-y-1">
              {market.suppliers.map((s) => (
                <li key={s.id}>
                  <strong>{s.name}</strong>:{" "}
                  {market.qualityTiers.map((t) => `${t.label} ${ghs(s.unitPrice[product.id]?.[t.id] ?? 0)}`).join(" · ")}
                  <span className="block text-sm text-muted">
                    {s.leadTimePeriods === 0 ? "Ready the same week" : `Arrives after ${s.leadTimePeriods} ${market.periodLabel}`}, up to{" "}
                    {s.capacityUnits}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}
        <Section title="Others selling nearby">
          {market.competitors.map((c) => `${c.name}${c.price === null ? "" : ` ${ghs(c.price)}`}`).join(" · ")}
        </Section>
        <Section title={`Your costs every ${market.periodLabel}`}>
          {market.fixedCosts.map((f) => `${f.label} ${ghs(f.amount)}`).join(" · ")}
          <span className="block text-sm text-muted">
            You can make at most {market.capacityUnitsPerPeriod} a {market.periodLabel}. Unsold food goes to waste.
          </span>
        </Section>
      </div>
    </details>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-display text-sm font-extrabold">{title}</p>
      <div className="text-ink-soft">{children}</div>
    </div>
  );
}
