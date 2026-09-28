/**
 * Self-hosted Better Auth for THIS app (server-only).
 *
 * The app runs its own Better Auth at `/api/auth/*`, so the session cookie stays
 * on this app's own origin. Sign-in is email/password only, but the "email"
 * side of it is really an index number: this app has no open self-registration
 * — an instructor pre-loads the student roster (`scripts/roster-import.mjs`)
 * with each student's institutional email + index number ahead of time, and a
 * student "activates" their own account by supplying a password that matches
 * an unclaimed roster row. From then on they can sign in with EITHER their
 * email (Better Auth's built-in `emailAndPassword`) OR their index number
 * (the `username` plugin, index number doubles as the username) — see the
 * `databaseHooks.user.create` below and `client.ts`'s `signIn`/`activateAccount`.
 *
 * Modes:
 *   - Deployed: set `BETTER_AUTH_URL` + `DATABASE_URL` + `BETTER_AUTH_SECRET`.
 *   - Local (`npm run dev` / `npm run preview`): no fixed URL needed; Better
 *     Auth derives the origin from the loopback host (see `baseURL` below).
 *     Sessions persist in the embedded PGLite DB (same DB as app data); a
 *     process restart wipes both.
 *   - Off (`VITE_AUTH_ENABLED=false`): no sign-in; `requireUserId` resolves a
 *     dev user with no database configured, and throws fail-closed once
 *     `DATABASE_URL` is set (see `verify.server.ts`).
 *
 * NEVER import this from client code — it pulls in `pg` + server-only Better
 * Auth internals. The client uses `@/lib/auth/client`; components read the
 * user via `@/lib/auth/use-current-user`; server functions get a verified id
 * via `@/lib/auth/middleware`.
 */
import { betterAuth } from "better-auth";
import { username } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { APIError } from "better-auth/api";
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { ensureDbReady, getPglite, getSql, withRlsBypass } from "../db";
import { newId } from "../utils";
import { expectedStaffCode, staffCodeMatches } from "../server/staff-code";
import { emailAndPasswordEnabled } from "./email-password";
import { pgliteDialect } from "./pglite-dialect";

// Kick (and share) PGLite bootstrap as soon as the auth server module loads.
void ensureDbReady();

/**
 * Local secret must outlive module reloads: PGLite (and its session rows) is
 * stored on `globalThis`, so an HMR re-eval of this file must NOT mint a new
 * signing secret or every existing session becomes invalid mid-dev. Process
 * restart clears both the secret and PGLite together.
 */
const globalAuthRef = globalThis as typeof globalThis & {
  __localAuthSecret__?: string;
};
function localAuthSecret(): string {
  globalAuthRef.__localAuthSecret__ ??= randomBytes(32).toString("hex");
  return globalAuthRef.__localAuthSecret__;
}

/** Read an env var, treating empty/whitespace as unset. */
const env = (key: string): string | undefined => {
  const value = process.env[key]?.trim();
  return value ? value : undefined;
};

// Explicit off-switch. Set to "false" to force auth off everywhere (dev user).
const authDisabled = env("VITE_AUTH_ENABLED") === "false";

/** True when real auth (email/index-number + password) is enforced. */
export const authConfigured = !authDisabled;

// This app's own Better Auth origin. Set `BETTER_AUTH_URL` when deployed.
// Locally there's no fixed URL, so Better Auth derives the origin per-request
// from the host, validated against the loopback hosts below.
const explicitBaseURL = env("BETTER_AUTH_URL");
// Local `npm run dev` (port 8080) and `npm run preview` (port 8081, the local
// production build); both ports are fixed in vite.config.ts. Browsers may send
// Origin as any of these for the same server — trusting only `localhost`
// rejects `127.0.0.1` and breaks email/password with "Invalid origin".
const LOCAL_DEV_ORIGINS: string[] = ["8080", "8081"].flatMap((port) => [
  `http://localhost:${port}`,
  `http://127.0.0.1:${port}`,
  `http://[::1]:${port}`,
]);
const baseURL = explicitBaseURL ?? {
  allowedHosts: ["localhost", "127.0.0.1", "[::1]"],
  protocol: "http" as const,
  fallback: "http://localhost:8080",
};

// Origins Better Auth accepts on credentialed POSTs (sign-up/sign-in, etc.).
// Missing entries here surface as FORBIDDEN "Invalid origin".
const trustedOrigins: string[] = explicitBaseURL
  ? [explicitBaseURL, ...LOCAL_DEV_ORIGINS]
  : LOCAL_DEV_ORIGINS;

const databaseUrl = env("DATABASE_URL");

// Real Postgres when `DATABASE_URL` is set (deployed apps), else the app's
// embedded PGLite (local) via a Kysely dialect — so Better Auth persists to the
// SAME DB as app data. Both use the Better Auth schema in
// `migrations/0001_auth.sql`.
const database = databaseUrl
  ? new Pool({ connectionString: databaseUrl })
  : { dialect: pgliteDialect(() => getPglite()), type: "postgres" as const };

/** Prefix for this app's auth cookie names. */
const COOKIE_PREFIX = "__Host-evp-auth";

type RosterMatch = { id: string; full_name: string };

/** The staff access code a lecturer sign-up carries in its body, or null for a student sign-up. */
function staffCodeFrom(ctx: { body?: unknown } | null | undefined): string | null {
  const code = (ctx?.body as { staffCode?: unknown } | undefined)?.staffCode;
  return typeof code === "string" ? code : null;
}

/** A user object mid-creation, as Better Auth's `databaseHooks` hand it to us. */
type CreatingUser = { email?: string; username?: string } & Record<string, unknown>;

export const auth = betterAuth({
  baseURL,
  // Deployed apps set BETTER_AUTH_SECRET. Locally: a process-stable secret on
  // globalThis so HMR doesn't invalidate PGLite-backed sessions (see above).
  secret: env("BETTER_AUTH_SECRET") ?? localAuthSecret(),
  database,

  // CSRF / origin check for credentialed auth POSTs (email sign-up/sign-in, …).
  // See `trustedOrigins` construction above — must cover the deployed URL AND
  // local loopback variants, or clients get "Invalid origin".
  trustedOrigins,

  // Enforces "no self-serve sign-up". A `/sign-up/email` call succeeds only:
  //  - for a student, when it matches an UNCLAIMED roster row an instructor
  //    pre-loaded (scripts/roster-import.mjs); the account is bound to that row
  //    and takes its name from the roster, not whatever the client submitted;
  //  - for a lecturer, when it carries the staff access code (STAFF_ACCESS_CODE;
  //    see src/lib/server/staff-code.ts); the account is recorded as staff.
  databaseHooks: {
    user: {
      create: {
        before: async (user: CreatingUser, ctx) => {
          const email = user.email?.trim().toLowerCase();
          const staffCode = staffCodeFrom(ctx);
          if (staffCode !== null) {
            if (!email) throw new APIError("BAD_REQUEST", { message: "Email is required." });
            if (!expectedStaffCode()) {
              throw new APIError("FORBIDDEN", {
                message: "Lecturer sign-up is not open. Ask your course administrator.",
              });
            }
            if (!staffCodeMatches(staffCode)) {
              throw new APIError("FORBIDDEN", { message: "That staff access code is not right." });
            }
            const name = String(user.name ?? "").trim();
            if (name.length < 3) throw new APIError("BAD_REQUEST", { message: "Enter your full name." });
            // Never let a staff account take an index number (student sign-in).
            return { data: { ...user, email, name, username: undefined, displayUsername: undefined } };
          }
          const username = user.username?.trim().toUpperCase();
          if (!email || !username) {
            throw new APIError("BAD_REQUEST", {
              message: "Email and index number are required.",
            });
          }
          const sql = await getSql();
          const rows = await sql<RosterMatch>`
            select id, full_name from students
            where auth_user_id is null
              and lower(email) = ${email}
              and index_number = ${username}
            limit 1
          `;
          if (!rows[0]) {
            throw new APIError("FORBIDDEN", {
              message:
                "No matching student record. Ask your lecturer to add you to the roster.",
            });
          }
          return { data: { ...user, name: rows[0].full_name, username, displayUsername: username } };
        },
        after: async (user: { id: string; email: string; name: string }, ctx) => {
          const sql = await getSql();
          if (staffCodeFrom(ctx) !== null) {
            // The access code was checked in `before`; it is the authority for
            // this row, written before the account holds any role.
            await withRlsBypass(async () => {
              await sql`
                insert into staff (id, auth_user_id, full_name)
                values (${newId()}, ${user.id}, ${user.name})
                on conflict (auth_user_id) do nothing
              `;
            });
            return;
          }
          await sql`
            update students set auth_user_id = ${user.id}, updated_at = now()
            where auth_user_id is null and lower(email) = ${user.email.toLowerCase()}
          `;
        },
      },
    },
  },

  // Cache the session in the short-lived signed `session_data` cookie so reads
  // (incl. the client's `/get-session`) skip the DB — this shrinks the "loading"
  // window and reduces auth flicker. See the `auth` skill for the full
  // flicker-prevention guidance (gate on `isPending`; SSR the session).
  session: { cookieCache: { enabled: true, maxAge: 300 } },

  // Local email/password — toggled only via `./email-password` (not a plugin).
  ...(emailAndPasswordEnabled ? { emailAndPassword: { enabled: true } } : {}),

  // `__Host-` prefixed cookies: the browser REFUSES any same-named cookie that
  // carries a `Domain` attribute, so a sibling subdomain cannot "toss" a
  // parent-domain session cookie onto this app. `__Host-` requires Secure +
  // Path=/ + no Domain; Better Auth otherwise uses `__Secure-` (which permits
  // Domain), so we drop its auto prefix (`useSecureCookies: false`) and set
  // Secure + the names ourselves. (Browsers allow Secure cookies on
  // `http://localhost`, so local dev still works.)
  advanced: {
    useSecureCookies: false,
    defaultCookieAttributes: { secure: true, sameSite: "lax", path: "/" },
    cookies: {
      session_token: { name: `${COOKIE_PREFIX}.session_token` },
      session_data: { name: `${COOKIE_PREFIX}.session_data` },
      account_data: { name: `${COOKIE_PREFIX}.account_data` },
      dont_remember: { name: `${COOKIE_PREFIX}.dont_remember` },
    },
  },

  plugins: [
    // Index number doubles as the Better Auth "username", so sign-in accepts
    // either identifier (see `client.ts`'s `signIn`). Normalized/validated the
    // same way `upsertProfile` treats an index number: trimmed, uppercased, any
    // non-empty value — student index numbers aren't alphanumeric-only.
    username({
      minUsernameLength: 1,
      maxUsernameLength: 64,
      usernameValidator: (value) => value.trim().length > 0,
      usernameNormalization: (value) => value.trim().toUpperCase(),
    }),

    // Bridges Better Auth's Set-Cookie into TanStack Start responses. MUST be
    // last so it runs after every other plugin's hooks.
    tanstackStartCookies(),
  ],
});

