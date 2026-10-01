// The look-around demo class against real Postgres (PGlite) with the real
// migrations and RLS.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { asUser, migratedDb } from "../server/test-db.ts";
import { claimStaff } from "../lecturers/accounts.ts";
import { classForRep, listClassMembers, type Db } from "../classes/service.ts";
import { DEMO_IDENTITIES, DEMO_OFFERING_ID, ensureDemoClass } from "./tour.ts";
import { isDemoEmail } from "./names.ts";

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

describe("demo class", () => {
  it("sets up a rep, a student, a lecturer and a group, and is safe to repeat", async () => {
    const pg = await migratedDb();
    try {
      await asSystem(pg, (db) => ensureDemoClass(db));
      await asSystem(pg, (db) => ensureDemoClass(db));

      const members = await asSystem(pg, (db) => listClassMembers(db, DEMO_OFFERING_ID));
      assert.equal(members.length, 5, "rep, student and three still to activate; synthetic peers are not listed");
      assert.equal(members.filter((m) => m.isRep).length, 1);
      const groups = await pg.query(`select id from groups where course_offering_id = $1`, [DEMO_OFFERING_ID]);
      assert.equal(groups.rows.length, 1);
      const course = await pg.query<{ course_code: string }>(
        `select c.course_code from course_offerings o join courses c on c.id = o.course_id where o.id = $1`,
        [DEMO_OFFERING_ID],
      );
      assert.equal(course.rows[0].course_code, "ENT 302");

      // The rep's account claims the rep row and is rep of the demo class.
      await pg.query(`update students set auth_user_id = 'auth-rep' where lower(email) = $1`, [DEMO_IDENTITIES.rep.email]);
      const rep = await pg.query<{ id: string }>(`select id from students where auth_user_id = 'auth-rep'`);
      const repClass = await asSystem(pg, (db) => classForRep(db, rep.rows[0].id));
      assert.equal(repClass?.offeringId, DEMO_OFFERING_ID);

      // The lecturer's sign-up claims the staff row and sees the demo group.
      assert.equal(await asSystem(pg, (db) => claimStaff(db, "auth-lect", DEMO_IDENTITIES.lecturer.email)), true);
      const seen = await asUser(pg, "auth-lect", (tx) => tx.query(`select id from groups`));
      assert.equal(seen.rows.length, 1);
    } finally {
      await pg.close();
    }
  });

  it("recognises demo emails only", () => {
    assert.equal(isDemoEmail(DEMO_IDENTITIES.student.email), true);
    assert.equal(isDemoEmail("STUDENT@TOUR.DEMO"), true);
    assert.equal(isDemoEmail("ama@ucc.edu.gh"), false);
    assert.equal(isDemoEmail(null), false);
  });
});
