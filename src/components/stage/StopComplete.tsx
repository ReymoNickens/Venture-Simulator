import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { STAGE_BY_ID, STAGES, type StageId, type StageProgress } from "@/lib/domain/stages";
import { Emblem } from "@/components/ui/emblem";
import { Button } from "@/components/ui/button";

const KEY = (owner: string) => `evp:stops-done:${owner}`;

/**
 * The payoff moment. When a stop becomes done — from this student's action or
 * a teammate's — the stop is stamped, the payoff line lands, and the next
 * stop is revealed. First load of a device only records what is already done,
 * so nobody gets a pile of stale celebrations.
 */
export function StopComplete({ owner, progress }: { owner: string; progress: StageProgress[] }) {
  const [shown, setShown] = useState<StageId | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const done = progress.filter((p) => p.state === "done").map((p) => p.id);
    let seen: StageId[] | null = null;
    try {
      const raw = localStorage.getItem(KEY(owner));
      seen = raw ? (JSON.parse(raw) as StageId[]) : null;
    } catch {
      return; // storage blocked: skip celebrations rather than repeat them
    }
    const merged = [...new Set([...(seen ?? []), ...done])];
    try {
      localStorage.setItem(KEY(owner), JSON.stringify(merged));
    } catch {
      return;
    }
    if (seen === null) return; // first visit on this device: just record
    const fresh = done.filter((id) => !seen!.includes(id));
    if (fresh.length) {
      // Celebrate the furthest stop reached.
      setShown([...fresh].sort((a, b) => STAGE_BY_ID[b].stop - STAGE_BY_ID[a].stop)[0]);
    }
  }, [owner, progress]);

  if (!shown) return null;
  const def = STAGE_BY_ID[shown];
  const next = STAGES.find((s) => s.stop === def.stop + 1);
  const close = () => setShown(null);

  return (
    <div role="dialog" aria-modal aria-label={`${def.title} complete`} className="fixed inset-0 z-50 flex items-end justify-center bg-ink/70 p-3 sm:items-center">
      <div className="rise w-full max-w-md overflow-hidden rounded-[16px] border-2 border-ink bg-bg-elevated shadow-[6px_6px_0_0_var(--color-gold)]">
        <div className="kente h-3" aria-hidden />
        <div className="px-6 pt-7 pb-6 text-center">
          <div className="relative mx-auto flex size-24 items-center justify-center rounded-full border-2 border-ink bg-gold-soft">
            <Emblem emblem={def.emblem} className="size-14" />
            <span className="stamp-in stamp absolute -right-8 -bottom-2 bg-bg-elevated px-2 py-1 text-sm text-accent">
              Stop {String(def.stop).padStart(2, "0")} done
            </span>
          </div>
          <h2 className="mt-6 font-display text-3xl font-extrabold">{def.title}</h2>
          <p className="mt-2 text-[16px] leading-7 text-ink-soft">{def.payoff}</p>
        </div>
        {next ? (
          <div className="border-t-2 border-dashed border-ink/30 bg-ink px-6 py-5 text-bg-elevated">
            <p className="font-mono text-[11px] tracking-[0.16em] text-gold uppercase">Next stop · {String(next.stop).padStart(2, "0")}</p>
            <div className="mt-2 flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-[8px] border-2 border-gold bg-gold text-ink">
                <Emblem emblem={next.emblem} className="size-7" />
              </span>
              <div>
                <p className="font-display text-xl font-extrabold">{next.title}</p>
                <p className="text-sm text-bg-elevated/75">{next.teaser}</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant="gold"
                onClick={() => {
                  close();
                  void navigate({ to: next.href });
                }}
              >
                Go there <ArrowRight className="size-4" aria-hidden />
              </Button>
              <button type="button" onClick={close} className="px-3 text-sm font-semibold text-bg-elevated/70">
                Later
              </button>
            </div>
          </div>
        ) : (
          <div className="px-6 pb-6 text-center">
            <Button onClick={close}>Close</Button>
          </div>
        )}
      </div>
    </div>
  );
}
