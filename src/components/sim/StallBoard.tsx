import type { SimulationView } from "@/lib/simulation/service";
import { cn } from "@/lib/utils";
import { cap, ghs } from "./money";

/** The stall at a glance: which week, how much cash, what is in stock. */
export function StallBoard({ view }: { view: SimulationView }) {
  const label = view.market.periodLabel;
  const finished = view.completedPeriod >= view.periodCount || view.status === "exited";
  const current = Math.min(view.completedPeriod + (finished ? 0 : 1), view.periodCount);
  const product = view.market.products[0];
  return (
    <div className="paper rounded-[20px] p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="font-display text-sm font-extrabold">
          {cap(label)} {current} <span className="text-muted">of {view.periodCount}</span>
        </p>
        <span
          className={cn(
            "rounded-full border-2 border-ink px-2.5 py-0.5 text-xs font-bold",
            view.status === "cash_out" ? "bg-clay text-white" : view.status === "exited" ? "bg-bg-subtle" : "bg-gold",
          )}
        >
          {view.status === "cash_out" ? "Out of cash" : view.status === "exited" ? "Closed" : "Open for business"}
        </span>
      </div>
      <ol className="mt-3 flex gap-1.5" aria-label={`${label}s`}>
        {Array.from({ length: view.periodCount }, (_, i) => (
          <li
            key={i}
            className={cn(
              "h-2 flex-1 rounded-full border border-ink/20",
              i < view.completedPeriod ? "bg-accent" : i + 1 === current && !finished ? "bg-gold" : "bg-bg-subtle",
            )}
          />
        ))}
      </ol>
      <div className="mt-4">
        <p className="text-xs font-bold text-muted">Cash in the box</p>
        <p className={cn("font-display text-[34px] leading-none font-extrabold tabular-nums", view.cash < 0 && "text-clay")}>
          {ghs(view.cash)}
        </p>
        {product ? (
          <p className="mt-2 text-sm">
            <strong className="font-display text-base font-extrabold tabular-nums">{view.stock[product.id] ?? 0}</strong>{" "}
            {product.name.toLowerCase()}s in stock
          </p>
        ) : null}
      </div>
    </div>
  );
}
