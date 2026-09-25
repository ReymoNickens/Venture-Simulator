import type { ReactNode } from "react";
import { ArrowRight, Clock, MapPin } from "lucide-react";
import { EMBLEMS, STAGE_BY_ID, type StageId } from "@/lib/domain/stages";
import { Emblem } from "@/components/ui/emblem";
import { Button } from "@/components/ui/button";

/**
 * The moment before a task: what you are about to do, where, and how long
 * it takes — then one button. Sets intent instead of dropping the student
 * into a form.
 */
export function MissionStart({
  stage,
  time,
  bring,
  cta,
  onStart,
  children,
}: {
  stage: StageId;
  time: string;
  bring?: string;
  cta: string;
  onStart: () => void;
  children?: ReactNode;
}) {
  const def = STAGE_BY_ID[stage];
  return (
    <section className="overflow-hidden rounded-[14px] border-2 border-ink bg-ink text-bg-elevated shadow-[5px_5px_0_0_var(--color-gold)]">
      <div className="kente h-2" aria-hidden />
      <div className="p-5 sm:p-7">
        <div className="flex items-center gap-3">
          <span className="flex size-12 items-center justify-center rounded-[10px] border-2 border-gold bg-gold text-ink">
            <Emblem emblem={def.emblem} className="size-8" />
          </span>
          <div>
            <p className="font-mono text-[11px] tracking-[0.16em] text-gold uppercase">Stop {String(def.stop).padStart(2, "0")}</p>
            <p className="text-xs text-bg-elevated/60 italic">{EMBLEMS[def.emblem].meaning}</p>
          </div>
        </div>
        <h1 className="mt-4 font-display text-[34px] leading-[1.02] font-extrabold sm:text-5xl">{def.title}</h1>
        <p className="mt-3 max-w-[40ch] text-[17px] leading-7 text-bg-elevated/85">{def.mission}</p>
        <ul className="mt-5 space-y-1.5 text-sm text-bg-elevated/75">
          <li className="flex items-center gap-2">
            <MapPin className="size-4 text-gold" aria-hidden /> {def.setting}
          </li>
          <li className="flex items-center gap-2">
            <Clock className="size-4 text-gold" aria-hidden /> {time}
            {bring ? ` · ${bring}` : ""}
          </li>
        </ul>
        {children}
        <Button variant="gold" size="lg" className="mt-6" onClick={onStart}>
          {cta} <ArrowRight className="size-4" aria-hidden />
        </Button>
      </div>
    </section>
  );
}
