/**
 * Structured server logging: one JSON object per line on stdout, which Vercel
 * and most log drains index directly.
 *
 * Personal data rule: only allow-listed fields are written. Internal ids
 * (studentId, groupId, ...) are pseudonymous and allowed; names, index
 * numbers, emails, free text written by students and AI message bodies are
 * not. A field outside the list is dropped and only its NAME is recorded in
 * `dropped`, so a mistake shows up in the logs without leaking the value.
 */
export type LogLevel = "info" | "warn" | "error";
export type LogValue = string | number | boolean | null | undefined;

export const LOG_FIELD_ALLOWLIST: ReadonlySet<string> = new Set([
  "studentId",
  "actorId",
  "groupId",
  "cohortId",
  "ventureId",
  "simulationId",
  "period",
  "engineVersion",
  "seedLabel",
  "status",
  "fromStatus",
  "toStatus",
  "durationMs",
  "count",
  "attempt",
  "outboxType",
  "entityType",
  "entityId",
  "errorCode",
  "reason",
  "route",
  "role",
]);

export type LogSink = (line: string) => void;

let sink: LogSink = (line) => console.log(line);

/** Tests swap the sink to capture output. Returns a restore function. */
export function setLogSink(next: LogSink): () => void {
  const prev = sink;
  sink = next;
  return () => {
    sink = prev;
  };
}

export function log(level: LogLevel, event: string, fields: Record<string, LogValue> = {}): void {
  const kept: Record<string, LogValue> = {};
  const dropped: string[] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    if (LOG_FIELD_ALLOWLIST.has(key)) kept[key] = value;
    else dropped.push(key);
  }
  const record: Record<string, unknown> = { level, event, ...kept };
  if (dropped.length) record.dropped = dropped.sort();
  sink(JSON.stringify(record));
}
