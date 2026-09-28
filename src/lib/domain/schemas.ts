import { z } from "zod";

/**
 * Runtime input validation for every server function.
 *
 * TypeScript types on a server function's input are erased at build time — a
 * request body can carry anything. Every `createServerFn` validates its input
 * through `input(schema)` below: unknown keys are rejected (strict objects),
 * text is trimmed and length-capped, enums are enforced, and ids are checked
 * for shape before they reach SQL.
 *
 * Client-safe: imports only zod.
 */

// ── Limits ────────────────────────────────────────────────────────────────
export const LIMITS = {
  title: 120,
  short: 500,
  long: 4000,
  advisor: 2000,
  rationaleMin: 40,
} as const;

// ── Ids ───────────────────────────────────────────────────────────────────
/** Every record this app creates gets `crypto.randomUUID()`. */
export const uuid = z.uuid({ message: "That link is not valid. Refresh and try again." });

/**
 * Ids the app did not mint itself: the seeded course offering
 * (`offering_entr201_2026s1`) and roster-imported students on the preview
 * database (`preview_demo_0001`). Not UUIDs, so they get a strict character
 * whitelist instead — still safe to hand to SQL as a parameter.
 */
export const safeId = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,64}$/, { message: "That link is not valid. Refresh and try again." });

// ── Text ──────────────────────────────────────────────────────────────────
// Control characters (other than newline, carriage return and tab in long
// text) have no business in student writing and can break logs, CSV exports
// and the advisor prompt.
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const CONTROL_SINGLE = /[\u0000-\u001f\u007f]/;
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const CONTROL_MULTI = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

/** A single-line field (a name, a title, a place). */
export function line(max: number = LIMITS.short, label = "This field") {
  return z
    .string()
    .trim()
    .max(max, { message: `${label} must be ${max} characters or fewer.` })
    .refine((v) => !CONTROL_SINGLE.test(v), { message: `${label} contains characters that can't be saved.` });
}

/** A multi-line field (an answer, a rationale, notes). */
export function text(max: number = LIMITS.long, label = "This answer") {
  return z
    .string()
    .trim()
    .max(max, { message: `${label} must be ${max} characters or fewer.` })
    .refine((v) => !CONTROL_MULTI.test(v), { message: `${label} contains characters that can't be saved.` });
}

export const title = line(LIMITS.title, "The title");
export const rationale = text(LIMITS.long, "The rationale").pipe(
  z.string().min(LIMITS.rationaleMin, {
    message: "Explain why this rather than the alternatives — at least a few full sentences.",
  }),
);

// ── Enums ─────────────────────────────────────────────────────────────────
export const classification = z.enum(["fact", "evidence", "assumption", "inference", "opinion", "unknown"], {
  message: "Choose a classification from the list.",
});
export const sourceType = z.enum(["observation", "interview", "survey", "quotation", "photo", "other"], {
  message: "Choose where this evidence came from.",
});
export const relationshipType = z.enum(["supports", "challenges"], {
  message: "Choose supports or challenges.",
});
export const importance = z.enum(["critical", "high", "medium", "low"], { message: "Choose how important this is." });
export const confidence = z.enum(["high", "medium", "low"], { message: "Choose how confident you are." });
export const advisorStage = z.enum(["selection", "evidence"], { message: "Unknown advisor stage." });
export const vote = z.enum(["endorse", "object"], { message: "Endorse or object." });

// ── Photos ────────────────────────────────────────────────────────────────
/**
 * Shape check only. Decoded size and the JPEG magic bytes are verified on the
 * server (src/lib/server/photo-store.ts) because they need the offering's limit.
 * Clients always re-encode to JPEG before upload (src/lib/offline/photos.ts).
 */
export const photoData = z
  .string()
  .max(4_000_000, { message: "The photo is too large. Compress it and try again." })
  .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/, {
    message: "Only JPEG photos can be attached. Take the photo again in the app.",
  });
export const photoMime = z.literal("image/jpeg", { message: "Only JPEG photos can be attached." });

/** Optional date or datetime a student typed or picked, e.g. "2026-09-28". */
export const dateish = z
  .string()
  .trim()
  .max(40)
  .regex(/^\d{4}-\d{2}-\d{2}([T ][\d:.]+Z?)?$/, { message: "That date is not valid." });

/** For server functions that take no input: any payload at all is rejected. */
export const noInput = z.undefined({ message: "That request had unexpected fields. Refresh the page and try again." });

// ── Wiring ────────────────────────────────────────────────────────────────
/** Thrown for invalid input; carries a message safe to show the student. */
export class InputError extends Error {
  readonly code = "INVALID";
  constructor(message: string) {
    super(message);
    this.name = "InputError";
  }
}

function friendly(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Some of that could not be saved. Check it and try again.";
  if (issue.code === "unrecognized_keys") return "That request had unexpected fields. Refresh the page and try again.";
  if (issue.code === "invalid_type" && issue.input === undefined) return "Something required is missing.";
  return issue.message || "Some of that could not be saved. Check it and try again.";
}

/**
 * Turn a zod schema into a server-function validator:
 *
 *   .validator(input(z.strictObject({ title })))
 *
 * On failure it throws InputError with a plain-language message (TanStack's
 * built-in handling of a bare schema would show the student raw JSON).
 */
export function input<S extends z.ZodType>(schema: S) {
  return (raw: z.input<S>): z.output<S> => {
    const result = schema.safeParse(raw);
    if (!result.success) throw new InputError(friendly(result.error));
    return result.data;
  };
}
