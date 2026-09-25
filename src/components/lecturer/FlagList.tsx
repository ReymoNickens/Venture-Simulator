import { AlertTriangle } from "lucide-react";
import type { Flag } from "@/lib/domain/flags";
import { cn } from "@/lib/utils";

export function FlagList({ flags, full = false }: { flags: Flag[]; full?: boolean }) {
  if (!flags.length) return <span className="text-xs text-accent">On track</span>;
  const shown = full ? flags : flags.slice(0, 2);
  return (
    <ul className="space-y-1">
      {shown.map((f) => (
        <li
          key={f.code}
          className={cn(
            "flex items-start gap-1.5 text-xs leading-5",
            f.severity === "high" ? "text-clay" : f.severity === "medium" ? "text-warn" : "text-muted",
          )}
        >
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-label={`${f.severity} severity`} />
          <span className={full ? "" : "line-clamp-1"}>{f.message}</span>
        </li>
      ))}
      {!full && flags.length > 2 ? <li className="text-xs text-muted">+{flags.length - 2} more</li> : null}
    </ul>
  );
}
