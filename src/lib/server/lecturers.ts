// Server functions for lecturers. Two audiences:
// - the owner (OWNER_ACCESS_CODE) creating lecturer logins and assigning classes;
// - a signed-in lecturer, whose reads run under RLS scoped to their classes.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware, codeCheckedMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import {
  listAllClasses,
  ownerLecturers,
  setStaffClasses,
  type ClassOption,
  type OwnerLecturer,
} from "@/lib/lecturers/accounts";
import {
  activityFeed,
  addFeedback,
  groupDetail,
  groupSignals,
  marksRows,
  myClasses,
  type ActivityItem,
  type GroupDetail,
  type LecturerClass,
  type MarksRow,
} from "@/lib/lecturers/data";
import type { GroupSignals } from "@/lib/lecturers/insights";
import { requireOwner } from "./owner";
import { AppError } from "./errors";
import { parseInput } from "./validate";

const ownerCode = z.string().min(1).max(200);
const id = z.string().min(1).max(80);

// ------------------------------------------------------------------ owner

export interface OwnerLecturerData {
  classes: ClassOption[];
  lecturers: OwnerLecturer[];
}

export const getOwnerLecturers = createServerFn({ method: "POST" })
  .middleware([codeCheckedMiddleware])
  .validator(parseInput(z.object({ ownerCode })))
  .handler(async ({ data }): Promise<OwnerLecturerData> => {
    await requireOwner(data.ownerCode);
    const sql = await getSql();
    const [classes, rest] = await Promise.all([listAllClasses(sql), ownerLecturers(sql)]);
    return { classes: classes.filter((c) => c.offeringId !== "demo_tour"), lecturers: rest.lecturers };
  });

/** A password that is easy to read out or type from a message: three groups of four. */
async function makePassword(): Promise<string> {
  const { randomInt } = await import("node:crypto");
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const group = () => Array.from({ length: 4 }, () => alphabet[randomInt(alphabet.length)]).join("");
  return `${group()}-${group()}-${group()}`;
}

/**
 * The owner adds a lecturer: name, email and classes in; an email-and-
 * password login out, shown once for the owner to pass on. The lecturer can
 * change the password after signing in. No middleware: the account is made
 * outside the database transaction, because the sign-up hook reads on its
 * own connection (same as src/lib/server/demo.ts).
 */
export const createOwnerLecturerLogin = createServerFn({ method: "POST" })
  .validator(
    parseInput(
      z.object({ ownerCode, fullName: z.string().min(1).max(120), email: z.string().min(3).max(200), offeringIds: z.array(id).min(1).max(50) }),
    ),
  )
  .handler(async ({ data }): Promise<{ email: string; password: string }> => {
    const { assertSameSiteRequest } = await import("@/lib/auth/isolation.server");
    const { runInScope } = await import("@/lib/db");
    const { createLecturerRecord } = await import("@/lib/lecturers/accounts");
    const { auth } = await import("@/lib/auth/server");
    assertSameSiteRequest();
    await requireOwner(data.ownerCode);
    const record = await runInScope({ kind: "bypass" }, async () => createLecturerRecord(await getSql(), data));
    const password = await makePassword();
    try {
      await auth.api.signUpEmail({ body: { email: record.email, password, name: record.fullName } });
    } catch (err) {
      // Leave nothing half-made, so the owner can simply try again.
      await runInScope({ kind: "bypass" }, async () => {
        const sql = await getSql();
        await sql`delete from lecturer_classes where staff_id = ${record.staffId}`;
        await sql`delete from lecturers where id = ${record.staffId} and auth_user_id is null`;
      });
      throw err;
    }
    return { email: record.email, password };
  });

/** A forgotten password: the owner makes a new one to pass on. */
export const resetOwnerLecturerPassword = createServerFn({ method: "POST" })
  .validator(parseInput(z.object({ ownerCode, staffId: id })))
  .handler(async ({ data }): Promise<{ email: string; password: string }> => {
    const { assertSameSiteRequest } = await import("@/lib/auth/isolation.server");
    const { runInScope } = await import("@/lib/db");
    const { lecturerAccount } = await import("@/lib/lecturers/accounts");
    const { auth } = await import("@/lib/auth/server");
    assertSameSiteRequest();
    await requireOwner(data.ownerCode);
    const account = await runInScope({ kind: "bypass" }, async () => lecturerAccount(await getSql(), data.staffId));
    if (!account.authUserId) throw new AppError("INVALID", "This lecturer has no login yet.");
    const password = await makePassword();
    const ctx = await auth.$context;
    await ctx.internalAdapter.updatePassword(account.authUserId, await ctx.password.hash(password));
    return { email: account.email, password };
  });

export const setOwnerLecturerClasses = createServerFn({ method: "POST" })
  .middleware([codeCheckedMiddleware])
  .validator(parseInput(z.object({ ownerCode, staffId: id, offeringIds: z.array(id).min(1).max(50) })))
  .handler(async ({ data }) => {
    await requireOwner(data.ownerCode);
    await setStaffClasses(await getSql(), data.staffId, data.offeringIds);
    return { ok: true };
  });

// ------------------------------------------------------ signed-in lecturer

async function requireLecturer(userId: string): Promise<{ fullName: string }> {
  const sql = await getSql();
  const rows = await sql<{ full_name: string }>`select full_name from lecturers where auth_user_id = ${userId} limit 1`;
  if (!rows[0]) throw new AppError("FORBIDDEN", "This page is for lecturers.");
  return { fullName: rows[0].full_name };
}

export interface LecturerHome {
  fullName: string;
  classes: LecturerClass[];
  groups: GroupSignals[];
}

export const getLecturerHome = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<LecturerHome> => {
    const me = await requireLecturer(context.userId);
    const sql = await getSql();
    const [classes, groups] = await Promise.all([myClasses(sql), groupSignals(sql)]);
    return { fullName: me.fullName, classes, groups };
  });

export const getLecturerActivity = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(parseInput(z.object({ offeringId: id.optional() })))
  .handler(async ({ context, data }): Promise<ActivityItem[]> => {
    await requireLecturer(context.userId);
    return activityFeed(await getSql(), { offeringId: data.offeringId, limit: 150 });
  });

export const getLecturerGroup = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(parseInput(z.object({ groupId: id })))
  .handler(async ({ context, data }): Promise<{ detail: GroupDetail; activity: ActivityItem[] }> => {
    await requireLecturer(context.userId);
    const sql = await getSql();
    const [detail, activity] = await Promise.all([
      groupDetail(sql, data.groupId),
      activityFeed(sql, { groupId: data.groupId, limit: 40 }),
    ]);
    return { detail, activity };
  });

export const sendGroupFeedback = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(parseInput(z.object({ groupId: id, body: z.string().min(1).max(1000) })))
  .handler(async ({ context, data }) => {
    const me = await requireLecturer(context.userId);
    await addFeedback(await getSql(), {
      groupId: data.groupId,
      authorUserId: context.userId,
      authorName: me.fullName,
      body: data.body,
    });
    return { ok: true };
  });

export const getMarksSheet = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(parseInput(z.object({ offeringId: id })))
  .handler(async ({ context, data }): Promise<MarksRow[]> => {
    await requireLecturer(context.userId);
    return marksRows(await getSql(), data.offeringId);
  });
