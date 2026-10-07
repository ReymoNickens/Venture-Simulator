import { Link } from "@tanstack/react-router";
import { JOURNEY_STEPS } from "@/lib/domain/config";
import type { JourneyProgress } from "@/lib/domain/journey-progress";
import { StepSticker } from "@/components/ui/sticker";
import { cn } from "@/lib/utils";

/** Where a step stands, in words a student would use. */
const STATE_WORDS = { done: "Done", current: "You are here", todo: "Later" } as const;

/**
 * The whole route as a numbered list. Every stop is always
 * visible (unlike a horizontal rail that clips on a phone), and the stop
 * you are on is the one that stands out.
 */
export function JourneyMap({
  progress,
  compact = false,
}: {
  progress: JourneyProgress;
  compact?: boolean;
}) {
  return (
    <nav aria-label="Your journey">
      <ol className="relative">
        {JOURNEY_STEPS.map((step, i) => {
          const st = progress.states[step.id];
          const last = i === JOURNEY_STEPS.length - 1;
          return (
            <li key={step.id} className="relative flex gap-3 pb-1">
              {!last ? (
                <span
                  aria-hidden
                  className={cn(
                    "absolute top-11 bottom-0 w-0.5",
                    compact ? "left-[17px]" : "left-[23px]",
                    st === "done" ? "bg-ink" : "bg-line-strong [background:repeating-linear-gradient(to_bottom,var(--color-line-strong)_0_4px,transparent_4px_8px)]",
                  )}
                />
              ) : null}
              <Link
                to={step.href}
                aria-current={st === "current" ? "step" : undefined}
                className={cn(
                  "relative flex min-h-11 flex-1 items-center gap-3 rounded-[14px] py-1.5 pr-2 transition-colors",
                  st === "current" && "bg-gold-soft ring-1 ring-gold",
                  st !== "current" && "hover:bg-bg-subtle",
                )}
              >
                <StepSticker step={step.id} size={compact ? "sm" : "md"} muted={st === "todo"} done={st === "done"} />
                <span className="min-w-0">
                  <span className="block text-[11px] font-semibold text-muted">
                    Step {i + 1} · {STATE_WORDS[st]}
                  </span>
                  <span
                    className={cn(
                      "block font-display leading-tight font-semibold",
                      compact ? "text-sm" : "text-base",
                      st === "todo" && "text-faint",
                    )}
                  >
                    {step.label}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
