/** A user-facing error with a stable machine-readable code. */
export class AppError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "Error";
    this.code = code;
  }
}
