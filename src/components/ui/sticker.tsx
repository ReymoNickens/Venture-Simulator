import { Check } from "lucide-react";
import { JOURNEY_STEPS } from "@/lib/domain/config";
import type { JourneyId } from "@/lib/domain/state-machine";
import { cn } from "@/lib/utils";

const SIZES = {
  xs: { box: "size-7 text-[13px]", icon: "size-3.5" },
  sm: { box: "size-9 text-[15px]", icon: "size-4" },
  md: { box: "size-11 text-[18px]", icon: "size-5" },
  lg: { box: "size-14 text-[24px]", icon: "size-6" },
  xl: { box: "size-20 text-[34px]", icon: "size-9" },
} as const;

/**
 * A step's marker: its number in a circle, the way steps are numbered on a
 * handout. Numbers mean something to everyone; symbols for "evidence" or
 * "assumptions" did not. Done steps show a tick.
 */
export function StepSticker({
  step,
  size = "md",
  muted = false,
  done = false,
  className,
}: {
  step: JourneyId;
  size?: keyof typeof SIZES;
  /** Kept for older callers; markers are never tilted now. */
  tilt?: boolean;
  muted?: boolean;
  done?: boolean;
  className?: string;
}) {
  const number = JOURNEY_STEPS.findIndex((s) => s.id === step) + 1;
  const s = SIZES[size];
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-display font-semibold tabular-nums",
        s.box,
        done
          ? "bg-mint text-white"
          : muted
            ? "border border-line-strong bg-transparent text-faint"
            : "bg-accent text-accent-fg",
        className,
      )}
    >
      {done ? <Check className={s.icon} strokeWidth={3} /> : number}
    </span>
  );
}

/**
 * The masthead: the course code set in the heading serif, the way it appears
 * on a course outline. `full` adds the university underneath.
 */
export function LogoMark({ full = false, className }: { full?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex flex-col leading-none", className)}>
      <span className="font-display text-[19px] font-semibold tracking-tight whitespace-nowrap text-ink">ENT 302</span>
      {full ? <span className="mt-1 text-[12px] font-medium text-muted">University of Cape Coast</span> : null}
    </span>
  );
}
