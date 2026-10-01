// The lecturer's reads, run as the lecturer under real RLS.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { asUser, freshSeededDb } from "../server/test-db.ts";
import type { Db } from "../classes/service.ts";
import { claimStaff, createLecturerInvite, redeemLecturerCode } from "./accounts.ts";
import { activityFeed, addFeedback, groupDetail, groupSignals, marksRows, myClasses } from "./data.ts";

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
const asLecturer = <T,>(pg: PGlite, fn: (db: Db) => Promise<T>) => asUser(pg, "auth-lect", (tx) => fn(dbOf(tx)));

async function setUp(): Promise<PGlite> {
  const pg = await freshSeededDb();
  // A second class the lecturer does NOT teach.
  await pg.query(`insert into course_offerings (id, course_id, semester, academic_year) values ('off2','c1','S1','2026')`);
  await pg.query(`insert into students (id, auth_user_id, full_name, index_number, programme) values ('student-c','auth-c','Student C','IDX-c','T')`);
  await pg.query(`insert into course_enrolments (id, student_id, course_offering_id) values ('enrol-c','student-c','off2')`);
  await pg.query(`insert into groups (id, course_offering_id, group_name, group_number, join_code, status, created_by_student_id, capacity)
                  values ('group-c','off2','Group C',1,'CODEC','opportunity_collection','student-c',10)`);
  // Group A has a venture with weak evidence and an untested critical assumption.
  await pg.query(`insert into ventures (id, group_id, opportunity_id, name, selection_rationale) values ('venture-a','group-a','opp-a','ShuttleBoard','because')`);
  for (const [i, cls] of ["opinion", "opinion", "assumption", "fact"].entries()) {
    await pg.query(
      `insert into evidence_items (id, venture_id, student_id, title, content, source_type, classification) values ($1,'venture-a','student-a',$2,'x','observation',$3)`,
      [`ev-${i}`, `Evidence ${i}`, cls],
    );
  }
  await pg.query(`insert into assumptions (id, venture_id, student_id, statement, importance, confidence) values ('as-1','venture-a','student-a','Students will pay','critical','low')`);
  await pg.query(`insert into activity_events (id, student_id, group_id, event_type) values ('act-1','student-a','group-a','EVIDENCE_CREATED'), ('act-c','student-c','group-c','GROUP_CREATED')`);

  const { code } = await asSystem(pg, (db) => createLecturerInvite(db, { label: "Dr Owusu", offeringIds: ["off1"] }));
  await asSystem(pg, (db) => redeemLecturerCode(db, { code, fullName: "Dr Ama Owusu", email: "a.owusu@ucc.edu.gh" }));
  await asSystem(pg, (db) => claimStaff(db, "auth-lect", "a.owusu@ucc.edu.gh"));
  return pg;
}

async function withDb(fn: (pg: PGlite) => Promise<void>) {
  const pg = await setUp();
  try {
    await fn(pg);
  } finally {
    await pg.close();
  }
}

describe("lecturer reads", () => {
  it("lists only the lecturer's classes and their groups", () =>
    withDb(async (pg) => {
      const classes = await asLecturer(pg, (db) => myClasses(db));
      assert.deepEqual(classes.map((c) => [c.offeringId, c.groups, c.students]), [["off1", 2, 2]]);
      const signals = await asLecturer(pg, (db) => groupSignals(db));
      assert.deepEqual(signals.map((s) => s.groupId), ["group-a", "group-b"]);
      const a = signals.find((s) => s.groupId === "group-a")!;
      assert.deepEqual(
        [a.ventureName, a.evidenceTotal, a.evidenceWeak, a.criticalUntested, a.submitted, a.required],
        ["ShuttleBoard", 4, 3, 1, 1, 1],
      );
    }));

  it("shows activity from their classes only", () =>
    withDb(async (pg) => {
      const feed = await asLecturer(pg, (db) => activityFeed(db));
      assert.deepEqual(feed.map((f) => [f.eventType, f.studentName, f.groupName]), [["EVIDENCE_CREATED", "Student A", "Group A"]]);
    }));

  it("opens a group in their class, and not one in another class", () =>
    withDb(async (pg) => {
      const d = await asLecturer(pg, (db) => groupDetail(db, "group-a"));
      assert.equal(d.venture?.name, "ShuttleBoard");
      assert.equal(d.evidence.length, 4);
      assert.deepEqual(d.members.map((m) => [m.fullName, m.submitted, m.evidence]), [["Student A", true, 4]]);
      await assert.rejects(asLecturer(pg, (db) => groupDetail(db, "group-c")), /not in your classes/);
    }));

  it("feedback is saved under the lecturer's name and appears on the group", () =>
    withDb(async (pg) => {
      await asLecturer(pg, (db) =>
        addFeedback(db, { groupId: "group-a", authorUserId: "auth-lect", authorName: "Dr Ama Owusu", body: "Count something." }),
      );
      const d = await asLecturer(pg, (db) => groupDetail(db, "group-a"));
      assert.deepEqual(d.feedback.map((f) => [f.author, f.body]), [["Dr Ama Owusu", "Count something."]]);
      await assert.rejects(
        asLecturer(pg, (db) => addFeedback(db, { groupId: "group-c", authorUserId: "auth-lect", authorName: "X", body: "No" })),
        /not in your classes/,
      );
    }));

  it("builds a marks row per student on the class list", () =>
    withDb(async (pg) => {
      const rows = await asLecturer(pg, (db) => marksRows(db, "off1"));
      assert.deepEqual(
        rows.map((r) => [r.fullName, r.group, r.problemSubmitted, r.evidence, r.assumptions, r.activity]),
        [
          ["Student A", "Group A", true, 4, 1, 1],
          ["Student B", "Group B", true, 0, 0, 0],
        ],
      );
      const other = await asLecturer(pg, (db) => marksRows(db, "off2"));
      assert.equal(other.length, 0, "another class's list is invisible");
    }));
});
