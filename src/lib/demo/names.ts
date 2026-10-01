// Safe to import from pages: no database code.

/** Every demo account's email ends with this. Not a real domain, so nothing is ever sent there. */
export const DEMO_EMAIL_DOMAIN = "tour.demo";

/** True for the look-around accounts, so screens can offer "switch role" instead of plain sign-out. */
export function isDemoEmail(email: string | null | undefined): boolean {
  return Boolean(email?.toLowerCase().endsWith(`@${DEMO_EMAIL_DOMAIN}`));
}
