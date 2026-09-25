import type { InputHTMLAttributes, LabelHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-12 w-full rounded-[12px] border border-line bg-bg-elevated px-3.5 text-base font-normal text-ink placeholder:text-faint transition-colors focus:border-accent",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "min-h-28 w-full rounded-[14px] border border-line bg-bg-elevated px-3.5 py-3 text-base font-normal leading-6 text-ink placeholder:text-faint transition-colors focus:border-accent",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
        className,
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className={cn("block text-sm font-semibold text-ink-soft", className)} {...props} />
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  // Every screen builds its forms on this component, so an unassociated
  // <label> (previously a plain sibling, no htmlFor/id, no wrapping) would
  // silently break screen readers and label-based automation on every form
  // in the app, not just one. Wrapping the control inside the <label>
  // associates them naturally (no ids to generate or keep in sync, and it
  // still works when a Field holds a control plus trailing content like a
  // <Why> hint) — simpler and safer than cloning an id onto the child, which
  // triggered a real SSR/CSR hydration mismatch when tried here.
  return (
    <div className="space-y-1.5">
      <Label className="space-y-1.5">
        <span className="block">{label}</span>
        {children}
      </Label>
      {hint ? <p className="text-xs leading-5 text-muted">{hint}</p> : null}
    </div>
  );
}

export function Select({ className, ...props }: import("react").SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-12 w-full rounded-[12px] border border-line bg-bg-elevated px-3.5 text-base font-normal text-ink focus:border-accent",
        className,
      )}
      {...props}
    />
  );
}
