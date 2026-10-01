// Server functions for lecturers. Three audiences, like class lists:
// - the owner (OWNER_ACCESS_CODE) inviting lecturers and assigning classes;
// - a lecturer redeeming their one-time invite code before signing up;
// - a signed-in lecturer, whose reads run under RLS scoped to their classes.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware, codeCheckedMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import {
  createLecturerInvite,
  listAllClasses,
  ownerLecturers,
  previewLecturerCode,
  redeemLecturerCode,
  revokeLecturerInvite,
  setStaffClasses,
  type ClassOption,
  type OwnerLecturer,
  type OwnerLecturerInvite,
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
  invites: OwnerLecturerInvite[];
}

export const getOwnerLecturers = createServerFn({ method: "POST" })
  .middleware([codeCheckedMiddleware])
  .validator(parseInput(z.object({ ownerCode })))
  .handler(async ({ data }): Promise<OwnerLecturerData> => {
    await requireOwner(data.ownerCode);
    const sql = await getSql();
    const [classes, rest] = await Promise.all([listAllClasses(sql), ownerLecturers(sql)]);
    return { classes, ...rest };
  });

export const createOwnerLecturerInvite = createServerFn({ method: "POST" })
  .middleware([codeCheckedMiddleware])
  .validator(parseInput(z.object({ ownerCode, label: z.string().min(1).max(120), offeringIds: z.array(id).min(1).max(50) })))
  .handler(async ({ data }) => {
    await requireOwner(data.ownerCode);
    return createLecturerInvite(await getSql(), data);
  });

export const revokeOwnerLecturerInvite = createServerFn({ method: "POST" })
  .middleware([codeCheckedMiddleware])
  .validator(parseInput(z.object({ ownerCode, id })))
  .handler(async ({ data }) => {
    await requireOwner(data.ownerCode);
    await revokeLecturerInvite(await getSql(), data.id);
    return { ok: true };
  });

export const setOwnerLecturerClasses = createServerFn({ method: "POST" })
  .middleware([codeCheckedMiddleware])
  .validator(parseInput(z.object({ ownerCode, staffId: id, offeringIds: z.array(id).min(1).max(50) })))
  .handler(async ({ data }) => {
    await requireOwner(data.ownerCode);
    await setStaffClasses(await getSql(), data.staffId, data.offeringIds);
    return { ok: true };
  });

// --------------------------------------------------------- lecturer join

const lecCode = z.string().min(4).max(40);

export const checkLecturerCode = createServerFn({ method: "POST" })
  .middleware([codeCheckedMiddleware])
  .validator(parseInput(z.object({ code: lecCode })))
  .handler(async ({ data }) => previewLecturerCode(await getSql(), data.code));

export const joinAsLecturer = createServerFn({ method: "POST" })
  .middleware([codeCheckedMiddleware])
  .validator(parseInput(z.object({ code: lecCode, fullName: z.string().min(1).max(120), email: z.string().min(3).max(200) })))
  .handler(async ({ data }) => redeemLecturerCode(await getSql(), data));

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
