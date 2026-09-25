import { AsyncLocalStorage } from "node:async_hooks";
import { pendingMigrations } from "../../scripts/migration-plan.mjs";

/** Which database backend is active. */
export type DbSource = "neon" | "pglite";

// An empty/whitespace DATABASE_URL (an easy misconfig in deploy UIs) must mean
// "unset" — otherwise production would silently run on the PGLite fallback.
const rawDatabaseUrl =
  typeof process !== "undefined" ? process.env.DATABASE_URL : undefined;
const databaseUrl =
  rawDatabaseUrl && rawDatabaseUrl.trim() ? rawDatabaseUrl : undefined;

/**
 * Active backend: real **Neon** when `DATABASE_URL` is set (deployed / configured
 * sandbox), otherwise a local embedded **PGLite** (Postgres compiled to WASM) so
 * the app has a working database even with nothing configured — the live preview
 * included. Swap in Neon later by just setting `DATABASE_URL`; no code changes.
 */
export const dbSource: DbSource = databaseUrl ? "neon" : "pglite";

/**
 * Minimal shared SQL surface, satisfied by both Neon and PGLite. Both the
 * tagged-template and `.query()` forms resolve to an array of row objects:
 *
 *   const sql = await getSql();
 *   const rows = await sql`select * from todos where id = ${id}`; // parameterized
 *   const rows2 = await sql.query("select * from todos where id = $1", [id]);
 */
export interface Sql {
  <T = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]>;
  query<T = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<T[]>;
}

/**
 * Init state lives on globalThis as promises: dev HMR creates new instances of
 * this module, and two instances racing module-level state would open a second
 * pool or run two concurrent PGLite migration passes (whose duplicate
 * `_migrations` insert rejects — and would get memoized, poisoning every later
 * `getSql()`). A failed init clears its slot so the next call retries.
 */
const globalRef = globalThis as typeof globalThis & {
  __pgSqlPromise__?: Promise<Sql>;
  __pgPoolPromise__?: Promise<import("pg").Pool>;
  __pgliteInstance__?: Promise<import("@electric-sql/pglite").PGlite>;
  __pgliteMigrateChain__?: Promise<void>;
};

/**
 * Result-type parity: Postgres sends every value as text plus a type OID — the
 * JS value is the DRIVER's parsing choice, and pg and PGLite disagree (pg:
 * int8 -> string, date -> local-midnight Date; PGLite: int8 -> BigInt, which
 * JSON.stringify rejects, date -> UTC Date). Normalize both so preview and
 * production return identical, JSON-safe shapes:
 *   int8/bigint (incl. count(*)) -> number (past 2^53 loses precision — cast
 *                                   `::text` if you ever need huge integers)
 *   date                         -> 'YYYY-MM-DD' string
 *   interval                     -> Postgres interval text
 * numeric already comes back as a string on both (arbitrary precision).
 */
const OID_INT8 = 20;
const OID_DATE = 1082;
const OID_INTERVAL = 1186;
const identity = (v: string) => v;

type Run = <T>(text: string, params: unknown[]) => Promise<T[]>;

/** Wrap a query runner in the tagged-template + `.query()` `Sql` surface. */
function toSql(run: Run): Sql {
  const sql = (async <T = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]> => {
    // Rebuild with $1, $2, … placeholders so values stay parameterized.
    let text = strings[0];
    for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1]}`;
    return run<T>(text, values);
  }) as unknown as Sql;
  sql.query = <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
    run<T>(text, params);
  return sql;
}

/**
 * The shared Neon pool (one per process). Also used by `runInScope` to check
 * out a dedicated client for a per-request transaction — pool.query() alone
 * can't do that, since it may hand different statements to different
 * connections.
 */
async function getNeonPool(): Promise<import("pg").Pool> {
  globalRef.__pgPoolPromise__ ??= (async () => {
    const { Pool, types } = await import("pg");
    types.setTypeParser(OID_INT8, Number);
    types.setTypeParser(OID_DATE, identity);
    types.setTypeParser(OID_INTERVAL, identity);
    return new Pool({ connectionString: databaseUrl });
  })().catch((err) => {
    globalRef.__pgPoolPromise__ = undefined;
    throw err;
  });
  return globalRef.__pgPoolPromise__;
}

function createNeonSql(): Promise<Sql> {
  globalRef.__pgSqlPromise__ ??= (async () => {
    // Regular Postgres driver: node-postgres (`pg`) — works directly with Neon's
    // pooled endpoint. One pool per process; warm serverless instances reuse it.
    const pool = await getNeonPool();
    return toSql(async <T>(text: string, params: unknown[]) => {
      const res = await pool.query(text, params);
      return res.rows as T[];
    });
  })().catch((err) => {
    globalRef.__pgSqlPromise__ = undefined;
    throw err;
  });
  return globalRef.__pgSqlPromise__;
}

async function createPgliteSql(): Promise<Sql> {
  // Embedded Postgres, imported on demand so it never loads on the Neon path.
  // One in-memory instance per process, shared across HMR module instances, so
  // data survives source edits (it resets on dev-server restart).
  globalRef.__pgliteInstance__ ??= (async () => {
    const { PGlite } = await import("@electric-sql/pglite");
    const pg = new PGlite({
      parsers: {
        [OID_INT8]: Number,
        [OID_DATE]: identity,
        [OID_INTERVAL]: identity,
      },
    });
    await pg.waitReady;
    await pg.exec(
      "create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())",
    );
    return pg;
  })().catch((err) => {
    globalRef.__pgliteInstance__ = undefined;
    throw err;
  });
  const pg = await globalRef.__pgliteInstance__;

  // Apply migrations/ (the single schema source) so preview matches production.
  // SQL is inlined by the bundler via import.meta.glob (no runtime fs); applied
  // files are tracked in _migrations. The glob does not descend, so the opt-in
  // auth schema under migrations/auth/ stays out. Runs once per module instance
  // — so an HMR reload after adding a migration file applies it live — with
  // passes serialized on a global chain so concurrent callers never
  // double-apply.
  const migrate = async (): Promise<void> => {
    const migrations = import.meta.glob("/migrations/*.sql", {
      query: "?raw",
      import: "default",
      eager: true,
    }) as Record<string, string>;
    const doneRows = await pg.query<{ name: string }>(
      "select name from _migrations",
    );
    const done = doneRows.rows.map((r) => r.name);
    for (const { name, path } of pendingMigrations(Object.keys(migrations), done)) {
      // Apply + record atomically (parity with scripts/migrate.mjs) so a failed
      // statement can't leave a file half-applied but untracked.
      await pg.transaction(async (tx) => {
        await tx.exec(migrations[path]);
        await tx.query("insert into _migrations (name) values ($1)", [name]);
      });
    }
  };
  const pass = (globalRef.__pgliteMigrateChain__ ?? Promise.resolve())
    .catch(() => undefined) // an earlier failed pass must not wedge the chain
    .then(migrate);
  globalRef.__pgliteMigrateChain__ = pass;
  await pass;
  await seedPreviewRoster(pg);

  return toSql(async <T>(text: string, params: unknown[]) => {
    const result = await pg.query<T>(text, params);
    return result.rows;
  });
}

/**
 * Students on the preview database's roster. Real rosters come from
 * scripts/roster-import.mjs against DATABASE_URL, which the in-memory preview
 * database can't take, so without these nobody could activate a student
 * account locally. Preview (PGLite) only; never written to a real database.
 */
export const PREVIEW_ROSTER = [
  { email: "ama@demo.ucc.edu.gh", indexNumber: "DEMO/0001", fullName: "Ama Owusu", programme: "Business Administration" },
  { email: "kofi@demo.ucc.edu.gh", indexNumber: "DEMO/0002", fullName: "Kofi Mensah", programme: "Economics" },
  { email: "esi@demo.ucc.edu.gh", indexNumber: "DEMO/0003", fullName: "Esi Arthur", programme: "Computer Science" },
  { email: "yaw@demo.ucc.edu.gh", indexNumber: "DEMO/0004", fullName: "Yaw Boateng", programme: "Marketing" },
  { email: "abena@demo.ucc.edu.gh", indexNumber: "DEMO/0005", fullName: "Abena Quaye", programme: "Accounting" },
] as const;

async function seedPreviewRoster(pg: import("@electric-sql/pglite").PGlite): Promise<void> {
  const offering = await pg.query<{ id: string }>("select id from course_offerings order by academic_year desc limit 1");
  const offeringId = offering.rows[0]?.id;
  if (!offeringId) return;
  for (const s of PREVIEW_ROSTER) {
    const id = `preview_${s.indexNumber.replace(/\W/g, "_").toLowerCase()}`;
    await pg.query(
      `insert into students (id, auth_user_id, email, index_number, full_name, programme, is_synthetic)
       values ($1, null, $2, $3, $4, $5, false)
       on conflict do nothing`,
      [id, s.email, s.indexNumber, s.fullName, s.programme],
    );
    await pg.query(
      `insert into course_enrolments (id, student_id, course_offering_id, status)
       select $1, $2, $3, 'active' where exists (select 1 from students where id = $2)
       on conflict do nothing`,
      [`${id}_enrolment`, id, offeringId],
    );
  }
}

let sqlPromise: Promise<Sql> | null = null;

async function createSql(): Promise<Sql> {
  if (typeof window !== "undefined") {
    throw new Error(
      "@/lib/db is server-only — call getSql() from a createServerFn handler " +
        "or a server route loader, never from client code.",
    );
  }
  return dbSource === "neon" ? createNeonSql() : createPgliteSql();
}

/**
 * Get the **server-only** SQL client for the current call.
 *
 * Inside `runInScope()` (every authenticated server function, via
 * `authMiddleware` — see src/lib/auth/middleware.ts) this returns a client
 * bound to that request's own transaction, running as the restricted
 * `app_runtime` role with `app.current_auth_user_id` set — so
 * `migrations/0003_rls.sql`'s policies are the real access boundary, not
 * decorative SQL. Outside a scope (migrations, seed scripts, module-load
 * bootstrap) it falls back to the shared, privileged, unscoped client used
 * before request scoping existed.
 *
 * Schema comes from `migrations/*.sql`, auto-applied before the first query on
 * both backends — define tables there, never inline in server functions.
 */
export function getSql(): Promise<Sql> {
  const scope = requestScope.getStore();
  if (scope) return Promise.resolve(scope.sql);
  sqlPromise ??= createSql().catch((err) => {
    sqlPromise = null; // don't memoize failures — let the next call retry
    throw err;
  });
  return sqlPromise;
}

type ScopeMode = { kind: "user"; userId: string } | { kind: "bypass" };

interface RequestScope {
  sql: Sql;
}

const requestScope = new AsyncLocalStorage<RequestScope>();

/**
 * Run `fn` with `getSql()` bound to a single per-request transaction, as the
 * restricted `app_runtime` role (see migrations/0005_runtime_role.sql) rather
 * than the privileged connection/migration role. `authMiddleware` wraps every
 * authenticated server function's handler in this with `{ kind: "user" }` —
 * app code should not need to call it directly.
 *
 * The transaction commits if `fn` resolves and rolls back if it throws, so a
 * server function's several statements (e.g. `createVenture`'s venture insert
 * plus its two opportunity-status updates) become atomic as a side effect.
 */
export async function runInScope<T>(mode: ScopeMode, fn: () => Promise<T>): Promise<T> {
  if (dbSource === "neon") {
    const pool = await getNeonPool();
    const client = await pool.connect();
    const sql = toSql(async <T2>(text: string, params: unknown[]) => {
      const res = await client.query(text, params);
      return res.rows as T2[];
    });
    try {
      await client.query("begin");
      await client.query("set local role app_runtime");
      if (mode.kind === "user") {
        await client.query(
          "select set_config('app.current_auth_user_id', $1, true)",
          [mode.userId],
        );
      } else {
        await client.query("select set_config('app.bypass_rls', 'on', true)");
      }
      const result = await requestScope.run({ sql }, fn);
      await client.query("commit");
      return result;
    } catch (err) {
      await client.query("rollback").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  await ensureDbReady();
  const pg = await getPglite();
  return pg.transaction(async (tx) => {
    const sql = toSql(async <T2>(text: string, params: unknown[]) => {
      const result = await tx.query<T2>(text, params);
      return result.rows;
    });
    await tx.query("set local role app_runtime");
    if (mode.kind === "user") {
      await tx.query("select set_config('app.current_auth_user_id', $1, true)", [
        mode.userId,
      ]);
    } else {
      await tx.query("select set_config('app.bypass_rls', 'on', true)");
    }
    return requestScope.run({ sql }, fn);
  });
}

/**
 * Escape hatch for the small, audited set of operations that are legitimately
 * system-level rather than "this student reading/writing their own rows" —
 * looking up a group by join code before membership exists, computing the
 * next group number, rolling a group's status forward from membership-wide
 * counts, transitioning sibling opportunities when a venture is created, and
 * seeding the synthetic demo cohort. Each call site should say in a comment
 * why the operation can't be expressed as "my own rows" under RLS.
 *
 * A no-op outside `runInScope` (migrations/scripts already run privileged).
 */
export async function withRlsBypass<T>(fn: () => Promise<T>): Promise<T> {
  const scope = requestScope.getStore();
  if (!scope) return fn();
  await scope.sql`select set_config('app.bypass_rls', 'on', true)`;
  try {
    return await fn();
  } finally {
    await scope.sql`select set_config('app.bypass_rls', 'off', true)`;
  }
}

/**
 * The shared PGLite instance (preview only), with `migrations/*.sql` applied.
 * Lets Better Auth persist to the SAME embedded DB as app data in preview (via a
 * Kysely dialect). Throws when `DATABASE_URL` is set (that path uses Neon).
 */
export async function getPglite(): Promise<import("@electric-sql/pglite").PGlite> {
  if (dbSource !== "pglite") {
    throw new Error("getPglite() is only available on the PGLite fallback (no DATABASE_URL)");
  }
  await getSql();
  const pg = await globalRef.__pgliteInstance__;
  if (!pg) throw new Error("PGLite instance failed to initialize");
  return pg;
}

/**
 * Finish DB bootstrap before the server handles traffic.
 *
 * - **PGLite** (preview / no `DATABASE_URL`): open the in-memory DB and apply
 *   `migrations/*.sql`. Idempotent — concurrent callers share one promise.
 * - **Neon**: no-op (pool is created lazily on first query).
 *
 * Vite `configureServer` awaits this at dev startup; production imports of this
 * module kick it off immediately (see bottom of file).
 */
export function ensureDbReady(): Promise<void> {
  if (dbSource !== "pglite") return Promise.resolve();
  return getSql().then(() => undefined);
}

// Server-only eager start: kick PGLite bootstrap as soon as this module loads in
// Node. Client bundles never hit this path (`getSql` throws in the browser).
const globalBoot = globalThis as typeof globalThis & {
  __pgBootstrapPromise__?: Promise<void>;
};
if (typeof window === "undefined" && dbSource === "pglite") {
  globalBoot.__pgBootstrapPromise__ ??= ensureDbReady().catch((err) => {
    globalBoot.__pgBootstrapPromise__ = undefined;
    console.error("[db] PGLite bootstrap failed:", err);
    throw err;
  });
}
