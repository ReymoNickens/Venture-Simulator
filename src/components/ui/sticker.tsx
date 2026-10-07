import { Check } from "lucide-react";
import { JOURNEY_STEPS } from "@/lib/domain/config";
import type { JourneyId } from "@/lib/domain/state-machine";
import { cn } from "@/lib/utils";

/** Each step keeps its colour everywhere, like a sticker you recognise. */
const STEP_COLOURS: Record<JourneyId, string> = {
  group: "bg-gold text-ink",
  opportunity: "bg-clay text-white",
  submit: "bg-indigo text-white",
  select: "bg-pink text-ink",
  evidence: "bg-accent text-white",
  assumptions: "bg-gold text-ink",
  simulate: "bg-clay text-white",
};

const SIZES = {
  xs: { box: "size-7 text-[13px]", icon: "size-3.5" },
  sm: { box: "size-9 text-[15px]", icon: "size-4" },
  md: { box: "size-11 text-[18px]", icon: "size-5" },
  lg: { box: "size-14 text-[24px]", icon: "size-6" },
  xl: { box: "size-20 text-[34px]", icon: "size-9" },
} as const;

/**
 * A step's sticker: its number on a coloured disc with an ink edge, stuck on
 * slightly crooked. Numbers mean something to everyone; symbols for
 * "evidence" or "assumptions" did not. Done steps show a tick.
 */
export function StepSticker({
  step,
  size = "md",
  muted = false,
  done = false,
  tilt = true,
  className,
}: {
  step: JourneyId;
  size?: keyof typeof SIZES;
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
        "inline-flex shrink-0 items-center justify-center rounded-full font-display font-extrabold tabular-nums",
        s.box,
        done
          ? "sticker bg-mint text-white"
          : muted
            ? "border-2 border-dashed border-line-strong bg-transparent text-faint"
            : cn("sticker", STEP_COLOURS[step]),
        className,
      )}
      style={tilt && !muted ? { transform: `rotate(${number % 2 ? -5 : 4}deg)` } : undefined}
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
      <span className="font-display text-[20px] font-extrabold tracking-tight whitespace-nowrap text-ink">
        <span className="mark">ENT 302</span>
      </span>
      {full ? <span className="mt-1 text-[12px] font-medium text-muted">University of Cape Coast</span> : null}
    </span>
  );
}
