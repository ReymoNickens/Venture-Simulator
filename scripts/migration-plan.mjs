// @ts-check
/**
 * Migration bookkeeping shared by the two appliers — `scripts/migrate.mjs`
 * (deploy, `readdir`) and `src/lib/db.ts` (PGLite preview, `import.meta.glob`).
 *
 * Applied files are keyed by BASENAME, so the same file applies once no matter
 * which directory it is globbed from. That is what makes the auth schema safe to
 * copy from `migrations/auth/` into `migrations/` when an app turns sign-in on:
 * a database that already has `0001_auth.sql` will not re-run it.
 *
 * Neither applier descends into subdirectories, so `migrations/auth/*.sql` is
 * out of scope for both until it is copied up.
 */

/**
 * The `_migrations` key for a migration path (or bare filename).
 * @param {string} path
 * @returns {string}
 */
export function migrationName(path) {
  return path.split("/").pop() ?? path;
}

/**
 * @param {string} path
 * @returns {boolean}
 */
export function isMigrationFile(path) {
  return path.endsWith(".sql");
}

/**
 * Migrations in `paths` that are not yet in `applied`, in apply order.
 * Non-`.sql` entries (a `readdir` also yields `migrations/auth/`) are dropped.
 * @param {Iterable<string>} paths
 * @param {Iterable<string>} applied
 * @returns {Array<{ name: string, path: string }>}
 */
export function pendingMigrations(paths, applied) {
  const done = new Set(applied);
  return [...paths]
    .filter(isMigrationFile)
    .map((path) => ({ name: migrationName(path), path }))
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter(({ name }) => !done.has(name));
}

/**
 * Whether this build may change the database. Vercel preview builds of every
 * branch get the production DATABASE_URL, so they used to run their own,
 * unmerged migrations against production (an unmerged branch once replaced
 * our access rules that way, see migrations/0012). Previews now skip unless
 * MIGRATE_PREVIEWS=1, which is for a preview environment given its own
 * database.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {{ run: boolean, reason?: string }}
 */
export function migrationDecision(env) {
  if (!env.DATABASE_URL) return { run: false, reason: "DATABASE_URL not set — skipping (the PGLite fallback migrates itself)." };
  if (env.VERCEL_ENV === "preview" && env.MIGRATE_PREVIEWS !== "1") {
    return {
      run: false,
      reason: "preview build — skipping so unmerged migrations never reach the shared database (set MIGRATE_PREVIEWS=1 if previews have their own).",
    };
  }
  return { run: true };
}
