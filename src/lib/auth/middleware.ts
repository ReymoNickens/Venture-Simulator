import { createMiddleware } from "@tanstack/react-start";

/**
 * Auth middleware for server functions — the standard way to get the caller's
 * verified user id. The session cookie is same-origin and rides along
 * automatically.
 *
 *   import { createServerFn } from "@tanstack/react-start";
 *   import { getSql } from "@/lib/db";
 *   import { authMiddleware } from "@/lib/auth/middleware";
 *
 *   export const listTodos = createServerFn({ method: "GET" })
 *     .middleware([authMiddleware])
 *     .handler(async ({ context }) => {
 *       const sql = await getSql();
 *       return sql`select * from todos where user_id = ${context.userId}`;
 *     });
 *
 * Signed out with auth on -> throws `UnauthorizedError`
 * (see `verify.server.ts`). With auth disabled (`VITE_AUTH_ENABLED=false`) it
 * resolves the shared dev user — but throws instead when a
 * `DATABASE_URL` is also set, so an app without sign-in must not use this at
 * all. On the auth-on path, use it on every server function that touches
 * per-user data and scope every query by `context.userId`.
 */
export const authMiddleware = createMiddleware({ type: "function" })
  .server(async (ctx) => {
    // ONLY import `*.server` modules here, so Vite does not ship
    // `@tanstack/react-start/server` to the browser.
    const { toSafeError } = await import("./errors.server");
    try {
      const { assertSameSiteRequest } = await import("./isolation.server");
      const { requireUserId } = await import("./verify.server");
      const { runInScope } = await import("@/lib/db");
      // Reject scripted cross-site/sibling requests before touching per-user data.
      assertSameSiteRequest();
      const userId = await requireUserId();
      // Bind every getSql() call the handler makes to one transaction, running
      // as the restricted app_runtime role with this user's id set for RLS
      // (see src/lib/db.ts `runInScope`) — not the privileged migration role.
      return await runInScope({ kind: "user", userId }, () => ctx.next({ context: { userId } }));
    } catch (err) {
      // Input validation runs after this middleware (as the last link in the
      // chain), so its errors pass through here too.
      throw toSafeError(err, methodOf(ctx));
    }
  });

/**
 * Verifies the caller like `authMiddleware` but does NOT open the per-request
 * database transaction. For handlers that must not hold a pooled connection
 * while they wait on something slow (the AI advisor): they call `runInScope`
 * themselves, once before and once after the slow part.
 */
export const authNoScopeMiddleware = createMiddleware({ type: "function" })
  .server(async (ctx) => {
    const { toSafeError } = await import("./errors.server");
    try {
      const { assertSameSiteRequest } = await import("./isolation.server");
      const { requireUserId } = await import("./verify.server");
      assertSameSiteRequest();
      const userId = await requireUserId();
      return await ctx.next({ context: { userId } });
    } catch (err) {
      throw toSafeError(err, methodOf(ctx));
    }
  });

/** Same error handling for server functions that need no sign-in. */
export const publicMiddleware = createMiddleware({ type: "function" })
  .server(async (ctx) => {
    const { toSafeError } = await import("./errors.server");
    try {
      return await ctx.next();
    } catch (err) {
      throw toSafeError(err, methodOf(ctx));
    }
  });

function methodOf(ctx: unknown): string {
  const method = (ctx as { method?: unknown }).method;
  return typeof method === "string" ? method.toUpperCase() : "POST";
}
