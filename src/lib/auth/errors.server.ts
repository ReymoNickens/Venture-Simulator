import { randomBytes } from "node:crypto";
import { isRedirect, isNotFound } from "@tanstack/react-router";
import { AppError } from "@/lib/server/app-error";
import { InputError } from "@/lib/domain/schemas";
import { UnauthorizedError } from "./verify.server";
import { logServerError } from "@/lib/server/log-scrub";

/**
 * The one place server-function errors are turned into what the student sees.
 *
 * - AppError / InputError: written for the student — passed through.
 * - Sign-in required, redirects, not-found: passed through (the client and
 *   router depend on them).
 * - Anything else (a SQL error, a provider error, a bug): logged here with a
 *   request id, and replaced by a generic message. SQL text, table names,
 *   constraint names and provider error bodies never reach the browser.
 */
export function toSafeError(err: unknown, method: string): unknown {
  if (err instanceof AppError || err instanceof InputError) return err;
  if (err instanceof UnauthorizedError) return err;
  if (isRedirect(err) || isNotFound(err)) return err;
  const ref = randomBytes(4).toString("hex");
  logServerError(ref, err);
  const doing = method === "GET" ? "load that" : "save that";
  return new AppError("INTERNAL", `We couldn't ${doing}. Please try again. (ref ${ref})`);
}
