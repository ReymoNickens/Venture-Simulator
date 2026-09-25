import { createAuthClient } from "better-auth/react";
import { usernameClient } from "better-auth/client/plugins";
import { runPreSignInSignOut, runSignOut } from "../../../scripts/sign-out-plan.mjs";

/**
 * Better Auth client for this React SPA (browser-side).
 *
 * Talks to this app's OWN Better Auth at same-origin `/api/auth/*`; the session
 * is an HttpOnly cookie on this origin.
 *
 * To sign out call `signOut()` below, NOT `authClient.signOut()`: it also
 * forgets the offline user and fails loudly if the server never confirms.
 */
export const authClient = createAuthClient({
  plugins: [usernameClient()],
});

/**
 * True when sign-in UI should be shown — i.e. whenever `VITE_AUTH_ENABLED` is
 * not `"false"`. Setting it to `"false"` selects a shared dev user (see
 * `use-current-user`), which the server refuses once `DATABASE_URL` is set.
 */
export const authEnabled = import.meta.env.VITE_AUTH_ENABLED !== "false";

/**
 * Sign in with EITHER a student's email address or their index number, plus
 * their password. An identifier containing "@" is treated as an email
 * (Better Auth's built-in `emailAndPassword`); anything else is treated as an
 * index number (the `username` plugin — see `server.ts`).
 *
 * Ends any existing session first, so signing in as someone else on a shared
 * phone actually switches identity.
 */
export async function signIn(identifier: string, password: string): Promise<void> {
  await runPreSignInSignOut({ requestSignOut: () => authClient.signOut() });

  const trimmed = identifier.trim();
  const { error } = trimmed.includes("@")
    ? await authClient.signIn.email({ email: trimmed, password })
    : await authClient.signIn.username({ username: trimmed, password });
  if (error) throw new Error(error.message ?? "Sign-in failed");
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
  const { error } = await authClient.signUp.email({
    email: input.email.trim(),
    password: input.password,
    // Overwritten server-side from the roster row once the match succeeds.
    name: input.indexNumber.trim(),
    username: input.indexNumber.trim(),
  });
  if (error) throw new Error(error.message ?? "Could not activate your account.");
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
  const { error } = await authClient.signUp.email(body);
  if (error) throw new Error(error.message ?? "Could not create your account.");
}

/**
 * Sign out, forget the offline user on this device, then redirect.
 *
 * Use this, never `authClient.signOut()` — see the note on `authClient`.
 * Sequencing lives in `scripts/sign-out-plan.mjs` so it can be unit-tested.
 *
 * **Rejects if the server never confirms.** The session is an HttpOnly cookie
 * only the server can clear, so redirecting anyway would report a sign-out
 * that did not happen. `<UserButton />` handles that for you; a hand-rolled
 * control must catch it and let the visitor retry.
 */
export async function signOut(redirectTo = "/"): Promise<void> {
  const { forgetUser } = await import("./offline-user");
  forgetUser();
  await runSignOut({
    // Better Auth resolves with `{ error }` instead of rejecting, so surface a
    // failed response as a rejection for the sequence to act on.
    requestSignOut: async () => {
      const { error } = await authClient.signOut();
      if (error) throw new Error(error.message ?? "Sign-out failed");
    },
    redirect: () => {
      window.location.href = redirectTo;
    },
  });
}
