// Simulation service: the server-side steps around the pure engine
// (src/sim). Starting a simulation, locking a group's decisions, drawing
// cohort events once per cohort period, running a period exactly once, and
// storing the results and ledger.
//
// It takes a minimal `Db` (anything with `.query`) and uses only relative
// imports, so it runs unchanged under the server's per-request transaction
// (src/lib/server/simulation.ts) and under plain `node --test` with PGlite.
// Every function expects to run inside ONE transaction as app_runtime; the
// few writes to outcome tables switch to app_sim_engine for just that step
// (docs/decisions/0012).
import {
  campusFoodStall,
  cohortSeed,
  CURRENT_ENGINE_VERSION,
  drawCohortEvents,
  EngineInputError,
  groupSeed,
  initialState,
  runPeriod,
  studentView,
  type CohortEventInstance,
  type Decisions,
  type PeriodOutput,
  type Scenario,
  withOpeningFinancing,
  type OpeningLoan,
  type SimState,
  type StudentPeriodView,
} from "../../sim/index.ts";
import { AppError } from "../server/errors.ts";
import { log } from "../server/log.ts";

export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
}

const newId = () => crypto.randomUUID();

// ------------------------------------------------------------- engine role

const KNOWN_ROLES = new Set(["app_runtime", "app_sim_engine"]);

/**
 * Run `fn` as app_sim_engine, then return to the caller's role. This is the
 * ONLY way outcome tables get written (app_runtime has no write grant on
 * them). Keep what runs inside minimal: no client input is interpreted here
 * beyond decisions already accepted by RLS.
 */
export async function asEngine<T>(db: Db, fn: () => Promise<T>): Promise<T> {
  const [{ role }] = await db.query<{ role: string }>("select current_user as role");
  await db.query("set local role app_sim_engine");
  try {
    return await fn();
  } finally {
    // Only ever switch back to a role we recognise (never interpolate an
    // arbitrary name into SQL).
    if (KNOWN_ROLES.has(role)) await db.query(`set local role ${role}`);
    else await db.query("reset role");
  }
}

// ---------------------------------------------------------------- cohorts

export interface CohortSettings {
  periodCount?: number;
  startingCapital?: number;
  eventFrequency?: number;
}

/**
 * The default scenario with a cohort's settings applied. Lecturer-set values
 * stay flagged as assumptions, with a note saying who set them.
 */
export function buildCohortScenario(settings: CohortSettings = {}): Scenario {
  const set = (value: number) => ({ value, assumption: true, note: "Set for this cohort by its lecturer." });
  const s: Scenario = structuredClone(campusFoodStall);
  if (settings.periodCount !== undefined) {
    if (!Number.isInteger(settings.periodCount) || settings.periodCount < 4 || settings.periodCount > 8) {
      throw new AppError("INVALID", "A simulation has between 4 and 8 periods.");
    }
    s.periodCount = set(settings.periodCount);
  }
  if (settings.startingCapital !== undefined) {
    if (!Number.isSafeInteger(settings.startingCapital) || settings.startingCapital <= 0) {
      throw new AppError("INVALID", "Starting capital must be a positive amount in pesewas.");
    }
    s.startingCapital = set(settings.startingCapital);
  }
  if (settings.eventFrequency !== undefined) {
    if (!(settings.eventFrequency >= 0 && settings.eventFrequency <= 3)) {
      throw new AppError("INVALID", "Event frequency must be between 0 and 3.");
    }
    s.eventSettings = { ...s.eventSettings, frequency: set(settings.eventFrequency) };
  }
  return s;
}

export interface CohortRow {
  id: string;
  course_offering_id: string;
  scenario: Scenario;
  engine_version: string;
  period_count: number;
  open_through_period: number;
  status: string;
}

/** The cohort's simulation settings, created with defaults on first use. */
export async function ensureCohort(db: Db, offeringId: string, settings: CohortSettings = {}): Promise<CohortRow> {
  const existing = await db.query<CohortRow>(
    "select id, course_offering_id, scenario, engine_version, period_count, open_through_period, status from simulation_cohorts where course_offering_id = $1",
    [offeringId],
  );
  if (existing[0]) return existing[0];
  const scenario = buildCohortScenario(settings);
  await asEngine(db, () =>
    db.query(
      `insert into simulation_cohorts
         (id, course_offering_id, scenario_id, scenario_version, scenario, engine_version, period_count, open_through_period)
       values ($1, $2, $3, $4, $5, $6, $7, $7)
       on conflict (course_offering_id) do nothing`,
      [newId(), offeringId, scenario.id, scenario.version, JSON.stringify(scenario), CURRENT_ENGINE_VERSION, scenario.periodCount.value],
    ),
  );
  const rows = await db.query<CohortRow>(
    "select id, course_offering_id, scenario, engine_version, period_count, open_through_period, status from simulation_cohorts where course_offering_id = $1",
    [offeringId],
  );
  if (!rows[0]) throw new AppError("NOT_FOUND", "Your course's simulation could not be set up.");
  return rows[0];
}

/**
 * Cohort events for one period: drawn once per cohort period and shared by
 * every group (ADR 0004). Two groups racing to draw the same period compute
 * the identical draw, so `on conflict do nothing` is safe.
 */
export async function ensureCohortEvents(db: Db, cohort: CohortRow, period: number): Promise<CohortEventInstance[]> {
  return asEngine(db, async () => {
    const drawn = await db.query("select 1 from simulation_cohort_periods where cohort_id = $1 and period = $2", [
      cohort.id,
      period,
    ]);
    if (!drawn[0]) {
      const history = await db.query<{ event_id: string; period: number }>(
        "select event_id, period from simulation_cohort_events where cohort_id = $1 and period < $2",
        [cohort.id, period],
      );
      const duration = (eventId: string) => cohort.scenario.events.find((e) => e.id === eventId)?.duration ?? 1;
      const active = history.filter((h) => h.period + duration(h.event_id) - 1 >= period).map((h) => h.event_id);
      const past = history.map((h) => h.event_id);
      const fresh = drawCohortEvents(cohort.scenario, cohortSeed(cohort.id, period), period, active, past);
      for (const e of fresh) {
        await db.query(
          `insert into simulation_cohort_events (id, cohort_id, period, instance_id, event_id, origin)
           values ($1, $2, $3, $4, $5, 'drawn') on conflict (cohort_id, instance_id) do nothing`,
          [newId(), cohort.id, period, e.instanceId, e.eventId],
        );
      }
      await db.query(
        "insert into simulation_cohort_periods (cohort_id, period) values ($1, $2) on conflict do nothing",
        [cohort.id, period],
      );
    }
    const rows = await db.query<{ instance_id: string; event_id: string; origin: "drawn" | "injected" }>(
      "select instance_id, event_id, origin from simulation_cohort_events where cohort_id = $1 and period = $2 order by instance_id",
      [cohort.id, period],
    );
    return rows.map((r) => ({ instanceId: r.instance_id, eventId: r.event_id, period, origin: r.origin }));
  });
}

// ------------------------------------------------------------- simulations

export interface SimulationRow {
  id: string;
  cohort_id: string;
  group_id: string;
  venture_id: string;
  engine_version: string;
  status: "operating" | "cash_out" | "exited";
  completed_period: number;
  /** The group's own market, frozen at start (0014); null = the class's scenario. */
  scenario: Scenario | null;
  /** Loans the group raised before opening (0015). */
  opening_financing: OpeningLoan[] | null;
}

const SIM_COLUMNS = "id, cohort_id, group_id, venture_id, engine_version, status, completed_period, scenario, opening_financing";

/** Where a simulation starts: the scenario's starting capital, plus any loans raised before opening. */
export function openingState(sim: Pick<SimulationRow, "id" | "opening_financing">, scenario: Scenario): SimState {
  return withOpeningFinancing(initialState(scenario, sim.id), sim.opening_financing ?? []);
}

/** The market a simulation runs in: its own, or (older simulations) the class's. */
export function scenarioOf(sim: Pick<SimulationRow, "scenario">, cohort: CohortRow): Scenario {
  return sim.scenario ?? cohort.scenario;
}

export async function findSimulationForGroup(db: Db, groupId: string): Promise<SimulationRow | null> {
  const rows = await db.query<SimulationRow>(`select ${SIM_COLUMNS} from simulations where group_id = $1`, [groupId]);
  return rows[0] ?? null;
}

/**
 * Launch the group's venture into the simulation with the cohort's starting
 * capital. Idempotent: starting twice returns the existing simulation.
 */
export async function startSimulation(
  db: Db,
  input: {
    studentId: string;
    groupId: string;
    ventureId: string;
    offeringId: string;
    /** Build the group's own market from the class's scenario (its weeks, cash and events). */
    buildScenario?: (classScenario: Scenario) => Scenario;
    /** Loans raised before opening, in place from the start. */
    openingLoans?: OpeningLoan[];
  },
): Promise<SimulationRow> {
  const existing = await findSimulationForGroup(db, input.groupId);
  if (existing) return existing;
  const cohort = await ensureCohort(db, input.offeringId);
  const id = newId();
  const own = input.buildScenario ? input.buildScenario(cohort.scenario) : null;
  const scenario = own ?? cohort.scenario;
  const loans = input.openingLoans ?? [];
  const state = openingState({ id, opening_financing: loans }, scenario);
  await asEngine(db, async () => {
    const inserted = await db.query<{ id: string }>(
      `insert into simulations
         (id, cohort_id, group_id, venture_id, engine_version, scenario_id, scenario_version, started_by_student_id, scenario, opening_financing)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       on conflict (group_id) do nothing
       returning id`,
      [
        id,
        cohort.id,
        input.groupId,
        input.ventureId,
        cohort.engine_version,
        scenario.id,
        scenario.version,
        input.studentId,
        own ? JSON.stringify(own) : null,
        loans.length ? JSON.stringify(loans) : null,
      ],
    );
    if (!inserted[0]) return; // another member started it a moment ago
    for (const tx of state.ledger) {
      await db.query(
        `insert into simulation_transactions (simulation_id, tx_id, period, category, amount, memo, ref, explain_id)
         values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [id, tx.id, tx.period, tx.category, tx.amount, tx.memo, tx.ref, tx.explainId],
      );
    }
  });
  const sim = await findSimulationForGroup(db, input.groupId);
  if (!sim) throw new AppError("NOT_FOUND", "The simulation could not be started.");
  log("info", "sim.started", { simulationId: sim.id, groupId: input.groupId, cohortId: cohort.id, studentId: input.studentId });
  return sim;
}

// -------------------------------------------------------- submit and run

export interface SubmitResult {
  period: number;
  status: SimulationRow["status"];
  /** True when this exact submission had already been recorded (offline replay). */
  replayed: boolean;
}

/**
 * Lock a decision set for the next period and compute that period.
 *
 * The decision INSERT runs as app_runtime, so RLS decides whether this
 * student may submit (own group, next period only, period open, cohort
 * running). The unique key on (simulation, period) makes a second
 * submission fail. Everything happens in the caller's transaction, so if the
 * engine refuses the decisions nothing is stored.
 */
export async function submitDecisions(
  db: Db,
  input: { simulationId: string; studentId: string; decisions: Decisions; clientId: string },
): Promise<SubmitResult> {
  const sims = await db.query<SimulationRow>(`select ${SIM_COLUMNS} from simulations where id = $1`, [input.simulationId]);
  const sim = sims[0];
  if (!sim) {
    log("warn", "authz.denied", { studentId: input.studentId, simulationId: input.simulationId, reason: "simulation_not_visible" });
    throw new AppError("NOT_FOUND", "That simulation does not belong to your group.");
  }
  const period = input.decisions.period;
  const prior = await db.query<{ client_id: string | null }>(
    "select client_id from simulation_decisions where simulation_id = $1 and period = $2",
    [sim.id, period],
  );
  if (prior[0]) {
    if (prior[0].client_id && prior[0].client_id === input.clientId) {
      return { period, status: sim.status, replayed: true };
    }
    throw new AppError("ALREADY_SUBMITTED", `Decisions for period ${period} were already submitted by your group. They are locked.`);
  }
  if (sim.status === "exited") throw new AppError("CLOSED", "This venture has exited.");
  if (period !== sim.completed_period + 1) {
    throw new AppError(
      "OUT_OF_ORDER",
      `The next period for your venture is ${sim.completed_period + 1}; you submitted decisions for period ${period}.`,
    );
  }
  try {
    await db.query(
      `insert into simulation_decisions (id, simulation_id, period, decisions, submitted_by_student_id, client_id)
       values ($1, $2, $3, $4, $5, $6)`,
      [newId(), sim.id, period, JSON.stringify(input.decisions), input.studentId, input.clientId],
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (/row-level security/i.test(message)) {
      log("warn", "authz.denied", { studentId: input.studentId, simulationId: sim.id, period, reason: "decision_insert_rls" });
      throw new AppError("CLOSED", `Period ${period} is not open for your group yet.`);
    }
    if (/unique|duplicate/i.test(message)) {
      throw new AppError("ALREADY_SUBMITTED", `Decisions for period ${period} were already submitted by your group.`);
    }
    throw err;
  }
  log("info", "sim.decisions_submitted", { simulationId: sim.id, period, studentId: input.studentId });
  const output = await runPeriodFor(db, sim.id, period);
  return { period, status: output.outcomes.status, replayed: false };
}

/**
 * Compute one period from the stored decisions. Runs as app_sim_engine and
 * locks the simulation row, so concurrent calls for the same simulation
 * queue behind each other; the second then finds the period done and stops.
 */
export async function runPeriodFor(db: Db, simulationId: string, period: number): Promise<PeriodOutput> {
  const started = performance.now();
  return asEngine(db, async () => {
    const sims = await db.query<SimulationRow>(`select ${SIM_COLUMNS} from simulations where id = $1 for update`, [simulationId]);
    const sim = sims[0];
    if (!sim) throw new AppError("NOT_FOUND", "Simulation not found.");
    if (sim.completed_period >= period) {
      throw new AppError("ALREADY_RUN", `Period ${period} has already been computed.`);
    }
    if (sim.completed_period + 1 !== period) {
      throw new AppError("OUT_OF_ORDER", `Period ${sim.completed_period + 1} must be run before period ${period}.`);
    }
    const [cohort] = await db.query<CohortRow>(
      "select id, course_offering_id, scenario, engine_version, period_count, open_through_period, status from simulation_cohorts where id = $1",
      [sim.cohort_id],
    );
    const [decisionRow] = await db.query<{ decisions: Decisions }>(
      "select decisions from simulation_decisions where simulation_id = $1 and period = $2",
      [simulationId, period],
    );
    if (!decisionRow) throw new AppError("NO_DECISIONS", `No decisions were submitted for period ${period}.`);
    let state: SimState;
    const scenario = scenarioOf(sim, cohort);
    if (period === 1) {
      state = openingState(sim, scenario);
    } else {
      const [prev] = await db.query<{ state: SimState }>(
        "select state from simulation_results where simulation_id = $1 and period = $2",
        [simulationId, period - 1],
      );
      if (!prev) throw new AppError("OUT_OF_ORDER", `Period ${period - 1} has no stored result.`);
      state = prev.state;
    }
    // Nested asEngine: returns to app_sim_engine, the role it was called in.
    const cohortEvents = await ensureCohortEvents(db, cohort, period);
    const seed = groupSeed(simulationId, period);
    let output: PeriodOutput;
    try {
      output = runPeriod({
        engineVersion: sim.engine_version,
        scenario,
        state,
        decisions: decisionRow.decisions,
        cohortEvents,
        seed,
        financing: [],
      });
    } catch (err) {
      if (err instanceof EngineInputError) throw new AppError("INVALID", err.message);
      throw err;
    }
    const { newState, ...rest } = output;
    const view = studentView(output);
    await db.query(
      `insert into simulation_results
         (id, simulation_id, period, engine_version, seed, cohort_events, output, student_output, state, closing_cash, status)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        newId(),
        simulationId,
        period,
        sim.engine_version,
        seed,
        JSON.stringify(cohortEvents),
        JSON.stringify(rest),
        JSON.stringify(view),
        JSON.stringify(newState),
        output.outcomes.closingCash,
        output.outcomes.status,
      ],
    );
    for (const tx of output.transactions) {
      await db.query(
        `insert into simulation_transactions (simulation_id, tx_id, period, category, amount, memo, ref, explain_id)
         values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [simulationId, tx.id, tx.period, tx.category, tx.amount, tx.memo, tx.ref, tx.explainId],
      );
    }
    await db.query(
      "update simulations set completed_period = $2, status = $3, updated_at = now() where id = $1",
      [simulationId, period, output.outcomes.status],
    );
    log("info", "sim.period_run", {
      simulationId,
      cohortId: cohort.id,
      period,
      engineVersion: sim.engine_version,
      status: output.outcomes.status,
      count: output.transactions.length,
      durationMs: Math.round(performance.now() - started),
    });
    return output;
  });
}

// ------------------------------------------------------------ student view

export interface MarketBrief {
  /** A service unused this week is lost; goods can be kept (some may go to waste). */
  kind: "goods" | "service";
  scenarioName: string;
  description: string;
  periodLabel: string;
  products: { id: string; name: string; unit: string; startingPrice: number | null }[];
  segments: { id: string; name: string }[];
  qualityTiers: { id: string; label: string }[];
  suppliers: {
    id: string;
    name: string;
    informal: boolean;
    leadTimePeriods: number;
    capacityUnits: number;
    unitPrice: Record<string, Record<string, number>>;
  }[];
  fixedCosts: { label: string; amount: number }[];
  capacityUnitsPerPeriod: number;
  competitors: { id: string; name: string; price: number | null }[];
}

/**
 * What a student may know about the market: names, prices they could
 * observe, and their own cost structure. Never the model's hidden
 * parameters (price sensitivity, conversion rates, event probabilities).
 */
export function marketBrief(scenario: Scenario, last: StudentPeriodView | null): MarketBrief {
  return {
    kind: scenario.family === "service" ? "service" : "goods",
    scenarioName: scenario.name,
    description: scenario.description,
    periodLabel: scenario.periodLabel,
    // A group's own venture starts from the price its customers said they'd
    // pay (their own figure). The reference scenario's price stays hidden.
    products: scenario.products.map((p) => ({
      id: p.id,
      name: p.name,
      unit: p.unit,
      startingPrice: scenario.id === "own-venture" ? p.referencePrice.value : null,
    })),
    segments: scenario.segments.map((s) => ({ id: s.id, name: s.name })),
    qualityTiers: scenario.qualityTiers.map((t) => ({ id: t.id, label: t.label })),
    suppliers: scenario.suppliers.map((s) => ({
      id: s.id,
      name: s.name,
      informal: s.informal,
      leadTimePeriods: s.leadTimePeriods.value,
      capacityUnits: s.capacityUnits.value,
      unitPrice: Object.fromEntries(
        Object.entries(s.unitPrice).map(([pid, price]) => [
          pid,
          Object.fromEntries(scenario.qualityTiers.map((t) => [t.id, Math.round(price.value * t.unitCostMult.value)])),
        ]),
      ),
    })),
    fixedCosts: scenario.fixedCosts.map((f) => ({ label: f.label, amount: f.amount.value })),
    capacityUnitsPerPeriod: scenario.operations.capacityUnitsPerPeriod.value,
    competitors: scenario.competitors
      .filter((c) => !c.entersViaEvent || last?.outcomes.competitors.some((x) => x.id === c.id))
      .map((c) => ({
        id: c.id,
        name: c.name,
        price: last?.outcomes.competitors.find((x) => x.id === c.id)?.price ?? c.price.value,
      })),
  };
}

export interface PeriodSummaryView {
  period: number;
  outcomes: StudentPeriodView["outcomes"];
  events: StudentPeriodView["events"];
  learningSignals: StudentPeriodView["learningSignals"];
  submittedBy: string | null;
  submittedAt: string | null;
}

export interface SimulationView {
  simulationId: string;
  status: SimulationRow["status"];
  completedPeriod: number;
  periodCount: number;
  openThroughPeriod: number;
  cohortStatus: string;
  /** The period to decide next, or null when finished / not open yet. */
  nextPeriod: number | null;
  cash: number;
  stock: Record<string, number>;
  market: MarketBrief;
  /** Summaries of every computed period (no explanation, to keep it small). */
  periods: PeriodSummaryView[];
  /** The full explanation trail of the latest period only. */
  latest: StudentPeriodView | null;
  lastDecisions: Decisions | null;
}

export async function loadSimulationView(db: Db, groupId: string): Promise<SimulationView | null> {
  const sim = await findSimulationForGroup(db, groupId);
  if (!sim) return null;
  const [cohort] = await db.query<CohortRow>(
    "select id, course_offering_id, scenario, engine_version, period_count, open_through_period, status from simulation_cohorts where id = $1",
    [sim.cohort_id],
  );
  const results = await db.query<{ period: number; student_output: StudentPeriodView }>(
    "select period, student_output from simulation_results where simulation_id = $1 order by period",
    [sim.id],
  );
  const decisions = await db.query<{ period: number; decisions: Decisions; submitted_at: string; full_name: string }>(
    `select d.period, d.decisions, d.submitted_at::text as submitted_at, s.full_name
     from simulation_decisions d join students s on s.id = d.submitted_by_student_id
     where d.simulation_id = $1 order by d.period`,
    [sim.id],
  );
  const [{ cash }] = await db.query<{ cash: string | number | null }>(
    "select coalesce(sum(amount), 0) as cash from simulation_transactions where simulation_id = $1",
    [sim.id],
  );
  const latest = results.length ? results[results.length - 1].student_output : null;
  const stock: Record<string, number> = {};
  const scenario = scenarioOf(sim, cohort);
  for (const p of scenario.products) stock[p.id] = latest?.outcomes.inventory[p.id]?.closing ?? 0;
  const next = sim.completed_period + 1;
  const nextPeriod =
    sim.status !== "exited" && next <= cohort.period_count && next <= cohort.open_through_period && cohort.status === "running"
      ? next
      : null;
  return {
    simulationId: sim.id,
    status: sim.status,
    completedPeriod: sim.completed_period,
    periodCount: cohort.period_count,
    openThroughPeriod: cohort.open_through_period,
    cohortStatus: cohort.status,
    nextPeriod,
    cash: Number(cash),
    stock,
    market: marketBrief(scenario, latest),
    periods: results.map((r) => {
      const d = decisions.find((x) => x.period === r.period);
      return {
        period: r.period,
        outcomes: r.student_output.outcomes,
        events: r.student_output.events,
        learningSignals: r.student_output.learningSignals,
        submittedBy: d?.full_name ?? null,
        submittedAt: d?.submitted_at ?? null,
      };
    }),
    latest,
    lastDecisions: decisions.length ? decisions[decisions.length - 1].decisions : null,
  };
}

/** The full student explanation for one earlier period (fetched on demand). */
export async function loadPeriodDetail(db: Db, groupId: string, period: number): Promise<StudentPeriodView | null> {
  const sim = await findSimulationForGroup(db, groupId);
  if (!sim) return null;
  const rows = await db.query<{ student_output: StudentPeriodView }>(
    "select student_output from simulation_results where simulation_id = $1 and period = $2",
    [sim.id, period],
  );
  return rows[0]?.student_output ?? null;
}
