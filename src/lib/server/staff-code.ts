import { timingSafeEqual } from "node:crypto";
import { dbSource } from "../db";

/** Demo code, accepted only on the embedded preview database. */
export const PREVIEW_STAFF_CODE = "DEMO-STAFF";

/**
 * The code a lecturer must enter to create a staff account: STAFF_ACCESS_CODE
 * on the server, or the demo code on the embedded preview database. Null means
 * staff sign-up is closed.
 */
export function expectedStaffCode(): string | null {
  const configured = process.env.STAFF_ACCESS_CODE?.trim();
  return configured || (dbSource === "pglite" ? PREVIEW_STAFF_CODE : null);
}

export function staffCodeMatches(code: string): boolean {
  const expected = expectedStaffCode();
  if (!expected) return false;
  const a = Buffer.from(code.trim());
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
