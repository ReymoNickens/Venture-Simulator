// Phase 2, Slice 0 regression tests for migrations/0006_cohort_scoped_roles.sql:
// lecturers see only their own cohorts, read-only, and nobody can grant
// themselves a role.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { asUser, freshSeededDb } from "./test-db.ts";

/**
 * freshSeededDb() gives cohort off1 with groups A and B. Add a second cohort
 * (off2, group C) and two lecturers: one for off1, one for off2.
 */
async function twoCohortDb(): Promise<PGlite> {
  const pg = await freshSeededDb();
  await pg.query(
    `insert into course_offerings (id, course_id, semester, academic_year) values ('off2','c1','S2','2026')`,
  );
  await pg.query(
    `insert into students (id, auth_user_id, full_name, index_number, programme) values ('student-c','auth-c','Student C','IDX-c','Test')`,
  );
  await pg.query(
    `insert into course_enrolments (id, student_id, course_offering_id) values ('enrol-c','student-c','off2')`,
  );
  await pg.query(
    `insert into groups (id, course_offering_id, group_name, group_number, join_code, status, created_by_student_id, capacity)
     values ('group-c','off2','Group C',1,'CODEC','opportunity_collection','student-c',10)`,
  );
  await pg.query(
    `insert into group_members (id, group_id, student_id, membership_status) values ('member-c','group-c','student-c','active')`,
  );
  await pg.query(
    `insert into opportunities (id, student_id, group_id, problem, status) values ('opp-c','student-c','group-c','Problem C','submitted')`,
  );
  // A draft in cohort off1 — must stay private to its author.
  await pg.query(
    `insert into students (id, auth_user_id, full_name, index_number, programme) values ('student-d','auth-d','Student D','IDX-d','Test')`,
  );
  await pg.query(
    `insert into group_members (id, group_id, student_id, membership_status) values ('member-d','group-a','student-d','active')`,
  );
  await pg.query(
    `insert into opportunities (id, student_id, group_id, problem, status) values ('opp-d-draft','student-d','group-a','Draft D','draft')`,
  );
  await pg.query(
    `insert into user_roles (id, user_id, role_id, course_offering_id) values
       ('ur-l1','auth-lect-1','role_lecturer','off1'),
       ('ur-l2','auth-lect-2','role_lecturer','off2')`,
  );
  return pg;
}

async function withDb(fn: (pg: PGlite) => Promise<void>): Promise<void> {
  const pg = await twoCohortDb();
  try {
    await fn(pg);
  } finally {
    await pg.close();
  }
}

describe("lecturers see only their own cohorts", () => {
  it("a lecturer sees every group in their cohort and none outside it", () =>
    withDb(async (pg) => {
      const rows = await asUser(pg, "auth-lect-1", (tx) =>
        tx.query<{ id: string }>("select id from groups order by id"),
      );
      assert.deepEqual(
        rows.rows.map((r) => r.id),
        ["group-a", "group-b"],
      );
    }));

  it("a lecturer cannot read another cohort's opportunities, even by id", () =>
    withDb(async (pg) => {
      const rows = await asUser(pg, "auth-lect-1", (tx) =>
        tx.query<{ id: string }>("select id from opportunities where id = 'opp-c'"),
      );
      assert.equal(rows.rows.length, 0);
    }));

  it("a lecturer cannot read another cohort's students", () =>
    withDb(async (pg) => {
      const rows = await asUser(pg, "auth-lect-2", (tx) =>
        tx.query<{ id: string }>("select id from students order by id"),
      );
      assert.deepEqual(
        rows.rows.map((r) => r.id),
        ["student-c"],
      );
    }));

  it("a lecturer never sees a student's unsubmitted draft", () =>
    withDb(async (pg) => {
      const rows = await asUser(pg, "auth-lect-1", (tx) =>
        tx.query<{ id: string }>("select id from opportunities order by id"),
      );
      assert.deepEqual(
        rows.rows.map((r) => r.id),
        ["opp-a", "opp-b"],
      );
    }));

  it("lecturer access is read-only: an update in their own cohort changes nothing", () =>
    withDb(async (pg) => {
      await asUser(pg, "auth-lect-1", (tx) =>
        tx.query("update opportunities set status = 'rejected' where id = 'opp-a'"),
      );
      const check = await pg.query<{ status: string }>(
        "select status from opportunities where id = 'opp-a'",
      );
      assert.equal(check.rows[0]?.status, "submitted");
    }));

  it("students are unaffected: still see only their own group", () =>
    withDb(async (pg) => {
      const rows = await asUser(pg, "auth-a", (tx) =>
        tx.query<{ id: string }>("select id from groups order by id"),
      );
      assert.deepEqual(
        rows.rows.map((r) => r.id),
        ["group-a"],
      );
    }));
});

describe("nobody grants themselves a role", () => {
  it("a student cannot make themselves a lecturer", () =>
    withDb(async (pg) => {
      await assert.rejects(() =>
        asUser(pg, "auth-a", (tx) =>
          tx.query(
            `insert into user_roles (id, user_id, role_id, course_offering_id) values ('x','auth-a','role_lecturer','off1')`,
          ),
        ),
      );
    }));

  it("a student cannot make themselves an admin", () =>
    withDb(async (pg) => {
      await assert.rejects(() =>
        asUser(pg, "auth-a", (tx) =>
          tx.query(
            `insert into user_roles (id, user_id, role_id, course_offering_id) values ('x','auth-a','role_admin',null)`,
          ),
        ),
      );
    }));

  it("a student can still record their own student role (upsertProfile's insert)", () =>
    withDb(async (pg) => {
      await assert.doesNotReject(() =>
        asUser(pg, "auth-a", (tx) =>
          tx.query(
            `insert into user_roles (id, user_id, role_id, course_offering_id) values ('x','auth-a','role_student','off1')`,
          ),
        ),
      );
    }));

  it("a student cannot see other people's roles", () =>
    withDb(async (pg) => {
      const rows = await asUser(pg, "auth-a", (tx) =>
        tx.query<{ id: string }>("select id from user_roles"),
      );
      assert.equal(rows.rows.length, 0);
    }));

  it("a lecturer cannot widen their own role to another cohort", () =>
    withDb(async (pg) => {
      await assert.rejects(() =>
        asUser(pg, "auth-lect-1", (tx) =>
          tx.query(
            `insert into user_roles (id, user_id, role_id, course_offering_id) values ('x','auth-lect-1','role_lecturer','off2')`,
          ),
        ),
      );
      await asUser(pg, "auth-lect-1", (tx) =>
        tx.query(`update user_roles set course_offering_id = 'off2' where id = 'ur-l1'`),
      );
      const check = await pg.query<{ course_offering_id: string }>(
        "select course_offering_id from user_roles where id = 'ur-l1'",
      );
      assert.equal(check.rows[0]?.course_offering_id, "off1");
    }));
});
