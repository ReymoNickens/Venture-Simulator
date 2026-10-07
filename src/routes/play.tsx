import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Bus, Footprints, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LogoMark } from "@/components/ui/sticker";
import { CapeCoastMap } from "@/components/game/CapeCoastMap";
import {
  actionsAt,
  BANK_QUESTIONS,
  cardOf,
  DAYS,
  finish,
  GOAL,
  newGame,
  perform,
  PLACES,
  SLOT_NAMES,
  SOURCE_NAMES,
  summary,
  travel,
  travelOptions,
  type Action,
  type GameState,
  type PlaceId,
} from "@/lib/game/fundraise";
import { cn } from "@/lib/utils";

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
  if (state.over) return <End state={state} onAgain={() => update(null)} />;
  return <World state={state} onChange={update} />;
}

function Deal({ onStart }: { onStart: (s: GameState) => void }) {
  const [game, setGame] = useState(() => newGame(Math.floor(Math.random() * 1e9)));
  const card = cardOf(game);
  return (
    <main className="min-h-dvh text-ink">
      <div className="mx-auto max-w-md px-5 py-8">
        <div className="flex items-center justify-between">
          <LogoMark />
          <span className="rounded-full border-2 border-ink bg-gold px-2.5 py-0.5 text-xs font-bold">Prototype</span>
        </div>
        <h1 className="mt-6 font-display text-[40px] leading-[1.02] font-extrabold">
          Raise the <span className="mark">money.</span>
        </h1>
        <p className="mt-3 text-[16px] leading-7 text-ink-soft">
          Your venture needs <strong>GHS {GOAL}</strong> to open. You have <strong>{DAYS} days</strong>. Money won’t come to you:
          you’ll have to go and get it.
        </p>
        <p className="mt-6 text-xs font-bold tracking-wide text-muted uppercase">Your life card</p>
        <div key={game.cardId} className="paper flow-enter mt-2 -rotate-1 rounded-[18px] p-5">
          <p className="font-display text-xl leading-tight font-extrabold">{card.title}</p>
          <p className="mt-2 text-[15px] leading-6 text-ink-soft">{card.story}</p>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <Stat label="Savings" value={`GHS ${card.cash}`} />
            <Stat label="Family trust" value={`${card.familyTrust}`} />
            <Stat label="Friend trust" value={`${card.friendTrust}`} />
          </div>
        </div>
        <p className="mt-3 text-sm text-muted">In class, everyone is dealt a card and keeps it. In this prototype you can deal again.</p>
        <div className="mt-6 grid gap-2">
          <Button size="lg" onClick={() => onStart(game)}>
            Start day 1
          </Button>
          <Button variant="secondary" onClick={() => setGame(newGame(Math.floor(Math.random() * 1e9)))}>
            Deal another card
          </Button>
        </div>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] bg-bg-subtle px-2 py-2">
      <p className="font-display text-base font-extrabold">{value}</p>
      <p className="text-[11px] font-bold text-muted">{label}</p>
    </div>
  );
}

function World({ state, onChange }: { state: GameState; onChange: (s: GameState | null) => void }) {
  const [selected, setSelected] = useState<PlaceId>(state.at);
  const [interview, setInterview] = useState(false);
  const here = selected === state.at;
  const place = PLACES[selected];
  // The newest thing that happened; a bare "Day 4." line is already in the status bar.
  const last = [...state.log].reverse().find((l) => !/^Day \d+\.$/.test(l.text)) ?? state.log[state.log.length - 1];
  const pct = Math.min(100, Math.round((state.cash / GOAL) * 100));

  function act(a: Action) {
    if (a.id === "bank_interview" && !a.blocked) {
      setInterview(true);
      return;
    }
    onChange(perform(state, a.id));
  }

  return (
    <main className="min-h-dvh pb-10 text-ink">
      {/* Status */}
      <div className="sticky top-0 z-20 border-b-2 border-ink bg-bg-elevated">
        <div className="mx-auto max-w-md px-4 py-2.5">
          <div className="flex items-center justify-between gap-2 text-sm">
            <p className="font-display font-extrabold">
              Day {state.day} of {DAYS} · <span className="text-accent">{SLOT_NAMES[state.slot]}</span>
            </p>
            <p className="font-display font-extrabold tabular-nums">GHS {state.cash}</p>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <Bar label="Energy" value={state.energy} tone={state.energy < 30 ? "bg-clay" : "bg-accent"} />
            <Bar label={`Goal GHS ${GOAL}`} value={pct} tone="bg-gold" />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-md">
        <div className="border-b-2 border-ink">
          <CapeCoastMap at={state.at} selected={selected} onSelect={setSelected} />
        </div>

        <div className="space-y-4 px-4 pt-4">
          {last ? (
            <p
              key={state.log.length}
              className={cn(
                "flow-enter rounded-[14px] border-2 border-ink px-3 py-2 text-[15px] leading-6",
                last.tone === "good" ? "bg-accent-soft" : last.tone === "bad" ? "bg-clay-soft" : "bg-bg-elevated",
              )}
            >
              {last.text}
            </p>
          ) : null}

          <section className="paper rounded-[18px] p-4">
            <p className="text-xs font-bold text-muted">{place.area}</p>
            <h2 className="font-display text-2xl leading-tight font-extrabold">{place.name}</h2>
            <p className="mt-1 text-[15px] leading-6 text-ink-soft">{place.blurb}</p>

            {here ? (
              <ul className="mt-3 space-y-2">
                {actionsAt(state).map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      disabled={Boolean(a.blocked)}
                      onClick={() => act(a)}
                      className={cn(
                        "w-full rounded-[14px] border-2 px-3 py-2.5 text-left transition-[transform,box-shadow]",
                        a.blocked
                          ? "border-line bg-bg-subtle text-muted"
                          : "border-ink bg-bg-elevated shadow-[3px_3px_0_var(--color-ink)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none",
                      )}
                    >
                      <span className="block font-display font-extrabold">{a.label}</span>
                      <span className="block text-sm leading-5">{a.blocked ?? a.detail}</span>
                      {!a.blocked ? (
                        <span className="mt-1.5 flex flex-wrap gap-1.5 text-xs font-bold">
                          {a.slots ? <Chip>{a.slots === 1 ? "Takes part of the day" : "Takes most of the day"}</Chip> : null}
                          {a.energy ? <Chip>−{a.energy} energy</Chip> : null}
                          {a.cost ? <Chip>GHS {a.cost}</Chip> : null}
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-3 grid gap-2">
                {travelOptions(state, selected).map((o) => (
                  <Button
                    key={o.mode}
                    size="lg"
                    variant={o.mode === "trotro" ? "primary" : "secondary"}
                    onClick={() => onChange(travel(state, selected, o.mode))}
                  >
                    {o.mode === "trotro" ? <Bus className="size-4" aria-hidden /> : <Footprints className="size-4" aria-hidden />}
                    {o.label} · {o.fare ? `GHS ${o.fare}` : "free"} · −{o.energy} energy
                  </Button>
                ))}
              </div>
            )}
          </section>

          <Diary state={state} />

          <div className="flex items-center justify-between gap-3 pt-2">
            <button
              type="button"
              className="flex min-h-11 items-center gap-1.5 text-sm font-bold text-muted"
              onClick={() => window.confirm("Start again with a new life card?") && onChange(null)}
            >
              <RotateCcw className="size-4" aria-hidden /> Start again
            </button>
            <Button variant="secondary" onClick={() => onChange(finish(state))}>
              I’m done raising money
            </Button>
          </div>
        </div>
      </div>

      {interview ? (
        <Interview
          state={state}
          onClose={() => setInterview(false)}
          onDone={(answers) => {
            setInterview(false);
            onChange(perform(state, "bank_interview", answers));
          }}
        />
      ) : null}
    </main>
  );
}

function Bar({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div>
      <div className="flex justify-between text-[11px] font-bold text-muted">
        <span>{label}</span>
        <span>{value}%</span>
      </div>
      <div className="mt-0.5 h-2.5 overflow-hidden rounded-full border border-ink/30 bg-bg-subtle">
        <div className={cn("h-full rounded-full transition-[width] duration-500", tone)} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-bg-subtle px-2 py-0.5">{children}</span>;
}

function Diary({ state }: { state: GameState }) {
  return (
    <details className="rounded-[16px] border border-line bg-bg-elevated px-4">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between font-display font-extrabold">
        Your diary
        <span className="text-sm font-bold text-muted">
          Pitch {state.pitch}/3 · Evidence {state.evidence}
        </span>
      </summary>
      <ol className="space-y-1.5 pb-4 text-sm leading-6">
        {[...state.log].reverse().map((l, i) => (
          <li key={i} className={cn(l.tone === "bad" && "text-clay", l.tone === "good" && "text-accent")}>
            <span className="font-bold text-muted">Day {l.day}: </span>
            {l.text}
          </li>
        ))}
      </ol>
    </details>
  );
}

/** The bank's loans officer asks three questions, one at a time. */
function Interview({ state, onClose, onDone }: { state: GameState; onClose: () => void; onDone: (answers: number[]) => void }) {
  const [answers, setAnswers] = useState<number[]>([]);
  const q = BANK_QUESTIONS[answers.length];
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/50 sm:items-center" role="dialog" aria-modal="true" aria-label="Bank interview">
      <div className="paper flow-enter w-full max-w-md rounded-t-[22px] p-5 sm:rounded-[22px]">
        <div className="flex items-center gap-3">
          <span className="sticker flex size-12 shrink-0 items-center justify-center rounded-full bg-indigo font-display text-lg font-extrabold text-white">AM</span>
          <div>
            <p className="font-display font-extrabold">Mrs Abena Mensah</p>
            <p className="text-sm text-muted">Loans officer · question {answers.length + 1} of {BANK_QUESTIONS.length}</p>
          </div>
        </div>
        <p className="mt-4 rounded-[14px] bg-indigo-soft px-4 py-3 font-display text-lg leading-snug font-extrabold">“{q.q}”</p>
        <p className="mt-3 text-sm font-bold text-muted">You say:</p>
        <div className="mt-2 grid gap-2">
          {q.answers.map((a, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                const next = [...answers, i];
                if (next.length === BANK_QUESTIONS.length) onDone(next);
                else setAnswers(next);
              }}
              className="w-full rounded-[14px] border-2 border-ink bg-bg-elevated px-3 py-2.5 text-left text-[15px] leading-6 shadow-[3px_3px_0_var(--color-ink)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            >
              {a.text}
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted">
          She can see your evidence notes ({state.evidence}) and how prepared your pitch is ({state.pitch}/3).
        </p>
        <button type="button" className="mt-2 min-h-11 text-sm font-bold text-muted" onClick={onClose}>
          Leave the queue
        </button>
      </div>
    </div>
  );
}

function End({ state, onAgain }: { state: GameState; onAgain: () => void }) {
  const s = summary(state);
  const made = s.short === 0;
  return (
    <main className="min-h-dvh text-ink">
      <div className="mx-auto max-w-md space-y-5 px-5 py-8">
        <LogoMark />
        <h1 className="font-display text-[36px] leading-tight font-extrabold">
          {made ? (
            <>
              You raised <span className="mark">GHS {s.cash}</span>
            </>
          ) : (
            <>
              You’re <span className="mark text-clay">GHS {s.short}</span> short
            </>
          )}
        </h1>
        <div className="paper space-y-2 rounded-[18px] p-4 text-[15px]">
          <p className="font-display font-extrabold">Where the money came from</p>
          {s.bySource.map((b) => (
            <div key={b.source} className="flex justify-between gap-3">
              <span>{SOURCE_NAMES[b.source]}</span>
              <span className="tabular-nums">GHS {b.amount}</span>
            </div>
          ))}
          <div className="border-t-2 border-dashed border-ink/30 pt-2">
            <div className="flex justify-between gap-3 font-bold">
              <span>Repayments every week</span>
              <span className={cn("tabular-nums", s.weeklyRepayments > 0 && "text-clay")}>GHS {s.weeklyRepayments}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>Total to pay back</span>
              <span className="tabular-nums">GHS {s.totalToRepay}</span>
            </div>
            {s.equityGiven ? (
              <div className="flex justify-between gap-3">
                <span>Share of your venture given away</span>
                <span className="tabular-nums">{s.equityGiven}%</span>
              </div>
            ) : null}
          </div>
        </div>
        {s.lessons.length ? (
          <div className="rounded-[18px] border-2 border-ink bg-gold-soft p-4">
            <p className="font-display font-extrabold">Talk about this with your group</p>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[15px] leading-6">
              {s.lessons.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <p className="text-sm text-muted">
          In the full course, this money and these repayments would carry straight into running your venture.
        </p>
        <div className="grid gap-2">
          <Button size="lg" onClick={onAgain}>
            Play again with a new life card
          </Button>
          <Link to="/" className="inline-flex min-h-11 items-center justify-center text-sm font-bold text-muted">
            Back to the app
          </Link>
        </div>
      </div>
    </main>
  );
}
