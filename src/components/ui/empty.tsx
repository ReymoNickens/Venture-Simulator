import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Empty({ icon, title, body, action, className }: { icon?: ReactNode; title: string; body?: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center gap-2 rounded-[20px] border border-dashed border-line-strong/70 px-5 py-8 text-center", className)}>
      {icon ? <div className="grid size-11 place-items-center rounded-full bg-bg-subtle text-muted">{icon}</div> : null}
      <p className="font-display text-lg">{title}</p>
      {body ? <p className="max-w-[40ch] text-sm leading-6 text-muted">{body}</p> : null}
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-[18px] bg-bg-subtle", className)} />;
}
