// Phone numbers as people type them in Ghana, turned into one form (E.164,
// e.g. +233244123456) for sign-in, storage and "one number, one group".
// Safe to import from pages.

/** Every phone sign-up gets a placeholder email ending in this; never shown, never mailed. */
export const PHONE_EMAIL_DOMAIN = "phone.ent302.invalid";

/**
 * "024 412 3456", "0244123456", "233244123456" and "+233 24 412 3456" all
 * become "+233244123456". Other countries need their + prefix. Returns null
 * for anything that is not a plausible number.
 */
export function normalisePhone(input: string): string | null {
  const raw = input.trim().replace(/[\s\-().]/g, "");
  let digits: string;
  if (raw.startsWith("+")) digits = raw.slice(1);
  else if (raw.startsWith("00")) digits = raw.slice(2);
  else if (/^0\d{9}$/.test(raw)) digits = `233${raw.slice(1)}`;
  else if (/^233\d{9}$/.test(raw)) digits = raw;
  else if (/^[2-9]\d{8}$/.test(raw)) digits = `233${raw}`;
  else return null;
  if (!/^\d{10,15}$/.test(digits)) return null;
  if (digits.startsWith("233") && digits.length !== 12) return null;
  return `+${digits}`;
}

/** "+233244123456" → "024 412 3456"; other countries are shown as stored. */
export function formatPhone(e164: string): string {
  const m = /^\+233(\d{2})(\d{3})(\d{4})$/.exec(e164);
  return m ? `0${m[1]} ${m[2]} ${m[3]}` : e164;
}

export function isPhoneEmail(email: string | null | undefined): boolean {
  return Boolean(email?.toLowerCase().endsWith(`@${PHONE_EMAIL_DOMAIN}`));
}

export function phoneEmail(e164: string): string {
  return `${e164.replace(/^\+/, "")}@${PHONE_EMAIL_DOMAIN}`;
}
