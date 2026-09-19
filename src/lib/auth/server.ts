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
 *   - Deployed: set `BETTER_AUTH_URL` + `DATABASE_URL` (+ `BETTER_AUTH_SECRET`).
 *   - Sandbox live preview: no fixed URL (each preview gets a dynamic
 *     `https://*.grok-sandbox.com` host), so Better Auth derives the origin
 *     per-request (see `baseURL` below). Sessions persist in the embedded
 *     PGLite DB (same DB as app data); a process restart wipes both.
 *     Live-preview iframe clients use a bearer token (partitioned cookies) —
 *     see `client.ts`.
 *   - Off (`VITE_AUTH_ENABLED=false`, the shipped default): no providers;
 *     `requireUserId` resolves a dev user with no database configured, and
 *     throws fail-closed once `DATABASE_URL` is set (see `verify.server.ts`).
 *
 * NEVER import this from client code — it pulls in `pg` + server-only Better
 * Auth internals. The client uses `@/lib/auth/client`; components read the
 * user via `@/lib/auth/use-current-user`; server functions get a verified id
 * via `@/lib/auth/middleware`.
 */
import { betterAuth } from "better-auth";
import { bearer, username } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { getCookie } from "@tanstack/react-start/server";
import { APIError } from "better-auth/api";
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { ensureDbReady, getPglite, getSql } from "../db";
import { emailAndPasswordEnabled } from "./email-password";
import { GATE_PROVIDER_ID, gateIdentitySessions } from "./gate-session.server";
import { pgliteDialect } from "./pglite-dialect";
import { PREVIEW_ALLOWED_HOSTS } from "./preview";

// Kick (and share) PGLite bootstrap as soon as the auth server module loads.
void ensureDbReady();

/**
 * Preview secret must outlive module reloads: PGLite (and its session rows) is
 * stored on `globalThis`, so an HMR re-eval of this file must NOT mint a new
 * signing secret or every existing session becomes invalid mid-dev. Process
 * restart clears both the secret and PGLite together.
 */
const globalAuthRef = globalThis as typeof globalThis & {
  __grokAuthPreviewSecret__?: string;
};
function previewAuthSecret(): string {
  globalAuthRef.__grokAuthPreviewSecret__ ??= randomBytes(32).toString("hex");
  return globalAuthRef.__grokAuthPreviewSecret__;
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

// This app's own Better Auth origin. Set `BETTER_AUTH_URL` when deployed. In the
// sandbox live preview there's no fixed URL (each preview gets a dynamic
// `*.grok-sandbox.com` host), so we hand Better Auth a dynamic baseURL: it
// derives the origin per-request from the (proxied) host, validated against the
// preview allowlist.
const explicitBaseURL = env("BETTER_AUTH_URL");
// Vercel injects a unique URL per deployment (VERCEL_URL, no protocol) and a
// stable per-branch alias (VERCEL_BRANCH_URL) into EVERY deployment — preview
// and production alike, regardless of whether BETTER_AUTH_URL is set for that
// environment. Trusting these closes "Invalid origin" on preview deployments
// without needing a per-preview BETTER_AUTH_URL (which can't exist — every
// preview gets a fresh, unpredictable URL).
const vercelHosts: string[] = [env("VERCEL_URL"), env("VERCEL_BRANCH_URL")].filter(
  (h): h is string => Boolean(h),
);
const vercelOrigins: string[] = vercelHosts.map((h) => `https://${h}`);
// Explicit `string[]` (not a readonly tuple) — Better Auth's DynamicBaseURLConfig
// requires a mutable `allowedHosts: string[]`.
const previewAllowedHosts: string[] = [...PREVIEW_ALLOWED_HOSTS, ...vercelHosts];
// Local `npm run dev` (port 8080 contract). Browsers may send Origin as any of
// these for the same server — trusting only `localhost` rejects `127.0.0.1` and
// breaks email/password with "Invalid origin".
const LOCAL_DEV_ORIGINS: string[] = [
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://[::1]:8080",
];
const baseURL = explicitBaseURL ?? {
  // Include loopback hosts so dynamic baseURL resolves for local email/password
  // (not only the preview wildcard).
  allowedHosts: [...previewAllowedHosts, "localhost", "127.0.0.1", "[::1]"],
  // `auto` → trust both http:// and https:// expansions of allowedHosts
  // (preview is https; local dev is http).
  protocol: "auto" as const,
  fallback: "http://localhost:8080",
};

// Origins Better Auth accepts on credentialed POSTs (sign-up/sign-in, etc.).
// Missing entries here surface as FORBIDDEN "Invalid origin". vercelOrigins is
// included in BOTH branches: a Vercel deployment can have BETTER_AUTH_URL set
// for Production only, leaving Preview to hit the dynamic-baseURL branch below.
const trustedOrigins: string[] = explicitBaseURL
  ? [explicitBaseURL, ...vercelOrigins, ...LOCAL_DEV_ORIGINS]
  : [
      // Host wildcards (matched against Origin's host)
      ...previewAllowedHosts,
      // Full-origin wildcards (matched against Origin)
      ...previewAllowedHosts.flatMap((host) => [`https://${host}`, `http://${host}`]),
      ...LOCAL_DEV_ORIGINS,
    ];

const databaseUrl = env("DATABASE_URL");

// Real Postgres when `DATABASE_URL` is set (deployed apps), else the app's
// embedded PGLite (preview) via a Kysely dialect — so Better Auth persists to the
// SAME DB as app data, including email/password users. Both use the Better Auth
// schema from `migrations/auth/0001_auth.sql`, copied into `migrations/` when
// the app turns sign-in on.
const database = databaseUrl
  ? new Pool({ connectionString: databaseUrl })
  : { dialect: pgliteDialect(() => getPglite()), type: "postgres" as const };

/** Session token cookie name. */
export const SESSION_TOKEN_COOKIE = "__Host-grok-auth.session_token";

type RosterMatch = { id: string; full_name: string };

/** A user object mid-creation, as Better Auth's `databaseHooks` hand it to us. */
type CreatingUser = { email?: string; username?: string } & Record<string, unknown>;

export const auth = betterAuth({
  baseURL,
  // Deployed apps inject BETTER_AUTH_SECRET. Preview: process-stable secret on
  // globalThis so HMR doesn't invalidate PGLite-backed sessions (see above).
  secret: env("BETTER_AUTH_SECRET") ?? previewAuthSecret(),
  database,

  // CSRF / origin check for credentialed auth POSTs (email sign-up/sign-in, …).
  // See `trustedOrigins` construction above — must cover live preview hosts AND
  // local loopback variants, or clients get "Invalid origin".
  trustedOrigins,

  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: [GATE_PROVIDER_ID],
    },
  },

  // Enforces "no self-serve sign-up": a `/sign-up/email` call only succeeds
  // when it matches an UNCLAIMED roster row an instructor pre-loaded (see
  // scripts/roster-import.mjs) — the account is then bound to that row and
  // takes its name from the roster, not whatever the client submitted.
  databaseHooks: {
    user: {
      create: {
        before: async (user: CreatingUser) => {
          const email = user.email?.trim().toLowerCase();
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
                "No matching student record. Ask your instructor to add you to the roster.",
            });
          }
          return { data: { ...user, name: rows[0].full_name, username, displayUsername: username } };
        },
        after: async (user: { id: string; email: string }) => {
          const sql = await getSql();
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
  ...(emailAndPasswordEnabled
    ? { emailAndPassword: { enabled: true, minPasswordLength: 6 } }
    : {}),

  // `__Host-` prefixed cookies: the browser REFUSES any same-named cookie that
  // carries a `Domain` attribute, so a sibling `*.grok.me` app cannot "toss" a
  // `Domain=.grok.me` session cookie onto this app. `__Host-` requires Secure +
  // Path=/ + no Domain; Better Auth otherwise uses `__Secure-` (which permits
  // Domain), so we drop its auto prefix (`useSecureCookies: false`) and set
  // Secure + the names ourselves. (Browsers allow Secure cookies on
  // `http://localhost`, so local dev still works.)
  advanced: {
    useSecureCookies: false,
    defaultCookieAttributes: { secure: true, sameSite: "lax", path: "/" },
    cookies: {
      session_token: { name: SESSION_TOKEN_COOKIE },
      session_data: { name: "__Host-grok-auth.session_data" },
      account_data: { name: "__Host-grok-auth.account_data" },
      dont_remember: { name: "__Host-grok-auth.dont_remember" },
    },
  },

  plugins: [
    gateIdentitySessions(),

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

    // Accept `Authorization: Bearer <session-token>` as an alternative to the
    // cookie. Needed for the LIVE PREVIEW: the app runs in an embedded iframe
    // where cookies are partitioned, so sign-in also returns the token in its
    // response body and the client stores it (see `client.ts`). The hook only
    // fires when an Authorization header is present, so the cookie path
    // (deployed apps) is unaffected.
    bearer(),

    // Bridges Better Auth's Set-Cookie into TanStack Start responses. MUST be
    // last so it runs after every other plugin's hooks.
    tanstackStartCookies(),
  ],
});

export function readSessionToken(): string | null {
  return getCookie(SESSION_TOKEN_COOKIE) ?? null;
}
