import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { FormMessages, Loading } from "@/components/ui/feedback";
import { StepHeader } from "@/components/shell/StepHeader";
import { MarketInfo } from "@/components/sim/MarketInfo";
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

type Mode = "home" | "plan";

function SimulationPage() {
  const { data: workspace, refresh: refreshWorkspace } = useStudioWorkspace();
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

  const ventureName = workspace?.venture?.name ?? null;

  if (!page) {
    return error ? (
      <div>
        <StepHeader step="simulate" title="Run a food stall" />
        <FormMessages error={error} />
      </div>
    ) : (
      <Loading />
    );
  }

  if (!page.view) {
    return <StartCard page={page} ventureName={ventureName} onStarted={() => void Promise.all([load(), refreshWorkspace()])} />;
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
  ventureName,
  onStarted,
}: {
  page: SimulationPageData;
  ventureName: string | null;
  onStarted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-5">
      <StepHeader step="simulate" title="Run a food stall" lead="Six weeks. Each week your group decides four things, then sees what happened." />
      <div className="paper space-y-3 rounded-[20px] p-5">
        <ol className="space-y-2.5">
          {[
            ["How many meals to make", "bg-gold"],
            ["Which quality and supplier", "bg-pink"],
            ["What price to charge", "bg-accent text-white"],
            ["How much to spend on marketing", "bg-indigo text-white"],
          ].map(([text, tone], i) => (
            <li key={text} className="flex items-center gap-3">
              <span className={cn("sticker flex size-8 shrink-0 items-center justify-center rounded-full font-display text-sm font-extrabold", tone)}>
                {i + 1}
              </span>
              <span className="text-[15px] font-semibold">{text}</span>
            </li>
          ))}
        </ol>
        <p className="text-[15px] leading-6 text-ink-soft">
          You start with cash in the box. Run out and the stall closes, and working out why <span className="mark">is the lesson</span>.
        </p>
        {page.blockedReason ? <p className="rounded-[14px] bg-gold-soft px-3 py-2 text-sm text-gold-deep">{page.blockedReason}</p> : null}
        <FormMessages error={error} />
        {page.canStart ? (
          <Button
            size="lg"
            className="w-full"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setError(null);
              startGroupSimulation()
                .then(onStarted)
                .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not start."))
                .finally(() => setBusy(false));
            }}
          >
            {busy ? "Opening the stall…" : "Open the stall"}
          </Button>
        ) : (
          <Link to="/studio/select" className={cn(buttonVariants({ variant: "secondary", size: "lg" }), "w-full")}>
            Pick a venture first <ArrowRight className="size-4" aria-hidden />
          </Link>
        )}
      </div>
      <WhyFoodStall ventureName={ventureName} />
    </div>
  );
}

/**
 * Students arrive having chosen their own problem and meet a food stall.
 * Say why in two lines, behind a tap, so it does not read as their work
 * being thrown away and does not stand between them and playing.
 */
function WhyFoodStall({ ventureName }: { ventureName: string | null }) {
  return (
    <details className="rounded-[18px] border border-line bg-bg-elevated px-4">
      <summary className="flex min-h-12 cursor-pointer list-none items-center font-display font-extrabold">Why a food stall?</summary>
      <p className="pb-4 text-[15px] leading-6 text-ink-soft">
        Every group practises on the same stall, so results can be compared fairly. Price, stock and cash work the same way
        in {ventureName ? <strong>{ventureName}</strong> : "your own venture"}, so keep testing your real idea in the
        notebook too.
      </p>
    </details>
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
