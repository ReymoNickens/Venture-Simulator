// Shared PGlite fixtures for database-level (RLS) tests. Boots its own
// PGlite and applies migrations/*.sql with plain node:fs, the same way
// scripts/migrate.mjs does for a real deploy (import.meta.glob is Vite-only
// and these tests run under plain `node --test`).
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

export async function migratedDb(): Promise<PGlite> {
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
export async function freshSeededDb(): Promise<PGlite> {
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
export async function asUser<T>(pg: PGlite, authUserId: string, fn: (tx: PGlite) => Promise<T>): Promise<T> {
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

