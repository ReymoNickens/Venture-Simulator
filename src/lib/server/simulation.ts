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
}

export const getSimulation = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<SimulationPageData> => {
    const student = await requireStudent(context.userId);
    const group = await loadGroupForStudent(student.id);
    if (!group) return { view: null, canStart: false, blockedReason: "Join a group first." };
    const sql = await getSql();
    const view = await loadSimulationView(sql, group.id);
    if (view) return { view, canStart: false, blockedReason: null };
    const venture = await sql<{ id: string }>`select id from ventures where group_id = ${group.id} limit 1`;
    if (!venture[0]) {
      return { view: null, canStart: false, blockedReason: "Your group must select a venture before it can run." };
    }
    return { view: null, canStart: true, blockedReason: null };
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
    const venture = await sql<{ id: string }>`select id from ventures where group_id = ${group.id} limit 1`;
    if (!venture[0]) throw new AppError("NO_VENTURE", "Select a venture first.");
    const sim = await startSimulation(sql, {
      studentId: student.id,
      groupId: group.id,
      ventureId: venture[0].id,
      offeringId: offering.id,
    });
    await logEvent({
      studentId: student.id,
      groupId: group.id,
      ventureId: venture[0].id,
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
