import type { InputHTMLAttributes, LabelHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-11 w-full rounded-[10px] border border-line bg-bg-elevated px-3 text-sm text-ink placeholder:text-faint",
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
        "min-h-28 w-full rounded-[12px] border border-line bg-bg-elevated px-3 py-2.5 text-sm text-ink placeholder:text-faint",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
        className,
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className={cn("block text-sm font-medium text-ink-soft", className)} {...props} />
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
