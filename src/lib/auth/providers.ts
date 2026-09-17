/**
 * Upstream identity providers this app offers for sign-in, via Better Auth's
 * own built-in `socialProviders` (Google, X) — configured directly with this
 * app's own OAuth app credentials. No external auth broker is involved.
 *
 * Source of truth for BOTH the server (`server.ts`, which of these get a
 * `socialProviders` entry) and the client (`client.ts` / sign-in buttons).
 * Kept in its own dependency-free module so the client can import it without
 * pulling the server-only Better Auth instance (and `pg`) into the browser
 * bundle.
 *
 * `providerId` is Better Auth's built-in social provider id — also the OAuth
 * callback path segment (`/api/auth/callback/<providerId>`).
 */
export type AuthProvider = {
  providerId: "google" | "twitter";
  /** Human label for the sign-in button. */
  label: string;
};

export const AUTH_PROVIDERS: readonly AuthProvider[] = [
  { providerId: "google", label: "Google" },
  { providerId: "twitter", label: "X" },
];
