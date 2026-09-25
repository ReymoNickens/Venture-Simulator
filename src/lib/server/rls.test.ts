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

/** Group A gets a second member and a venture; group B a venture of its own. */
async function withVentures(pg: PGlite): Promise<void> {
  await pg.query(
    `insert into students (id, auth_user_id, full_name, index_number, programme) values ('student-a2','auth-a2','Student A2','IDX-a2','Test')`,
  );
  await pg.query(
    `insert into group_members (id, group_id, student_id, membership_status) values ('member-a2','group-a','student-a2','active')`,
  );
  for (const g of ["a", "b"]) {
    await pg.query(
      `insert into ventures (id, group_id, opportunity_id, name, selection_rationale) values ($1,$2,$3,'V','because')`,
      [`venture-${g}`, `group-${g}`, `opp-${g}`],
    );
  }
  await pg.query(
    `insert into interviews (id, venture_id, student_id, interviewee_profile, key_quotes) values ('int-b','venture-b','student-b','Trader','quote')`,
  );
  await pg.query(
    `insert into reflections (id, student_id, group_id, stage, body) values ('ref-a','student-a','group-a','decide','private thoughts')`,
  );
  await pg.query(
    `insert into peer_ratings (id, group_id, rater_student_id, ratee_student_id, score) values ('pr-a','group-a','student-a','student-a2',2)`,
  );
}

describe("RLS for the later venture stages", () => {
  it("denies reading another group's interviews", async () => {
    const pg = await freshSeededDb();
    try {
      await withVentures(pg);
      const rows = await asUser(pg, "auth-a", (tx) => tx.query("select id from interviews"));
      assert.equal(rows.rows.length, 0);
    } finally {
      await pg.close();
    }
  });

  it("keeps a reflection private from the author's own teammates", async () => {
    const pg = await freshSeededDb();
    try {
      await withVentures(pg);
      const teammate = await asUser(pg, "auth-a2", (tx) => tx.query("select id from reflections"));
      assert.equal(teammate.rows.length, 0);
      const author = await asUser(pg, "auth-a", (tx) => tx.query("select id from reflections"));
      assert.equal(author.rows.length, 1);
    } finally {
      await pg.close();
    }
  });

  it("hides a peer rating from the teammate being rated", async () => {
    const pg = await freshSeededDb();
    try {
      await withVentures(pg);
      const ratee = await asUser(pg, "auth-a2", (tx) => tx.query("select id from peer_ratings"));
      assert.equal(ratee.rows.length, 0);
    } finally {
      await pg.close();
    }
  });

  it("denies writing an interview into another group's venture", async () => {
    const pg = await freshSeededDb();
    try {
      await withVentures(pg);
      await assert.rejects(() =>
        asUser(pg, "auth-a", (tx) =>
          tx.query(
            `insert into interviews (id, venture_id, student_id, interviewee_profile, key_quotes) values ('int-x','venture-b','student-a','x','y')`,
          ),
        ),
      );
    } finally {
      await pg.close();
    }
  });
});
