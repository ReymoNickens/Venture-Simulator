// Run a whole simulation for one group in memory: the CLI, tests and demos
// use this. The server does the same steps, one period at a time, storing
// each input and output.
import { drawCohortEvents } from "./modules/events.ts";
import { initialState } from "./engine.ts";
import { cohortSeed, groupSeed } from "./seeds.ts";
import type { Strategy } from "./strategies.ts";
import type { CohortEventInstance, FinancingDisbursement, PeriodOutput, Scenario } from "./types.ts";
import { CURRENT_ENGINE_VERSION, runPeriod } from "./versions.ts";

export interface SimulateOptions {
  scenario: Scenario;
  simulationId: string;
  cohortId: string;
  strategy: Strategy;
  periods?: number;
  financing?: (period: number) => FinancingDisbursement[];
}

/** Cohort-level event history, as the server keeps it per cohort. */
export class CohortEventLog {
  private instances: { eventId: string; startedPeriod: number; endsAfterPeriod: number }[] = [];

  draw(scenario: Scenario, cohortId: string, period: number): CohortEventInstance[] {
    const active = this.instances.filter((i) => i.endsAfterPeriod >= period).map((i) => i.eventId);
    const past = this.instances.map((i) => i.eventId);
    const drawn = drawCohortEvents(scenario, cohortSeed(cohortId, period), period, active, past);
    for (const ce of drawn) {
      const def = scenario.events.find((e) => e.id === ce.eventId)!;
      this.instances.push({ eventId: ce.eventId, startedPeriod: period, endsAfterPeriod: period + def.duration - 1 });
    }
    return drawn;
  }
}

export function simulate(opts: SimulateOptions): PeriodOutput[] {
  const { scenario, simulationId, cohortId, strategy } = opts;
  const periods = opts.periods ?? scenario.periodCount.value;
  const cohort = new CohortEventLog();
  let state = initialState(scenario, simulationId);
  let last: PeriodOutput | null = null;
  const outputs: PeriodOutput[] = [];
  for (let period = 1; period <= periods; period++) {
    const cohortEvents = cohort.draw(scenario, cohortId, period);
    const decisions = strategy({ scenario, state, period, last });
    last = runPeriod({
      engineVersion: CURRENT_ENGINE_VERSION,
      scenario,
      state,
      decisions,
      cohortEvents,
      seed: groupSeed(simulationId, period),
      financing: opts.financing?.(period) ?? [],
    });
    outputs.push(last);
    state = last.newState;
  }
  return outputs;
}
