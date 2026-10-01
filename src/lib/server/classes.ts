// Server functions for class lists. Three audiences:
// - the platform owner, who proves themselves with OWNER_ACCESS_CODE and
//   issues one-time rep setup codes;
// - a course rep setting up, who proves themselves with that setup code;
// - a signed-in course rep keeping their class list up to date.
// The logic lives in src/lib/classes/service.ts; these wrappers authenticate,
// validate input and decide when the RLS bypass is allowed.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware, codeCheckedMiddleware } from "@/lib/auth/middleware";
import { getSql, withRlsBypass } from "@/lib/db";
import {
  classForRep,
  createRepCode,
  importClassList,
  listClassMembers,
  listCourses,
  MAX_ROWS,
  ownerOverview,
  previewRepCode,
  redeemRepCode,
  removeFromClassList,
  revokeRepCode,
  type ClassInfo,
  type ClassMember,
  type CodePreview,
  type CourseRow,
  type ImportOutcome,
  type OwnerClass,
  type OwnerCode,
} from "@/lib/classes/service";
import { AppError, logEvent, requireStudent } from "./authz";
import { parseInput } from "./validate";

// ------------------------------------------------------------------ owner

async function requireOwner(code: string) {
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

const ownerCode = z.string().min(1).max(200);

export interface OwnerPageData {
  courses: CourseRow[];
  codes: OwnerCode[];
  classes: OwnerClass[];
  /** Semester and year of the newest class, to prefill the next code. */
  defaults: { semester: string; academicYear: string };
}

export const getOwnerPage = createServerFn({ method: "POST" })
  .middleware([codeCheckedMiddleware])
  .validator(parseInput(z.object({ ownerCode })))
  .handler(async ({ data }): Promise<OwnerPageData> => {
    await requireOwner(data.ownerCode);
    const sql = await getSql();
    const [courses, overview, latest] = await Promise.all([
      listCourses(sql),
      ownerOverview(sql),
      sql<{ semester: string; academic_year: string }>`
        select semester, academic_year from course_offerings order by created_at desc limit 1
      `,
    ]);
    return {
      courses,
      ...overview,
      defaults: {
        semester: latest[0]?.semester ?? "Semester 1",
        academicYear: latest[0]?.academic_year ?? "",
      },
    };
  });

export const createOwnerRepCode = createServerFn({ method: "POST" })
  .middleware([codeCheckedMiddleware])
  .validator(
    parseInput(
      z.object({
        ownerCode,
        courseId: z.string().min(1).max(80),
        label: z.string().min(1).max(120),
        semester: z.string().min(1).max(40),
        academicYear: z.string().min(1).max(20),
      }),
    ),
  )
  .handler(async ({ data }) => {
    await requireOwner(data.ownerCode);
    return createRepCode(await getSql(), data);
  });

export const revokeOwnerRepCode = createServerFn({ method: "POST" })
  .middleware([codeCheckedMiddleware])
  .validator(parseInput(z.object({ ownerCode, id: z.string().min(1).max(80) })))
  .handler(async ({ data }) => {
    await requireOwner(data.ownerCode);
    await revokeRepCode(await getSql(), data.id);
    return { ok: true };
  });

// ------------------------------------------------------------ rep set-up

const repCode = z.string().min(4).max(40);

export const checkRepCode = createServerFn({ method: "POST" })
  .middleware([codeCheckedMiddleware])
  .validator(parseInput(z.object({ code: repCode })))
  .handler(async ({ data }): Promise<CodePreview> => previewRepCode(await getSql(), data.code));

export const setUpClass = createServerFn({ method: "POST" })
  .middleware([codeCheckedMiddleware])
  .validator(
    parseInput(
      z.object({
        code: repCode,
        fullName: z.string().min(1).max(120),
        email: z.string().min(3).max(200),
        indexNumber: z.string().min(1).max(40),
        programme: z.string().min(1).max(120),
        level: z.string().min(1).max(40),
      }),
    ),
  )
  .handler(async ({ data }) => {
    const result = await redeemRepCode(await getSql(), data);
    // The client activates the account next, with this email + index number.
    return { email: result.email, indexNumber: result.indexNumber, resumed: result.resumed };
  });

// ------------------------------------------------------- rep's class list

async function requireRepClass(userId: string): Promise<{ studentId: string; info: ClassInfo }> {
  const student = await requireStudent(userId);
  const info = await classForRep(await getSql(), student.id);
  if (!info) throw new AppError("FORBIDDEN", "Only the course rep can manage the class list.");
  return { studentId: student.id, info };
}

export interface MyClassData {
  info: ClassInfo;
  members: ClassMember[];
}

export const getMyClass = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<MyClassData | null> => {
    const student = await requireStudent(context.userId);
    const info = await classForRep(await getSql(), student.id);
    if (!info) return null;
    // Unactivated classmates are invisible to a student under RLS; the rep is
    // allowed to see their own class's list, which was just checked.
    const members = await withRlsBypass(async () => listClassMembers(await getSql(), info.offeringId));
    return { info, members };
  });

const person = z.object({
  row: z.number().int().min(1).max(100_000),
  fullName: z.string().max(200),
  email: z.string().max(300),
  indexNumber: z.string().max(80),
  programme: z.string().max(200).optional(),
});

export const uploadClassList = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(parseInput(z.object({ people: z.array(person).min(1).max(MAX_ROWS) })))
  .handler(async ({ context, data }): Promise<ImportOutcome[]> => {
    const { studentId, info } = await requireRepClass(context.userId);
    const outcomes = await withRlsBypass(async () => importClassList(await getSql(), info.offeringId, data.people));
    await logEvent({
      studentId,
      eventType: "class_list_uploaded",
      entityType: "course_offering",
      entityId: info.offeringId,
      metadata: {
        rows: data.people.length,
        added: outcomes.filter((o) => o.status === "added").length,
        updated: outcomes.filter((o) => o.status === "updated").length,
        skipped: outcomes.filter((o) => o.status === "skipped").length,
      },
    });
    return outcomes;
  });

export const removeClassMember = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(parseInput(z.object({ studentId: z.string().min(1).max(80) })))
  .handler(async ({ context, data }) => {
    const { studentId, info } = await requireRepClass(context.userId);
    await withRlsBypass(async () => removeFromClassList(await getSql(), info.offeringId, data.studentId));
    await logEvent({
      studentId,
      eventType: "class_list_removed",
      entityType: "course_offering",
      entityId: info.offeringId,
      metadata: { removedStudentId: data.studentId },
    });
    return { ok: true };
  });
