import { getSql, withRlsBypass } from "@/lib/db";
import { newId } from "@/lib/utils";
import { evaluateGroupStatus } from "@/lib/domain/state-machine";
import type { CourseOffering, Group, GroupStatus, Student } from "@/lib/domain/types";

export class AppError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "Error";
    this.code = code;
  }
}

export interface Actor {
  userId: string;
  student: Student;
  offering: CourseOffering | null;
}

type StudentRow = {
  id: string;
  auth_user_id: string;
  full_name: string;
  index_number: string;
  programme: string;
  is_synthetic: boolean | string;
  created_at: unknown;
  updated_at: unknown;
};

export function mapStudent(row: StudentRow): Student {
  return {
    id: row.id,
    authUserId: row.auth_user_id,
    fullName: row.full_name,
    indexNumber: row.index_number,
    programme: row.programme,
    isSynthetic: row.is_synthetic === true || row.is_synthetic === "t",
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

export async function loadStudent(userId: string): Promise<Student | null> {
  const sql = await getSql();
  const rows = await sql<StudentRow>`
    select id, auth_user_id, full_name, index_number, programme, is_synthetic, created_at, updated_at
    from students where auth_user_id = ${userId} limit 1
  `;
  return rows[0] ? mapStudent(rows[0]) : null;
}

export async function requireStudent(userId: string): Promise<Student> {
  const student = await loadStudent(userId);
  if (!student) throw new AppError("PROFILE_REQUIRED", "Complete your student profile first.");
  return student;
}

export type OfferingRow = {
  id: string;
  course_id: string;
  semester: string;
  academic_year: string;
  default_group_size: number;
  selection_requires_all_active: boolean | string;
  max_photo_bytes: number;
  decision_quorum_pct: number;
  ai_daily_student_limit: number;
  course_code: string;
  course_name: string;
};

export const OFFERING_COLUMNS = `o.id, o.course_id, o.semester, o.academic_year, o.default_group_size,
  o.selection_requires_all_active, o.max_photo_bytes, o.decision_quorum_pct,
  o.ai_daily_student_limit, c.course_code, c.course_name`;

export function mapOffering(row: OfferingRow): CourseOffering {
  return {
    id: row.id,
    courseId: row.course_id,
    semester: row.semester,
    academicYear: row.academic_year,
    defaultGroupSize: Number(row.default_group_size),
    selectionRequiresAllActive:
      row.selection_requires_all_active === true || row.selection_requires_all_active === "t",
    maxPhotoBytes: Number(row.max_photo_bytes),
    decisionQuorumPct: Number(row.decision_quorum_pct ?? 51),
    aiDailyStudentLimit: Number(row.ai_daily_student_limit ?? 25),
    courseCode: row.course_code,
    courseName: row.course_name,
  };
}

export async function loadOfferingForStudent(studentId: string): Promise<CourseOffering | null> {
  const sql = await getSql();
  const rows = await sql.query<OfferingRow>(
    `select ${OFFERING_COLUMNS}
     from course_enrolments e
     join course_offerings o on o.id = e.course_offering_id
     join courses c on c.id = o.course_id
     where e.student_id = $1 and e.status = 'active'
     order by e.created_at desc
     limit 1`,
    [studentId],
  );
  return rows[0] ? mapOffering(rows[0]) : null;
}

export async function loadGroupForStudent(studentId: string): Promise<Group | null> {
  const sql = await getSql();
  const rows = await sql<{
    id: string;
    course_offering_id: string;
    group_name: string;
    group_number: number;
    join_code: string;
    status: string;
    created_by_student_id: string | null;
    capacity: number;
    created_at: unknown;
    updated_at: unknown;
  }>`
    select g.id, g.course_offering_id, g.group_name, g.group_number, g.join_code,
           g.status, g.created_by_student_id, g.capacity, g.created_at, g.updated_at
    from group_members gm
    join groups g on g.id = gm.group_id
    where gm.student_id = ${studentId} and gm.membership_status = 'active'
    order by gm.joined_at desc
    limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    courseOfferingId: row.course_offering_id,
    groupName: row.group_name,
    groupNumber: Number(row.group_number),
    joinCode: row.join_code,
    status: row.status as Group["status"],
    createdByStudentId: row.created_by_student_id,
    capacity: Number(row.capacity),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

export async function assertGroupMember(studentId: string, groupId: string): Promise<void> {
  const sql = await getSql();
  const rows = await sql<{ id: string }>`
    select id from group_members
    where student_id = ${studentId}
      and group_id = ${groupId}
      and membership_status = 'active'
    limit 1
  `;
  if (!rows[0]) throw new AppError("FORBIDDEN", "You are not a member of this group.");
}

export async function logEvent(input: {
  studentId?: string | null;
  groupId?: string | null;
  ventureId?: string | null;
  eventType: string;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, string | number | boolean | null> | null;
}): Promise<void> {
  const sql = await getSql();
  await sql`
    insert into activity_events (
      id, student_id, group_id, venture_id, event_type, entity_type, entity_id, metadata
    ) values (
      ${newId()},
      ${input.studentId ?? null},
      ${input.groupId ?? null},
      ${input.ventureId ?? null},
      ${input.eventType},
      ${input.entityType ?? null},
      ${input.entityId ?? null},
      ${input.metadata ? JSON.stringify(input.metadata) : null}
    )
  `;
}

export async function refreshGroupStatus(groupId: string): Promise<GroupStatus> {
  const sql = await getSql();
  const groups = await sql<{
    status: string;
    course_offering_id: string;
  }>`select status, course_offering_id from groups where id = ${groupId} limit 1`;
  const g = groups[0];
  if (!g) throw new AppError("NOT_FOUND", "Group not found.");

  const offerings = await sql<{ selection_requires_all_active: boolean | string }>`
    select selection_requires_all_active from course_offerings where id = ${g.course_offering_id} limit 1
  `;
  const requiresAll =
    offerings[0]?.selection_requires_all_active === true ||
    offerings[0]?.selection_requires_all_active === "t";

  // System computation, not "this student's rows": counting every active
  // member's submission decides whether selection opens at all, so it must
  // see submitted peer opportunities even before opportunities_select's
  // privacy gate (peers visible only once selection_ready+) would allow it.
  // logEvent here has no student_id (an automatic transition, not one
  // student's action), which activity_insert's check also requires bypass for.
  const next = await withRlsBypass(async () => {
    const counts = await sql<{ members: number; submitted: number; ventures: number }>`
      select
        (select count(*)::int from group_members where group_id = ${groupId} and membership_status = 'active') as members,
        (select count(*)::int from opportunities o
           join group_members gm on gm.student_id = o.student_id and gm.group_id = o.group_id
          where o.group_id = ${groupId} and o.status in ('submitted','selected','rejected')
            and gm.membership_status = 'active') as submitted,
        (select count(*)::int from ventures where group_id = ${groupId}) as ventures
    `;
    const next = evaluateGroupStatus({
      activeMemberCount: Number(counts[0]?.members ?? 0),
      submittedCount: Number(counts[0]?.submitted ?? 0),
      requiresAllActive: requiresAll,
      hasVenture: Number(counts[0]?.ventures ?? 0) > 0,
      current: g.status as GroupStatus,
    });
    if (next !== g.status) {
      await sql`update groups set status = ${next}, updated_at = now() where id = ${groupId}`;
      await logEvent({
        groupId,
        eventType: next === "selection_ready" ? "SELECTION_STARTED" : "GROUP_STATUS",
        entityType: "group",
        entityId: groupId,
        metadata: { from: g.status, to: next },
      });
    }
    return next;
  });
  return next;
}
