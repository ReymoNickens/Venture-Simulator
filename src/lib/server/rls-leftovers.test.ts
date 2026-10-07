// Preview builds share the production database, and an unmerged branch
// (claude/studio-ux-lecturer) ran its migration there, replacing some of
// our access rules. 0012 puts them back. This replays what happened: our
// migrations, then the branch's (a verbatim copy in fixtures/), then 0012.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { asUser, freshSeededDb } from "./test-db.ts";

const read = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

async function joinOwnGroup(pg: PGlite) {
  // A student starting a group adds themselves as its first member.
  await pg.query(
    `insert into groups (id, course_offering_id, group_name, group_number, join_code, status, created_by_student_id, capacity)
     values ('group-new','off1','New',9,'CODENEW','opportunity_collection','student-a',10)`,
  );
  return asUser(pg, "auth-a", (tx) =>
    tx.query(`insert into group_members (id, group_id, student_id, membership_status) values ('m-new','group-new','student-a','active')`),
  );
}

describe("leftovers from an unmerged branch's preview build", () => {
  it("reproduces the group_members error, and 0012 fixes it", async () => {
    const pg = await freshSeededDb();
    try {
      await pg.exec(await read("./fixtures/leftover-studio-ux-lecturer-0006.sql"));
      await assert.rejects(joinOwnGroup(pg), /row-level security policy for table "group_members"/);

      await pg.exec(await read("../../../migrations/0012_restore_rls_after_preview_leftovers.sql"));
      await pg.query(`delete from groups where id = 'group-new'`);
      await joinOwnGroup(pg);
    } finally {
      await pg.close();
    }
  });

  it("after 0012, a lecturer still cannot read draft opportunities", async () => {
    const pg = await freshSeededDb();
    try {
      await pg.exec(await read("./fixtures/leftover-studio-ux-lecturer-0006.sql"));
      await pg.query(`insert into user_roles (id, user_id, role_id, course_offering_id) values ('r1','auth-lect','role_lecturer','off1')`);
      await pg.query(`update opportunities set status = 'draft' where id = 'opp-a'`);
      const before = await asUser(pg, "auth-lect", (tx) => tx.query(`select id from opportunities where id = 'opp-a'`));
      assert.equal(before.rows.length, 1, "the leftover policy leaked drafts");

      await pg.exec(await read("../../../migrations/0012_restore_rls_after_preview_leftovers.sql"));
      const after = await asUser(pg, "auth-lect", (tx) => tx.query<{ id: string }>(`select id from opportunities order by id`));
      assert.deepEqual(after.rows.map((r) => r.id), ["opp-b"], "submitted work only");
    } finally {
      await pg.close();
    }
  });

  it("0012 is harmless on a database that never had the branch, and safe to repeat", async () => {
    const pg = await freshSeededDb(); // already includes 0012
    try {
      await pg.exec(await read("../../../migrations/0012_restore_rls_after_preview_leftovers.sql"));
      await joinOwnGroup(pg);
    } finally {
      await pg.close();
    }
  });
});
