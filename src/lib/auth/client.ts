import { createAuthClient } from "better-auth/react";
import { usernameClient } from "better-auth/client/plugins";
import { runPreSignInSignOut, runSignOut } from "../../../scripts/sign-out-plan.mjs";

/**
 * Better Auth client for this React SPA (browser-side).
 *
 * Talks to this app's OWN Better Auth at same-origin `/api/auth/*`. In the live
 * preview the app is an embedded iframe with PARTITIONED cookies, so it can't
 * read the session cookie — it authenticates with a bearer token instead
 * (Better Auth's `bearer()` plugin returns the token in the sign-in response
 * body itself; see `signIn`/`activateAccount` below). The `onRequest` hook
 * attaches that token when present; when deployed (cookie auth) no token is
 * stored, so nothing changes.
 *
 * To sign out call `signOut()` below, NOT `authClient.signOut()`: the raw call
 * leaves the bearer token in place, and `onRequest` keeps re-attaching it, so
 * the visitor stays signed in.
 */
export const authClient = createAuthClient({
  plugins: [usernameClient()],
  fetchOptions: {
    onRequest(ctx) {
      const token = getBearerToken();
      if (token) ctx.headers.set("Authorization", `Bearer ${token}`);
      return ctx;
    },
  },
});

/**
 * True when sign-in UI should be shown — i.e. whenever `VITE_AUTH_ENABLED` is
 * not `"false"`. The shipped template sets it to `"false"`
 * (`.grok/app-env.json`), which selects the dev user (see `use-current-user`);
 * with the key removed, sign-in is real in preview (embedded PGLite) and when
 * deployed (real Postgres).
 */
export const authEnabled = import.meta.env.VITE_AUTH_ENABLED !== "false";

// ── Live-preview bearer token ────────────────────────────────────────────────
// The embedded preview iframe has partitioned cookies, so we keep the session's
// bearer token in sessionStorage and attach it to every Better Auth request (and
// to server functions, via `@/lib/auth/middleware`). Empty everywhere except the
// preview, so the cookie path is untouched elsewhere.
const BEARER_KEY = "grok-auth.bearer-token";

/** The stored preview bearer token, or null. */
export function getBearerToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(BEARER_KEY);
  } catch {
    return null;
  }
}

function setBearerToken(token: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (token) window.sessionStorage.setItem(BEARER_KEY, token);
    else window.sessionStorage.removeItem(BEARER_KEY);
  } catch {
    /* storage unavailable — ignore */
  }
}

/** True inside the sandbox live-preview iframe (`*.grok-sandbox.com`). */
function inLivePreview(): boolean {
  return (
    typeof window !== "undefined" &&
    window.location.hostname.endsWith(".grok-sandbox.com")
  );
}

/** Read the bearer token Better Auth's `bearer()` plugin returns on sign-in. */
function tokenFromResponse(data: unknown): string | null {
  const token = (data as { token?: unknown } | null)?.token;
  return typeof token === "string" && token ? token : null;
}

/**
 * Sign in with EITHER a student's email address or their index number, plus
 * their password. An identifier containing "@" is treated as an email
 * (Better Auth's built-in `emailAndPassword`); anything else is treated as an
 * index number (the `username` plugin — see `server.ts`).
 *
 * Clears any existing local session first so switching identities actually
 * switches identity, then stores the returned bearer token (harmless outside
 * the live preview; needed inside it, since its iframe cookies are
 * partitioned).
 */
export async function signIn(identifier: string, password: string): Promise<void> {
  await runPreSignInSignOut({
    livePreview: inLivePreview(),
    hasBearer: Boolean(getBearerToken()),
    requestSignOut: () => authClient.signOut(),
    clearToken: () => setBearerToken(null),
  });

  const trimmed = identifier.trim();
  const { data, error } = trimmed.includes("@")
    ? await authClient.signIn.email({ email: trimmed, password })
    : await authClient.signIn.username({ username: trimmed, password });
  if (error) throw new Error(error.message ?? "Sign-in failed");
  setBearerToken(tokenFromResponse(data));
}

/**
 * Activate a pre-provisioned student account: the instructor has already
 * loaded this student's email + index number into the roster
 * (`scripts/roster-import.mjs`); this call sets their password and claims
 * that roster row. Fails when no unclaimed roster row matches BOTH the email
 * and the index number (see `server.ts`'s `databaseHooks.user.create`) — there
 * is no open self-registration.
 */
export async function activateAccount(input: {
  email: string;
  indexNumber: string;
  password: string;
}): Promise<void> {
  const { data, error } = await authClient.signUp.email({
    email: input.email.trim(),
    password: input.password,
    // Overwritten server-side from the roster row once the match succeeds.
    name: input.indexNumber.trim(),
    username: input.indexNumber.trim(),
  });
  if (error) throw new Error(error.message ?? "Could not activate your account.");
  setBearerToken(tokenFromResponse(data));
}

/**
 * Create a lecturer's account. The staff access code (STAFF_ACCESS_CODE on the
 * server) is the authority: `server.ts`'s `databaseHooks.user.create` rejects
 * the sign-up unless it matches, and then records the account as staff. The
 * lecturer picks their course on first visit to /lecturer.
 */
export async function createStaffAccount(input: {
  email: string;
  fullName: string;
  staffCode: string;
  password: string;
}): Promise<void> {
  // `staffCode` isn't a user field, so it isn't in the client's sign-up type;
  // the endpoint accepts extra body keys and the server hook reads it.
  const body = {
    email: input.email.trim(),
    password: input.password,
    name: input.fullName.trim(),
    staffCode: input.staffCode.trim(),
  };
  const { data, error } = await authClient.signUp.email(body);
  if (error) throw new Error(error.message ?? "Could not create your account.");
  setBearerToken(tokenFromResponse(data));
}

/**
 * Sign out of THIS app's local session, clear the preview token, then redirect.
 *
 * Use this, never `authClient.signOut()` — see the note on `authClient`.
 * Sequencing lives in `scripts/sign-out-plan.mjs` so it can be unit-tested.
 *
 * **Rejects when deployed if the server never confirms.** There the session is
 * an HttpOnly cookie only the server can clear, so redirecting anyway would
 * report a sign-out that did not happen. `<UserButton />` handles that for you;
 * a hand-rolled control must catch it and let the visitor retry. In the live
 * preview the local clear is sufficient, so it always resolves.
 */
export async function signOut(redirectTo = "/"): Promise<void> {
  const { forgetUser } = await import("./offline-user");
  forgetUser();
  await runSignOut({
    livePreview: inLivePreview(),
    hasBearer: Boolean(getBearerToken()),
    // Better Auth resolves with `{ error }` instead of rejecting, so surface a
    // failed response as a rejection for the sequence to act on.
    requestSignOut: async () => {
      const { error } = await authClient.signOut();
      if (error) throw new Error(error.message ?? "Sign-out failed");
    },
    clearToken: () => setBearerToken(null),
    redirect: () => {
      window.location.href = redirectTo;
    },
  });
}
