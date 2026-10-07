// Lecturer accounts: one-time invite codes from the owner, a staff record
// per lecturer, and the classes they teach. Same shape as the class-list
// service: a minimal `Db`, relative imports, callers authorise and decide
// when the RLS bypass is on (src/lib/server/lecturers.ts, the sign-up hook).
import { AppError } from "../server/errors.ts";
import { generateCode, hashCode, normaliseCode, type Db } from "../classes/service.ts";

const newId = () => crypto.randomUUID();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const LECTURER_CODE_DAYS = 30;

export interface ClassOption {
  offeringId: string;
  /** e.g. "ENT 302 · BSc Business Administration · Level 300 · Semester 1 2026/2027" */
  label: string;
}

/** Every class an owner could assign a lecturer to. */
export async function listAllClasses(db: Db): Promise<ClassOption[]> {
  const rows = await db.query<{
    id: string;
    course_code: string;
    programme: string | null;
    level: string | null;
    semester: string;
    academic_year: string;
  }>(
    `select o.id, c.course_code, o.programme, o.level, o.semester, o.academic_year
     from course_offerings o join courses c on c.id = o.course_id
     order by o.academic_year desc, c.course_code, o.programme nulls first, o.level`,
  );
  return rows.map((r) => ({
    offeringId: r.id,
    label: [r.course_code, r.programme ?? "All programmes", r.level, `${r.semester} ${r.academic_year}`]
      .filter(Boolean)
      .join(" · "),
  }));
}

async function checkOfferings(db: Db, offeringIds: string[]): Promise<string[]> {
  const unique = [...new Set(offeringIds)];
  if (!unique.length) throw new AppError("INVALID", "Choose at least one class.");
  const rows = await db.query<{ id: string }>(`select id from course_offerings where id = any($1)`, [unique]);
  if (rows.length !== unique.length) throw new AppError("INVALID", "One of those classes no longer exists.");
  return unique;
}

export async function createLecturerInvite(
  db: Db,
  input: { label: string; offeringIds: string[]; now?: Date },
): Promise<{ id: string; code: string; expiresAt: string }> {
  const label = input.label.trim();
  if (!label) throw new AppError("INVALID", "Add a note, e.g. the lecturer's name.");
  const offeringIds = await checkOfferings(db, input.offeringIds);
  const code = generateCode("LEC");
  const id = newId();
  const expires = new Date((input.now ?? new Date()).getTime() + LECTURER_CODE_DAYS * 86_400_000);
  await db.query(
    `insert into lecturer_invites (id, code_hash, label, offering_ids, expires_at) values ($1, $2, $3, $4, $5)`,
    [id, await hashCode(code), label, offeringIds, expires.toISOString()],
  );
  return { id, code, expiresAt: expires.toISOString() };
}

export async function revokeLecturerInvite(db: Db, id: string): Promise<void> {
  const rows = await db.query(
    `update lecturer_invites set revoked_at = now() where id = $1 and used_at is null and revoked_at is null returning id`,
    [id],
  );
  if (!rows.length) throw new AppError("INVALID", "Only an unused code can be cancelled.");
}

type InviteRow = {
  id: string;
  label: string;
  offering_ids: string[];
  expires_at: unknown;
  revoked_at: unknown;
  used_at: unknown;
  staff_id: string | null;
};

async function findInvite(db: Db, code: string, lock = false): Promise<InviteRow> {
  if (normaliseCode(code).length < 8) throw new AppError("INVALID", "That code looks too short. It is like LEC-K7M2-QX4P.");
  const rows = await db.query<InviteRow>(
    `select id, label, offering_ids, expires_at, revoked_at, used_at, staff_id
     from lecturer_invites where code_hash = $1 ${lock ? "for update" : ""}`,
    [await hashCode(code)],
  );
  const row = rows[0];
  if (!row) throw new AppError("INVALID", "That code is not recognised. Check it against the message you were sent.");
  if (row.revoked_at) throw new AppError("INVALID", "That code was cancelled. Ask for a new one.");
  return row;
}

async function unclaimedStaff(db: Db, staffId: string | null): Promise<{ id: string; email: string } | null> {
  if (!staffId) return null;
  const rows = await db.query<{ id: string; email: string; auth_user_id: string | null }>(
    `select id, email, auth_user_id from lecturers where id = $1`,
    [staffId],
  );
  return rows[0] && !rows[0].auth_user_id ? { id: rows[0].id, email: rows[0].email } : null;
}

export async function previewLecturerCode(db: Db, code: string, now = new Date()): Promise<{ classes: string[] }> {
  const row = await findInvite(db, code);
  if (row.used_at && !(await unclaimedStaff(db, row.staff_id))) {
    throw new AppError("INVALID", "That code has already been used.");
  }
  if (!row.used_at && new Date(String(row.expires_at)) < now) throw new AppError("INVALID", "That code has expired. Ask for a new one.");
  const all = await listAllClasses(db);
  return { classes: all.filter((c) => row.offering_ids.includes(c.offeringId)).map((c) => c.label) };
}

/**
 * Create the lecturer's staff record (unclaimed) and their classes. The
 * client then signs up with the same email, and the sign-up hook claims it.
 * A retry before signing up resumes instead of failing.
 */
export async function redeemLecturerCode(
  db: Db,
  input: { code: string; fullName: string; email: string },
  now = new Date(),
): Promise<{ email: string }> {
  const row = await findInvite(db, input.code, true);
  const fullName = input.fullName.trim().replace(/\s+/g, " ");
  const email = input.email.trim().toLowerCase();
  if (!fullName) throw new AppError("INVALID", "Add your name as students should see it, e.g. Dr Ama Owusu.");
  if (!EMAIL.test(email)) throw new AppError("INVALID", "That email does not look right.");

  if (row.used_at) {
    const pending = await unclaimedStaff(db, row.staff_id);
    if (!pending || pending.email !== email) throw new AppError("INVALID", "That code has already been used.");
    await db.query(`update lecturers set full_name = $2, updated_at = now() where id = $1`, [pending.id, fullName]);
    return { email };
  }
  if (new Date(String(row.expires_at)) < now) throw new AppError("INVALID", "That code has expired. Ask for a new one.");

  const taken = await db.query(
    `select 1 from lecturers where lower(email) = $1
     union all select 1 from students where lower(email) = $1
     union all select 1 from "user" where lower(email) = $1`,
    [email],
  );
  if (taken.length) {
    throw new AppError("INVALID", "That email already has an account. Use a different email for your lecturer account.");
  }
  const staffId = newId();
  await db.query(`insert into lecturers (id, auth_user_id, email, full_name) values ($1, null, $2, $3)`, [staffId, email, fullName]);
  for (const offeringId of row.offering_ids) {
    await db.query(
      `insert into lecturer_classes (staff_id, course_offering_id) values ($1, $2) on conflict do nothing`,
      [staffId, offeringId],
    );
  }
  await db.query(`update lecturer_invites set used_at = now(), staff_id = $2 where id = $1`, [row.id, staffId]);
  return { email };
}

/**
 * The owner adds a lecturer directly: a staff record and their classes,
 * ready for the server to create the email-and-password account (the
 * sign-up hook then claims this record). Returns the staff id.
 */
export async function createLecturerRecord(
  db: Db,
  input: { fullName: string; email: string; offeringIds: string[] },
): Promise<{ staffId: string; email: string; fullName: string }> {
  const fullName = input.fullName.trim().replace(/\s+/g, " ");
  const email = input.email.trim().toLowerCase();
  if (!fullName) throw new AppError("INVALID", "Add the lecturer's name as students should see it, e.g. Dr Ama Owusu.");
  if (!EMAIL.test(email)) throw new AppError("INVALID", "That email does not look right.");
  const offeringIds = await checkOfferings(db, input.offeringIds);
  const taken = await db.query(
    `select 1 from lecturers where lower(email) = $1
     union all select 1 from students where lower(email) = $1
     union all select 1 from "user" where lower(email) = $1`,
    [email],
  );
  if (taken.length) throw new AppError("INVALID", "That email already has an account.");
  const staffId = newId();
  await db.query(`insert into lecturers (id, auth_user_id, email, full_name) values ($1, null, $2, $3)`, [staffId, email, fullName]);
  for (const offeringId of offeringIds) {
    await db.query(`insert into lecturer_classes (staff_id, course_offering_id) values ($1, $2) on conflict do nothing`, [
      staffId,
      offeringId,
    ]);
  }
  return { staffId, email, fullName };
}

/** The sign-in account behind a lecturer, once it exists. */
export async function lecturerAccount(db: Db, staffId: string): Promise<{ authUserId: string | null; email: string; fullName: string }> {
  const rows = await db.query<{ auth_user_id: string | null; email: string; full_name: string }>(
    `select auth_user_id, email, full_name from lecturers where id = $1`,
    [staffId],
  );
  if (!rows[0]) throw new AppError("NOT_FOUND", "Lecturer not found.");
  return { authUserId: rows[0].auth_user_id, email: rows[0].email, fullName: rows[0].full_name };
}

/** Sign-up hook, before: is this email an invited lecturer who has not signed up yet? */
export async function pendingStaffByEmail(db: Db, email: string): Promise<{ id: string; fullName: string } | null> {
  const rows = await db.query<{ id: string; full_name: string }>(
    `select id, full_name from lecturers where lower(email) = $1 and auth_user_id is null limit 1`,
    [email.trim().toLowerCase()],
  );
  return rows[0] ? { id: rows[0].id, fullName: rows[0].full_name } : null;
}

/** Sign-up hook, after: bind the account to the staff record and grant its classes. */
export async function claimStaff(db: Db, authUserId: string, email: string): Promise<boolean> {
  const rows = await db.query<{ id: string }>(
    `update lecturers set auth_user_id = $1, updated_at = now()
     where lower(email) = $2 and auth_user_id is null returning id`,
    [authUserId, email.trim().toLowerCase()],
  );
  if (!rows[0]) return false;
  await syncLecturerRoles(db, rows[0].id);
  return true;
}

/** Make user_roles (what RLS checks) match lecturer_classes (what the owner set). */
export async function syncLecturerRoles(db: Db, staffId: string): Promise<void> {
  const staff = await db.query<{ auth_user_id: string | null }>(`select auth_user_id from lecturers where id = $1`, [staffId]);
  const userId = staff[0]?.auth_user_id;
  if (!userId) return;
  await db.query(
    `delete from user_roles where user_id = $1 and role_id = 'role_lecturer'
       and course_offering_id not in (select course_offering_id from lecturer_classes where staff_id = $2)`,
    [userId, staffId],
  );
  await db.query(
    `insert into user_roles (id, user_id, role_id, course_offering_id)
     select gen_random_uuid()::text, $1, 'role_lecturer', sc.course_offering_id
     from lecturer_classes sc where sc.staff_id = $2
     on conflict (user_id, role_id, course_offering_id) do nothing`,
    [userId, staffId],
  );
}

export async function setStaffClasses(db: Db, staffId: string, offeringIds: string[]): Promise<void> {
  const ids = await checkOfferings(db, offeringIds);
  const exists = await db.query(`select 1 from lecturers where id = $1`, [staffId]);
  if (!exists.length) throw new AppError("NOT_FOUND", "Lecturer not found.");
  await db.query(`delete from lecturer_classes where staff_id = $1 and course_offering_id <> all($2)`, [staffId, ids]);
  for (const id of ids) {
    await db.query(`insert into lecturer_classes (staff_id, course_offering_id) values ($1, $2) on conflict do nothing`, [
      staffId,
      id,
    ]);
  }
  await syncLecturerRoles(db, staffId);
}

export interface OwnerLecturer {
  staffId: string;
  fullName: string;
  email: string;
  signedUp: boolean;
  offeringIds: string[];
}

export interface OwnerLecturerInvite {
  id: string;
  label: string;
  classCount: number;
  status: "waiting" | "used" | "expired" | "cancelled";
  expiresAt: string;
}

export async function ownerLecturers(
  db: Db,
  now = new Date(),
): Promise<{ lecturers: OwnerLecturer[]; invites: OwnerLecturerInvite[] }> {
  const staff = await db.query<{ id: string; full_name: string; email: string; auth_user_id: string | null; offering_ids: string[] | null }>(
    `select s.id, s.full_name, s.email, s.auth_user_id,
            array(select sc.course_offering_id from lecturer_classes sc where sc.staff_id = s.id order by sc.created_at) as offering_ids
     from lecturers s order by s.created_at desc`,
  );
  const invites = await db.query<{
    id: string;
    label: string;
    offering_ids: string[];
    expires_at: unknown;
    revoked_at: unknown;
    used_at: unknown;
  }>(`select id, label, offering_ids, expires_at, revoked_at, used_at from lecturer_invites order by created_at desc limit 100`);
  return {
    lecturers: staff.map((s) => ({
      staffId: s.id,
      fullName: s.full_name,
      email: s.email,
      signedUp: Boolean(s.auth_user_id),
      offeringIds: s.offering_ids ?? [],
    })),
    invites: invites.map((i) => ({
      id: i.id,
      label: i.label,
      classCount: i.offering_ids.length,
      status: i.revoked_at
        ? "cancelled"
        : i.used_at
          ? "used"
          : new Date(String(i.expires_at)) < now
            ? "expired"
            : "waiting",
      expiresAt: String(i.expires_at),
    })),
  };
}
