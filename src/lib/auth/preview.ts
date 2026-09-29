/**
 * Live-preview host allowlist (server-only — NEVER import from the client).
 *
 * The sandbox serves each live preview on a dynamic `https://*.grok-sandbox.com`
 * URL. Better Auth derives the live preview's real origin from the request host
 * and validates it against this list (wildcard-matched), so both its dynamic
 * `baseURL` and `trustedOrigins` (see `server.ts`) accept that origin without a
 * fixed URL being configured.
 */
export const PREVIEW_ALLOWED_HOSTS = ["*.grok-sandbox.com"] as const;
