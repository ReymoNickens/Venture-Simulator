import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/badge";

/** Shared chrome for a guided, one-question-at-a-time flow screen: a quiet
 * progress indicator, one heading, one short prompt, the step's own input,
 * and back/continue. Every guided flow (opportunity discovery, evidence
 * capture, assumption creation) is built from this so the interaction
 * vocabulary stays consistent across all three. */
export function StepScreen({
  step,
  total,
  heading,
  prompt,
  children,
  onBack,
  onContinue,
  continueLabel = "Continue",
  continueDisabled,
  pending,
}: {
  step: number;
  total: number;
  heading: string;
  prompt?: string;
  children: ReactNode;
  onBack?: () => void;
  onContinue: () => void;
  continueLabel?: string;
  continueDisabled?: boolean;
  pending?: boolean;
}) {
  return (
    <div className="space-y-4">
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-faint" aria-hidden="true">
        {step} / {total}
      </p>
      <Card className="space-y-4">
        <div>
          <h1 className="font-display text-2xl leading-snug sm:text-3xl">{heading}</h1>
          {prompt ? <p className="mt-2 text-sm leading-6 text-muted">{prompt}</p> : null}
        </div>
        {children}
        <div className="flex items-center gap-2 pt-1">
          {onBack ? (
            <Button type="button" variant="ghost" onClick={onBack} disabled={pending}>
              Back
            </Button>
          ) : null}
          <Button
            type="button"
            className="ml-auto"
            onClick={onContinue}
            disabled={continueDisabled || pending}
          >
            {pending ? "Saving…" : continueLabel}
          </Button>
        </div>
      </Card>
    </div>
  );
}

/** A tappable choice card — the accessible replacement for a native
 * <select> or an icon-only affordance. Always carries a real text label, so
 * an emoji (if any) is decoration, never the only signal. */
export function ChoiceCard({
  icon,
  label,
  hint,
  selected,
  onClick,
}: {
  icon?: string;
  label: string;
  hint?: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={
        "flex w-full items-start gap-3 rounded-[14px] border px-4 py-3 text-left text-sm transition-colors " +
        (selected
          ? "border-accent bg-accent-soft text-ink"
          : "border-line bg-bg-elevated text-ink hover:border-line-strong")
      }
    >
      {icon ? (
        <span className="text-lg leading-none" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span>
        <span className="block font-medium">{label}</span>
        {hint ? <span className="mt-0.5 block text-xs text-muted">{hint}</span> : null}
      </span>
    </button>
  );
}
