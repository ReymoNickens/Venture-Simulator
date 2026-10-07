import { createAuthClient } from "better-auth/react";
import { phoneNumberClient, usernameClient } from "better-auth/client/plugins";
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
  plugins: [usernameClient(), phoneNumberClient()],
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
  if (error) throw new Error(signInErrorMessage(error));
  setBearerToken(tokenFromResponse(data));
}

/**
 * Step 1 of phone sign-in: text a 6-digit code to this number (already
 * normalised to +233…, see src/lib/phone.ts).
 */
export async function sendPhoneCode(phone: string): Promise<void> {
  const { error } = await authClient.phoneNumber.sendOtp({ phoneNumber: phone });
  if (error) {
    if (error.status === 429) throw new Error("Too many codes asked for. Wait a minute, then try again.");
    throw new Error(error.message || "Could not send the code. Check the number and try again.");
  }
}

/**
 * Step 2: check the code. The first time, this creates the account; either
 * way it signs in.
 */
export async function verifyPhoneCode(phone: string, code: string): Promise<void> {
  await runPreSignInSignOut({
    livePreview: inLivePreview(),
    hasBearer: Boolean(getBearerToken()),
    requestSignOut: () => authClient.signOut(),
    clearToken: () => setBearerToken(null),
  });
  const { data, error } = await authClient.phoneNumber.verify({ phoneNumber: phone, code: code.trim() });
  if (error) {
    if (error.status === 429) throw new Error("Too many tries. Wait a minute, then ask for a new code.");
    throw new Error("That code is not right, or it has expired. Check the text message, or ask for a new code.");
  }
  setBearerToken(tokenFromResponse(data));
}

/** Google sign-in: leaves the app and comes back to `returnTo`. */
export async function signInWithGoogle(returnTo = "/studio"): Promise<void> {
  const { error } = await authClient.signIn.social({ provider: "google", callbackURL: returnTo });
  if (error) throw new Error(error.message || "Could not start Google sign-in.");
}

/**
 * Turn Better Auth's sign-in errors into a next step. The common case is a
 * student who never activated: their account does not exist until they do.
 */
export function signInErrorMessage(error: { status?: number; code?: string; message?: string }): string {
  const text = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
  if (error.status === 401 || /invalid (email|username)|password/.test(text)) {
    return "That email and password don't match an account. Students sign in with their phone number instead. Lecturers can ask the platform owner for a new password.";
  }
  if (error.status === 403 || /origin/.test(text)) {
    return "Sign-in isn't allowed from this web address. Open the app at venture-simulator.vercel.app and try again.";
  }
  if (error.status === 429) return "Too many attempts. Wait a minute, then try again.";
  return error.message || "Could not sign in. Check your connection and try again.";
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
 * A lecturer's first sign-in, after redeeming their invite code created a
 * pending staff record for this email (no index number: the sign-up hook
 * takes the lecturer path when username is absent).
 */
export async function createLecturerAccount(input: { email: string; password: string; fullName: string }): Promise<void> {
  const { data, error } = await authClient.signUp.email({
    email: input.email.trim(),
    password: input.password,
    name: input.fullName.trim(),
  });
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
