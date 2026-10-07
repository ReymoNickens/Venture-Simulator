import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { FormMessages, Loading } from "@/components/ui/feedback";
import { StepHeader } from "@/components/shell/StepHeader";
import { MarketInfo } from "@/components/sim/MarketInfo";
import { ghs } from "@/components/sim/money";
import { NumbersWizard } from "@/components/sim/NumbersWizard";
import { RaiseMoney } from "@/components/sim/RaiseMoney";
import { End } from "@/components/game/FundraiseGame";
import { startFundraising } from "@/lib/server/fundraising";
import { PlanWeek } from "@/components/sim/PlanWeek";
import { StallBoard } from "@/components/sim/StallBoard";
import { WeekResult } from "@/components/sim/WeekResult";
import { useStudioWorkspace } from "@/hooks/workspace-context";
import { outboxAll } from "@/lib/offline/idb";
import { isEffectivelyOnline, subscribeConnection } from "@/lib/offline/status";
import {
  getSimulation,
  getSimulationPeriod,
  startGroupSimulation,
  type SimulationPageData,
} from "@/lib/server/simulation";
import type { SimulationView } from "@/lib/simulation/service";
import type { StudentPeriodView } from "@/sim/index";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/studio/simulation")({ component: SimulationPage });

type Mode = "home" | "plan" | "numbers" | "raise";

function SimulationPage() {
  const { refresh: refreshWorkspace } = useStudioWorkspace();
  const [page, setPage] = useState<SimulationPageData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingPeriod, setPendingPeriod] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>("home");

  const load = useCallback(async () => {
    setError(null);
    try {
      if (!(await isEffectivelyOnline())) {
        setError("You’re offline. Plans you lock in are sent when you reconnect; results need a connection.");
      } else {
        const next = await getSimulation();
        setPage(next);
        // Once results exist for a queued submission, it is no longer pending.
        if (next.view && pendingPeriod !== null && next.view.completedPeriod >= pendingPeriod) setPendingPeriod(null);
      }
      const queued = (await outboxAll()).find((i) => i.type === "submit_sim_decisions");
      if (queued) {
        const p = queued.payload as { decisions?: { period?: number } };
        setPendingPeriod(p.decisions?.period ?? null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the simulation.");
    }
  }, [pendingPeriod]);

  useEffect(() => {
    void load();
    return subscribeConnection(() => void load());
  }, [load]);


  if (!page) {
    return error ? (
      <div>
        <StepHeader step="simulate" title="Run your venture" />
        <FormMessages error={error} />
      </div>
    ) : (
      <Loading />
    );
  }

  if (!page.view) {
    if (mode === "raise" && page.venture && page.fundraising.state) {
      return (
        <RaiseMoney
          initial={page.fundraising.state}
          ventureName={page.venture.name}
          onLeave={() => {
            setMode("home");
            window.scrollTo({ top: 0 });
            void load();
          }}
        />
      );
    }
    if (mode === "numbers" && page.venture) {
      return (
        <NumbersWizard
          ventureName={page.venture.name}
          hints={{ problem: page.venture.problem, alternatives: page.venture.alternatives }}
          numbers={page.numbers}
          evidence={page.evidence}
          onCancel={() => setMode("home")}
          onSaved={() => {
            setMode("home");
            window.scrollTo({ top: 0 });
            void load();
          }}
        />
      );
    }
    return (
      <StartCard
        page={page}
        onSetNumbers={() => setMode("numbers")}
        onRaise={() => setMode("raise")}
        onReload={() => load()}
        onStarted={() => void Promise.all([load(), refreshWorkspace()])}
      />
    );
  }

  const view = page.view;
  if (mode === "plan" && view.nextPeriod && pendingPeriod === null) {
    return (
      <PlanWeek
        view={view}
        onCancel={() => setMode("home")}
        onDone={(queuedPeriod) => {
          if (queuedPeriod !== null) setPendingPeriod(queuedPeriod);
          setMode("home");
          window.scrollTo({ top: 0 });
          void Promise.all([load(), refreshWorkspace()]);
        }}
      />
    );
  }
  return <StallHome view={view} pendingPeriod={pendingPeriod} error={error} onPlan={() => setMode("plan")} />;
}

function StartCard({
  page,
  onSetNumbers,
  onRaise,
  onReload,
  onStarted,
}: {
  page: SimulationPageData;
  onSetNumbers: () => void;
  onRaise: () => void;
  onReload: () => Promise<void>;
  onStarted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const n = page.numbers;
  const raise = page.fundraising;
  const name = page.venture?.name ?? "your venture";

  if (!page.venture) {
    return (
      <div className="space-y-5">
        <StepHeader step="simulate" title="Run your venture" lead="Six weeks in a simulated market, built from your own numbers." />
        {page.blockedReason ? <p className="rounded-[14px] bg-gold-soft px-3 py-2 text-sm text-gold-deep">{page.blockedReason}</p> : null}
        <Link to="/studio/select" className={cn(buttonVariants({ variant: "secondary", size: "lg" }), "w-full")}>
          Pick a venture first <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <StepHeader
        step="simulate"
        title={
          <>
            Run <span className="mark">{name}</span>
          </>
        }
        lead="Six weeks in a market built from your own numbers. Each week you decide, then see what happened."
      />
      {!n ? (
        <div className="paper space-y-3 rounded-[20px] p-5">
          <h2 className="font-display text-xl font-extrabold">First, your numbers</h2>
          <p className="text-[15px] leading-6 text-ink-soft">
            About ten quick questions: what one costs you, what customers would pay, how many people have the problem, and
            your weekly costs. Use your evidence; where you have none, say it’s a guess.
          </p>
          <Button size="lg" className="w-full" onClick={onSetNumbers}>
            Set our numbers <ArrowRight className="size-4" aria-hidden />
          </Button>
        </div>
      ) : (
        <>
          <div className="paper space-y-3 rounded-[20px] p-5">
            <h2 className="font-display text-xl font-extrabold">Your numbers</h2>
            <ul className="space-y-1 text-[15px]">
              <li>
                Each {n.unit} costs you <strong>{ghs(n.costPerUnit)}</strong> and sells for about <strong>{ghs(n.price)}</strong>.
              </li>
              <li>
                About <strong>{n.peoplePerWeek}</strong> people have the problem each week; you can provide up to{" "}
                <strong>{n.capacityPerWeek}</strong>.
              </li>
              <li>
                Running costs: <strong>{ghs(n.fixedCosts.reduce((a, f) => a + f.amount, 0))}</strong> a week.
              </li>
            </ul>
            {!raise.state ? (
              <button type="button" className="min-h-11 text-sm font-bold underline underline-offset-4" onClick={onSetNumbers}>
                Change our numbers
              </button>
            ) : null}
          </div>

          {!raise.state ? (
            <div className="paper space-y-3 rounded-[20px] p-5">
              <h2 className="font-display text-xl font-extrabold">
                Next, raise <span className="mark">GHS {raise.goal}</span>
              </h2>
              <p className="text-[15px] leading-6 text-ink-soft">
                Stock for your first week and two weeks of running costs. Money won’t come to you: ten days in Cape Coast to
                persuade family, friends, a bank or a microfinance office, or to earn and save it. Your numbers are fixed once
                you start.
              </p>
              <FormMessages error={error} />
              <Button
                size="lg"
                className="w-full"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  setError(null);
                  startFundraising()
                    .then(() => onReload())
                    .then(onRaise)
                    .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not start."))
                    .finally(() => setBusy(false));
                }}
              >
                {busy ? "Getting ready…" : "Start raising money"}
              </Button>
            </div>
          ) : !raise.finished ? (
            <div className="paper space-y-3 rounded-[20px] p-5">
              <h2 className="font-display text-xl font-extrabold">Raising money</h2>
              <p className="text-[15px] leading-6">
                Day {raise.state.day} of 10 · <strong>GHS {raise.state.cash}</strong> of GHS {raise.goal} raised so far.
              </p>
              <Button size="lg" className="w-full" onClick={onRaise}>
                Carry on raising money <ArrowRight className="size-4" aria-hidden />
              </Button>
            </div>
          ) : (
            <End state={raise.state}>
              <p className="text-[15px] leading-6 text-ink-soft">
                You open with <strong>GHS {raise.state.cash}</strong>. Loans are repaid with interest from week 1, out of
                your takings. Running out of cash closes the venture, and working out why <span className="mark">is the lesson</span>.
              </p>
              <FormMessages error={error} />
              <Button
                size="lg"
                className="w-full"
                disabled={busy || !page.canStart}
                onClick={() => {
                  setBusy(true);
                  setError(null);
                  startGroupSimulation()
                    .then(onStarted)
                    .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not start."))
                    .finally(() => setBusy(false));
                }}
              >
                {busy ? "Opening…" : `Open ${name}`}
              </Button>
            </End>
          )}
        </>
      )}
    </div>
  );
}

function StallHome({
  view,
  pendingPeriod,
  error,
  onPlan,
}: {
  view: SimulationView;
  pendingPeriod: number | null;
  error: string | null;
  onPlan: () => void;
}) {
  const label = view.market.periodLabel;
  const latestPeriod = view.latest?.period ?? null;
  const [selected, setSelected] = useState<number | null>(latestPeriod);
  const [fetched, setFetched] = useState<StudentPeriodView | null>(null);
  const finished = view.completedPeriod >= view.periodCount || view.status === "exited";
  const awaiting = view.latest?.events.filter((e) => e.availableResponses.length) ?? [];

  useEffect(() => setSelected(latestPeriod), [latestPeriod]);
  useEffect(() => {
    if (selected === null || selected === latestPeriod) return;
    let live = true;
    void getSimulationPeriod({ data: { period: selected } }).then((d) => {
      if (live) setFetched(d);
    });
    return () => {
      live = false;
    };
  }, [selected, latestPeriod]);
  const detail = selected === latestPeriod ? view.latest : fetched?.period === selected ? fetched : null;

  return (
    <div className="space-y-5 pt-2">
      <StallBoard view={view} />
      <FormMessages error={error} />

      {pendingPeriod !== null ? (
        <p className="rounded-[16px] border-2 border-ink bg-gold-soft px-4 py-3 text-[15px] leading-6">
          Your plan for {label} {pendingPeriod} is saved on this phone. It sends, and results appear, once you’re back online.
        </p>
      ) : view.nextPeriod ? (
        <div className="space-y-2">
          {awaiting.length ? (
            <p className="rounded-[16px] border-2 border-ink bg-clay px-4 py-3 text-[15px] font-semibold text-white">
              Something happened: {awaiting.map((e) => e.name).join(", ")}. You’ll choose what to do while planning.
            </p>
          ) : null}
          <Button size="lg" className="w-full" onClick={onPlan}>
            Plan {label} {view.nextPeriod} <ArrowRight className="size-4" aria-hidden />
          </Button>
        </div>
      ) : (
        <p className="rounded-[16px] bg-bg-subtle px-4 py-3 text-[15px]">
          {finished
            ? "All weeks are done. Look back over how it went."
            : view.cohortStatus !== "running"
              ? "Your lecturer has paused the simulation."
              : `${label[0].toUpperCase()}${label.slice(1)} ${view.completedPeriod + 1} isn’t open yet.`}
        </p>
      )}

      {view.status === "cash_out" ? (
        <p className="rounded-[16px] border-2 border-ink bg-clay-soft px-4 py-3 text-[15px] leading-6">
          The stall ran out of cash. That’s not the end of the course: look at the weeks below with your group and work out
          what caused it.
        </p>
      ) : null}

      {view.periods.length ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-xl font-extrabold">How it went</h2>
            {view.periods.length > 1 ? (
              <div className="flex gap-1.5 overflow-x-auto" role="tablist" aria-label={`Choose a ${label}`}>
                {view.periods.map((p) => (
                  <button
                    key={p.period}
                    type="button"
                    role="tab"
                    aria-selected={selected === p.period}
                    aria-label={`${label} ${p.period}`}
                    onClick={() => setSelected(p.period)}
                    className={cn(
                      "flex size-10 shrink-0 items-center justify-center rounded-full border-2 font-display text-sm font-extrabold",
                      selected === p.period ? "border-ink bg-gold" : "border-line-strong bg-bg-elevated",
                      p.outcomes.profit < 0 && selected !== p.period && "text-clay",
                    )}
                  >
                    {p.period}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          {detail ? <WeekResult detail={detail} market={view.market} /> : <Loading />}
        </section>
      ) : null}

      <MarketInfo market={view.market} />
    </div>
  );
}
