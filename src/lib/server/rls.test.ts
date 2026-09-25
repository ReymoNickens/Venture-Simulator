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
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { pendingMigrations } from "../../../scripts/migration-plan.mjs";

const migrationsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "migrations",
);

async function migratedDb(): Promise<PGlite> {
  const pg = new PGlite();
  await pg.waitReady;
  await pg.exec(
    "create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())",
  );
  const entries = await readdir(migrationsDir);
  for (const { name } of pendingMigrations(entries, [])) {
    const text = await readFile(join(migrationsDir, name), "utf8");
    await pg.transaction(async (tx) => {
      await tx.exec(text);
      await tx.query("insert into _migrations (name) values ($1)", [name]);
    });
  }
  return pg;
}

/**
 * Fresh migrated + seeded instance per test. PGlite's single physical
 * connection appears to desync ("CommitTransactionCommand: unexpected state
 * DEFAULT") after several `SET LOCAL ROLE` transactions in a row on one
 * instance — a WASM/embedded-engine quirk, not something a real per-request
 * Neon connection (a fresh client checkout each time, see runInScope in
 * src/lib/db.ts) hits. One instance per test sidesteps it and keeps each
 * test's fixture independent besides.
 */
async function freshSeededDb(): Promise<PGlite> {
  const pg = await migratedDb();
  await pg.query(
    `insert into courses (id, course_code, course_name) values ('c1','T101','Test 101') on conflict (id) do nothing`,
  );
  await pg.query(
    `insert into course_offerings (id, course_id, semester, academic_year) values ('off1','c1','S1','2026') on conflict (id) do nothing`,
  );
  for (const [suffix, authId, groupId] of [
    ["a", "auth-a", "group-a"],
    ["b", "auth-b", "group-b"],
  ] as const) {
    await pg.query(
      `insert into students (id, auth_user_id, full_name, index_number, programme) values ($1,$2,$3,$4,'Test')`,
      [`student-${suffix}`, authId, `Student ${suffix.toUpperCase()}`, `IDX-${suffix}`],
    );
    await pg.query(
      `insert into course_enrolments (id, student_id, course_offering_id) values ($1,$2,'off1')`,
      [`enrol-${suffix}`, `student-${suffix}`],
    );
    await pg.query(
      `insert into groups (id, course_offering_id, group_name, group_number, join_code, status, created_by_student_id, capacity)
       values ($1,'off1',$2,$3,$4,'opportunity_collection',$5,10)`,
      [groupId, `Group ${suffix.toUpperCase()}`, suffix === "a" ? 1 : 2, `CODE${suffix.toUpperCase()}`, `student-${suffix}`],
    );
    await pg.query(
      `insert into group_members (id, group_id, student_id, membership_status) values ($1,$2,$3,'active')`,
      [`member-${suffix}`, groupId, `student-${suffix}`],
    );
    await pg.query(
      `insert into opportunities (id, student_id, group_id, problem, status)
       values ($1,$2,$3,$4,'submitted')`,
      [`opp-${suffix}`, `student-${suffix}`, groupId, `Problem statement for group ${suffix}`],
    );
  }
  return pg;
}

/** Run `fn` as a real per-request connection would: app_runtime + this user's id. */
async function asUser<T>(pg: PGlite, authUserId: string, fn: (tx: PGlite) => Promise<T>): Promise<T> {
  return pg.transaction(async (tx) => {
    await tx.exec("set local role app_runtime");
    await tx.query("select set_config('app.current_auth_user_id', $1, true)", [authUserId]);
    const result = await fn(tx as unknown as PGlite);
    // Hand the connection back in the role it started in — some PGlite
    // internals (autovacuum-ish bookkeeping between transactions) run as the
    // session's ordinary role, and this is a single physical connection
    // reused test-to-test, not a fresh one per request as in production.
    await tx.exec("reset role");
    return result;
  });
}

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

describe("Slice 2 policies: joining, roles, lecturers, private advisor chats", () => {
  it("a student can no longer insert themselves into another group directly", async () => {
    const pg = await freshSeededDb();
    try {
      await assert.rejects(() =>
        asUser(pg, "auth-a", (tx) =>
          tx.query(`insert into group_members (id, group_id, student_id, membership_status) values ('sneak','group-b','student-a','active')`),
        ),
      );
    } finally {
      await pg.close();
    }
  });

  it("a user can't make themselves a lecturer or admin", async () => {
    const pg = await freshSeededDb();
    try {
      await assert.rejects(() =>
        asUser(pg, "auth-a", (tx) =>
          tx.query(`insert into user_roles (id, user_id, role_id, course_offering_id) values ('r1','auth-a','role_lecturer','off1')`),
        ),
      );
      await assert.rejects(() =>
        asUser(pg, "auth-a", (tx) =>
          tx.query(`insert into user_roles (id, user_id, role_id, course_offering_id) values ('r2','auth-a','role_admin',null)`),
        ),
      );
    } finally {
      await pg.close();
    }
  });

  it("a lecturer reads only the offering they teach", async () => {
    const pg = await freshSeededDb();
    try {
      await pg.query(`insert into course_offerings (id, course_id, semester, academic_year) values ('off2','c1','S2','2026')`);
      await pg.query(`update groups set course_offering_id = 'off2' where id = 'group-b'`);
      await pg.query(`insert into user_roles (id, user_id, role_id, course_offering_id) values ('lr','auth-lect','role_lecturer','off1')`);
      const rows = await asUser(pg, "auth-lect", (tx) => tx.query<{ id: string }>("select id from opportunities order by id"));
      assert.deepEqual(rows.rows.map((r) => r.id), ["opp-a"], "sees group A (off1), not group B (off2)");
      const groups = await asUser(pg, "auth-lect", (tx) => tx.query<{ id: string }>("select id from groups order by id"));
      assert.deepEqual(groups.rows.map((r) => r.id), ["group-a"]);
    } finally {
      await pg.close();
    }
  });

  it("a lecturer cannot write students' work", async () => {
    const pg = await freshSeededDb();
    try {
      await pg.query(`insert into user_roles (id, user_id, role_id, course_offering_id) values ('lr','auth-lect','role_lecturer','off1')`);
      await asUser(pg, "auth-lect", (tx) => tx.query("update opportunities set problem = 'edited' where id = 'opp-a'"));
      const check = await pg.query<{ problem: string }>("select problem from opportunities where id = 'opp-a'");
      assert.notEqual(check.rows[0]?.problem, "edited");
    } finally {
      await pg.close();
    }
  });

  it("a private advisor chat about your own idea is invisible to teammates", async () => {
    const pg = await freshSeededDb();
    try {
      await pg.query(`insert into students (id, auth_user_id, full_name, index_number, programme) values ('student-a2','auth-a2','Teammate','IDX-a2','Test')`);
      await pg.query(`insert into group_members (id, group_id, student_id, membership_status) values ('member-a2','group-a','student-a2','active')`);
      await pg.query(`insert into ai_advisor_sessions (id, group_id, stage, student_id) values ('s-private','group-a','idea','student-a')`);
      await pg.query(`insert into ai_advisor_messages (id, session_id, group_id, student_id, role, content) values ('m1','s-private','group-a','student-a','student','my secret idea')`);
      const mine = await asUser(pg, "auth-a", (tx) => tx.query<{ id: string }>("select id from ai_advisor_messages"));
      const theirs = await asUser(pg, "auth-a2", (tx) => tx.query<{ id: string }>("select id from ai_advisor_messages"));
      assert.equal(mine.rows.length, 1);
      assert.equal(theirs.rows.length, 0, "teammate must not read another member's private idea chat");
    } finally {
      await pg.close();
    }
  });
});
