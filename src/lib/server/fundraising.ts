// Server functions for the group's fundraising game. The rules are pure
// (src/lib/game/fundraise.ts); here every move is computed on the server
// from the stored state and written with the RLS bypass, so a group can only
// ever reach a state the rules allow. One shared game per group.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, withRlsBypass } from "@/lib/db";
import { finish, newGame, perform, PLACES, travel, type ActionId, type GameState, type PlaceId } from "@/lib/game/fundraise";
import { checkVentureNumbers, startupGoal, type VentureNumbers } from "@/sim/scenarios/own-venture";
import { AppError, loadGroupForStudent, logEvent, requireStudent } from "./authz";
import { parseInput } from "./validate";

const ACTIONS = [
  "rest",
  "call_relative",
  "prepare_pitch",
  "tutor",
  "apply_grant",
  "borrow_friend",
  "sell_share",
  "hang_out",
  "count_customers",
  "porter",
  "susu_pay",
  "susu_collect",
  "bank_interview",
  "microfinance_apply",
  "accept_offer",
  "decline_offer",
  "ask_family_gift",
  "ask_family_loan",
  "help_family",
] as const satisfies readonly ActionId[];

/** A stable number from the group id: the group's luck is fixed, like a dealt card. */
function seedOf(groupId: string): number {
  let h = 2166136261;
  for (const ch of groupId) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h;
}

async function context(userId: string) {
  const student = await requireStudent(userId);
  const group = await loadGroupForStudent(student.id);
  if (!group) throw new AppError("NO_GROUP", "Join a group first.");
  const sql = await getSql();
  const v = await sql<{ id: string; sim_inputs: VentureNumbers | null }>`select id, sim_inputs from ventures where group_id = ${group.id} limit 1`;
  if (!v[0]) throw new AppError("NO_VENTURE", "Select a venture first.");
  return { student, group, sql, venture: v[0] };
}

/** Apply one move under a row lock, so two members acting at once take turns. */
async function move(userId: string, fn: (s: GameState) => GameState): Promise<GameState> {
  const { student, group, sql } = await context(userId);
  return withRlsBypass(async () => {
    const running = await sql`select 1 from simulations where group_id = ${group.id} limit 1`;
    if (running[0]) throw new AppError("CLOSED", "Your venture is open. Fundraising is over.");
    const rows = await sql<{ state: GameState; finished_at: unknown }>`select state, finished_at from fundraising where group_id = ${group.id} for update`;
    if (!rows[0]) throw new AppError("NOT_STARTED", "Start raising money first.");
    if (rows[0].finished_at) throw new AppError("CLOSED", "Your group has finished raising money.");
    const next = fn(rows[0].state);
    await sql`
      update fundraising set state = ${JSON.stringify(next)}::jsonb, updated_at = now(),
        finished_at = ${next.over ? new Date().toISOString() : null}
      where group_id = ${group.id}
    `;
    if (next.over) {
      await logEvent({
        studentId: student.id,
        groupId: group.id,
        eventType: "FUNDRAISING_FINISHED",
        entityType: "group",
        entityId: group.id,
        metadata: { cash: next.cash, goal: next.goal ?? null, loans: next.debts.length },
      });
    }
    return next;
  });
}

export const startFundraising = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context: ctx }): Promise<GameState> => {
    const { student, group, sql, venture } = await context(ctx.userId);
    const numbers = venture.sim_inputs;
    if (!numbers || checkVentureNumbers(numbers).length) throw new AppError("NO_NUMBERS", "Set your venture’s numbers first.");
    return withRlsBypass(async () => {
      const existing = await sql<{ state: GameState }>`select state from fundraising where group_id = ${group.id}`;
      if (existing[0]) return existing[0].state;
      const state = newGame(seedOf(group.id), undefined, startupGoal(numbers));
      await sql`
        insert into fundraising (group_id, state, started_by_student_id) values (${group.id}, ${JSON.stringify(state)}::jsonb, ${student.id})
        on conflict (group_id) do nothing
      `;
      await logEvent({ studentId: student.id, groupId: group.id, eventType: "FUNDRAISING_STARTED", entityType: "group", entityId: group.id });
      const rows = await sql<{ state: GameState }>`select state from fundraising where group_id = ${group.id}`;
      return rows[0].state;
    });
  });

export const fundraiseTravel = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(parseInput(z.object({ to: z.enum(Object.keys(PLACES) as [PlaceId, ...PlaceId[]]), mode: z.enum(["walk", "trotro"]) })))
  .handler(async ({ context: ctx, data }) => move(ctx.userId, (s) => travel(s, data.to, data.mode)));

export const fundraiseAct = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(parseInput(z.object({ action: z.enum(ACTIONS), answers: z.array(z.number().int().min(0).max(2)).max(3).optional() })))
  .handler(async ({ context: ctx, data }) => move(ctx.userId, (s) => perform(s, data.action, data.answers ?? [])));

export const fundraiseFinish = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context: ctx }) => move(ctx.userId, (s) => finish(s)));
