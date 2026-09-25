import { useState } from "react";
import { Check, ChevronDown, Circle, MessageSquareQuote } from "lucide-react";
import { STAGE_BY_ID, type StageId } from "@/lib/domain/stages";
import { progressFromSnapshot } from "@/lib/domain/stage-input";
import type { WorkspaceSnapshot } from "@/lib/domain/types";
import { dueLabel, isOverdue } from "@/lib/dates";
import { StopSticker } from "@/components/ui/sticker";
import { Stamp } from "@/components/ui/stamp";
import { cn } from "@/lib/utils";

const LEVELS = ["", "Getting started", "Developing", "Strong", "Excellent"];

/**
 * The top of every stop: sticker, title, one-line mission, progress ring.
 * Everything else — what counts as done, the setting, the deadline — sits
 * behind one tap. Lecturer feedback is the exception: it is always shown.
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
    <section className="mb-6 space-y-3">
      <div className="flex items-center gap-3.5">
        <StopSticker stage={stage} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-muted">
            Stop {def.stop} of 11
            {due && !done ? (
              <span className={cn(" ml-1", isOverdue(due.dueAt) ? "text-clay" : "")}> · {dueLabel(due.dueAt)}</span>
            ) : null}
          </p>
          <h1 className="font-display text-[28px] leading-[1.05] font-extrabold sm:text-[34px]">{def.title}</h1>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={`${met} of ${total} done. Show what counts.`}
          className="relative shrink-0"
        >
          <Ring value={met / total} />
          <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold tabular">
            {done ? <Check className="size-4 text-mint" strokeWidth={3} /> : `${met}/${total}`}
          </span>
        </button>
      </div>

      <p className="text-[16px] leading-7 text-ink-soft">{def.mission}</p>

      <button type="button" onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-1 text-sm font-semibold text-accent">
        {open ? "Hide" : "What counts as done?"}
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden />
      </button>

      {open && progress ? (
        <ul className="rise space-y-2 rounded-[18px] bg-bg-elevated p-4 ring-1 ring-line">
          {progress.criteria.map((c) => (
            <li key={c.label} className="flex items-start gap-2.5 text-sm">
              {c.met ? (
                <Check className="mt-0.5 size-4 shrink-0 text-mint" strokeWidth={3} aria-label="done" />
              ) : (
                <Circle className="mt-0.5 size-4 shrink-0 text-line-strong" aria-label="not yet" />
              )}
              <span className={c.met ? "text-muted line-through decoration-mint/40" : "text-ink"}>
                {c.label}
                {c.detail ? <span className="text-muted"> — {c.detail}</span> : null}
              </span>
            </li>
          ))}
          <li className="pt-1 text-xs text-muted">Usually happens at: {def.setting}</li>
        </ul>
      ) : null}

      {feedback.slice(0, 1).map((f) => (
        <div key={f.id} className="rounded-[18px] bg-indigo-soft px-4 py-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 font-semibold text-indigo">
              <MessageSquareQuote className="size-4" aria-hidden /> {f.staffName}
            </p>
            {f.level ? <Stamp tone="indigo" size="xs">{LEVELS[f.level]}</Stamp> : null}
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
        stroke={value >= 1 ? "var(--color-mint)" : "var(--color-accent)"}
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
