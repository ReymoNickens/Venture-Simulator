// "A number or name cannot join more than one group": the database refuses a
// second active group for a student, and a phone number used twice.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { freshSeededDb } from "./test-db.ts";

describe("one person, one group", () => {
  it("refuses a second active group for the same student", async () => {
    const pg = await freshSeededDb(); // student-a is active in group-a
    try {
      await assert.rejects(
        pg.query(`insert into group_members (id, group_id, student_id, membership_status) values ('m2','group-b','student-a','active')`),
        /group_members_one_active_group_idx/,
      );
      // Leaving the first group frees them to join another.
      await pg.query(`update group_members set membership_status = 'left' where id = 'member-a'`);
      await pg.query(`insert into group_members (id, group_id, student_id, membership_status) values ('m3','group-b','student-a','active')`);
    } finally {
      await pg.close();
    }
  });

  it("refuses the same phone number for two students", async () => {
    const pg = await freshSeededDb();
    try {
      await pg.query(`update students set phone = '+233244123456' where id = 'student-a'`);
      await assert.rejects(pg.query(`update students set phone = '+233244123456' where id = 'student-b'`), /students_phone_idx/);
    } finally {
      await pg.close();
    }
  });

  it("gives phone sign-in the columns it needs on accounts", async () => {
    const pg = await freshSeededDb();
    try {
      const cols = await pg.query<{ column_name: string }>(
        `select column_name from information_schema.columns where table_name = 'user' and column_name like 'phone%' order by 1`,
      );
      assert.deepEqual(cols.rows.map((r) => r.column_name), ["phoneNumber", "phoneNumberVerified"]);
    } finally {
      await pg.close();
    }
  });
});
