import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Share2 } from "lucide-react";
import { useStudioWorkspace } from "@/hooks/workspace-context";
import { RECAP_SEEN_KEY, recapInputFrom, recapWeeks, weekLabel, weeklyRecap } from "@/lib/domain/recap";
import { shareRecap } from "@/lib/recap-image";
import { RecapCard } from "@/components/recap/RecapCard";
import { EmptyNote } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormMessages, Loading } from "@/components/ui/feedback";
import { useAction } from "@/hooks/use-action";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/studio/recap")({ component: RecapPage });

function RecapPage() {
  const { data, loading } = useStudioWorkspace();
  const [index, setIndex] = useState(0);
  const { pending, error, notice, run, setNotice } = useAction();

  const input = useMemo(() => (data ? recapInputFrom(data) : null), [data]);
  const weeks = useMemo(() => (input ? recapWeeks(input) : []), [input]);
  const week = weeks[Math.min(index, weeks.length - 1)];
  const recap = useMemo(() => (input && week ? weeklyRecap(input, week) : null), [input, week]);

  // Opening the page counts as seeing last week's card.
  const owner = data?.student?.id;
  useEffect(() => {
    if (!owner || weeks.length < 2) return;
    try {
      localStorage.setItem(RECAP_SEEN_KEY(owner), weeks[1].toISOString());
    } catch {
      // storage blocked: Today will keep offering the card, which is harmless
    }
  }, [owner, weeks]);

  if (loading || !data) return <Loading />;
  if (!data.group)
    return (
      <EmptyNote>
        Your weekly card starts once you are in a crew.{" "}
        <Link to="/studio/group" className="font-semibold text-accent underline">
          Team up
        </Link>
      </EmptyNote>
    );
  if (!recap) return <Loading />;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-[34px] leading-tight font-extrabold">Your week</h1>
        <p className="mt-1 text-[15px] text-muted">What your crew did in the field. Share it on your status.</p>
      </div>

      {weeks.length > 1 ? (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="tablist" aria-label="Choose a week">
          {weeks.map((w, i) => (
            <button
              key={w.toISOString()}
              type="button"
              role="tab"
              aria-selected={i === index}
              onClick={() => {
                setIndex(i);
                setNotice(null);
              }}
              className={cn(
                "h-9 shrink-0 rounded-full px-4 text-sm font-semibold",
                i === index ? "bg-ink text-white" : "bg-bg-subtle text-ink-soft",
              )}
            >
              {i === 0 ? "This week" : i === 1 ? "Last week" : weekLabel(w)}
            </button>
          ))}
        </div>
      ) : null}

      <RecapCard recap={recap} />

      <div className="space-y-2">
        <Button
          size="lg"
          className="w-full"
          disabled={Boolean(pending)}
          onClick={() =>
            void run("share", async () => {
              const how = await shareRecap(recap, data.appName);
              setNotice(how === "saved" ? "Saved to your phone. Post it from your photos." : how === "shared" ? "Shared." : null);
            })
          }
        >
          <Share2 className="size-4" aria-hidden /> {pending ? "Making your card…" : "Share this card"}
        </Button>
        <FormMessages error={error} notice={notice} />
        <p className="text-center text-xs text-muted">Crew totals only. No names, no rankings. Quotes appear only with the person’s consent.</p>
      </div>
    </div>
  );
}
