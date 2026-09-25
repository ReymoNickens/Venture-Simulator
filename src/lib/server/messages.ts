import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, withRlsBypass } from "@/lib/db";
import { newId } from "@/lib/utils";
import { AppError, loadGroupForStudent, logEvent, requireStudent } from "./authz";
import { requireStaff, requireStaffForGroup } from "./lecturer-core";

// Messaging between staff and groups. Server functions only.

const MAX = 2000;

function cleanBody(raw: string): string {
  const body = String(raw ?? "").trim();
  if (!body) throw new AppError("INVALID", "Write a message first.");
  if (body.length > MAX) throw new AppError("INVALID", "Keep it under 2,000 characters.");
  return body;
}

async function markRead(userId: string, groupId: string) {
  const sql = await getSql();
  await sql`
    insert into message_reads (user_id, group_id, last_read_at) values (${userId}, ${groupId}, now())
    on conflict (user_id, group_id) do update set last_read_at = now()
  `;
}

/** A student writes to their group thread, or privately to staff. */
export const sendMessage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { body: string; privateToStaff?: boolean }) => input)
  .handler(async ({ context, data }) => {
    const student = await requireStudent(context.userId);
    const group = await loadGroupForStudent(student.id);
    if (!group) throw new AppError("NO_GROUP", "Join a group first.");
    const body = cleanBody(data.body);
    const sql = await getSql();
    const id = newId();
    await sql`
      insert into messages (id, group_id, author_student_id, recipient_student_id, body)
      values (${id}, ${group.id}, ${student.id}, ${data.privateToStaff ? student.id : null}, ${body})
    `;
    await markRead(context.userId, group.id);
    await logEvent({ studentId: student.id, groupId: group.id, eventType: "MESSAGE_SENT", entityType: "message", entityId: id });
    return { id };
  });

export const markMessagesRead = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const student = await requireStudent(context.userId);
    const group = await loadGroupForStudent(student.id);
    if (group) await markRead(context.userId, group.id);
    return { ok: true };
  });

/** Staff write to one group, or privately to one student in it. */
export const sendStaffMessage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { groupId: string; body: string; recipientStudentId?: string | null }) => input)
  .handler(async ({ context, data }) => {
    const staff = await requireStaffForGroup(context.userId, data.groupId);
    const body = cleanBody(data.body);
    const sql = await getSql();
    if (data.recipientStudentId) {
      const m = await sql<{ id: string }>`
        select id from group_members where group_id = ${data.groupId} and student_id = ${data.recipientStudentId} limit 1
      `;
      if (!m[0]) throw new AppError("NOT_FOUND", "That student is not in this group.");
    }
    const id = newId();
    await sql`
      insert into messages (id, group_id, author_staff_id, recipient_student_id, body)
      values (${id}, ${data.groupId}, ${staff.staffId}, ${data.recipientStudentId ?? null}, ${body})
    `;
    await markRead(context.userId, data.groupId);
    await withRlsBypass(() =>
      logEvent({ groupId: data.groupId, eventType: "STAFF_MESSAGE", entityType: "message", entityId: id }),
    );
    return { id };
  });

/** One message to many groups — e.g. every group behind on a milestone. */
export const sendStaffMessageBulk = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { offeringId: string; groupIds: string[]; body: string }) => input)
  .handler(async ({ context, data }) => {
    const staff = await requireStaff(context.userId, data.offeringId);
    const body = cleanBody(data.body);
    const ids = [...new Set((data.groupIds ?? []).map(String))].slice(0, 500);
    if (!ids.length) throw new AppError("INVALID", "Choose at least one group.");
    const sql = await getSql();
    const valid = await sql.query<{ id: string }>(
      `select id from groups where course_offering_id = $1 and id = any($2::text[])`,
      [data.offeringId, ids],
    );
    for (const g of valid) {
      await sql`
        insert into messages (id, group_id, author_staff_id, body)
        values (${newId()}, ${g.id}, ${staff.staffId}, ${body})
      `;
      await markRead(context.userId, g.id);
    }
    return { sent: valid.length };
  });

export const markThreadRead = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { groupId: string }) => input)
  .handler(async ({ context, data }) => {
    await requireStaffForGroup(context.userId, data.groupId);
    await markRead(context.userId, data.groupId);
    return { ok: true };
  });
