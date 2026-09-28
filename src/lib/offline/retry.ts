/**
 * When a queued write that failed may be tried again. Pure, so it can be
 * unit-tested without a browser.
 *
 * Failed items are never dropped — a student's evidence outlives any number
 * of bad connections — but hammering the server every few seconds with a
 * write it keeps refusing wastes a student's data bundle. So retries back off:
 * 5s, 10s, 20s … capped at 10 minutes.
 */
export const RETRY_BASE_MS = 5_000;
export const RETRY_MAX_MS = 10 * 60_000;

export function retryDelayMs(attempts: number): number {
  if (attempts <= 0) return 0;
  const delay = RETRY_BASE_MS * 2 ** Math.min(attempts - 1, 20);
  return Math.min(RETRY_MAX_MS, delay);
}

export function nextAttemptAt(attempts: number, now: Date): string {
  return new Date(now.getTime() + retryDelayMs(attempts)).toISOString();
}

/** Due now? A manual "retry" (force) ignores the backoff. */
export function isDue(
  item: { status: string; nextAttemptAt?: string | null },
  now: Date,
  force = false,
): boolean {
  if (item.status === "done") return false;
  if (force || item.status !== "error" || !item.nextAttemptAt) return true;
  return new Date(item.nextAttemptAt).getTime() <= now.getTime();
}
