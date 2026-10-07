import { useState } from "react";
import type { MarketBrief } from "@/lib/simulation/service";
import type { StudentPeriodView } from "@/sim/index";
import { cn } from "@/lib/utils";
import { cap, ghs } from "./money";

/**
 * How a week went, in the order a student would ask: did we make money,
 * how many did we sell, what went to waste, and one thing to think about.
 * Everything else is one tap away.
 */
export function WeekResult({ detail, market }: { detail: StudentPeriodView; market: MarketBrief }) {
  const [more, setMore] = useState(false);
  const [trail, setTrail] = useState(false);
  const o = detail.outcomes;
  const label = market.periodLabel;
  const product = market.products[0];
  const flow = product ? o.inventory[product.id] : undefined;
  const unit = product?.unit ?? "unit";
  const [first, ...rest] = detail.learningSignals;
  const made = o.profit >= 0;

  return (
    <div className="space-y-4">
      <div className={cn("rounded-[20px] border-2 border-ink p-5", made ? "bg-accent-soft" : "bg-clay-soft")}>
        <p className="text-xs font-bold text-muted">
          {cap(label)} {detail.period}
        </p>
        <p className="mt-1 font-display text-[28px] leading-tight font-extrabold">
          {made ? "You made a profit of " : "You lost "}
          <span className={cn("mark", !made && "text-clay")}>{ghs(Math.abs(o.profit))}</span>
        </p>
        <p className="mt-2 text-[15px] text-ink-soft">
          Sales brought in {ghs(o.revenue)}. Cash went from {ghs(o.openingCash)} to{" "}
          <strong className={cn(o.closingCash < 0 && "text-clay")}>{ghs(o.closingCash)}</strong>.
        </p>
      </div>

      {flow ? (
        <div className="grid grid-cols-3 gap-2">
          <Tile label={`${cap(unit)}s sold`} value={flow.sold} tone="bg-gold" />
          <Tile label="Went to waste" value={flow.spoiled} tone={flow.spoiled ? "bg-clay text-white" : "bg-bg-elevated"} />
          <Tile label="Left over" value={flow.closing} tone="bg-bg-elevated" />
        </div>
      ) : null}

      <p className="text-[15px] leading-6">
        <strong>{o.unitsDemanded}</strong> people wanted a {unit}; you sold <strong>{o.unitsSold}</strong>.
        {o.unmetUnits > 0 ? ` ${o.unmetUnits} went away because you ran out.` : ""}
        {o.breakEvenUnits !== null ? ` To cover all your costs you needed to sell about ${o.breakEvenUnits}.` : ""}
      </p>

      {first ? (
        <div className="rounded-[18px] border-2 border-ink bg-gold-soft p-4">
          <p className="font-display text-sm font-extrabold">Talk about this with your group</p>
          <p className="mt-1 text-[15px] font-semibold leading-6">{first.message}</p>
          <p className="mt-1 text-[15px] leading-6 text-ink-soft">{first.prompt}</p>
          {rest.length ? (
            <>
              {more
                ? rest.map((s) => (
                    <div key={s.code} className="mt-3 border-t border-ink/15 pt-3">
                      <p className="text-[15px] font-semibold leading-6">{s.message}</p>
                      <p className="text-[15px] leading-6 text-ink-soft">{s.prompt}</p>
                    </div>
                  ))
                : null}
              <button type="button" className="mt-2 min-h-11 text-sm font-bold underline underline-offset-4" onClick={() => setMore((v) => !v)}>
                {more ? "Show less" : `${rest.length} more to think about`}
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      {detail.events.length ? (
        <div className="rounded-[18px] border border-line bg-bg-elevated p-4">
          <p className="font-display text-sm font-extrabold">What happened around you</p>
          <ul className="mt-1 space-y-1 text-[15px] leading-6">
            {detail.events.map((e) => (
              <li key={e.instanceId}>
                <strong>{e.name}.</strong> {e.response ? `You chose: ${e.response}${e.responseWasDefault ? " (nobody chose, so the default)" : ""}.` : ""}
                <span className="block text-sm text-muted">{e.description}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <button
        type="button"
        className="min-h-11 text-sm font-bold text-accent underline underline-offset-4"
        onClick={() => setTrail((v) => !v)}
        aria-expanded={trail}
      >
        {trail ? "Hide the working" : "How was this worked out?"}
      </button>
      {trail ? (
        <ol className="space-y-1.5 rounded-[14px] bg-bg-subtle p-3 text-sm leading-6 text-ink-soft">
          {detail.explanation.map((l) => (
            <li key={l.id}>{l.text}</li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className={cn("rounded-[16px] border-2 border-ink px-3 py-3 text-center", tone)}>
      <p className="font-display text-[28px] leading-none font-extrabold tabular-nums">{value}</p>
      <p className="mt-1 text-xs font-bold">{label}</p>
    </div>
  );
}
