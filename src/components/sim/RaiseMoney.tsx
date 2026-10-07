import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FormMessages } from "@/components/ui/feedback";
import { LifeCardView, World } from "@/components/game/FundraiseGame";
import { DAYS, goalOf, type GameState } from "@/lib/game/fundraise";
import { fundraiseAct, fundraiseFinish, fundraiseTravel } from "@/lib/server/fundraising";

const message = (err: unknown) =>
  err instanceof Error ? err.message : "That didn’t work. Check your connection and try again.";

/**
 * The group's fundraising game inside the course. Every move goes to the
 * server, which applies the rules and saves the group's shared game, so
 * whoever in the group picks it up next carries on from the same place.
 */
export function RaiseMoney({
  initial,
  ventureName,
  onLeave,
}: {
  initial: GameState;
  ventureName: string;
  onLeave: () => void;
}) {
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [intro, setIntro] = useState(initial.log.length <= 1);

  async function run(fn: () => Promise<GameState>) {
    setBusy(true);
    setError(null);
    try {
      const next = await fn();
      setState(next);
      if (next.over) onLeave();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  if (intro) {
    return (
      <div className="space-y-5 pt-2">
        <h1 className="font-display text-[34px] leading-[1.05] font-extrabold">
          Raise the money for <span className="mark">{ventureName}</span>
        </h1>
        <p className="text-[16px] leading-7 text-ink-soft">
          From your numbers, you need <strong>GHS {goalOf(state)}</strong> to open: stock for the
          first week and two weeks of running costs. You have <strong>{DAYS} days</strong>. Your
          whole group plays this together, and it’s saved as you go.
        </p>
        <p className="text-xs font-bold tracking-wide text-muted uppercase">
          Your group’s life card
        </p>
        <LifeCardView state={state} />
        <p className="text-sm text-muted">
          Cards are dealt once. Some groups start with more than others, as in life.
        </p>
        <Button size="lg" className="w-full" onClick={() => setIntro(false)}>
          Start day 1
        </Button>
        <button
          type="button"
          className="min-h-11 w-full text-sm font-bold text-muted"
          onClick={onLeave}
        >
          Not now
        </button>
      </div>
    );
  }

  return (
    <div className="-mx-4 pt-1">
      {error ? (
        <div className="px-4 pb-2">
          <FormMessages error={error} />
        </div>
      ) : null}
      <World
        state={state}
        busy={busy}
        sticky={false}
        onTravel={(to, mode) => void run(() => fundraiseTravel({ data: { to, mode } }))}
        onAct={(action, answers) => void run(() => fundraiseAct({ data: { action, answers } }))}
        onFinish={() => void run(() => fundraiseFinish())}
      />
      <div className="px-4">
        <button type="button" className="min-h-11 text-sm font-bold text-muted" onClick={onLeave}>
          Back to your venture
        </button>
      </div>
    </div>
  );
}
