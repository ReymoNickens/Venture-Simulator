import type {
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";

const control =
  "w-full rounded-[8px] border-2 border-line-strong/70 bg-bg-elevated text-[15px] text-ink placeholder:text-faint transition-colors focus-visible:border-accent focus-visible:outline-none focus-visible:ring-0";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(control, "h-11 px-3", className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(control, "min-h-24 px-3 py-2.5 leading-6", className)} {...props} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(control, "h-11 appearance-none bg-no-repeat px-3 pr-9", className)} style={{
      backgroundImage:
        "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%231c1712'%3E%3Cpath d='M5 7l5 6 5-6z'/%3E%3C/svg%3E\")",
      backgroundPosition: "right 10px center",
      backgroundSize: "14px",
    }} {...props}>
      {children}
    </select>
  );
}

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("block text-sm font-semibold text-ink-soft", className)} {...props} />;
}

export function Field({
  label,
  hint,
  optional,
  children,
}: {
  label: string;
  hint?: string;
  optional?: boolean;
  children: ReactNode;
}) {
  // Wrapping the control inside the <label> associates them without ids (a
  // cloned id previously caused an SSR/CSR hydration mismatch) and still
  // works when a Field holds a control plus trailing content like <Why>.
  return (
    <div className="space-y-1.5">
      <Label className="space-y-1.5">
        <span className="flex items-baseline justify-between gap-2">
          <span>{label}</span>
          {optional ? <span className="text-xs font-normal text-faint">optional</span> : null}
        </span>
        {children}
      </Label>
      {hint ? <p className="text-xs leading-5 text-muted">{hint}</p> : null}
    </div>
  );
}

/**
 * Tap-sized choice chips — faster than a dropdown on a phone, and every option
 * is visible, which matters when the options themselves teach something
 * (fact vs. opinion, critical vs. low).
 */
export function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
  hint,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string; hint?: string }[];
  onChange: (v: T) => void;
  hint?: string;
}) {
  const active = options.find((o) => o.value === value);
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-semibold text-ink-soft">{label}</legend>
      <div className="flex flex-wrap gap-1.5 pt-1.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={o.value === value}
            onClick={() => onChange(o.value)}
            className={cn(
              "min-h-9 rounded-[7px] border-2 px-3 py-1 text-sm transition-colors",
              o.value === value
                ? "border-ink bg-ink text-bg-elevated"
                : "border-line-strong/70 bg-bg-elevated text-ink-soft hover:border-ink/50",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
      {active?.hint ? <p className="text-xs leading-5 text-muted">{active.hint}</p> : null}
      {hint ? <p className="text-xs leading-5 text-muted">{hint}</p> : null}
    </fieldset>
  );
}
