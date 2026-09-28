/**
 * Database configuration rules, kept pure so they can be unit-tested and
 * shared by the app pool (src/lib/db.ts), Better Auth's pool
 * (src/lib/auth/server.ts) and the deploy guard (server/middleware/db-guard.ts).
 */

type Env = Record<string, string | undefined>;

const set = (env: Env, key: string) => Boolean(env[key]?.trim());

/** True on a real deployment (as opposed to `npm run dev` or a test). */
export function isDeployed(env: Env): boolean {
  return set(env, "VERCEL") || set(env, "GROK_PROJECT_ID") || env.NODE_ENV === "production";
}

/**
 * Why this process must not serve requests, or null when it may.
 *
 * Without DATABASE_URL the app falls back to an in-memory PGLite database —
 * right for local development, disastrous in production: every cold start
 * wipes every student's work, silently. So a deployed process with no
 * database refuses to run. `npm run preview` (a local production build) opts
 * back in with ALLOW_EPHEMERAL_DB=true; that opt-in is ignored on a real
 * hosting platform.
 */
export function databaseGuardError(env: Env): string | null {
  if (set(env, "DATABASE_URL")) return null;
  if (!isDeployed(env)) return null;
  const onPlatform = set(env, "VERCEL") || set(env, "GROK_PROJECT_ID");
  if (!onPlatform && env.ALLOW_EPHEMERAL_DB === "true") return null;
  return (
    "DATABASE_URL is not set on a production deployment. Refusing to start on the " +
    "in-memory fallback database, which would lose every student's work on the next restart."
  );
}

export interface PoolSettings {
  connectionString: string;
  max: number;
  statement_timeout: number;
  idle_in_transaction_session_timeout: number;
  connectionTimeoutMillis: number;
  idleTimeoutMillis: number;
  ssl?: { rejectUnauthorized: boolean };
}

/**
 * node-postgres pool settings for Neon (or any hosted Postgres).
 *
 * - Small pool: serverless runs many instances, each with its own pool, and
 *   Neon's pooled endpoint multiplexes them. A large per-instance pool just
 *   exhausts the server's connection limit under load.
 * - statement_timeout: one runaway query cannot hold a connection forever.
 * - idle_in_transaction_session_timeout: a request that crashes mid-
 *   transaction releases its locks.
 * - SSL on for any non-local host (Neon requires it); a `sslmode` in the URL
 *   still takes precedence, as node-postgres merges it over these options.
 */
export function poolSettings(connectionString: string, env: Env, role: "app" | "auth" = "app"): PoolSettings {
  const num = (key: string, fallback: number) => {
    const v = Number(env[key]);
    return Number.isFinite(v) && v > 0 ? v : fallback;
  };
  let local = false;
  try {
    const host = new URL(connectionString).hostname;
    local = host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
  } catch {
    // Not a URL (e.g. key=value form) — leave SSL to the string itself.
    local = true;
  }
  const settings: PoolSettings = {
    connectionString,
    max: role === "auth" ? num("PG_AUTH_POOL_MAX", 2) : num("PG_POOL_MAX", 5),
    statement_timeout: num("PG_STATEMENT_TIMEOUT_MS", 15_000),
    idle_in_transaction_session_timeout: num("PG_IDLE_TX_TIMEOUT_MS", 30_000),
    connectionTimeoutMillis: num("PG_CONNECT_TIMEOUT_MS", 10_000),
    idleTimeoutMillis: 10_000,
  };
  if (!local) settings.ssl = { rejectUnauthorized: true };
  return settings;
}
