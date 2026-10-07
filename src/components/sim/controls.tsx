import type { ReactNode } from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { cedisText, typedCedis } from "./money";

// Controls shared by the simulation's question screens: easier on a phone
// than typing into form fields.

export function Question({ title, help, children }: { title: string; help: string; children: ReactNode }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-[28px] leading-tight font-extrabold">{title}</h2>
        <p className="mt-2 text-[15px] leading-6 text-ink-soft">{help}</p>
      </div>
      {children}
    </div>
  );
}

export function BigChoice({ selected, onClick, title, side, sub }: { selected: boolean; onClick: () => void; title: string; side?: string; sub?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "w-full rounded-[16px] border-2 px-4 py-3 text-left transition-[transform,box-shadow]",
        selected ? "border-ink bg-gold shadow-[3px_3px_0_var(--color-ink)]" : "border-line-strong bg-bg-elevated",
      )}
    >
      <span className="flex items-baseline justify-between gap-3">
        <span className="font-display text-lg font-extrabold">{title}</span>
        {side ? <span className="shrink-0 text-sm font-bold">{side}</span> : null}
      </span>
      {sub ? <span className="mt-0.5 block text-sm leading-5 text-ink-soft">{sub}</span> : null}
    </button>
  );
}

/** A big number with − and + buttons and quick picks, easier on a phone than typing. */
export function Stepper({
  value,
  onChange,
  step,
  presets,
  max,
  money = false,
}: {
  value: string;
  onChange: (v: string) => void;
  step: number;
  presets?: number[];
  max?: number;
  money?: boolean;
}) {
  const asNumber = money ? (typedCedis(value) ?? 0) / 100 : Number(value) || 0;
  const write = (n: number) => {
    const clamped = Math.max(0, max ? Math.min(max, n) : n);
    onChange(money ? cedisText(Math.round(clamped * 100)) : String(Math.round(clamped)));
  };
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-center gap-4">
        <button
          type="button"
          aria-label={`Less by ${step}`}
          onClick={() => write(asNumber - step)}
          className="flex size-14 items-center justify-center rounded-full border-2 border-ink bg-bg-elevated shadow-[3px_3px_0_var(--color-ink)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
        >
          <Minus className="size-6" aria-hidden />
        </button>
        <label className="flex items-baseline gap-1">
          {money ? <span className="font-display text-xl font-extrabold text-muted">GHS</span> : null}
          <input
            inputMode={money ? "decimal" : "numeric"}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-32 bg-transparent text-center font-display text-[48px] leading-none font-extrabold tabular-nums outline-none focus:underline"
            aria-label="Amount"
          />
        </label>
        <button
          type="button"
          aria-label={`More by ${step}`}
          onClick={() => write(asNumber + step)}
          className="flex size-14 items-center justify-center rounded-full border-2 border-ink bg-bg-elevated shadow-[3px_3px_0_var(--color-ink)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
        >
          <Plus className="size-6" aria-hidden />
        </button>
      </div>
      {presets ? (
        <div className="flex flex-wrap justify-center gap-2">
          {presets.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => write(p)}
              className={cn(
                "min-h-11 min-w-16 rounded-full border-2 px-3 text-sm font-bold",
                asNumber === p ? "border-ink bg-gold" : "border-line-strong bg-bg-elevated",
              )}
            >
              {money ? `GHS ${p}` : p}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

