// Lecturer accounts against real Postgres (PGlite) with the real migrations
// and RLS: invites, claiming, class scoping, and group feedback.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { asUser, freshSeededDb } from "../server/test-db.ts";
import type { Db } from "../classes/service.ts";
import {
  claimStaff,
  createLecturerInvite,
  listAllClasses,
  ownerLecturers,
  pendingStaffByEmail,
  previewLecturerCode,
  redeemLecturerCode,
  revokeLecturerInvite,
  setStaffClasses,
} from "./accounts.ts";

const dbOf = (tx: PGlite): Db => ({
  query: async <T,>(text: string, params: unknown[] = []) => (await tx.query<T>(text, params)).rows,
});

async function asSystem<T>(pg: PGlite, fn: (db: Db) => Promise<T>): Promise<T> {
  return pg.transaction(async (tx) => {
    await tx.exec("set local role app_runtime");
    await tx.query("select set_config('app.bypass_rls', 'on', true)");
    const result = await fn(dbOf(tx as unknown as PGlite));
    await tx.exec("reset role");
    return result;
  });
}

/** freshSeededDb (off1: groups A, B) plus a second class off2 with group C. */
async function twoClasses(): Promise<PGlite> {
  const pg = await freshSeededDb();
  await pg.query(`insert into course_offerings (id, course_id, semester, academic_year, programme, level)
                  values ('off2','c1','S1','2026','BSc Other','Level 300')`);
  await pg.query(`insert into students (id, auth_user_id, full_name, index_number, programme) values ('student-c','auth-c','Student C','IDX-c','T')`);
  await pg.query(`insert into course_enrolments (id, student_id, course_offering_id) values ('enrol-c','student-c','off2')`);
  await pg.query(`insert into groups (id, course_offering_id, group_name, group_number, join_code, status, created_by_student_id, capacity)
                  values ('group-c','off2','Group C',1,'CODEC','opportunity_collection','student-c',10)`);
  await pg.query(`insert into group_members (id, group_id, student_id, membership_status) values ('member-c','group-c','student-c','active')`);
  return pg;
}

async function withDb(fn: (pg: PGlite) => Promise<void>) {
  const pg = await twoClasses();
  try {
    await fn(pg);
  } finally {
    await pg.close();
  }
}

/** Invite for off1 only, redeemed, then "signed up" as auth-lect. */
async function lecturerForOff1(pg: PGlite) {
  const { code } = await asSystem(pg, (db) => createLecturerInvite(db, { label: "Dr Owusu", offeringIds: ["off1"] }));
  await asSystem(pg, (db) => redeemLecturerCode(db, { code, fullName: "Dr  Ama Owusu", email: "A.Owusu@ucc.edu.gh" }));
  const claimed = await asSystem(pg, (db) => claimStaff(db, "auth-lect", "a.owusu@ucc.edu.gh"));
  assert.equal(claimed, true);
  return code;
}

describe("lecturer invites", () => {
  it("lists every class for the owner to choose from", () =>
    withDb(async (pg) => {
      const classes = await asSystem(pg, (db) => listAllClasses(db));
      const labels = classes.map((c) => c.label);
      assert.ok(labels.includes("T101 · All programmes · S1 2026"));
      assert.ok(labels.includes("T101 · BSc Other · Level 300 · S1 2026"));
      assert.ok(labels.includes("ENT 302 · All programmes · Semester 1 2026/2027"), "the seeded course is listed too");
    }));

  it("redeeming creates a pending lecturer the sign-up hook recognises", () =>
    withDb(async (pg) => {
      const { code } = await asSystem(pg, (db) => createLecturerInvite(db, { label: "x", offeringIds: ["off1", "off2"] }));
      const preview = await asSystem(pg, (db) => previewLecturerCode(db, code));
      assert.equal(preview.classes.length, 2);
      await asSystem(pg, (db) => redeemLecturerCode(db, { code, fullName: "Dr Ama Owusu", email: "a.owusu@ucc.edu.gh" }));
      const pending = await asSystem(pg, (db) => pendingStaffByEmail(db, "A.OWUSU@ucc.edu.gh"));
      assert.equal(pending?.fullName, "Dr Ama Owusu");
      // Retrying before signing up resumes; a different email cannot reuse it.
      await asSystem(pg, (db) => redeemLecturerCode(db, { code, fullName: "Dr A. Owusu", email: "a.owusu@ucc.edu.gh" }));
      await assert.rejects(
        asSystem(pg, (db) => redeemLecturerCode(db, { code, fullName: "Someone", email: "other@ucc.edu.gh" })),
        /already been used/,
      );
    }));

  it("refuses cancelled codes and emails that already have an account", () =>
    withDb(async (pg) => {
      const a = await asSystem(pg, (db) => createLecturerInvite(db, { label: "x", offeringIds: ["off1"] }));
      await asSystem(pg, (db) => revokeLecturerInvite(db, a.id));
      await assert.rejects(asSystem(pg, (db) => previewLecturerCode(db, a.code)), /cancelled/);

      await pg.query(`update students set email = 'taken@ucc.edu.gh' where id = 'student-a'`);
      const b = await asSystem(pg, (db) => createLecturerInvite(db, { label: "y", offeringIds: ["off1"] }));
      await assert.rejects(
        asSystem(pg, (db) => redeemLecturerCode(db, { code: b.code, fullName: "X", email: "taken@ucc.edu.gh" })),
        /already has an account/,
      );
    }));
});

describe("lecturer scope", () => {
  it("sees groups in their own classes only, and cannot read the codes table", () =>
    withDb(async (pg) => {
      await lecturerForOff1(pg);
      const groups = await asUser(pg, "auth-lect", (tx) => tx.query<{ id: string }>(`select id from groups order by id`));
      assert.deepEqual(groups.rows.map((r) => r.id), ["group-a", "group-b"]);
      const invites = await asUser(pg, "auth-lect", (tx) => tx.query(`select * from lecturer_invites`));
      assert.equal(invites.rows.length, 0);
    }));

  it("the owner changing classes changes what the lecturer can see", () =>
    withDb(async (pg) => {
      await lecturerForOff1(pg);
      const { lecturers } = await asSystem(pg, (db) => ownerLecturers(db));
      await asSystem(pg, (db) => setStaffClasses(db, lecturers[0].staffId, ["off2"]));
      const groups = await asUser(pg, "auth-lect", (tx) => tx.query<{ id: string }>(`select id from groups order by id`));
      assert.deepEqual(groups.rows.map((r) => r.id), ["group-c"]);
      const after = await asSystem(pg, (db) => ownerLecturers(db));
      assert.deepEqual(after.lecturers[0].offeringIds, ["off2"]);
      assert.equal(after.lecturers[0].signedUp, true);
    }));
});

describe("group feedback", () => {
  it("a lecturer writes feedback their group's members can read; others cannot", () =>
    withDb(async (pg) => {
      await lecturerForOff1(pg);
      await asUser(pg, "auth-lect", (tx) =>
        tx.query(
          `insert into group_feedback (id, group_id, author_user_id, author_name, body) values ('f1','group-a','auth-lect','Dr Ama Owusu','Go and count something.')`,
        ),
      );
      const member = await asUser(pg, "auth-a", (tx) => tx.query(`select body from group_feedback`));
      assert.equal(member.rows.length, 1);
      const otherGroup = await asUser(pg, "auth-b", (tx) => tx.query(`select body from group_feedback`));
      assert.equal(otherGroup.rows.length, 0);
    }));

  it("refuses feedback to a group outside the lecturer's classes, or in someone else's name", () =>
    withDb(async (pg) => {
      await lecturerForOff1(pg);
      await assert.rejects(
        asUser(pg, "auth-lect", (tx) =>
          tx.query(
            `insert into group_feedback (id, group_id, author_user_id, author_name, body) values ('f2','group-c','auth-lect','X','No')`,
          ),
        ),
        /row-level security/,
      );
      await assert.rejects(
        asUser(pg, "auth-a", (tx) =>
          tx.query(
            `insert into group_feedback (id, group_id, author_user_id, author_name, body) values ('f3','group-a','auth-a','Student','Fake lecturer')`,
          ),
        ),
        /row-level security/,
      );
    }));
});
