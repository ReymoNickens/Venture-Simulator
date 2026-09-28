/**
 * An error whose message is written for the student and safe to show them.
 * Anything else that escapes a server function is logged server-side and
 * replaced with a generic message (see src/lib/auth/errors.server.ts).
 */
export class AppError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "Error";
    this.code = code;
  }
}
