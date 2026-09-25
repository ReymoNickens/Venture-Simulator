import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { STAGE_BY_ID, STAGES, type StageId, type StageProgress } from "@/lib/domain/stages";
import { StopSticker, Sparkle } from "@/components/ui/sticker";
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
    <div role="dialog" aria-modal aria-label={`${def.title} complete`} className="fixed inset-0 z-50 flex items-end justify-center bg-ink/60 p-3 backdrop-blur-sm sm:items-center">
      <div className="rise w-full max-w-md overflow-hidden rounded-[28px] bg-bg-elevated shadow-2xl">
        <div className="relative px-6 pt-9 pb-6 text-center">
          <Sparkle className="absolute top-6 left-8 size-5 text-gold" />
          <Sparkle className="absolute top-14 right-10 size-4 text-pink" />
          <Sparkle className="absolute bottom-8 left-12 size-3 text-accent" />
          <div className="relative mx-auto w-fit">
            <StopSticker stage={shown} size="xl" />
            <span className="stamp-in absolute -right-12 -bottom-1 rounded-full bg-mint px-3 py-1 text-sm font-bold text-white shadow-md">
              Done!
            </span>
          </div>
          <h2 className="mt-6 font-display text-3xl font-extrabold">{def.title}</h2>
          <p className="mt-2 text-[16px] leading-7 text-ink-soft">{def.payoff}</p>
        </div>
        {next ? (
          <div className="bg-ink px-6 py-5 text-white">
            <p className="text-xs font-semibold text-white/60">Up next</p>
            <div className="mt-2 flex items-center gap-3">
              <StopSticker stage={next.id} size="md" />
              <div>
                <p className="font-display text-xl font-bold">{next.title}</p>
                <p className="text-sm text-white/70">{next.teaser}</p>
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
                Let’s go <ArrowRight className="size-4" aria-hidden />
              </Button>
              <button type="button" onClick={close} className="px-3 text-sm font-semibold text-white/70">
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
