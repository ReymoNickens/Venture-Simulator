import { useMemo, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Home, ListOrdered, NotebookText, Store, WifiOff } from "lucide-react";
import { APP_NAME } from "@/lib/brand";
import type { WorkspaceSnapshot } from "@/lib/domain/types";
import { connectionCopy, useConnection } from "@/hooks/use-connection";
import { LogoMark } from "@/components/ui/sticker";
import { AccountMenu } from "./AccountMenu";
import { DemoBar } from "./DemoBar";
import { journeyFromSnapshot } from "@/lib/domain/journey-progress";
import { JourneyMap } from "./JourneyMap";
import { cn } from "@/lib/utils";

// Tab names say what is on the screen. Icons are the common ones (home,
// list, notebook, shop) and always sit above their word.
const TABS = [
  { to: "/studio", label: "Today", icon: Home, exact: true },
  { to: "/studio/journey", label: "Steps", icon: ListOrdered, exact: false },
  { to: "/studio/venture", label: "Venture", icon: NotebookText, exact: false },
  { to: "/studio/simulation", label: "Simulation", icon: Store, exact: false },
] as const;

export function AppShell({
  children,
  data,
}: {
  children: ReactNode;
  data: WorkspaceSnapshot | null;
}) {
  const progress = useMemo(() => (data?.student ? journeyFromSnapshot(data) : null), [data]);
  const inDemo = Boolean(data?.members.some((m) => m.isSynthetic));
  return (
    <div className="min-h-dvh text-ink">
      <header className="sticky top-0 z-30 bg-bg/90 backdrop-blur-md">
        <DemoBar role="student" />
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5">
          <Link to="/studio" className="flex min-w-0 items-center gap-2.5" aria-label={`${APP_NAME}, today`}>
            <LogoMark />
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            <SyncPill />
            <AccountMenu name={data?.student?.fullName} canRehearse={inDemo} />
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl gap-10 px-4">
        {progress ? (
          <aside className="sticky top-20 hidden h-[calc(100dvh-6rem)] w-60 shrink-0 overflow-y-auto py-4 lg:block">
            <JourneyMap progress={progress} compact />
          </aside>
        ) : null}
        <main className="mx-auto w-full max-w-2xl min-w-0 flex-1 pt-2 pb-24 lg:pb-16">{children}</main>
      </div>

      {progress ? (
        <nav
          aria-label="Studio"
          className="no-print fixed inset-x-0 bottom-0 z-30 border-t-2 border-ink bg-bg-elevated pb-[env(safe-area-inset-bottom)] lg:hidden"
        >
          <ul className="mx-auto grid max-w-md grid-cols-4">
            {TABS.map((t) => (
              <li key={t.to}>
                <Link
                  to={t.to}
                  activeOptions={{ exact: t.exact }}
                  className="group flex min-h-14 flex-col items-center justify-center gap-0.5 text-[12px] font-bold text-muted"
                  activeProps={{ className: "!text-ink [&_.tab-icon]:bg-gold [&_.tab-icon]:border-ink" }}
                >
                  <span className="tab-icon flex h-7 w-12 items-center justify-center rounded-full border-2 border-transparent">
                    <t.icon className="size-[18px]" aria-hidden strokeWidth={2} />
                  </span>
                  {t.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </div>
  );
}

/**
 * Sync state in plain words, but only when it needs attention. "Synced" is
 * the normal case and lives in the account menu; anything else is shown here
 * so nobody closes the app believing unsent work was sent.
 */
function SyncPill() {
  const { state } = useConnection();
  const copy = connectionCopy(state);
  if (copy.tone === "ok") return null;
  return (
    <span
      role="status"
      className={cn(
        "flex max-w-[11rem] items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold",
        copy.tone === "warn" ? "bg-gold-soft text-gold-deep" : "bg-clay-soft text-clay",
      )}
    >
      <WifiOff className="size-3.5 shrink-0" aria-hidden />
      <span className="truncate">{state === "offline" ? "Offline" : "Not synced yet"}</span>
    </span>
  );
}
