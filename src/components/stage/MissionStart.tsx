import { useState, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { STAGE_BY_ID, type StageId } from "@/lib/domain/stages";
import { StopSticker, Sparkle } from "@/components/ui/sticker";
import { Button } from "@/components/ui/button";

/**
 * The moment before a task: a big sticker, the mission in one sentence, one
 * button. Where and how long are one tap away for anyone who wants them.
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
  const [more, setMore] = useState(false);
  return (
    <section className="tape relative mt-4 rounded-[28px] bg-bg-elevated px-6 pt-10 pb-7 text-center ring-1 ring-line">
      <Sparkle className="absolute top-6 left-6 size-4 text-gold" />
      <Sparkle className="absolute top-12 right-8 size-3 text-clay" />
      <StopSticker stage={stage} size="xl" className="mx-auto" />
      <p className="mt-6 text-xs font-semibold text-muted">Stop {def.stop} of 11</p>
      <h1 className="mt-1 font-display text-[36px] leading-[1.02] font-extrabold sm:text-5xl">{def.title}</h1>
      <p className="mx-auto mt-3 max-w-[34ch] text-[17px] leading-7 text-ink-soft">{def.mission}</p>
      <Button size="lg" className="mt-6" onClick={onStart}>
        {cta} <ArrowRight className="size-4" aria-hidden />
      </Button>
      <div className="mt-4">
        <button type="button" onClick={() => setMore((v) => !v)} className="text-sm font-semibold text-muted underline underline-offset-4">
          {more ? "Less" : "Where and how long?"}
        </button>
        {more ? (
          <div className="rise mx-auto mt-3 max-w-sm space-y-2 text-left text-sm text-ink-soft">
            <p>
              <span className="font-semibold">Where:</span> {def.setting}
            </p>
            <p>
              <span className="font-semibold">Time:</span> {time}
              {bring ? `, ${bring}` : ""}
            </p>
            {children}
          </div>
        ) : null}
      </div>
    </section>
  );
}
