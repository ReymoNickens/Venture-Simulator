import { useMemo, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Bell, BookOpen, Home, MessageCircleQuestion, Map as MapIcon } from "lucide-react";
import { APP_NAME } from "@/lib/brand";
import type { WorkspaceSnapshot } from "@/lib/domain/types";
import { progressFromSnapshot } from "@/lib/domain/stage-input";
import { LogoMark } from "@/components/ui/sticker";
import { StopComplete } from "@/components/stage/StopComplete";
import { AccountMenu } from "./AccountMenu";
import { RouteMap } from "./RouteMap";

const TABS = [
  { to: "/studio", label: "Today", icon: Home, exact: true },
  { to: "/studio/map", label: "Journey", icon: MapIcon, exact: false },
  { to: "/studio/notebook", label: "Notebook", icon: BookOpen, exact: false },
  { to: "/studio/advisor", label: "Advisor", icon: MessageCircleQuestion, exact: false },
] as const;

export function AppShell({ children, data }: { children: ReactNode; data: WorkspaceSnapshot | null }) {
  const progress = useMemo(() => (data?.student ? progressFromSnapshot(data) : null), [data]);
  return (
    <div className="min-h-dvh text-ink">
      {progress && data?.student ? <StopComplete owner={data.student.id} progress={progress} /> : null}
      <header className="sticky top-0 z-30 bg-bg/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/studio" className="flex min-w-0 items-center gap-2.5" aria-label={APP_NAME}>
            <LogoMark />
            <span className="hidden truncate font-display text-base font-bold sm:block">{APP_NAME}</span>
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            {data?.group ? (
              <Link
                to="/studio/messages"
                aria-label={data.life.unreadMessages ? `${data.life.unreadMessages} unread messages` : "Messages"}
                className="relative flex size-10 items-center justify-center rounded-full bg-bg-elevated ring-1 ring-line"
              >
                <Bell className="size-[18px]" aria-hidden />
                {data.life.unreadMessages ? (
                  <span className="absolute -top-0.5 -right-0.5 flex size-5 items-center justify-center rounded-full border-2 border-bg bg-clay text-[10px] font-bold text-white">
                    {Math.min(9, data.life.unreadMessages)}
                  </span>
                ) : null}
              </Link>
            ) : null}
            <AccountMenu name={data?.student?.fullName} />
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl gap-10 px-4">
        {progress ? (
          <aside className="sticky top-20 hidden h-[calc(100dvh-6rem)] w-64 shrink-0 overflow-y-auto py-4 lg:block">
            <RouteMap progress={progress} milestones={data?.life.milestones} compact />
          </aside>
        ) : null}
        <main className="mx-auto w-full max-w-2xl min-w-0 flex-1 pt-3 pb-28 lg:pb-16">{children}</main>
      </div>

      <nav aria-label="Studio" className="no-print fixed inset-x-3 bottom-3 z-30 lg:hidden">
        <ul className="mx-auto grid max-w-md grid-cols-4 rounded-full bg-ink p-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))] shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)]">
          {TABS.map((t) => (
            <li key={t.to}>
              <Link
                to={t.to}
                activeOptions={{ exact: t.exact }}
                className="flex flex-col items-center gap-0.5 rounded-full py-1.5 text-[10.5px] font-semibold text-white/60"
                activeProps={{ className: "bg-white/12 !text-white [&_svg]:text-gold" }}
              >
                <t.icon className="size-5" aria-hidden />
                {t.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
