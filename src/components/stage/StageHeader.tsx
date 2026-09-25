import { useState } from "react";
import { Check, ChevronDown, Circle, MapPin, MessageSquareQuote } from "lucide-react";
import { EMBLEMS, STAGE_BY_ID, type StageId } from "@/lib/domain/stages";
import { progressFromSnapshot } from "@/lib/domain/stage-input";
import type { WorkspaceSnapshot } from "@/lib/domain/types";
import { dueLabel, isOverdue } from "@/lib/dates";
import { Emblem } from "@/components/ui/emblem";
import { Stamp } from "@/components/ui/stamp";
import { cn } from "@/lib/utils";

const LEVELS = ["", "Beginning", "Developing", "Proficient", "Exemplary"];

/**
 * The top of every stop, kept short on purpose: where you are, the one-line
 * mission, and a progress ring. What "done" means opens on tap — the page
 * leads with the work, not the rules. Lecturer feedback is never hidden.
 */
export function StageHeader({ stage, data }: { stage: StageId; data: WorkspaceSnapshot }) {
  const def = STAGE_BY_ID[stage];
  const progress = progressFromSnapshot(data).find((p) => p.id === stage);
  const due = data.life.milestones.find((m) => m.stage === stage);
  const feedback = data.life.feedback.filter((f) => f.stage === stage);
  const [open, setOpen] = useState(false);
  const done = progress?.state === "done";
  const met = progress?.met ?? 0;
  const total = progress?.criteria.length ?? 1;

  return (
    <section className="mb-5 space-y-3">
      <div className="flex items-start gap-3">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-[10px] border-2 border-ink bg-gold-soft sm:size-14">
          <Emblem emblem={def.emblem} className="size-8 sm:size-9" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[11px] tracking-[0.16em] text-muted uppercase">
            Stop {String(def.stop).padStart(2, "0")}
            <span className="normal-case tracking-normal"> · {EMBLEMS[def.emblem].name}</span>
          </p>
          <div className="flex flex-wrap items-center gap-x-3">
            <h1 className="font-display text-[28px] leading-[1.05] font-extrabold sm:text-4xl">{def.title}</h1>
            {done ? (
              <Stamp tone="forest" tilt={-6}>
                Done
              </Stamp>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={`${met} of ${total} done. Show what done means.`}
          className="relative shrink-0"
        >
          <Ring value={met / total} />
          <span className="absolute inset-0 flex items-center justify-center font-mono text-[11px] font-semibold tabular">
            {met}/{total}
          </span>
        </button>
      </div>

      <p className="max-w-[56ch] text-[16px] leading-7 text-ink-soft">{def.mission}</p>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1">
          <MapPin className="size-3.5 text-gold-deep" aria-hidden /> {def.setting}
        </span>
        {due && !done ? (
          <span className={cn("font-mono uppercase", isOverdue(due.dueAt) && "font-semibold text-clay")}>{dueLabel(due.dueAt)}</span>
        ) : null}
        <button type="button" onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-1 font-semibold text-ink-soft">
          What counts as done <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} aria-hidden />
        </button>
      </div>

      {open && progress ? (
        <ul className="rise space-y-1.5 rounded-[10px] border-2 border-ink bg-bg-elevated px-3.5 py-3">
          {progress.criteria.map((c) => (
            <li key={c.label} className="flex items-start gap-2 text-sm">
              {c.met ? (
                <Check className="mt-0.5 size-4 shrink-0 text-accent" strokeWidth={3} aria-label="done" />
              ) : (
                <Circle className="mt-0.5 size-4 shrink-0 text-line-strong" aria-label="not yet" />
              )}
              <span className={c.met ? "text-muted line-through decoration-accent/40" : "text-ink"}>
                {c.label}
                {c.detail ? <span className="text-muted no-underline"> — {c.detail}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {feedback.slice(0, 1).map((f) => (
        <div key={f.id} className="rounded-[10px] border-2 border-indigo/40 bg-indigo-soft/60 px-3.5 py-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 font-semibold text-indigo">
              <MessageSquareQuote className="size-4" aria-hidden /> {f.staffName} says
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
    </section>
  );
}

export function Ring({ value, size = 44 }: { value: number; size?: number }) {
  const r = size / 2 - 4;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="var(--color-bg-elevated)" stroke="var(--color-line)" strokeWidth="4" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={value >= 1 ? "var(--color-accent)" : "var(--color-gold)"}
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.min(1, Math.max(0, value)))}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        className="transition-[stroke-dashoffset] duration-500"
      />
    </svg>
  );
}
