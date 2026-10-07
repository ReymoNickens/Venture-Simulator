// Server functions for the simulated venture (Phase 2, Slice B). Thin
// wrappers: authenticate, resolve the caller's group, validate input, and
// hand the request's transaction to the simulation service. Results are
// computed here on the server, never in the browser.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import {
  loadPeriodDetail,
  loadSimulationView,
  startSimulation,
  submitDecisions,
  type SimulationView,
} from "@/lib/simulation/service";
import type { StudentPeriodView } from "@/sim/index";
import { checkVentureNumbers, scenarioFromVenture, startupGoal, type VentureNumbers } from "@/sim/scenarios/own-venture";
import { fundingPlan, type GameState } from "@/lib/game/fundraise";
import { AppError, loadGroupForStudent, loadOfferingForStudent, logEvent, requireStudent } from "./authz";
import { parseInput } from "./validate";

const id = z.string().min(1).max(80);

export const DecisionsSchema = z.object({
  period: z.number().int().min(1).max(8),
  products: z.record(
    z.string().max(40),
    z.object({
      price: z.number().int().positive().max(10_000_000),
      qualityTier: z.string().max(40),
      order: z
        .object({ supplierId: z.string().max(40), units: z.number().int().min(0).max(100_000) })
        .nullable(),
    }),
  ),
  marketingBudget: z.number().int().min(0).max(100_000_000),
  marketingSplit: z.record(z.string().max(40), z.number().min(0).max(1000)).optional(),
  eventResponses: z.record(z.string().max(80), z.string().max(40)),
});

export interface SimulationPageData {
  view: SimulationView | null;
  canStart: boolean;
  /** Why the simulation cannot start yet, in plain words. */
  blockedReason: string | null;
  /** The venture this group runs, before it starts. */
  venture: { name: string; problem: string; alternatives: string } | null;
  /** The group's own numbers, once someone has entered them. */
  numbers: VentureNumbers | null;
  /** The group's evidence, to say where a number came from. */
  evidence: { id: string; title: string }[];
  /** Raising the money to open: the group's game, and the target from their numbers. */
  fundraising: { state: GameState | null; finished: boolean; goal: number | null };
}

async function fundraisingFor(groupId: string, numbers: VentureNumbers | null) {
  const sql = await getSql();
  const rows = await sql<{ state: GameState; finished_at: unknown }>`select state, finished_at from fundraising where group_id = ${groupId}`;
  return {
    state: rows[0]?.state ?? null,
    finished: Boolean(rows[0]?.finished_at),
    goal: numbers && checkVentureNumbers(numbers).length === 0 ? startupGoal(numbers) : null,
  };
}

const money = z.number().int().min(0).max(100_000_000);
const NumbersSchema = z.object({
  offer: z.string().max(80),
  unit: z.string().max(30),
  kind: z.enum(["goods", "service"]),
  costPerUnit: money,
  price: money,
  alternatives: z.array(z.object({ name: z.string().max(60), price: money })).max(4),
  peoplePerWeek: z.number().int().min(0).max(1_000_000),
  buysPerWeek: z.number().min(0).max(50),
  capacityPerWeek: z.number().int().min(0).max(1_000_000),
  wasteShare: z.number().min(0).max(1),
  fixedCosts: z.array(z.object({ label: z.string().max(60), amount: money })).max(8),
  sources: z
    .object({ costPerUnit: id.nullable().optional(), price: id.nullable().optional(), peoplePerWeek: id.nullable().optional() })
    .optional(),
});

async function ventureFor(groupId: string) {
  const sql = await getSql();
  const rows = await sql<{ id: string; name: string; sim_inputs: VentureNumbers | null; problem: string | null; alternatives: string | null }>`
    select v.id, v.name, v.sim_inputs, o.problem, o.current_alternatives as alternatives
    from ventures v left join opportunities o on o.id = v.opportunity_id
    where v.group_id = ${groupId} limit 1
  `;
  return rows[0] ?? null;
}

export const getSimulation = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<SimulationPageData> => {
    const student = await requireStudent(context.userId);
    const group = await loadGroupForStudent(student.id);
    const none = { venture: null, numbers: null, evidence: [], fundraising: { state: null, finished: false, goal: null } };
    if (!group) return { view: null, canStart: false, blockedReason: "Join a group first.", ...none };
    const sql = await getSql();
    const view = await loadSimulationView(sql, group.id);
    if (view) return { view, canStart: false, blockedReason: null, ...none };
    const venture = await ventureFor(group.id);
    if (!venture) {
      return { view: null, canStart: false, blockedReason: "Your group must select a venture before it can run.", ...none };
    }
    const evidence = await sql<{ id: string; title: string }>`
      select id, title from evidence_items where venture_id = ${venture.id} order by created_at desc limit 50
    `;
    const numbers = venture.sim_inputs;
    const fundraising = await fundraisingFor(group.id, numbers);
    return {
      view: null,
      canStart: Boolean(numbers && checkVentureNumbers(numbers).length === 0 && fundraising.finished),
      fundraising,
      blockedReason: null,
      venture: { name: venture.name, problem: venture.problem ?? "", alternatives: venture.alternatives ?? "" },
      numbers,
      evidence,
    };
  });

/** Save the group's numbers (any member, until the venture opens). */
export const saveVentureNumbers = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(parseInput(z.object({ numbers: NumbersSchema })))
  .handler(async ({ context, data }) => {
    const student = await requireStudent(context.userId);
    const group = await loadGroupForStudent(student.id);
    if (!group) throw new AppError("NO_GROUP", "Join a group first.");
    const sql = await getSql();
    const venture = await ventureFor(group.id);
    if (!venture) throw new AppError("NO_VENTURE", "Select a venture first.");
    const running = await sql`select 1 from simulations where group_id = ${group.id} limit 1`;
    if (running[0]) throw new AppError("CLOSED", "Your venture is already open. Its numbers are fixed now.");
    const raising = await sql`select 1 from fundraising where group_id = ${group.id} limit 1`;
    if (raising[0]) throw new AppError("CLOSED", "You’ve started raising money for these numbers, so they’re fixed now.");
    const problems = checkVentureNumbers(data.numbers);
    if (problems.length) throw new AppError("INVALID", problems[0]);
    // A source must be this group's own evidence.
    const cited = Object.values(data.numbers.sources ?? {}).filter((x): x is string => Boolean(x));
    if (cited.length) {
      const ok = await sql<{ id: string }>`select id from evidence_items where venture_id = ${venture.id} and id = any(${cited})`;
      if (ok.length !== new Set(cited).size) throw new AppError("INVALID", "One of those sources isn’t in your group’s evidence.");
    }
    await sql`
      update ventures set sim_inputs = ${JSON.stringify(data.numbers)}::jsonb, sim_inputs_updated_at = now(),
        sim_inputs_updated_by = ${student.id}, updated_at = now()
      where id = ${venture.id}
    `;
    await logEvent({
      studentId: student.id,
      groupId: group.id,
      ventureId: venture.id,
      eventType: "VENTURE_NUMBERS_SAVED",
      entityType: "venture",
      entityId: venture.id,
    });
    return { ok: true };
  });

export const startGroupSimulation = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const student = await requireStudent(context.userId);
    const group = await loadGroupForStudent(student.id);
    if (!group) throw new AppError("NO_GROUP", "Join a group first.");
    const offering = await loadOfferingForStudent(student.id);
    if (!offering) throw new AppError("NO_OFFERING", "You are not enrolled in a course.");
    const sql = await getSql();
    const venture = await ventureFor(group.id);
    if (!venture) throw new AppError("NO_VENTURE", "Select a venture first.");
    const numbers = venture.sim_inputs;
    if (!numbers || checkVentureNumbers(numbers).length) {
      throw new AppError("NO_NUMBERS", "Fill in your venture’s numbers first.");
    }
    const raised = await fundraisingFor(group.id, numbers);
    if (!raised.state || !raised.finished) throw new AppError("NOT_FUNDED", "Raise the money to open first.");
    const plan = fundingPlan(raised.state, 6);
    const sim = await startSimulation(sql, {
      studentId: student.id,
      groupId: group.id,
      ventureId: venture.id,
      offeringId: offering.id,
      buildScenario: (frame) => {
        const scenario = scenarioFromVenture(numbers, frame);
        // The cash the group raised that is theirs (savings, gifts, wages, susu, grants, a share sold).
        scenario.startingCapital = { value: plan.startingCash, assumption: true, note: "Raised by the group before opening." };
        return scenario;
      },
      openingLoans: plan.loans.map((l) => ({ ...l, termPeriods: Math.min(l.termPeriods, 6) })),
    });
    await logEvent({
      studentId: student.id,
      groupId: group.id,
      ventureId: venture.id,
      eventType: "SIMULATION_STARTED",
      entityType: "simulation",
      entityId: sim.id,
    });
    return { simulationId: sim.id };
  });

export const submitSimulationDecisions = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(parseInput(z.object({ simulationId: id, clientId: id, decisions: DecisionsSchema })))
  .handler(async ({ context, data }) => {
    const student = await requireStudent(context.userId);
    const group = await loadGroupForStudent(student.id);
    if (!group) throw new AppError("NO_GROUP", "Join a group first.");
    const sql = await getSql();
    const result = await submitDecisions(sql, {
      simulationId: data.simulationId,
      studentId: student.id,
      decisions: data.decisions,
      clientId: data.clientId,
    });
    if (!result.replayed) {
      await logEvent({
        studentId: student.id,
        groupId: group.id,
        eventType: "SIMULATION_DECISIONS_SUBMITTED",
        entityType: "simulation",
        entityId: data.simulationId,
        metadata: { period: result.period, status: result.status },
      });
    }
    return result;
  });

export const getSimulationPeriod = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(parseInput(z.object({ period: z.number().int().min(1).max(8) })))
  .handler(async ({ context, data }): Promise<StudentPeriodView | null> => {
    const student = await requireStudent(context.userId);
    const group = await loadGroupForStudent(student.id);
    if (!group) return null;
    return loadPeriodDetail(await getSql(), group.id, data.period);
  });
