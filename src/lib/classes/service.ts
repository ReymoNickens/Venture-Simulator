// Class lists: the owner issues one-time rep setup codes, a course rep
// redeems one to create their class, and the rep keeps that class's list of
// students up to date from the Excel template. Students on the list activate
// their own accounts through the existing roster hook (src/lib/auth/server.ts).
//
// Like the simulation service, this takes a minimal `Db` and uses only
// relative imports, so it runs unchanged inside a request's transaction and
// under plain `node --test` with PGlite. Callers are responsible for
// authorisation (owner code checked, rep identity checked) and for running
// the writes with the RLS bypass on; see src/lib/server/classes.ts.
import { AppError } from "../server/errors.ts";

export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
}

const newId = () => crypto.randomUUID();

/** Rows accepted in one upload. A large lecture class is ~400. */
export const MAX_ROWS = 800;
export const CODE_DAYS = 30;

// ------------------------------------------------------------------ codes

// No 0/O, 1/I/L: codes get read out over the phone and typed from WhatsApp.
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function generateRepCode(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const chars = Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
  return `REP-${chars.slice(0, 4)}-${chars.slice(4)}`;
}

/** Case, spaces and dashes don't matter when a rep types the code. */
export function normaliseCode(code: string): string {
  return code.toUpperCase().replace(/[^0-9A-Z]/g, "");
}

export async function hashCode(code: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normaliseCode(code)));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export interface CourseRow {
  id: string;
  courseCode: string;
  courseName: string;
}

export async function listCourses(db: Db): Promise<CourseRow[]> {
  const rows = await db.query<{ id: string; course_code: string; course_name: string }>(
    `select id, course_code, course_name from courses order by course_code`,
  );
  return rows.map((r) => ({ id: r.id, courseCode: r.course_code, courseName: r.course_name }));
}

export async function createRepCode(
  db: Db,
  input: { courseId: string; label: string; semester: string; academicYear: string; now?: Date },
): Promise<{ id: string; code: string; expiresAt: string }> {
  const course = await db.query(`select id from courses where id = $1`, [input.courseId]);
  if (!course.length) throw new AppError("INVALID", "That course does not exist.");
  const label = input.label.trim();
  if (!label) throw new AppError("INVALID", "Add a note so you can tell this code apart, e.g. the programme and level.");
  const code = generateRepCode();
  const id = newId();
  const expires = new Date((input.now ?? new Date()).getTime() + CODE_DAYS * 86_400_000);
  await db.query(
    `insert into rep_setup_codes (id, code_hash, course_id, label, semester, academic_year, expires_at)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [id, await hashCode(code), input.courseId, label, input.semester.trim(), input.academicYear.trim(), expires.toISOString()],
  );
  return { id, code, expiresAt: expires.toISOString() };
}

export async function revokeRepCode(db: Db, id: string): Promise<void> {
  const rows = await db.query(
    `update rep_setup_codes set revoked_at = now() where id = $1 and used_at is null and revoked_at is null returning id`,
    [id],
  );
  if (!rows.length) throw new AppError("INVALID", "Only an unused code can be cancelled.");
}

type CodeRow = {
  id: string;
  course_id: string;
  course_code: string;
  course_name: string;
  label: string;
  semester: string;
  academic_year: string;
  expires_at: unknown;
  revoked_at: unknown;
  used_at: unknown;
  course_offering_id: string | null;
};

async function findCode(db: Db, code: string, lock = false): Promise<CodeRow> {
  if (normaliseCode(code).length < 8) throw new AppError("INVALID", "That code looks too short. It is like REP-K7M2-QX4P.");
  const rows = await db.query<CodeRow>(
    `select r.id, r.course_id, c.course_code, c.course_name, r.label, r.semester, r.academic_year,
            r.expires_at, r.revoked_at, r.used_at, r.course_offering_id
     from rep_setup_codes r join courses c on c.id = r.course_id
     where r.code_hash = $1 ${lock ? "for update of r" : ""}`,
    [await hashCode(code)],
  );
  const row = rows[0];
  if (!row) throw new AppError("INVALID", "That code is not recognised. Check it against the message you were sent.");
  if (row.revoked_at) throw new AppError("INVALID", "That code was cancelled. Ask for a new one.");
  return row;
}

export interface CodePreview {
  courseCode: string;
  courseName: string;
  semester: string;
  academicYear: string;
  /** True when this code already created a class whose rep has not activated yet. */
  resumable: boolean;
}

export async function previewRepCode(db: Db, code: string, now = new Date()): Promise<CodePreview> {
  const row = await findCode(db, code);
  const resumable = Boolean(row.used_at) && (await resumableRep(db, row)) !== null;
  if (row.used_at && !resumable) throw new AppError("INVALID", "That code has already been used to set up a class.");
  if (!row.used_at && new Date(String(row.expires_at)) < now) {
    throw new AppError("INVALID", "That code has expired. Ask for a new one.");
  }
  return {
    courseCode: row.course_code,
    courseName: row.course_name,
    semester: row.semester,
    academicYear: row.academic_year,
    resumable,
  };
}

async function resumableRep(db: Db, row: CodeRow): Promise<{ studentId: string; email: string } | null> {
  if (!row.course_offering_id) return null;
  const reps = await db.query<{ id: string; email: string | null; auth_user_id: string | null }>(
    `select s.id, s.email, s.auth_user_id from course_offerings o join students s on s.id = o.rep_student_id
     where o.id = $1`,
    [row.course_offering_id],
  );
  const rep = reps[0];
  return rep && !rep.auth_user_id && rep.email ? { studentId: rep.id, email: rep.email } : null;
}

// ------------------------------------------------------------ people rows

export interface PersonInput {
  fullName: string;
  email: string;
  indexNumber: string;
  programme?: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalisePerson(p: PersonInput): { fullName: string; email: string; indexNumber: string; programme: string } {
  return {
    fullName: p.fullName.trim().replace(/\s+/g, " "),
    email: p.email.trim().toLowerCase(),
    // Matches the sign-in hook, which upper-cases the index number.
    indexNumber: p.indexNumber.trim().toUpperCase().replace(/\s+/g, ""),
    programme: (p.programme ?? "").trim(),
  };
}

/** Why a row cannot be used, in words a course rep can act on; null when fine. */
export function personProblem(p: { fullName: string; email: string; indexNumber: string }): string | null {
  if (!p.fullName) return "Full name is missing";
  if (!p.indexNumber) return "Index number is missing";
  if (!p.email) return "Email is missing";
  if (!EMAIL.test(p.email)) return "Email does not look right";
  if (p.fullName.length > 120 || p.email.length > 200 || p.indexNumber.length > 40) return "A value is too long";
  return null;
}

// ----------------------------------------------------------------- redeem

export interface RedeemInput extends PersonInput {
  code: string;
  programme: string;
  level: string;
}

/**
 * Create the class and put the rep on its list as an unclaimed student, so
 * the rep can then activate their account like any other student. Retrying
 * with the same code and email before activating resumes instead of failing.
 */
export async function redeemRepCode(
  db: Db,
  input: RedeemInput,
  now = new Date(),
): Promise<{ offeringId: string; email: string; indexNumber: string; resumed: boolean }> {
  const row = await findCode(db, input.code, true);
  const person = normalisePerson(input);
  const problem = personProblem(person);
  if (problem) throw new AppError("INVALID", `${problem}.`);
  const programme = input.programme.trim();
  const level = input.level.trim();
  if (!programme) throw new AppError("INVALID", "Add the programme, e.g. BSc Business Administration.");
  if (!level) throw new AppError("INVALID", "Add the level, e.g. Level 300.");

  if (row.used_at) {
    const rep = await resumableRep(db, row);
    if (!rep || rep.email !== person.email) {
      throw new AppError("INVALID", "That code has already been used to set up a class.");
    }
    await db.query(
      `update students set full_name = $2, index_number = $3, programme = $4, updated_at = now() where id = $1`,
      [rep.studentId, person.fullName, person.indexNumber, programme],
    );
    await db.query(`update course_offerings set programme = $2, level = $3, updated_at = now() where id = $1`, [
      row.course_offering_id,
      programme,
      level,
    ]);
    return { offeringId: row.course_offering_id!, email: person.email, indexNumber: person.indexNumber, resumed: true };
  }
  if (new Date(String(row.expires_at)) < now) throw new AppError("INVALID", "That code has expired. Ask for a new one.");

  const existing = await db.query<{ id: string; auth_user_id: string | null }>(
    `select id, auth_user_id from students where lower(email) = $1 or index_number = $2`,
    [person.email, person.indexNumber],
  );
  if (existing.some((s) => s.auth_user_id)) {
    throw new AppError(
      "INVALID",
      "That email or index number already has an account. A rep needs their own new account for the class they run.",
    );
  }
  if (existing.length) {
    throw new AppError("INVALID", "That email or index number is already on another class list.");
  }

  const offeringId = `class_${newId()}`;
  const studentId = newId();
  await db.query(
    `insert into course_offerings (id, course_id, semester, academic_year, programme, level)
     values ($1, $2, $3, $4, $5, $6)`,
    [offeringId, row.course_id, row.semester, row.academic_year, programme, level],
  );
  await db.query(
    `insert into students (id, auth_user_id, email, index_number, full_name, programme, is_synthetic)
     values ($1, null, $2, $3, $4, $5, false)`,
    [studentId, person.email, person.indexNumber, person.fullName, programme],
  );
  await db.query(
    `insert into course_enrolments (id, student_id, course_offering_id, status) values ($1, $2, $3, 'active')`,
    [newId(), studentId, offeringId],
  );
  await db.query(`update course_offerings set rep_student_id = $2 where id = $1`, [offeringId, studentId]);
  await db.query(`update rep_setup_codes set used_at = now(), course_offering_id = $2 where id = $1`, [
    row.id,
    offeringId,
  ]);
  return { offeringId, email: person.email, indexNumber: person.indexNumber, resumed: false };
}

// ------------------------------------------------------------- class list

export interface ClassInfo {
  offeringId: string;
  courseCode: string;
  courseName: string;
  programme: string | null;
  level: string | null;
  semester: string;
  academicYear: string;
}

export interface ClassMember {
  studentId: string;
  fullName: string;
  email: string | null;
  indexNumber: string;
  programme: string;
  activated: boolean;
  isRep: boolean;
}

/** The class this student is rep for, or null. */
export async function classForRep(db: Db, studentId: string): Promise<ClassInfo | null> {
  const rows = await db.query<{
    id: string;
    course_code: string;
    course_name: string;
    programme: string | null;
    level: string | null;
    semester: string;
    academic_year: string;
  }>(
    `select o.id, c.course_code, c.course_name, o.programme, o.level, o.semester, o.academic_year
     from course_offerings o join courses c on c.id = o.course_id
     where o.rep_student_id = $1 order by o.created_at desc limit 1`,
    [studentId],
  );
  const r = rows[0];
  return r
    ? {
        offeringId: r.id,
        courseCode: r.course_code,
        courseName: r.course_name,
        programme: r.programme,
        level: r.level,
        semester: r.semester,
        academicYear: r.academic_year,
      }
    : null;
}

export async function listClassMembers(db: Db, offeringId: string): Promise<ClassMember[]> {
  const rows = await db.query<{
    id: string;
    full_name: string;
    email: string | null;
    index_number: string;
    programme: string;
    auth_user_id: string | null;
    is_rep: boolean | string;
  }>(
    `select s.id, s.full_name, s.email, s.index_number, s.programme, s.auth_user_id,
            (o.rep_student_id = s.id) as is_rep
     from course_enrolments e
     join students s on s.id = e.student_id
     join course_offerings o on o.id = e.course_offering_id
     where e.course_offering_id = $1 and e.status = 'active' and not s.is_synthetic
     order by lower(s.full_name)`,
    [offeringId],
  );
  return rows.map((r) => ({
    studentId: r.id,
    fullName: r.full_name,
    email: r.email,
    indexNumber: r.index_number,
    programme: r.programme,
    activated: Boolean(r.auth_user_id),
    isRep: r.is_rep === true || r.is_rep === "t",
  }));
}

export type ImportOutcome =
  | { row: number; status: "added" | "updated" }
  | { row: number; status: "skipped"; reason: string };

/**
 * Add or correct people on a class list. Never touches anyone who has
 * already activated, and never moves someone off another class's list.
 * `row` is the spreadsheet row number the rep sees (header is row 1).
 */
export async function importClassList(
  db: Db,
  offeringId: string,
  people: (PersonInput & { row: number })[],
): Promise<ImportOutcome[]> {
  if (people.length > MAX_ROWS) {
    throw new AppError("INVALID", `That is more than ${MAX_ROWS} rows. Split the list into two uploads.`);
  }
  const offering = await db.query<{ programme: string | null; rep_student_id: string | null }>(
    `select programme, rep_student_id from course_offerings where id = $1`,
    [offeringId],
  );
  if (!offering.length) throw new AppError("NOT_FOUND", "Class not found.");
  const defaultProgramme = offering[0].programme ?? "";
  const repId = offering[0].rep_student_id;

  const seenEmail = new Set<string>();
  const seenIndex = new Set<string>();
  const out: ImportOutcome[] = [];

  for (const raw of people) {
    const p = normalisePerson(raw);
    const problem = personProblem(p);
    if (problem) {
      out.push({ row: raw.row, status: "skipped", reason: problem });
      continue;
    }
    if (seenEmail.has(p.email) || seenIndex.has(p.indexNumber)) {
      out.push({ row: raw.row, status: "skipped", reason: "Same email or index number appears earlier in the sheet" });
      continue;
    }
    seenEmail.add(p.email);
    seenIndex.add(p.indexNumber);
    const programme = p.programme || defaultProgramme;

    const matches = await db.query<{ id: string; auth_user_id: string | null; offering_id: string | null }>(
      `select s.id, s.auth_user_id,
              (select e.course_offering_id from course_enrolments e where e.student_id = s.id and e.status = 'active'
               order by (e.course_offering_id = $3) desc limit 1) as offering_id
       from students s where lower(s.email) = $1 or s.index_number = $2`,
      [p.email, p.indexNumber, offeringId],
    );
    if (matches.length > 1) {
      out.push({ row: raw.row, status: "skipped", reason: "Email and index number belong to two different people" });
      continue;
    }
    const m = matches[0];
    if (!m) {
      const studentId = newId();
      await db.query(
        `insert into students (id, auth_user_id, email, index_number, full_name, programme, is_synthetic)
         values ($1, null, $2, $3, $4, $5, false)`,
        [studentId, p.email, p.indexNumber, p.fullName, programme],
      );
      await db.query(
        `insert into course_enrolments (id, student_id, course_offering_id, status) values ($1, $2, $3, 'active')`,
        [newId(), studentId, offeringId],
      );
      out.push({ row: raw.row, status: "added" });
      continue;
    }
    if (m.id === repId) {
      out.push({ row: raw.row, status: "skipped", reason: "That’s you, the rep. You’re already on the list" });
      continue;
    }
    if (m.auth_user_id) {
      out.push({
        row: raw.row,
        status: "skipped",
        reason: m.offering_id === offeringId ? "Already activated, nothing to change" : "Already has an account in another class",
      });
      continue;
    }
    if (m.offering_id && m.offering_id !== offeringId) {
      out.push({ row: raw.row, status: "skipped", reason: "Already on another class list" });
      continue;
    }
    await db.query(
      `update students set email = $2, index_number = $3, full_name = $4, programme = $5, updated_at = now() where id = $1`,
      [m.id, p.email, p.indexNumber, p.fullName, programme],
    );
    if (!m.offering_id) {
      await db.query(
        `insert into course_enrolments (id, student_id, course_offering_id, status) values ($1, $2, $3, 'active')
         on conflict (student_id, course_offering_id) do nothing`,
        [newId(), m.id, offeringId],
      );
    }
    out.push({ row: raw.row, status: "updated" });
  }
  return out;
}

/** Take a mistaken entry off the list. Only possible before they activate. */
export async function removeFromClassList(db: Db, offeringId: string, studentId: string): Promise<void> {
  const rows = await db.query<{ auth_user_id: string | null; rep_student_id: string | null }>(
    `select s.auth_user_id, o.rep_student_id
     from course_enrolments e join students s on s.id = e.student_id join course_offerings o on o.id = e.course_offering_id
     where e.course_offering_id = $1 and e.student_id = $2`,
    [offeringId, studentId],
  );
  const r = rows[0];
  if (!r) throw new AppError("NOT_FOUND", "That person is not on this class list.");
  if (r.rep_student_id === studentId) throw new AppError("INVALID", "You can't remove yourself as the rep.");
  if (r.auth_user_id) throw new AppError("INVALID", "They have already activated their account, so they stay on the list.");
  await db.query(`delete from course_enrolments where course_offering_id = $1 and student_id = $2`, [offeringId, studentId]);
  // An unclaimed roster row has no other data hanging off it.
  await db.query(
    `delete from students s where s.id = $1 and s.auth_user_id is null
       and not exists (select 1 from course_enrolments e where e.student_id = s.id)`,
    [studentId],
  );
}

// ------------------------------------------------------------------ owner

export interface OwnerCode {
  id: string;
  label: string;
  courseCode: string;
  semester: string;
  academicYear: string;
  status: "waiting" | "used" | "expired" | "cancelled";
  createdAt: string;
  expiresAt: string;
}

export interface OwnerClass extends ClassInfo {
  repName: string | null;
  repEmail: string | null;
  repActivated: boolean;
  onList: number;
  activated: number;
}

export async function ownerOverview(db: Db, now = new Date()): Promise<{ codes: OwnerCode[]; classes: OwnerClass[] }> {
  const codes = await db.query<{
    id: string;
    label: string;
    course_code: string;
    semester: string;
    academic_year: string;
    created_at: unknown;
    expires_at: unknown;
    revoked_at: unknown;
    used_at: unknown;
  }>(
    `select r.id, r.label, c.course_code, r.semester, r.academic_year, r.created_at, r.expires_at, r.revoked_at, r.used_at
     from rep_setup_codes r join courses c on c.id = r.course_id order by r.created_at desc limit 200`,
  );
  const classes = await db.query<{
    id: string;
    course_code: string;
    course_name: string;
    programme: string | null;
    level: string | null;
    semester: string;
    academic_year: string;
    rep_name: string | null;
    rep_email: string | null;
    rep_auth: string | null;
    on_list: number | string;
    activated: number | string;
  }>(
    `select o.id, c.course_code, c.course_name, o.programme, o.level, o.semester, o.academic_year,
            rep.full_name as rep_name, rep.email as rep_email, rep.auth_user_id as rep_auth,
            (select count(*) from course_enrolments e join students s on s.id = e.student_id
              where e.course_offering_id = o.id and not s.is_synthetic) as on_list,
            (select count(*) from course_enrolments e join students s on s.id = e.student_id
              where e.course_offering_id = o.id and not s.is_synthetic and s.auth_user_id is not null) as activated
     from course_offerings o join courses c on c.id = o.course_id
     left join students rep on rep.id = o.rep_student_id
     where o.rep_student_id is not null
     order by o.created_at desc`,
  );
  return {
    codes: codes.map((r) => ({
      id: r.id,
      label: r.label,
      courseCode: r.course_code,
      semester: r.semester,
      academicYear: r.academic_year,
      status: r.revoked_at
        ? "cancelled"
        : r.used_at
          ? "used"
          : new Date(String(r.expires_at)) < now
            ? "expired"
            : "waiting",
      createdAt: String(r.created_at),
      expiresAt: String(r.expires_at),
    })),
    classes: classes.map((r) => ({
      offeringId: r.id,
      courseCode: r.course_code,
      courseName: r.course_name,
      programme: r.programme,
      level: r.level,
      semester: r.semester,
      academicYear: r.academic_year,
      repName: r.rep_name,
      repEmail: r.rep_email,
      repActivated: Boolean(r.rep_auth),
      onList: Number(r.on_list),
      activated: Number(r.activated),
    })),
  };
}
