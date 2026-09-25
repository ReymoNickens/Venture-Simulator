import * as T from "@radix-ui/react-tabs";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const Tabs = T.Root;
export const TabPanel = T.Content;
export function TabList({ tabs }: { tabs: { value: string; label: string; count?: number; icon?: ReactNode }[] }) {
  return (
    <T.List className="scroll-snap-x -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
      {tabs.map((t) => (
        <T.Trigger
          key={t.value}
          value={t.value}
          className={cn(
            "flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-line bg-bg-elevated px-3.5 text-sm font-semibold text-ink-soft transition-colors",
            "data-[state=active]:border-night data-[state=active]:bg-night data-[state=active]:text-accent-fg",
          )}
        >
          {t.icon}
          {t.label}
          {typeof t.count === "number" ? (
            <span className="rounded-full bg-bg-subtle px-1.5 text-[11px] tabular-nums text-muted data-[state=active]:bg-white/15">{t.count}</span>
          ) : null}
        </T.Trigger>
      ))}
    </T.List>
  );
}
