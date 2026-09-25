import { useMemo, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Bell, BookOpenText, Home, MessageCircleQuestion, Route as RouteIcon } from "lucide-react";
import { UserButton } from "@/lib/auth/gates";
import { APP_NAME } from "@/lib/brand";
import type { WorkspaceSnapshot } from "@/lib/domain/types";
import { progressFromSnapshot } from "@/lib/domain/stage-input";
import { KenteBand } from "@/components/ui/kente";
import { Emblem } from "@/components/ui/emblem";
import { ConnectionPill } from "./ConnectionBar";
import { RouteMap } from "./RouteMap";
import { StopComplete } from "@/components/stage/StopComplete";

const TABS = [
  { to: "/studio", label: "Today", icon: Home, exact: true },
  { to: "/studio/map", label: "Route", icon: RouteIcon, exact: false },
  { to: "/studio/notebook", label: "Notebook", icon: BookOpenText, exact: false },
  { to: "/studio/advisor", label: "Advisor", icon: MessageCircleQuestion, exact: false },
] as const;

export function AppShell({
  children,
  data,
}: {
  children: ReactNode;
  data: WorkspaceSnapshot | null;
}) {
  const progress = useMemo(() => (data?.student ? progressFromSnapshot(data) : null), [data]);
  return (
    <div className="min-h-dvh text-ink">
      <KenteBand />
      {progress && data?.student ? <StopComplete owner={data.student.id} progress={progress} /> : null}
      <header className="sticky top-0 z-30 border-b-2 border-ink bg-bg/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5">
          <Link to="/studio" className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-[8px] border-2 border-ink bg-gold text-ink">
              <Emblem emblem="adinkrahene" className="size-6" title={APP_NAME} />
            </span>
            <span className="min-w-0">
              <span className="block truncate font-display text-[15px] font-extrabold leading-tight sm:text-base">
                {APP_NAME}
              </span>
              {data?.venture ? (
                <span className="block truncate text-xs text-muted">{data.venture.name}</span>
              ) : data?.group ? (
                <span className="block truncate text-xs text-muted">{data.group.groupName}</span>
              ) : null}
            </span>
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            {data?.group ? (
              <Link
                to="/studio/messages"
                aria-label={data.life.unreadMessages ? `${data.life.unreadMessages} unread messages` : "Messages"}
                className="relative flex size-9 items-center justify-center rounded-full border-2 border-ink/70 bg-bg-elevated"
              >
                <Bell className="size-4" aria-hidden />
                {data.life.unreadMessages ? (
                  <span className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full border-2 border-bg bg-clay font-mono text-[10px] font-bold text-accent-fg">
                    {Math.min(9, data.life.unreadMessages)}
                  </span>
                ) : null}
              </Link>
            ) : null}
            <ConnectionPill />
            <UserButton />
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl gap-8 px-4">
        {progress ? (
          <aside className="sticky top-20 hidden h-[calc(100dvh-6rem)] w-64 shrink-0 overflow-y-auto py-6 lg:block">
            <p className="mb-2 px-1 font-mono text-[10.5px] uppercase tracking-[0.16em] text-muted">The route</p>
            <RouteMap progress={progress} milestones={data?.life.milestones} />
          </aside>
        ) : null}
        <main className="min-w-0 flex-1 pt-5 pb-28 lg:pb-16">{children}</main>
      </div>

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
                className="flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-muted"
                activeProps={{ className: "text-ink [&_svg]:text-accent [&_.tab-dot]:opacity-100" }}
              >
                <t.icon className="size-5" aria-hidden />
                {t.label}
                <span className="tab-dot h-1 w-5 rounded-full bg-gold opacity-0" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
