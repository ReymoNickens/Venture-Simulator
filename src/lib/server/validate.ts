import type { z } from "zod";
import { AppError } from "./errors.ts";

/**
 * Runtime input validation for server functions:
 *
 *   createServerFn({ method: "POST" })
 *     .middleware([authMiddleware])
 *     .validator(parseInput(MySchema))
 *
 * TypeScript types on a server function's input are erased at runtime, so a
 * hand-crafted request can send anything. New server functions (all of the
 * simulation ones) validate with zod here; a failure is a user-facing
 * INVALID error naming the first bad field, never a stack trace.
 */
export function parseInput<S extends z.ZodType>(schema: S): (input: unknown) => z.infer<S> {
  return (input: unknown) => {
    const result = schema.safeParse(input);
    if (result.success) return result.data;
    const issue = result.error.issues[0];
    const where = issue?.path.length ? `${issue.path.join(".")}: ` : "";
    throw new AppError("INVALID", `${where}${issue?.message ?? "Invalid input."}`);
  };
}
