import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/** Big tappable options instead of <select> — easier on a phone, and each option can explain itself. */
export function ChoiceGrid<T extends string>({
  options,
  value,
  onChange,
  columns = 2,
  label,
}: {
  options: readonly { value: T; label: string; hint?: string; icon?: ReactNode }[];
  value: T | "";
  onChange: (v: T) => void;
  columns?: 1 | 2 | 3;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("grid gap-2", columns === 2 && "grid-cols-2", columns === 3 && "grid-cols-3")}>
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative flex min-h-[52px] flex-col items-start gap-0.5 rounded-[14px] border px-3 py-2.5 text-left transition-colors",
              on ? "border-accent bg-accent-soft" : "border-line bg-bg-elevated hover:border-line-strong",
            )}
          >
            <span className="flex items-center gap-2 text-sm font-semibold">
              {o.icon}
              {o.label}
            </span>
            {o.hint ? <span className="text-xs leading-4 text-muted">{o.hint}</span> : null}
            {on ? <Check className="absolute right-2.5 top-2.5 size-4 text-accent" aria-hidden /> : null}
          </button>
        );
      })}
    </div>
  );
}
