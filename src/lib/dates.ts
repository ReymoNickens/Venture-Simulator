/** "due in 3 days", "due tomorrow", "2 days overdue" — relative, in plain words. */
export function dueLabel(iso: string, now = new Date()): string {
  const due = new Date(iso);
  if (Number.isNaN(due.getTime())) return "";
  const days = Math.round((startOfDay(due) - startOfDay(now)) / 86_400_000);
  if (days < -1) return `${-days} days overdue`;
  if (days === -1) return "due yesterday";
  if (days === 0) return "due today";
  if (days === 1) return "due tomorrow";
  if (days < 14) return `due in ${days} days`;
  return `due ${due.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
}

export function isOverdue(iso: string, now = new Date()): boolean {
  const due = new Date(iso);
  return !Number.isNaN(due.getTime()) && due.getTime() < now.getTime();
}

/** "3 Oct, 14:05" */
export function shortDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function daysAgo(iso: string, now = new Date()): number {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 0;
  return Math.floor((now.getTime() - d.getTime()) / 86_400_000);
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
