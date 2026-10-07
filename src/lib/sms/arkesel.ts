// Text messages through Arkesel (https://arkesel.com), a Ghanaian SMS
// provider. Used for sign-in codes. Server-only; relative imports so it can
// be unit-tested under plain node.
//
// Configure with ARKESEL_API_KEY and ARKESEL_SENDER_ID (the approved sender
// name, at most 11 characters, e.g. "ENT302"). Until both are set, messages
// are not sent: they are held in pending_sms_codes for the platform owner to
// read on the owner page, so sign-in can be tried before the account is live.
import type { Db } from "../classes/service.ts";

export const ARKESEL_URL = "https://sms.arkesel.com/api/v2/sms/send";
const HOLD_MINUTES = 10;

export interface SmsConfig {
  apiKey: string;
  senderId: string;
}

export function smsConfig(env: Record<string, string | undefined> = process.env): SmsConfig | null {
  const apiKey = env.ARKESEL_API_KEY?.trim();
  const senderId = env.ARKESEL_SENDER_ID?.trim();
  return apiKey && senderId ? { apiKey, senderId } : null;
}

type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

/** Send one text. `to` is E.164 (+233…); Arkesel wants it without the plus. */
export async function sendViaArkesel(config: SmsConfig, to: string, message: string, fetchImpl: Fetch = fetch as Fetch): Promise<void> {
  const res = await fetchImpl(ARKESEL_URL, {
    method: "POST",
    headers: { "api-key": config.apiKey, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ sender: config.senderId, message, recipients: [to.replace(/^\+/, "")] }),
  });
  const body = (await res.json().catch(() => null)) as { status?: string; message?: string } | null;
  if (!res.ok || body?.status !== "success") {
    throw new Error(`Arkesel did not send the message (${res.status}${body?.message ? `: ${body.message}` : ""}).`);
  }
}

/** No SMS account yet: keep the message for the owner page instead. */
export async function holdForOwner(db: Db, to: string, message: string, now = new Date()): Promise<void> {
  await db.query(`delete from pending_sms_codes where expires_at < $1`, [now.toISOString()]);
  await db.query(`insert into pending_sms_codes (id, phone, message, expires_at) values ($1, $2, $3, $4)`, [
    crypto.randomUUID(),
    to,
    message,
    new Date(now.getTime() + HOLD_MINUTES * 60_000).toISOString(),
  ]);
}

export interface HeldMessage {
  phone: string;
  message: string;
  at: string;
}

export async function heldMessages(db: Db, now = new Date()): Promise<HeldMessage[]> {
  const rows = await db.query<{ phone: string; message: string; created_at: unknown }>(
    `select phone, message, created_at from pending_sms_codes where expires_at > $1 order by created_at desc limit 20`,
    [now.toISOString()],
  );
  return rows.map((r) => ({ phone: r.phone, message: r.message, at: String(r.created_at) }));
}

export function codeMessage(code: string): string {
  return `${code} is your ENT 302 sign-in code. It expires in 5 minutes. Do not share it.`;
}

/** Send a text, or hold it for the owner when SMS is not set up. */
export async function sendSms(db: Db, to: string, message: string, env = process.env, fetchImpl?: Fetch): Promise<"sent" | "held"> {
  const config = smsConfig(env);
  if (!config) {
    await holdForOwner(db, to, message);
    return "held";
  }
  await sendViaArkesel(config, to, message, fetchImpl);
  return "sent";
}
