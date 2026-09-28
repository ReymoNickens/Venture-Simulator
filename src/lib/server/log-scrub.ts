/**
 * Log without leaking secrets: photo data URLs, API keys, bearer tokens and
 * cookie values are scrubbed, and every string is truncated.
 */
export function logServerError(ref: string, err: unknown): void {
  const e = err as { name?: unknown; message?: unknown; code?: unknown; stack?: unknown } | null;
  console.error(`[server-fn] ref=${ref}`, {
    name: scrub(String(e?.name ?? typeof err)),
    code: e?.code === undefined ? undefined : scrub(String(e.code)),
    message: scrub(String(e?.message ?? err)),
    stack: typeof e?.stack === "string" ? scrub(e.stack, 2000) : undefined,
  });
}

export function scrub(value: string, max = 500): string {
  return value
    .replace(/data:[a-z]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi, "data:[redacted]")
    .replace(/[A-Za-z0-9+/]{200,}={0,2}/g, "[base64 redacted]")
    .replace(/sk-(ant|xai)-[A-Za-z0-9_-]+/gi, "[api key redacted]")
    .replace(/xai-[A-Za-z0-9_-]{16,}/gi, "[api key redacted]")
    .replace(/(bearer\s+)[A-Za-z0-9._-]+/gi, "$1[redacted]")
    .replace(/((?:session_token|session_data|cookie)[=:]\s*)[^;\s,]+/gi, "$1[redacted]")
    .slice(0, max);
}
