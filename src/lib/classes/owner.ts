// The owner's list of classes. Students choose their class from this list
// when they give their details; group leaders and members do the rest.
// Same shape as service.ts: a minimal Db, callers authorise.
import { AppError } from "../server/errors.ts";
import type { Db } from "./service.ts";

export interface OwnerClassRow {
  offeringId: string;
  label: string;
  groups: number;
  students: number;
}

export async function ownerClasses(db: Db): Promise<OwnerClassRow[]> {
  const rows = await db.query<{
    id: string;
    course_code: string;
    programme: string | null;
    level: string | null;
    semester: string;
    academic_year: string;
    groups: number | string;
    students: number | string;
  }>(
    `select o.id, c.course_code, o.programme, o.level, o.semester, o.academic_year,
            (select count(*) from groups g where g.course_offering_id = o.id) as groups,
            (select count(*) from course_enrolments e join students s on s.id = e.student_id
              where e.course_offering_id = o.id and e.status = 'active' and not s.is_synthetic) as students
     from course_offerings o join courses c on c.id = o.course_id
     where o.id <> 'demo_tour'
     order by o.academic_year desc, c.course_code, o.programme nulls first, o.level`,
  );
  return rows.map((r) => ({
    offeringId: r.id,
    label: [r.course_code, r.programme ?? "All programmes", r.level, `${r.semester} ${r.academic_year}`].filter(Boolean).join(" · "),
    groups: Number(r.groups),
    students: Number(r.students),
  }));
}

export async function createClass(
  db: Db,
  input: { courseId: string; programme: string; level: string; semester: string; academicYear: string },
): Promise<{ offeringId: string }> {
  const programme = input.programme.trim().replace(/\s+/g, " ");
  const level = input.level.trim().replace(/\s+/g, " ");
  const semester = input.semester.trim();
  const academicYear = input.academicYear.trim();
  if (!programme) throw new AppError("INVALID", "Add the programme, e.g. BSc Business Administration.");
  if (!level) throw new AppError("INVALID", "Add the level, e.g. Level 300.");
  if (!semester || !academicYear) throw new AppError("INVALID", "Add the semester and academic year.");
  const course = await db.query(`select 1 from courses where id = $1`, [input.courseId]);
  if (!course.length) throw new AppError("INVALID", "Choose a course.");
  const dup = await db.query(
    `select 1 from course_offerings where course_id = $1 and lower(programme) = lower($2) and lower(coalesce(level, '')) = lower($3)
       and semester = $4 and academic_year = $5`,
    [input.courseId, programme, level, semester, academicYear],
  );
  if (dup.length) throw new AppError("INVALID", "That class is already on the list.");
  const offeringId = `class_${crypto.randomUUID()}`;
  await db.query(
    `insert into course_offerings (id, course_id, semester, academic_year, programme, level) values ($1, $2, $3, $4, $5, $6)`,
    [offeringId, input.courseId, semester, academicYear, programme, level],
  );
  return { offeringId };
}
