// The owner's classes. Protected by OWNER_ACCESS_CODE; the handlers run with
// the RLS bypass on (codeCheckedMiddleware), so each checks the code first.
// Students pick their class from this list (src/routes/onboarding.tsx).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { codeCheckedMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { listCourses, type CourseRow } from "@/lib/classes/service";
import { createClass, ownerClasses, type OwnerClassRow } from "@/lib/classes/owner";
import { heldMessages, type HeldMessage } from "@/lib/sms/arkesel";
import { requireOwner } from "./owner";
import { parseInput } from "./validate";

const ownerCode = z.string().min(1).max(200);

export interface OwnerPageData {
  courses: CourseRow[];
  classes: OwnerClassRow[];
  /** Semester and year of the newest class, to prefill the next one. */
  defaults: { semester: string; academicYear: string };
  /** False until ARKESEL_API_KEY and ARKESEL_SENDER_ID are set. */
  smsLive: boolean;
  /** Sign-in codes waiting to be read here while texts are off. */
  heldTexts: HeldMessage[];
}

export const getOwnerPage = createServerFn({ method: "POST" })
  .middleware([codeCheckedMiddleware])
  .validator(parseInput(z.object({ ownerCode })))
  .handler(async ({ data }): Promise<OwnerPageData> => {
    await requireOwner(data.ownerCode);
    const sql = await getSql();
    const smsLive = Boolean(process.env.ARKESEL_API_KEY?.trim() && process.env.ARKESEL_SENDER_ID?.trim());
    const [courses, classes, latest, heldTexts] = await Promise.all([
      listCourses(sql),
      ownerClasses(sql),
      sql<{ semester: string; academic_year: string }>`
        select semester, academic_year from course_offerings where id <> 'demo_tour' order by created_at desc limit 1
      `,
      smsLive ? Promise.resolve([]) : heldMessages(sql),
    ]);
    return {
      courses,
      classes,
      defaults: { semester: latest[0]?.semester ?? "Semester 1", academicYear: latest[0]?.academic_year ?? "" },
      smsLive,
      heldTexts,
    };
  });

export const createOwnerClass = createServerFn({ method: "POST" })
  .middleware([codeCheckedMiddleware])
  .validator(
    parseInput(
      z.object({
        ownerCode,
        courseId: z.string().min(1).max(80),
        programme: z.string().max(120),
        level: z.string().max(40),
        semester: z.string().max(40),
        academicYear: z.string().max(20),
      }),
    ),
  )
  .handler(async ({ data }) => {
    await requireOwner(data.ownerCode);
    return createClass(await getSql(), data);
  });
