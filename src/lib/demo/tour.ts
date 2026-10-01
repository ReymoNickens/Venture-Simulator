// The look-around demo: one ready-made class with a course rep, a student,
// a lecturer and a group of synthetic classmates, so the owner can see each
// role's screens without setup codes, uploads or activation. Same shape as
// the class-list service: a minimal `Db`, relative imports; the caller
// checks the owner's code and runs with the RLS bypass on
// (src/lib/server/demo.ts). Safe to call every time: it only fills gaps.
import { type Db } from "../classes/service.ts";
import { syncLecturerRoles } from "../lecturers/accounts.ts";
import { DEMO_EMAIL_DOMAIN } from "./names.ts";
import { PEERS } from "./peers.ts";

export const DEMO_OFFERING_ID = "demo_tour";
const DEMO_GROUP_ID = "demo_tour_group_1";

export type DemoRole = "student" | "rep" | "lecturer";

export interface DemoIdentity {
  role: DemoRole;
  email: string;
  fullName: string;
  /** Students and reps sign up with an index number; lecturers do not. */
  indexNumber: string | null;
}

export const DEMO_IDENTITIES: Record<DemoRole, DemoIdentity> = {
  student: { role: "student", email: `student@${DEMO_EMAIL_DOMAIN}`, fullName: "Yaw Demo", indexNumber: "DEMO/STU/0001" },
  rep: { role: "rep", email: `rep@${DEMO_EMAIL_DOMAIN}`, fullName: "Akosua Demo", indexNumber: "DEMO/REP/0001" },
  lecturer: { role: "lecturer", email: `lecturer@${DEMO_EMAIL_DOMAIN}`, fullName: "Dr Demo Lecturer", indexNumber: null },
};

/** On the class list but not activated, so the rep's list shows who is still waiting. */
const WAITING = [
  { fullName: "Abena Owusu", email: `abena@${DEMO_EMAIL_DOMAIN}`, indexNumber: "DEMO/STU/0002" },
  { fullName: "Kojo Mensah", email: `kojo@${DEMO_EMAIL_DOMAIN}`, indexNumber: "DEMO/STU/0003" },
  { fullName: "Afia Boateng", email: `afia@${DEMO_EMAIL_DOMAIN}`, indexNumber: "DEMO/STU/0004" },
];

const PROGRAMME = "Demo class";
const newId = () => crypto.randomUUID();

async function addToList(db: Db, person: { fullName: string; email: string; indexNumber: string }): Promise<string> {
  const found = await db.query<{ id: string }>(`select id from students where lower(email) = $1`, [person.email]);
  if (found[0]) return found[0].id;
  const id = newId();
  await db.query(
    `insert into students (id, auth_user_id, email, index_number, full_name, programme, is_synthetic)
     values ($1, null, $2, $3, $4, $5, false)`,
    [id, person.email, person.indexNumber, person.fullName, PROGRAMME],
  );
  await db.query(
    `insert into course_enrolments (id, student_id, course_offering_id, status) values ($1, $2, $3, 'active')
     on conflict (student_id, course_offering_id) do nothing`,
    [newId(), id, DEMO_OFFERING_ID],
  );
  return id;
}

/** Create whatever part of the demo class is missing. */
export async function ensureDemoClass(db: Db): Promise<void> {
  const exists = await db.query(`select 1 from course_offerings where id = $1`, [DEMO_OFFERING_ID]);
  if (!exists.length) {
    // Copy the course and term of the main class, so the demo looks like the real one.
    const base = await db.query<{ course_id: string; semester: string; academic_year: string }>(
      `select o.course_id, o.semester, o.academic_year from course_offerings o join courses c on c.id = o.course_id
       order by (c.course_code = 'ENT 302') desc, o.created_at limit 1`,
    );
    if (!base[0]) throw new Error("No course to base the demo class on.");
    await db.query(
      `insert into course_offerings (id, course_id, semester, academic_year, programme, level)
       values ($1, $2, $3, $4, $5, 'Look around') on conflict (id) do nothing`,
      [DEMO_OFFERING_ID, base[0].course_id, base[0].semester, base[0].academic_year, PROGRAMME],
    );
  }

  const { student, rep, lecturer } = DEMO_IDENTITIES;
  const repId = await addToList(db, { ...rep, indexNumber: rep.indexNumber! });
  await db.query(`update course_offerings set rep_student_id = $2 where id = $1 and rep_student_id is null`, [
    DEMO_OFFERING_ID,
    repId,
  ]);
  await addToList(db, { ...student, indexNumber: student.indexNumber! });
  for (const person of WAITING) await addToList(db, person);

  const staff = await db.query<{ id: string }>(`select id from lecturers where lower(email) = $1`, [lecturer.email]);
  const staffId = staff[0]?.id ?? newId();
  if (!staff[0]) {
    await db.query(`insert into lecturers (id, auth_user_id, email, full_name) values ($1, null, $2, $3)`, [
      staffId,
      lecturer.email,
      lecturer.fullName,
    ]);
  }
  await db.query(
    `insert into lecturer_classes (staff_id, course_offering_id) values ($1, $2) on conflict do nothing`,
    [staffId, DEMO_OFFERING_ID],
  );
  await syncLecturerRoles(db, staffId);

  await ensureDemoGroup(db, repId);
}

/** One group of synthetic classmates who have each posted an opportunity, so the lecturer has something to look at. */
async function ensureDemoGroup(db: Db, createdBy: string): Promise<void> {
  const exists = await db.query(`select 1 from groups where id = $1`, [DEMO_GROUP_ID]);
  if (exists.length) return;
  const n = await db.query<{ n: number | string }>(
    `select coalesce(max(group_number), 0) + 1 as n from groups where course_offering_id = $1`,
    [DEMO_OFFERING_ID],
  );
  await db.query(
    `insert into groups (id, course_offering_id, group_name, group_number, join_code, status, created_by_student_id, capacity)
     values ($1, $2, 'Shuttle Seekers', $3, 'DEMO01', 'opportunity_collection', $4, 10)`,
    [DEMO_GROUP_ID, DEMO_OFFERING_ID, Number(n[0]?.n ?? 1), createdBy],
  );
  for (const [i, peer] of PEERS.slice(0, 4).entries()) {
    const sid = `demo_tour_peer_${i}`;
    await db.query(
      `insert into students (id, auth_user_id, full_name, index_number, programme, is_synthetic)
       values ($1, $2, $3, $4, $5, true)`,
      [sid, `seed:${DEMO_GROUP_ID}:${i}`, peer.name, `${peer.index}-TOUR`, peer.programme],
    );
    await db.query(
      `insert into course_enrolments (id, student_id, course_offering_id, status) values ($1, $2, $3, 'active')`,
      [newId(), sid, DEMO_OFFERING_ID],
    );
    await db.query(
      `insert into group_members (id, group_id, student_id, membership_status) values ($1, $2, $3, 'active')`,
      [newId(), DEMO_GROUP_ID, sid],
    );
    const o = peer.opportunity;
    const oid = newId();
    await db.query(
      `insert into opportunities (
         id, student_id, group_id, problem, affected_people, context, observed_evidence,
         current_alternatives, why_it_matters, possible_solution, potential_customer,
         revenue_mechanism, uncertainties, status, submitted_at
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'submitted', now())`,
      [
        oid,
        sid,
        DEMO_GROUP_ID,
        o.problem,
        o.affectedPeople,
        o.context,
        o.observedEvidence,
        o.currentAlternatives,
        o.whyItMatters,
        o.possibleSolution,
        o.potentialCustomer,
        o.revenueMechanism,
        o.uncertainties,
      ],
    );
    await db.query(
      `insert into opportunity_preferences (id, opportunity_id, student_id, preference_rank, rationale) values ($1, $2, $3, 1, $4)`,
      [newId(), oid, sid, peer.preferenceNote],
    );
  }
}
