import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, Pencil, X } from "lucide-react";
import { getOfflineOwner } from "@/lib/offline/idb";
import { Button } from "@/components/ui/button";
import { FormMessages } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";

/**
 * One question per screen.
 *
 * Long forms are where motivation dies, especially on a phone. A step flow
 * shows a single question in large type, one line on why it matters, and a
 * clear Next — with a progress bar so the end is always in sight. Answers are
 * kept on this device (per account) as they are typed, so closing the app
 * mid-way loses nothing.
 */

export interface Step<V> {
  id: string;
  /** Optional section label above the question ("What you saw"). */
  section?: string;
  question: string;
  hint?: string;
  optional?: boolean;
  /** Input for this step. `next` lets a single-choice step advance on tap. */
  render: (values: V, set: (patch: Partial<V>) => void, next: () => void) => ReactNode;
  /** true when the step can be left; a string explains what is missing. */
  valid?: (values: V) => boolean | string;
  /** Hide the step entirely for these values. */
  skipIf?: (values: V) => boolean;
  /** How the answer reads on the review screen. */
  summary?: (values: V) => string;
}

export function StepFlow<V extends object>({
  steps,
  initial,
  draftKey,
  finishLabel,
  reviewTitle = "Check it, then send",
  onFinish,
  onCancel,
  extraFinish,
}: {
  steps: Step<V>[];
  initial: V;
  /** Autosave key; drafts are stored per signed-in account. */
  draftKey?: string;
  finishLabel: string;
  reviewTitle?: string;
  onFinish: (values: V) => Promise<void>;
  onCancel?: () => void;
  /** Secondary action on the review screen (e.g. "Save draft"). */
  extraFinish?: { label: string; run: (values: V) => Promise<void> };
}) {
  const storageKey = draftKey ? `evp:draft:${getOfflineOwner() ?? "anon"}:${draftKey}` : null;
  const [values, setValues] = useState<V>(() => {
    if (!storageKey || typeof localStorage === "undefined") return initial;
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? { ...initial, ...(JSON.parse(raw) as Partial<V>) } : initial;
    } catch {
      return initial;
    }
  });
  const visible = useMemo(() => steps.filter((s) => !s.skipIf?.(values)), [steps, values]);
  // Tap-to-advance answers call next() from a timer set during the click,
  // before React re-renders — so validation must read the latest answers,
  // not the ones captured by that render.
  const valuesRef = useRef(values);
  valuesRef.current = values;
  const [index, setIndex] = useState(0);
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const step = visible[Math.min(index, visible.length - 1)];

  useEffect(() => {
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(values));
    } catch {
      /* storage full or blocked — the flow still works, just without autosave */
    }
  }, [values, storageKey]);

  // Put the cursor in the answer, so a student can just type.
  useEffect(() => {
    const el = bodyRef.current?.querySelector<HTMLElement>("textarea, input:not([type=checkbox]):not([type=radio])");
    el?.focus({ preventScroll: true });
    setError(null);
  }, [index, reviewing]);

  const set = (patch: Partial<V>) => {
    valuesRef.current = { ...valuesRef.current, ...patch };
    setValues((v) => ({ ...v, ...patch }));
  };
  const check = (s: Step<V>): string | null => {
    const r = s.valid ? s.valid(valuesRef.current) : true;
    return r === true ? null : typeof r === "string" ? r : "Answer this to continue.";
  };
  const next = () => {
    const live = steps.filter((s) => !s.skipIf?.(valuesRef.current));
    const current = live[Math.min(index, live.length - 1)];
    if (!current) return;
    const problem = check(current);
    if (problem && !current.optional) return setError(problem);
    if (index >= live.length - 1) setReviewing(true);
    else setIndex((i) => i + 1);
  };
  const back = () => {
    if (reviewing) return setReviewing(false);
    if (index > 0) setIndex((i) => i - 1);
    else onCancel?.();
  };
  const clearDraft = () => {
    if (storageKey) {
      try {
        localStorage.removeItem(storageKey);
      } catch {
        /* ignore */
      }
    }
  };
  const finish = async (fn: (v: V) => Promise<void>, key: string, validate = true) => {
    const firstBad = validate ? visible.findIndex((s) => !s.optional && check(s)) : -1;
    if (firstBad >= 0) {
      setReviewing(false);
      setIndex(firstBad);
      setError(check(visible[firstBad]));
      return;
    }
    setBusy(key);
    setError(null);
    try {
      await fn(values);
      clearDraft();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not save. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const progress = reviewing ? 1 : visible.length ? index / visible.length : 0;

  return (
    <div className="overflow-hidden rounded-[22px] ring-1 ring-line bg-bg-elevated">
      <div className="flex items-center gap-3 border-b border-line px-3 py-2.5">
        <button type="button" onClick={back} aria-label="Back" className="rounded-full p-1.5 hover:bg-bg-subtle">
          <ArrowLeft className="size-5" aria-hidden />
        </button>
        <div
          className="flex h-2.5 flex-1 overflow-hidden rounded-full ring-1 ring-line bg-bg-subtle"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
        >
          <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${Math.max(4, progress * 100)}%` }} />
        </div>
        <span className="font-mono text-xs tabular text-muted">
          {reviewing ? "Review" : `${index + 1}/${visible.length}`}
        </span>
        {onCancel ? (
          <button type="button" onClick={onCancel} aria-label="Close" className="rounded-full p-1.5 hover:bg-bg-subtle">
            <X className="size-5" aria-hidden />
          </button>
        ) : null}
      </div>

      <div ref={bodyRef} key={reviewing ? "review" : step?.id} className="flow-enter px-4 pt-6 pb-5 sm:px-7 sm:pt-8">
        {reviewing ? (
          <div className="space-y-4">
            <h2 className="font-display text-[26px] leading-tight font-extrabold">{reviewTitle}</h2>
            <ul className="divide-y divide-line">
              {visible.map((s, i) => {
                const text = s.summary ? s.summary(values) : "";
                return (
                  <li key={s.id} className="flex items-start gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-muted">{s.question}</p>
                      <p className={cn("mt-0.5 text-sm leading-6 whitespace-pre-line", !text && "text-faint italic")}>
                        {text || (s.optional ? "Skipped" : "Missing")}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setReviewing(false);
                        setIndex(i);
                      }}
                      className="flex shrink-0 items-center gap-1 text-xs font-semibold text-accent"
                    >
                      <Pencil className="size-3" aria-hidden /> Edit
                    </button>
                  </li>
                );
              })}
            </ul>
            <FormMessages error={error} />
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="lg" disabled={Boolean(busy)} onClick={() => void finish(onFinish, "finish")}>
                <Check className="size-4" aria-hidden /> {busy === "finish" ? "Saving…" : finishLabel}
              </Button>
              {extraFinish ? (
                <Button size="lg" variant="secondary" disabled={Boolean(busy)} onClick={() => void finish(extraFinish.run, "extra", false)}>
                  {busy === "extra" ? "Saving…" : extraFinish.label}
                </Button>
              ) : null}
            </div>
          </div>
        ) : step ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              next();
            }}
            onKeyDown={(e) => {
              // Ctrl/Cmd+Enter moves on from a textarea; plain Enter adds a line.
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                next();
              }
            }}
            className="space-y-5"
          >
            <div>
              {step.section ? (
                <p className="text-xs font-semibold text-gold-deep">{step.section}</p>
              ) : null}
              <h2 className="mt-1 font-display text-[26px] leading-[1.15] font-extrabold sm:text-3xl">{step.question}</h2>
              {step.hint ? <p className="mt-2 text-[15px] leading-6 text-muted">{step.hint}</p> : null}
            </div>
            <div>{step.render(values, set, next)}</div>
            <FormMessages error={error} />
            <div className="flex items-center gap-3">
              <Button type="submit" size="lg">
                {index >= visible.length - 1 ? "Review" : "Next"} <ArrowRight className="size-4" aria-hidden />
              </Button>
              {step.optional ? (
                <button type="button" onClick={() => (index >= visible.length - 1 ? setReviewing(true) : setIndex((i) => i + 1))} className="text-sm font-semibold text-muted underline underline-offset-2">
                  Skip for now
                </button>
              ) : null}
            </div>
          </form>
        ) : null}
      </div>
    </div>
  );
}

// ── Inputs sized for a step flow ────────────────────────────────────────────

const big =
  "w-full rounded-[18px] border-2 border-line-strong/70 bg-bg px-4 text-[17px] leading-7 text-ink placeholder:text-faint focus-visible:border-accent focus-visible:outline-none";

export function BigText({
  value,
  onChange,
  placeholder,
  rows = 4,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  label: string;
}) {
  return (
    <div>
      <textarea
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className={cn(big, "py-3")}
      />
      <p className="mt-1 text-right font-mono text-[11px] text-faint">{value.trim().length} characters</p>
    </div>
  );
}

export function BigInput({
  value,
  onChange,
  placeholder,
  label,
  type = "text",
  inputMode,
  list,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  label: string;
  type?: string;
  inputMode?: "text" | "numeric" | "decimal";
  list?: string;
}) {
  return (
    <input
      aria-label={label}
      value={value}
      type={type}
      inputMode={inputMode}
      list={list}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn(big, "h-14")}
    />
  );
}

/** Big tap targets; picking one moves straight on when `autoNext` is set. */
export function Pick<T extends string>({
  options,
  value,
  onChange,
  onPicked,
}: {
  options: readonly { value: T; label: string; hint?: string }[];
  value: T | "";
  onChange: (v: T) => void;
  onPicked?: () => void;
}) {
  return (
    <div className="grid gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => {
            onChange(o.value);
            if (onPicked) setTimeout(onPicked, 180);
          }}
          className={cn(
            "flex items-start gap-3 rounded-[18px] border-2 px-4 py-3 text-left transition-colors",
            value === o.value ? "border-ink bg-ink text-bg-elevated" : "border-line-strong/70 bg-bg hover:border-ink/60",
          )}
        >
          <span
            className={cn(
              "mt-1 size-4 shrink-0 rounded-full border-2",
              value === o.value ? "border-gold bg-gold" : "border-line-strong",
            )}
          />
          <span>
            <span className="block text-[16px] font-semibold">{o.label}</span>
            {o.hint ? (
              <span className={cn("block text-sm", value === o.value ? "text-bg-elevated/75" : "text-muted")}>{o.hint}</span>
            ) : null}
          </span>
        </button>
      ))}
    </div>
  );
}

/** Tappable suggestions that fill a text answer — local places, common answers. */
export function Suggest({ items, onPick }: { items: readonly string[]; onPick: (v: string) => void }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {items.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onPick(s)}
          className="rounded-full border border-line-strong bg-bg-elevated px-3 py-1 text-sm text-ink-soft hover:border-ink"
        >
          {s}
        </button>
      ))}
    </div>
  );
}

export function Scale({
  value,
  onChange,
  low,
  high,
  onPicked,
}: {
  value: number | null;
  onChange: (n: number) => void;
  low: string;
  high: string;
  onPicked?: () => void;
}) {
  return (
    <div>
      <div className="grid grid-cols-5 gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={value === n}
            aria-label={`${n} of 5`}
            onClick={() => {
              onChange(n);
              if (onPicked) setTimeout(onPicked, 180);
            }}
            className={cn(
              "h-14 rounded-[18px] border-2 font-display text-2xl font-extrabold",
              value === n ? "border-ink bg-gold" : "border-line-strong/70 bg-bg",
            )}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-xs text-muted">
        <span>{low}</span>
        <span>{high}</span>
      </div>
    </div>
  );
}
