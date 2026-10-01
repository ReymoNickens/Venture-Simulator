// Class lists against real Postgres (PGlite) with the real migrations. Each
// call runs the way the server runs it: one transaction, as app_runtime, with
// the RLS bypass on for the step (the server checks the owner/rep first).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { asUser, migratedDb } from "../server/test-db.ts";
import {
  classForRep,
  createRepCode,
  importClassList,
  listClassMembers,
  normaliseCode,
  ownerOverview,
  previewRepCode,
  redeemRepCode,
  removeFromClassList,
  revokeRepCode,
  type Db,
} from "./service.ts";

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

const COURSE = "course_entr201";
const rep = {
  fullName: "Kofi  Rep",
  email: "Kofi.Rep@stu.ucc.edu.gh",
  indexNumber: "ps/itc/22/0001",
  programme: "BSc Business Administration",
  level: "Level 300",
};

async function withDb(fn: (pg: PGlite) => Promise<void>) {
  const pg = await migratedDb();
  try {
    await fn(pg);
  } finally {
    await pg.close();
  }
}

async function setUpClass(pg: PGlite) {
  const { code } = await asSystem(pg, (db) =>
    createRepCode(db, { courseId: COURSE, label: "Business L300", semester: "Semester 1", academicYear: "2026/2027" }),
  );
  const redeemed = await asSystem(pg, (db) => redeemRepCode(db, { ...rep, code }));
  const repRow = await pg.query<{ id: string }>(`select id from students where email = $1`, [redeemed.email]);
  return { code, offeringId: redeemed.offeringId, repStudentId: repRow.rows[0].id };
}

describe("rep setup codes", () => {
  it("are shown once, stored only as a hash, and readable however the rep types them", () =>
    withDb(async (pg) => {
      const { code } = await asSystem(pg, (db) =>
        createRepCode(db, { courseId: COURSE, label: "L300", semester: "Semester 1", academicYear: "2026/2027" }),
      );
      assert.match(code, /^REP-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);
      const stored = await pg.query<{ code_hash: string }>(`select code_hash from rep_setup_codes`);
      assert.notEqual(stored.rows[0].code_hash, code);
      assert.ok(!stored.rows[0].code_hash.includes(normaliseCode(code)));
      const preview = await asSystem(pg, (db) => previewRepCode(db, ` ${code.toLowerCase().replaceAll("-", " ")} `));
      assert.equal(preview.courseCode, "ENT 302");
    }));

  it("cannot be read by a signed-in student without the server's bypass", () =>
    withDb(async (pg) => {
      await asSystem(pg, (db) =>
        createRepCode(db, { courseId: COURSE, label: "L300", semester: "Semester 1", academicYear: "2026/2027" }),
      );
      const seen = await asUser(pg, "auth-anyone", (tx) => tx.query(`select * from rep_setup_codes`));
      assert.equal(seen.rows.length, 0);
    }));

  it("refuses expired, cancelled and already-used codes", () =>
    withDb(async (pg) => {
      const old = await asSystem(pg, (db) =>
        createRepCode(db, {
          courseId: COURSE,
          label: "old",
          semester: "S1",
          academicYear: "2026/2027",
          now: new Date("2020-01-01"),
        }),
      );
      await assert.rejects(asSystem(pg, (db) => previewRepCode(db, old.code)), /expired/);

      const cancelled = await asSystem(pg, (db) =>
        createRepCode(db, { courseId: COURSE, label: "x", semester: "S1", academicYear: "2026/2027" }),
      );
      await asSystem(pg, (db) => revokeRepCode(db, cancelled.id));
      await assert.rejects(asSystem(pg, (db) => redeemRepCode(db, { ...rep, code: cancelled.code })), /cancelled/);

      const { code } = await setUpClass(pg);
      await assert.rejects(
        asSystem(pg, (db) => redeemRepCode(db, { ...rep, email: "someone.else@stu.ucc.edu.gh", indexNumber: "X/1", code })),
        /already been used/,
      );
    }));
});

describe("redeeming a code", () => {
  it("creates the class with the rep on its list, ready to activate", () =>
    withDb(async (pg) => {
      const { offeringId, repStudentId } = await setUpClass(pg);
      const offering = await pg.query<{ programme: string; level: string; rep_student_id: string }>(
        `select programme, level, rep_student_id from course_offerings where id = $1`,
        [offeringId],
      );
      assert.deepEqual(offering.rows[0], {
        programme: "BSc Business Administration",
        level: "Level 300",
        rep_student_id: repStudentId,
      });
      const repRow = await pg.query<{ auth_user_id: string | null; email: string; index_number: string; full_name: string }>(
        `select auth_user_id, email, index_number, full_name from students where id = $1`,
        [repStudentId],
      );
      // Normalised exactly as the sign-in hook will look it up.
      assert.deepEqual(repRow.rows[0], {
        auth_user_id: null,
        email: "kofi.rep@stu.ucc.edu.gh",
        index_number: "PS/ITC/22/0001",
        full_name: "Kofi Rep",
      });
      const info = await asSystem(pg, (db) => classForRep(db, repStudentId));
      assert.equal(info?.offeringId, offeringId);
    }));

  it("resumes if the rep retries before activating (e.g. the network dropped)", () =>
    withDb(async (pg) => {
      const { code, offeringId } = await setUpClass(pg);
      const again = await asSystem(pg, (db) => redeemRepCode(db, { ...rep, level: "Level 400", code }));
      assert.equal(again.offeringId, offeringId);
      assert.equal(again.resumed, true);
      const classes = await pg.query(`select id from course_offerings where rep_student_id is not null`);
      assert.equal(classes.rows.length, 1);
    }));

  it("refuses someone who already has an account", () =>
    withDb(async (pg) => {
      await pg.query(
        `insert into students (id, auth_user_id, email, index_number, full_name, programme) values ('s1','auth-1',$1,'OTHER','X','Y')`,
        [rep.email.toLowerCase()],
      );
      const { code } = await asSystem(pg, (db) =>
        createRepCode(db, { courseId: COURSE, label: "x", semester: "S1", academicYear: "2026/2027" }),
      );
      await assert.rejects(asSystem(pg, (db) => redeemRepCode(db, { ...rep, code })), /already has an account/);
      const codeRow = await pg.query<{ used_at: unknown }>(`select used_at from rep_setup_codes`);
      assert.equal(codeRow.rows[0].used_at, null, "a refused attempt does not burn the code");
    }));
});

describe("class list upload", () => {
  it("adds new people, corrects unactivated ones, and explains every skipped row", () =>
    withDb(async (pg) => {
      const { offeringId, repStudentId } = await setUpClass(pg);
      const first = await asSystem(pg, (db) =>
        importClassList(db, offeringId, [
          { row: 2, fullName: "Ama Mensah", email: "ama@stu.ucc.edu.gh", indexNumber: "PS/ITC/22/0002" },
          { row: 3, fullName: "Yaw Boateng", email: "yaw@stu.ucc.edu.gh", indexNumber: "PS/ITC/22/0003" },
          { row: 4, fullName: "", email: "nobody@stu.ucc.edu.gh", indexNumber: "PS/ITC/22/0004" },
          { row: 5, fullName: "Bad Email", email: "not-an-email", indexNumber: "PS/ITC/22/0005" },
          { row: 6, fullName: "Ama Again", email: "AMA@stu.ucc.edu.gh", indexNumber: "PS/ITC/22/0099" },
          { row: 7, ...rep },
        ]),
      );
      assert.deepEqual(first, [
        { row: 2, status: "added" },
        { row: 3, status: "added" },
        { row: 4, status: "skipped", reason: "Full name is missing" },
        { row: 5, status: "skipped", reason: "Email does not look right" },
        { row: 6, status: "skipped", reason: "Same email or index number appears earlier in the sheet" },
        { row: 7, status: "skipped", reason: "That’s you, the rep. You’re already on the list" },
      ]);

      // Re-uploading with a fixed name updates rather than duplicates.
      const second = await asSystem(pg, (db) =>
        importClassList(db, offeringId, [
          { row: 2, fullName: "Ama Serwaa Mensah", email: "ama@stu.ucc.edu.gh", indexNumber: "PS/ITC/22/0002" },
        ]),
      );
      assert.deepEqual(second, [{ row: 2, status: "updated" }]);

      const members = await asSystem(pg, (db) => listClassMembers(db, offeringId));
      assert.deepEqual(
        members.map((m) => [m.fullName, m.programme, m.isRep, m.activated]),
        [
          ["Ama Serwaa Mensah", "BSc Business Administration", false, false],
          ["Kofi Rep", "BSc Business Administration", true, false],
          ["Yaw Boateng", "BSc Business Administration", false, false],
        ],
      );
      assert.ok(members.some((m) => m.studentId === repStudentId));
    }));

  it("never changes an activated student or takes someone from another class", () =>
    withDb(async (pg) => {
      const a = await setUpClass(pg);
      await asSystem(pg, (db) =>
        importClassList(db, a.offeringId, [
          { row: 2, fullName: "Ama Mensah", email: "ama@stu.ucc.edu.gh", indexNumber: "A1" },
          { row: 3, fullName: "Esi Active", email: "esi@stu.ucc.edu.gh", indexNumber: "A2" },
        ]),
      );
      await pg.query(`update students set auth_user_id = 'auth-esi' where index_number = 'A2'`);

      const { code } = await asSystem(pg, (db) =>
        createRepCode(db, { courseId: COURSE, label: "other", semester: "S1", academicYear: "2026/2027" }),
      );
      const b = await asSystem(pg, (db) =>
        redeemRepCode(db, { ...rep, email: "rep.b@stu.ucc.edu.gh", indexNumber: "B0", code }),
      );
      const result = await asSystem(pg, (db) =>
        importClassList(db, b.offeringId, [
          { row: 2, fullName: "Ama Moved", email: "ama@stu.ucc.edu.gh", indexNumber: "A1" },
          { row: 3, fullName: "Esi Renamed", email: "esi@stu.ucc.edu.gh", indexNumber: "A2" },
        ]),
      );
      assert.deepEqual(result, [
        { row: 2, status: "skipped", reason: "Already on another class list" },
        { row: 3, status: "skipped", reason: "Already has an account in another class" },
      ]);
      const mixed = await asSystem(pg, (db) =>
        importClassList(db, b.offeringId, [{ row: 2, fullName: "Mixed Up", email: "ama@stu.ucc.edu.gh", indexNumber: "A2" }]),
      );
      assert.deepEqual(mixed, [
        { row: 2, status: "skipped", reason: "Email and index number belong to two different people" },
      ]);
      const esi = await pg.query<{ full_name: string }>(`select full_name from students where index_number = 'A2'`);
      assert.equal(esi.rows[0].full_name, "Esi Active");
    }));

  it("lets the rep remove a mistaken entry, but not an activated student or themselves", () =>
    withDb(async (pg) => {
      const { offeringId, repStudentId } = await setUpClass(pg);
      await asSystem(pg, (db) =>
        importClassList(db, offeringId, [
          { row: 2, fullName: "Typo Person", email: "typo@stu.ucc.edu.gh", indexNumber: "T1" },
          { row: 3, fullName: "Real Person", email: "real@stu.ucc.edu.gh", indexNumber: "T2" },
        ]),
      );
      await pg.query(`update students set auth_user_id = 'auth-real' where index_number = 'T2'`);
      const ids = await pg.query<{ id: string; index_number: string }>(`select id, index_number from students`);
      const idOf = (idx: string) => ids.rows.find((r) => r.index_number === idx)!.id;

      await asSystem(pg, (db) => removeFromClassList(db, offeringId, idOf("T1")));
      const left = await pg.query(`select 1 from students where index_number = 'T1'`);
      assert.equal(left.rows.length, 0, "the unclaimed row is gone, so the person can no longer activate");

      await assert.rejects(asSystem(pg, (db) => removeFromClassList(db, offeringId, idOf("T2"))), /already activated/);
      await assert.rejects(asSystem(pg, (db) => removeFromClassList(db, offeringId, repStudentId)), /yourself/);
    }));
});

describe("owner overview", () => {
  it("shows each code's state and each class's progress", () =>
    withDb(async (pg) => {
      const { offeringId } = await setUpClass(pg);
      await asSystem(pg, (db) =>
        createRepCode(db, { courseId: COURSE, label: "waiting one", semester: "S1", academicYear: "2026/2027" }),
      );
      await asSystem(pg, (db) =>
        importClassList(db, offeringId, [{ row: 2, fullName: "Ama", email: "ama@stu.ucc.edu.gh", indexNumber: "A1" }]),
      );
      await pg.query(`update students set auth_user_id = 'auth-ama' where index_number = 'A1'`);
      const { codes, classes } = await asSystem(pg, (db) => ownerOverview(db));
      assert.deepEqual(codes.map((c) => c.status).sort(), ["used", "waiting"]);
      assert.equal(classes.length, 1);
      assert.equal(classes[0].onList, 2);
      assert.equal(classes[0].activated, 1);
      assert.equal(classes[0].repActivated, false);
    }));
});
