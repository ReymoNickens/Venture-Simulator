import type { ReactNode } from "react";
import { JOURNEY_STEPS } from "@/lib/domain/config";
import type { JourneyId } from "@/lib/domain/state-machine";

/**
 * The top of every step screen: where it sits in the journey,
 * and one plain sentence about the job. Replaces the old clipped rail, so a
 * student always sees "Step 4 of 7" even on a 360px phone.
 */
export function StepHeader({
  step,
  title,
  lead,
  aside,
}: {
  step: JourneyId;
  title: ReactNode;
  lead?: ReactNode;
  aside?: ReactNode;
}) {
  const index = JOURNEY_STEPS.findIndex((s) => s.id === step);
  return (
    <header className="flow-enter mb-5 pt-2">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-muted">
          Step {index + 1} of {JOURNEY_STEPS.length}
          {aside ? <span className="text-faint"> · </span> : null}
          {aside}
        </p>
        <h1 className="font-display text-[28px] leading-[1.05] font-extrabold sm:text-4xl">{title}</h1>
        {lead ? <p className="mt-2 text-[15px] leading-6 text-ink-soft">{lead}</p> : null}
      </div>
    </header>
  );
}
