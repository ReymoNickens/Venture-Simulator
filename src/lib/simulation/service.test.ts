// Slice B: the simulation service against real Postgres (PGlite) with the
// real migrations and RLS. Every call runs the way a request does: in one
// transaction, as app_runtime, with a user's id set.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { canonicalJson, runPeriod, type Decisions, type PeriodOutput, type SimState } from "../../sim/index.ts";
import { scenarioFromVenture } from "../../sim/scenarios/own-venture.ts";
import { setLogSink } from "../server/log.ts";
import { asUser, freshSeededDb } from "../server/test-db.ts";
import {
  ensureCohort,
  loadSimulationView,
  runPeriodFor,
  startSimulation,
  submitDecisions,
  type Db,
} from "./service.ts";

const dbOf = (tx: PGlite): Db => ({
  query: async <T,>(text: string, params: unknown[] = []) => (await tx.query<T>(text, params)).rows,
});

function decisions(period: number, overrides: Partial<Decisions> = {}): Decisions {
  return {
    period,
    products: { rice_pack: { price: 2500, qualityTier: "standard", order: { supplierId: "market_trader", units: 150 } } },
    marketingBudget: 10000,
    eventResponses: {},
    ...overrides,
  };
}

/** Two groups (A, B) in cohort off1, each with a venture; one lecturer; one outsider lecturer. */
async function simDb(): Promise<PGlite> {
  const pg = await freshSeededDb();
  for (const g of ["a", "b"]) {
    await pg.query(
      `insert into ventures (id, group_id, opportunity_id, name, selection_rationale) values ($1, $2, $3, $4, 'because')`,
      [`venture-${g}`, `group-${g}`, `opp-${g}`, `Venture ${g}`],
    );
  }
  await pg.query(
    `insert into user_roles (id, user_id, role_id, course_offering_id) values
       ('ur-l1','auth-lect-1','role_lecturer','off1'),
       ('ur-l2','auth-lect-2','role_lecturer','off-other')`,
  );
  return pg;
}

const as = <T,>(pg: PGlite, user: string, fn: (db: Db) => Promise<T>) => asUser(pg, user, (tx) => fn(dbOf(tx)));

async function started(pg: PGlite, group: "a" | "b") {
  return as(pg, `auth-${group}`, (db) =>
    startSimulation(db, { studentId: `student-${group}`, groupId: `group-${group}`, ventureId: `venture-${group}`, offeringId: "off1" }),
  );
}

let restoreLog: () => void;
before(() => {
  restoreLog = setLogSink(() => {});
});
after(() => restoreLog());

async function withDb(fn: (pg: PGlite) => Promise<void>) {
  const pg = await simDb();
  try {
    await fn(pg);
  } finally {
    await pg.close();
  }
}

describe("starting a simulation", () => {
  it("creates the cohort settings, the simulation and the starting-capital ledger entry", () =>
    withDb(async (pg) => {
      const sim = await started(pg, "a");
      assert.equal(sim.completed_period, 0);
      const view = await as(pg, "auth-a", (db) => loadSimulationView(db, "group-a"));
      assert.equal(view?.cash, 400000);
      assert.equal(view?.nextPeriod, 1);
      assert.equal(view?.periodCount, 6);
    }));

  it("is idempotent: starting twice returns the same simulation", () =>
    withDb(async (pg) => {
      const one = await started(pg, "a");
      const two = await started(pg, "a");
      assert.equal(one.id, two.id);
      const [{ n }] = (await pg.query<{ n: number }>("select count(*)::int as n from simulation_transactions")).rows;
      assert.equal(n, 1);
    }));

  it("both groups in a cohort share one cohort configuration", () =>
    withDb(async (pg) => {
      const a = await started(pg, "a");
      const b = await started(pg, "b");
      assert.equal(a.cohort_id, b.cohort_id);
    }));
});

describe("submitting and running a period", () => {
  it("locks the decisions, runs the engine once, stores results and the ledger", () =>
    withDb(async (pg) => {
      const sim = await started(pg, "a");
      const r = await as(pg, "auth-a", (db) =>
        submitDecisions(db, { simulationId: sim.id, studentId: "student-a", decisions: decisions(1), clientId: "c1" }),
      );
      assert.deepEqual(r, { period: 1, status: "operating", replayed: false });
      const view = await as(pg, "auth-a", (db) => loadSimulationView(db, "group-a"));
      assert.equal(view?.completedPeriod, 1);
      assert.equal(view?.nextPeriod, 2);
      assert.equal(view?.periods.length, 1);
      // Cash shown = sum of the ledger = the engine's closing cash.
      assert.equal(view?.cash, view?.periods[0].outcomes.closingCash);
      assert.ok(view?.latest?.explanation.length);
    }));

  it("a second submission for the same period is refused; an offline replay of the same one is recognised", () =>
    withDb(async (pg) => {
      const sim = await started(pg, "a");
      const submit = (clientId: string) =>
        as(pg, "auth-a", (db) =>
          submitDecisions(db, { simulationId: sim.id, studentId: "student-a", decisions: decisions(1), clientId }),
        );
      await submit("c1");
      assert.deepEqual(await submit("c1"), { period: 1, status: "operating", replayed: true });
      await assert.rejects(submit("c2"), /already submitted/);
    }));

  it("a period cannot be skipped", () =>
    withDb(async (pg) => {
      const sim = await started(pg, "a");
      await assert.rejects(
        as(pg, "auth-a", (db) =>
          submitDecisions(db, { simulationId: sim.id, studentId: "student-a", decisions: decisions(2), clientId: "c" }),
        ),
        /next period for your venture is 1/,
      );
    }));

  it("a period cannot be run twice", () =>
    withDb(async (pg) => {
      const sim = await started(pg, "a");
      await as(pg, "auth-a", (db) =>
        submitDecisions(db, { simulationId: sim.id, studentId: "student-a", decisions: decisions(1), clientId: "c1" }),
      );
      await assert.rejects(as(pg, "auth-a", (db) => runPeriodFor(db, sim.id, 1)), /already been computed/);
    }));

  it("invalid decisions are refused and nothing is stored", () =>
    withDb(async (pg) => {
      const sim = await started(pg, "a");
      const bad = decisions(1);
      bad.products.rice_pack.qualityTier = "gold";
      await assert.rejects(
        as(pg, "auth-a", (db) =>
          submitDecisions(db, { simulationId: sim.id, studentId: "student-a", decisions: bad, clientId: "c1" }),
        ),
        /quality tier/,
      );
      const [{ n }] = (await pg.query<{ n: number }>("select count(*)::int as n from simulation_decisions")).rows;
      assert.equal(n, 0);
    }));

  it("respects the cohort's open period (lecturer pacing)", () =>
    withDb(async (pg) => {
      const sim = await started(pg, "a");
      await pg.query("update simulation_cohorts set open_through_period = 1");
      await as(pg, "auth-a", (db) =>
        submitDecisions(db, { simulationId: sim.id, studentId: "student-a", decisions: decisions(1), clientId: "c1" }),
      );
      await assert.rejects(
        as(pg, "auth-a", (db) =>
          submitDecisions(db, { simulationId: sim.id, studentId: "student-a", decisions: decisions(2), clientId: "c2" }),
        ),
        /not open/,
      );
      const view = await as(pg, "auth-a", (db) => loadSimulationView(db, "group-a"));
      assert.equal(view?.nextPeriod, null);
    }));

  it("a paused cohort accepts no decisions", () =>
    withDb(async (pg) => {
      const sim = await started(pg, "a");
      await pg.query("update simulation_cohorts set status = 'paused'");
      await assert.rejects(
        as(pg, "auth-a", (db) =>
          submitDecisions(db, { simulationId: sim.id, studentId: "student-a", decisions: decisions(1), clientId: "c1" }),
        ),
        /not open/,
      );
    }));
});

describe("stored results are reproducible and fair", () => {
  it("re-running the engine from the stored inputs reproduces the stored output exactly", () =>
    withDb(async (pg) => {
      const sim = await started(pg, "a");
      for (let p = 1; p <= 3; p++) {
        await as(pg, "auth-a", (db) =>
          submitDecisions(db, { simulationId: sim.id, studentId: "student-a", decisions: decisions(p), clientId: `c${p}` }),
        );
      }
      const [cohort] = (await pg.query<{ scenario: never }>("select scenario from simulation_cohorts")).rows;
      const rows = (
        await pg.query<{ period: number; seed: string; cohort_events: never; output: Omit<PeriodOutput, "newState">; state: SimState; engine_version: string }>(
          "select period, seed, cohort_events, output, state, engine_version from simulation_results order by period",
        )
      ).rows;
      const decisionRows = (await pg.query<{ period: number; decisions: Decisions }>("select period, decisions from simulation_decisions order by period")).rows;
      const r3 = rows[2];
      const recomputed = runPeriod({
        engineVersion: r3.engine_version,
        scenario: cohort.scenario,
        state: rows[1].state,
        decisions: decisionRows[2].decisions,
        cohortEvents: r3.cohort_events,
        seed: r3.seed,
        financing: [],
      });
      const { newState, ...rest } = recomputed;
      assert.equal(canonicalJson(rest), canonicalJson(r3.output));
      assert.equal(canonicalJson(newState), canonicalJson(r3.state));
    }));

  it("two groups in the cohort get the same cohort events for the same period", () =>
    withDb(async (pg) => {
      const a = await started(pg, "a");
      const b = await started(pg, "b");
      for (let p = 1; p <= 4; p++) {
        await as(pg, "auth-a", (db) =>
          submitDecisions(db, { simulationId: a.id, studentId: "student-a", decisions: decisions(p), clientId: `a${p}` }),
        );
        await as(pg, "auth-b", (db) =>
          submitDecisions(db, { simulationId: b.id, studentId: "student-b", decisions: decisions(p), clientId: `b${p}` }),
        );
      }
      const rows = (
        await pg.query<{ simulation_id: string; period: number; cohort_events: unknown }>(
          "select simulation_id, period, cohort_events from simulation_results order by period",
        )
      ).rows;
      for (let p = 1; p <= 4; p++) {
        const [x, y] = rows.filter((r) => r.period === p);
        assert.deepEqual(x.cohort_events, y.cohort_events, `period ${p}`);
      }
      const [{ n }] = (await pg.query<{ n: number }>("select count(*)::int as n from simulation_cohort_periods")).rows;
      assert.equal(n, 4, "each cohort period is drawn exactly once");
    }));
});

describe("database-level protection (clients never write outcomes)", () => {
  async function withRun(fn: (pg: PGlite, simId: string) => Promise<void>) {
    await withDb(async (pg) => {
      const sim = await started(pg, "a");
      await as(pg, "auth-a", (db) =>
        submitDecisions(db, { simulationId: sim.id, studentId: "student-a", decisions: decisions(1), clientId: "c1" }),
      );
      await fn(pg, sim.id);
    });
  }

  const attempts: [string, string][] = [
    ["insert a transaction", `insert into simulation_transactions (simulation_id, tx_id, period, category, amount, memo, explain_id) values ($1, '9:1', 1, 'revenue', 99999999, 'free money', 'x')`],
    ["change a transaction", `update simulation_transactions set amount = 99999999 where simulation_id = $1`],
    ["delete the ledger", `delete from simulation_transactions where simulation_id = $1`],
    ["write a result", `update simulation_results set closing_cash = 99999999 where simulation_id = $1`],
    ["advance its own period", `update simulations set completed_period = 6 where id = $1`],
    ["change its locked decisions", `update simulation_decisions set decisions = '{}' where simulation_id = $1`],
    ["delete its locked decisions", `delete from simulation_decisions where simulation_id = $1`],
    ["read the full engine output", `select output from simulation_results where simulation_id = $1`],
    ["read the engine state", `select state from simulation_results where simulation_id = $1`],
  ];
  for (const [what, sql] of attempts) {
    it(`a student cannot ${what}, even with the RLS bypass switch on`, () =>
      withRun(async (pg, simId) => {
        await assert.rejects(
          asUser(pg, "auth-a", async (tx) => {
            await tx.query("select set_config('app.bypass_rls', 'on', true)");
            return tx.query(sql, [simId]);
          }),
          /permission denied/,
        );
      }));
  }

  it("a student cannot inject cohort events", () =>
    withRun(async (pg) => {
      await assert.rejects(
        asUser(pg, "auth-a", (tx) =>
          tx.query(`insert into simulation_cohort_events (id, cohort_id, period, instance_id, event_id, origin)
                    select 'x', id, 2, 'viral@2', 'viral_post', 'injected' from simulation_cohorts`),
        ),
        /permission denied/,
      );
    }));

  it("a student can read their own results through the student view", () =>
    withRun(async (pg, simId) => {
      const rows = await asUser(pg, "auth-a", (tx) =>
        tx.query("select student_output, closing_cash from simulation_results where simulation_id = $1", [simId]),
      );
      assert.equal(rows.rows.length, 1);
    }));
});

describe("group privacy", () => {
  it("another group cannot see a group's simulation, results, decisions or ledger", () =>
    withDb(async (pg) => {
      const sim = await started(pg, "a");
      await as(pg, "auth-a", (db) =>
        submitDecisions(db, { simulationId: sim.id, studentId: "student-a", decisions: decisions(1), clientId: "c1" }),
      );
      for (const table of ["simulations", "simulation_decisions", "simulation_transactions"]) {
        const col = table === "simulations" ? "id" : "simulation_id";
        const rows = await asUser(pg, "auth-b", (tx) => tx.query(`select 1 from ${table} where ${col} = $1`, [sim.id]));
        assert.equal(rows.rows.length, 0, table);
      }
      const results = await asUser(pg, "auth-b", (tx) =>
        tx.query("select student_output from simulation_results where simulation_id = $1", [sim.id]),
      );
      assert.equal(results.rows.length, 0);
      assert.equal(await as(pg, "auth-b", (db) => loadSimulationView(db, "group-a")), null);
    }));

  it("another group cannot submit decisions to a group's simulation", () =>
    withDb(async (pg) => {
      const sim = await started(pg, "a");
      await assert.rejects(
        as(pg, "auth-b", (db) =>
          submitDecisions(db, { simulationId: sim.id, studentId: "student-b", decisions: decisions(1), clientId: "x" }),
        ),
        /does not belong to your group/,
      );
      await assert.rejects(
        asUser(pg, "auth-b", (tx) =>
          tx.query(
            `insert into simulation_decisions (id, simulation_id, period, decisions, submitted_by_student_id) values ('x', $1, 1, '{}', 'student-b')`,
            [sim.id],
          ),
        ),
        /row-level security/,
      );
    }));

  it("a student cannot submit in someone else's name", () =>
    withDb(async (pg) => {
      const sim = await started(pg, "a");
      await pg.query(
        `insert into students (id, auth_user_id, full_name, index_number, programme) values ('student-a2','auth-a2','A2','IDX-a2','Test')`,
      );
      await pg.query(`insert into group_members (id, group_id, student_id) values ('m-a2','group-a','student-a2')`);
      await assert.rejects(
        asUser(pg, "auth-a", (tx) =>
          tx.query(
            `insert into simulation_decisions (id, simulation_id, period, decisions, submitted_by_student_id) values ('x', $1, 1, '{}', 'student-a2')`,
            [sim.id],
          ),
        ),
        /row-level security/,
      );
    }));

  it("a lecturer sees simulations in their own cohort only, and cohort events only there", () =>
    withDb(async (pg) => {
      const sim = await started(pg, "a");
      await as(pg, "auth-a", (db) =>
        submitDecisions(db, { simulationId: sim.id, studentId: "student-a", decisions: decisions(1), clientId: "c1" }),
      );
      const mine = await asUser(pg, "auth-lect-1", (tx) => tx.query("select id from simulations"));
      assert.equal(mine.rows.length, 1);
      const other = await asUser(pg, "auth-lect-2", (tx) => tx.query("select id from simulations"));
      assert.equal(other.rows.length, 0);
      const cohortForStudent = await asUser(pg, "auth-a", (tx) => tx.query("select 1 from simulation_cohort_periods"));
      assert.equal(cohortForStudent.rows.length, 0, "students do not read the cohort's event draws directly");
    }));
});

describe("cohort settings", () => {
  it("the default is 6 periods; lecturers may configure 4 to 8", () =>
    withDb(async (pg) => {
      const c = await asUser(pg, "auth-a", (tx) => ensureCohort(dbOf(tx), "off1"));
      assert.equal(c.period_count, 6);
      assert.equal(c.scenario.periodCount.value, 6);
    }));
});

describe("a group's own venture", () => {
  const numbers = {
    offer: "Shuttle seat booking",
    unit: "seat",
    kind: "service" as const,
    costPerUnit: 150,
    price: 300,
    alternatives: [{ name: "Dropping taxi", price: 600 }],
    peoplePerWeek: 900,
    buysPerWeek: 4,
    capacityPerWeek: 1200,
    wasteShare: 0,
    fixedCosts: [{ label: "Bus hire", amount: 60000 }],
  };

  it("is frozen at start and run instead of the class's food stall, with the class's cash and events", () =>
    withDb(async (pg) => {
      const sim = await as(pg, "auth-a", (db) =>
        startSimulation(db, {
          studentId: "student-a",
          groupId: "group-a",
          ventureId: "venture-a",
          offeringId: "off1",
          buildScenario: (frame) => scenarioFromVenture(numbers, frame),
        }),
      );
      assert.equal(sim.scenario?.id, "own-venture");
      const before = await as(pg, "auth-a", (db) => loadSimulationView(db, "group-a"));
      assert.equal(before?.market.products[0].name, "Shuttle seat booking");
      assert.equal(before?.cash, 400000, "the class's starting cash");
      await as(pg, "auth-a", (db) =>
        submitDecisions(db, {
          simulationId: sim.id,
          studentId: "student-a",
          clientId: "c1",
          decisions: {
            period: 1,
            products: { offer: { price: 300, qualityTier: "standard", order: { supplierId: "own_cost", units: 400 } } },
            marketingBudget: 5000,
            eventResponses: {},
          },
        }),
      );
      const after = await as(pg, "auth-a", (db) => loadSimulationView(db, "group-a"));
      assert.equal(after?.completedPeriod, 1);
      assert.equal(after?.stock.offer, 0, "unused seats do not carry over");
      // Group B, in the same class, still plays the class's scenario.
      await started(pg, "b");
      const b = await as(pg, "auth-b", (db) => loadSimulationView(db, "group-b"));
      assert.equal(b?.market.products[0].id, "rice_pack");
    }));
});

describe("money raised before opening", () => {
  it("starts with the group's own cash plus its loans, and repays from week 1", () =>
    withDb(async (pg) => {
      const sim = await as(pg, "auth-a", (db) =>
        startSimulation(db, {
          studentId: "student-a",
          groupId: "group-a",
          ventureId: "venture-a",
          offeringId: "off1",
          buildScenario: (frame) => ({ ...frame, startingCapital: { value: 50000, assumption: true } }),
          openingLoans: [{ id: "raised_1_bank", source: "bank", amount: 100000, ratePerPeriodBp: 300, termPeriods: 6 }],
        }),
      );
      const before = await as(pg, "auth-a", (db) => loadSimulationView(db, "group-a"));
      assert.equal(before?.cash, 150000, "GHS 500 of their own + GHS 1,000 borrowed");
      await as(pg, "auth-a", (db) => submitDecisions(db, { simulationId: sim.id, studentId: "student-a", clientId: "c-1", decisions: decisions(1) }));
      const rows = await pg.query<{ category: string; amount: number }>(
        "select category, amount from simulation_transactions where simulation_id = $1 and period = 1 and category in ('loan_interest', 'loan_principal')",
        [sim.id],
      );
      assert.deepEqual(
        rows.rows.map((r) => [r.category, Number(r.amount)]).sort(),
        [
          ["loan_interest", -3000],
          ["loan_principal", -16666],
        ],
      );
    }));
});
