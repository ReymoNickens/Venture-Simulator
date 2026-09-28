/**
 * Refuse to serve a production deployment that has no database. Without
 * DATABASE_URL the app would quietly run on an in-memory database and lose
 * every student's work on the next cold start (see src/lib/db-config.ts).
 * Answering 503 on every request makes the misconfiguration impossible to miss.
 */
import { databaseGuardError } from "../../src/lib/db-config";

const guardError = databaseGuardError(process.env);

export default function dbGuardMiddleware(_event: unknown, next: () => unknown | Promise<unknown>): unknown {
  if (!guardError) return next();
  return new Response(
    "This site is not configured yet: its database connection is missing. " +
      "Your work has not been lost — please try again later.",
    { status: 503, headers: { "content-type": "text/plain; charset=utf-8", "retry-after": "300" } },
  );
}
