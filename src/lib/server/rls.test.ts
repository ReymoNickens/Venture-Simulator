// Proves the Slice 1 acceptance criterion (spec §55, "RLS"): a direct database
// access attempt against another group's data must be denied by the database
// itself, not by application code. This boots its own PGlite instance and
// applies migrations/*.sql the same way scripts/migrate.mjs does for a real
// deploy — plain `node:fs`, not `import.meta.glob` (a Vite-only macro), since
// this file runs under plain `node --test`, outside Vite. It does not import
// src/lib/db.ts for the same reason; see that file's `runInScope` for the
// runtime wiring this test is a lower-level check on.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { asUser, freshSeededDb } from "./test-db.ts";

describe("RLS actually enforces group isolation (not just executable SQL)", () => {
  it("denies a student reading another group's opportunities directly", async () => {
    const pg = await freshSeededDb();
    try {
      const rows = await asUser(pg, "auth-a", (tx) =>
        tx.query<{ id: string }>("select id from opportunities where group_id = $1", ["group-b"]),
      );
      assert.equal(rows.rows.length, 0, "student A must not see group B's opportunity via RLS");
    } finally {
      await pg.close();
    }
  });

  it("denies a student reading another group's row at all, even by opportunity id", async () => {
    const pg = await freshSeededDb();
    try {
      const rows = await asUser(pg, "auth-a", (tx) =>
        tx.query<{ id: string }>("select id from opportunities where id = 'opp-b'"),
      );
      assert.equal(rows.rows.length, 0);
    } finally {
      await pg.close();
    }
  });

  it("denies a student updating another group's opportunity", async () => {
    const pg = await freshSeededDb();
    try {
      await asUser(pg, "auth-a", (tx) =>
        tx.query("update opportunities set status = 'rejected' where id = 'opp-b'"),
      );
      // No error — RLS just matches zero rows, same as a WHERE clause that
      // matches nothing. Confirm nothing actually changed.
      const check = await pg.query<{ status: string }>(
        "select status from opportunities where id = 'opp-b'",
      );
      assert.equal(check.rows[0]?.status, "submitted");
    } finally {
      await pg.close();
    }
  });

  it("still allows a student to read their own group's data", async () => {
    const pg = await freshSeededDb();
    try {
      const rows = await asUser(pg, "auth-a", (tx) =>
        tx.query<{ id: string }>("select id from opportunities where group_id = $1", ["group-a"]),
      );
      assert.equal(rows.rows.length, 1);
      assert.equal(rows.rows[0]?.id, "opp-a");
    } finally {
      await pg.close();
    }
  });

  it("denies row access entirely for an unknown/unauthenticated caller", async () => {
    const pg = await freshSeededDb();
    try {
      const rows = await asUser(pg, "no-such-user", (tx) =>
        tx.query<{ id: string }>("select id from opportunities where group_id = $1", ["group-a"]),
      );
      assert.equal(rows.rows.length, 0);
    } finally {
      await pg.close();
    }
  });

  it("lets an explicit, audited bypass see across groups (the escape hatch app code opts into)", async () => {
    const pg = await freshSeededDb();
    try {
      const rows = await pg.transaction(async (tx) => {
        await tx.exec("set local role app_runtime");
        await tx.query("select set_config('app.bypass_rls', 'on', true)");
        return tx.query<{ id: string }>("select id from groups where course_offering_id = 'off1'");
      });
      assert.equal(rows.rows.length, 2, "bypass is for system operations, not a per-user grant");
    } finally {
      await pg.close();
    }
  });

  it("lets a student insert their own opportunity_revisions row (the bug found once RLS applied)", async () => {
    const pg = await freshSeededDb();
    try {
      await assert.doesNotReject(() =>
        asUser(pg, "auth-a", (tx) =>
          tx.query(
            `insert into opportunity_revisions (id, opportunity_id, snapshot) values ('rev-a','opp-a','{}')`,
          ),
        ),
      );
    } finally {
      await pg.close();
    }
  });

  it("still denies a student inserting a revision for another group's opportunity", async () => {
    const pg = await freshSeededDb();
    try {
      await assert.rejects(() =>
        asUser(pg, "auth-a", (tx) =>
          tx.query(
            `insert into opportunity_revisions (id, opportunity_id, snapshot) values ('rev-b','opp-b','{}')`,
          ),
        ),
      );
    } finally {
      await pg.close();
    }
  });
});
