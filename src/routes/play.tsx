import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { LogoMark } from "@/components/ui/sticker";
import { End, LifeCardView, World } from "@/components/game/FundraiseGame";
import { DAYS, finish, GOAL, newGame, perform, travel, type GameState } from "@/lib/game/fundraise";

export const Route = createFileRoute("/play")({ component: PlayPage });

const SAVE_KEY = "fundraise-game-v1";

function load(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? (JSON.parse(raw) as GameState) : null;
  } catch {
    return null;
  }
}
function save(s: GameState | null) {
  try {
    if (s) localStorage.setItem(SAVE_KEY, JSON.stringify(s));
    else localStorage.removeItem(SAVE_KEY);
  } catch {
    // Private mode: the game just won't survive a reload.
  }
}

/**
 * Prototype: raising the money to start. Ten days in a small Cape Coast,
 * with time, energy and cash to spend, and people and places that might
 * help. Runs entirely on the phone (no account, nothing sent anywhere).
 */
function PlayPage() {
  const [state, setState] = useState<GameState | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setState(load());
    setReady(true);
  }, []);
  const update = (s: GameState | null) => {
    setState(s);
    save(s);
  };

  if (!ready) return <div className="min-h-dvh" />;
  if (!state) return <Deal onStart={(s) => update(s)} />;
  if (state.over)
    return (
      <main className="mx-auto min-h-dvh max-w-md space-y-5 px-5 py-8 text-ink">
        <LogoMark />
        <End state={state}>
          <p className="text-sm text-muted">
            In the course, this money and these repayments carry straight into running your venture.
          </p>
          <div className="grid gap-2">
            <Button size="lg" onClick={() => update(null)}>
              Play again with a new life card
            </Button>
            <Link
              to="/"
              className="inline-flex min-h-11 items-center justify-center text-sm font-bold text-muted"
            >
              Back to the app
            </Link>
          </div>
        </End>
      </main>
    );
  return (
    <World
      state={state}
      onTravel={(to, mode) => update(travel(state, to, mode))}
      onAct={(action, answers) => update(perform(state, action, answers))}
      onFinish={() => update(finish(state))}
      onReset={() => update(null)}
    />
  );
}

function Deal({ onStart }: { onStart: (s: GameState) => void }) {
  const [game, setGame] = useState(() => newGame(Math.floor(Math.random() * 1e9)));
  return (
    <main className="min-h-dvh text-ink">
      <div className="mx-auto max-w-md px-5 py-8">
        <div className="flex items-center justify-between">
          <LogoMark />
          <span className="rounded-full border-2 border-ink bg-gold px-2.5 py-0.5 text-xs font-bold">
            Prototype
          </span>
        </div>
        <h1 className="mt-6 font-display text-[40px] leading-[1.02] font-extrabold">
          Raise the <span className="mark">money.</span>
        </h1>
        <p className="mt-3 text-[16px] leading-7 text-ink-soft">
          Your venture needs <strong>GHS {GOAL}</strong> to open. You have{" "}
          <strong>{DAYS} days</strong>. Money won’t come to you: you’ll have to go and get it.
        </p>
        <p className="mt-6 text-xs font-bold tracking-wide text-muted uppercase">Your life card</p>
        <div className="mt-2">
          <LifeCardView state={game} />
        </div>
        <p className="mt-3 text-sm text-muted">
          In class, everyone is dealt a card and keeps it. In this prototype you can deal again.
        </p>
        <div className="mt-6 grid gap-2">
          <Button size="lg" onClick={() => onStart(game)}>
            Start day 1
          </Button>
          <Button
            variant="secondary"
            onClick={() => setGame(newGame(Math.floor(Math.random() * 1e9)))}
          >
            Deal another card
          </Button>
        </div>
      </div>
    </main>
  );
}
