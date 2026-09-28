import { createServerFn } from "@tanstack/react-start";
import { dbSource, PREVIEW_ROSTER } from "@/lib/db";
import { PREVIEW_STAFF_CODE } from "./staff-code";

/**
 * Demo credentials for the login page, only on the embedded preview database
 * (never with a real DATABASE_URL), so a local preview can be tried as a
 * student or a lecturer.
 */
export const getSignInHints = createServerFn({ method: "GET" }).handler(async () => {
  if (dbSource !== "pglite") return null;
  const student = PREVIEW_ROSTER[0];
  return {
    student: { email: student.email, indexNumber: student.indexNumber },
    staffCode: process.env.STAFF_ACCESS_CODE?.trim() ? null : PREVIEW_STAFF_CODE,
  };
});
