// @ts-check
/**
 * The sign-out sequence used by `src/lib/auth/client.ts`, kept here as a pure
 * module so its effects can be unit-tested (`node --test` only covers
 * `scripts/`), the same split `migration-plan.mjs` uses for the two appliers.
 *
 * The session rides an HttpOnly `__Host-` cookie that JS cannot delete. ONLY a
 * completed sign-out response clears it, and `server.ts` enables
 * `session.cookieCache` (maxAge 300), so `/get-session` would keep answering
 * from the cached cookie for minutes afterwards. Redirecting on a timeout
 * would show the visitor "signed out" while their session is still live — so
 * sign-out fails loudly instead of pretending.
 */

/**
 * Generous, because only the server can end the session — but still bounded,
 * so a wedged request reports failure the visitor can retry instead of
 * spinning forever. A sign-out still unanswered at 10s is not going to land.
 */
export const SIGN_OUT_TIMEOUT_MS = 10_000;

/**
 * Run `start()` but give up after `timeoutMs`, reporting which happened. Never
 * rejects — callers decide what a failure means, and a `try/catch` around an
 * `await` does nothing for a promise that never settles.
 * @param {() => unknown} start
 * @param {number} timeoutMs
 * @returns {Promise<"ok" | "failed" | "timeout">}
 */
export function settleWithin(start, timeoutMs) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve("timeout"), timeoutMs);
    /** @param {"ok" | "failed"} outcome */
    const done = (outcome) => {
      clearTimeout(timer);
      resolve(outcome);
    };
    try {
      Promise.resolve(start()).then(
        () => done("ok"),
        () => done("failed"),
      );
    } catch {
      done("failed");
    }
  });
}

/**
 * @typedef {object} SignOutSteps
 * @property {() => unknown} requestSignOut Ask the server to end the session; must reject on a failed response.
 * @property {() => void} redirect Leave the page.
 * @property {number} [timeoutMs]
 */

/**
 * End the session, then redirect — only if the server confirmed, because
 * nothing else can clear the cookie. A failed or timed-out sign-out throws
 * rather than reporting a sign-out that did not happen.
 * @param {SignOutSteps} steps
 * @returns {Promise<void>}
 */
export async function runSignOut({ requestSignOut, redirect, timeoutMs = SIGN_OUT_TIMEOUT_MS }) {
  const outcome = await settleWithin(requestSignOut, timeoutMs);
  if (outcome !== "ok") {
    throw new Error(
      outcome === "timeout"
        ? "Sign-out timed out — you are still signed in. Please try again."
        : "Sign-out failed — you are still signed in. Please try again.",
    );
  }
  redirect();
}

/**
 * @typedef {object} PreSignInSteps
 * @property {() => unknown} requestSignOut Ask the server to end any prior session.
 * @property {number} [timeoutMs]
 */

/**
 * Drop any prior session before a new sign-in starts, so signing in as
 * someone else on a shared phone actually switches identity.
 *
 * Deliberately BEST EFFORT — unlike `runSignOut` this never throws. It also
 * runs when there is no prior session at all, so treating a failure as fatal
 * would block first-time sign-in on a transport hiccup, for a visitor with no
 * session to protect. Only the wait is bounded.
 * @param {PreSignInSteps} steps
 * @returns {Promise<void>}
 */
export async function runPreSignInSignOut({ requestSignOut, timeoutMs = SIGN_OUT_TIMEOUT_MS }) {
  await settleWithin(requestSignOut, timeoutMs);
}
