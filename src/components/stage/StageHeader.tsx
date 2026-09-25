import { Check, Circle, MessageSquareQuote } from "lucide-react";
import { EMBLEMS, STAGE_BY_ID, type StageId } from "@/lib/domain/stages";
import { progressFromSnapshot } from "@/lib/domain/stage-input";
import type { WorkspaceSnapshot } from "@/lib/domain/types";
import { dueLabel, isOverdue, shortDate } from "@/lib/dates";
import { Emblem } from "@/components/ui/emblem";
import { KenteBand } from "@/components/ui/kente";
import { Stamp } from "@/components/ui/stamp";
import { cn } from "@/lib/utils";

const LEVELS = ["", "Beginning", "Developing", "Proficient", "Exemplary"];

/**
 * The threshold of every stop: where you are on the route, what the mission
 * is, exactly what "done" means (computed from the record), when it is due,
 * and what the lecturer last said about it.
 */
export function StageHeader({ stage, data }: { stage: StageId; data: WorkspaceSnapshot }) {
  const def = STAGE_BY_ID[stage];
  const emblem = EMBLEMS[def.emblem];
  const progress = progressFromSnapshot(data).find((p) => p.id === stage);
  const due = data.life.milestones.find((m) => m.stage === stage);
  const feedback = data.life.feedback.filter((f) => f.stage === stage);
  const done = progress?.state === "done";

  return (
    <section className="mb-6">
      <div className="flex items-start gap-4">
        <div className="relative flex size-16 shrink-0 items-center justify-center rounded-[12px] border-2 border-ink bg-gold-soft text-ink shadow-[3px_3px_0_0_var(--color-ink)] sm:size-20">
          <Emblem emblem={def.emblem} className="size-10 sm:size-12" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
            Stop {String(def.stop).padStart(2, "0")} of 11
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="font-display text-[28px] leading-[1.05] font-extrabold sm:text-4xl">{def.title}</h1>
            {done ? (
              <Stamp tone="forest" tilt={-6}>
                Done
              </Stamp>
            ) : null}
          </div>
          <p className="mt-1 text-xs italic text-muted">
            {emblem.name} — {emblem.meaning}
          </p>
        </div>
      </div>
      <p className="mt-4 max-w-[62ch] text-[15px] leading-7 text-ink-soft">{def.mission}</p>

      {progress ? (
        <div className="mt-4 rounded-[10px] border-2 border-ink bg-bg-elevated">
          <KenteBand thin className="rounded-t-[8px]" />
          <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 pt-3">
            <p className="font-display text-sm font-bold">
              What “done” means here{" "}
              <span className="font-mono text-xs font-medium text-muted">
                {progress.met}/{progress.criteria.length}
              </span>
            </p>
            {due ? (
              <span
                className={cn(
                  "font-mono text-[11px] uppercase tracking-wide",
                  isOverdue(due.dueAt) && !done ? "font-semibold text-clay" : "text-muted",
                )}
              >
                {dueLabel(due.dueAt)} · {shortDate(due.dueAt)}
              </span>
            ) : null}
          </div>
          <ul className="space-y-1.5 px-3.5 pt-2 pb-3.5">
            {progress.criteria.map((c) => (
              <li key={c.label} className="flex items-start gap-2 text-sm">
                {c.met ? (
                  <Check className="mt-0.5 size-4 shrink-0 text-accent" strokeWidth={3} aria-label="met" />
                ) : (
                  <Circle className="mt-0.5 size-4 shrink-0 text-line-strong" aria-label="not yet" />
                )}
                <span className={c.met ? "text-ink" : "text-ink-soft"}>
                  {c.label}
                  {c.detail ? <span className="text-muted"> — {c.detail}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {feedback.length ? (
        <div className="mt-3 space-y-2">
          {feedback.slice(0, 2).map((f) => (
            <div key={f.id} className="rounded-[10px] border-2 border-indigo/40 bg-indigo-soft/60 px-3.5 py-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 font-semibold text-indigo">
                  <MessageSquareQuote className="size-4" aria-hidden /> {f.staffName}
                </p>
                {f.level ? (
                  <Stamp tone="indigo" size="xs" tilt={-2}>
                    {LEVELS[f.level]}
                  </Stamp>
                ) : null}
              </div>
              <p className="mt-1 leading-6 text-ink-soft">{f.body}</p>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
