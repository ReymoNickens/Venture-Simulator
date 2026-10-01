// The owner's access check, in its own module: it is imported by server
// function files that pages also import, so it must not pull in database or
// auth code (only the handlers run on the server).
import { AppError } from "./errors";

export async function requireOwner(code: string) {
  // Loaded here, not at the top: this module is also imported by pages, and
  // only the handlers run on the server.
  const { createHash, timingSafeEqual } = await import("node:crypto");
  const digest = (v: string) => createHash("sha256").update(v).digest();
  const expected = process.env.OWNER_ACCESS_CODE?.trim();
  if (!expected) {
    throw new AppError(
      "NOT_CONFIGURED",
      "The owner page is not switched on yet. Add OWNER_ACCESS_CODE to the app's environment variables, then redeploy.",
    );
  }
  // Compare digests so the check takes the same time whatever was typed.
  if (!timingSafeEqual(digest(code.trim()), digest(expected))) {
    throw new AppError("FORBIDDEN", "That owner access code is not right.");
  }
}
