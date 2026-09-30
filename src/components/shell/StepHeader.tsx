import type { ReactNode } from "react";
import { JOURNEY_STEPS } from "@/lib/domain/config";
import type { JourneyId } from "@/lib/domain/state-machine";
import { StepSticker } from "@/components/ui/sticker";

/**
 * The top of every step screen: its sticker, where it sits in the journey,
 * and one plain sentence about the job. Replaces the old clipped rail, so a
 * student always sees "Stop 4 of 7" even on a 360px phone.
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
    <header className="flow-enter mb-5 flex items-start gap-3.5 pt-2">
      <StepSticker step={step} size="md" className="mt-1" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-muted">
          Stop {index + 1} of {JOURNEY_STEPS.length}
          {aside ? <span className="text-faint"> · </span> : null}
          {aside}
        </p>
        <h1 className="font-display text-[28px] leading-[1.05] font-extrabold sm:text-4xl">{title}</h1>
        {lead ? <p className="mt-2 text-[15px] leading-6 text-ink-soft">{lead}</p> : null}
      </div>
    </header>
  );
}
