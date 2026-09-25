import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Home, Lightbulb, Scale, FlaskConical, MessageCircleQuestion, GraduationCap } from "lucide-react";
import { APP_NAME } from "@/lib/brand";
import type { WorkspaceSnapshot } from "@/lib/domain/types";
import { journeyState } from "@/lib/domain/state-machine";
import { JOURNEY_STEPS } from "@/lib/domain/config";
import { CHAPTER_COLOR } from "@/lib/domain/story";
import { cn } from "@/lib/utils";
import { AccountMenu, ConnectionPill } from "./ConnectionBar";

const NAV = [
  { to: "/studio", label: "Home", icon: Home, exact: true },
  { to: "/studio/opportunity", label: "Idea", icon: Lightbulb },
  { to: "/studio/select", label: "Decide", icon: Scale },
  { to: "/studio/venture", label: "Venture", icon: FlaskConical },
  { to: "/studio/advisor", label: "Advisor", icon: MessageCircleQuestion },
] as const;

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span className="relative grid size-8 place-items-center overflow-hidden rounded-[10px] bg-night text-sm font-bold text-sun" aria-hidden>
        <span className="kente absolute inset-x-0 bottom-0 h-1.5" />
        <span className="-mt-1 font-display">E</span>
      </span>
      <span className="font-display text-[17px] leading-none">{APP_NAME.split(" ").slice(0, 2).join(" ")}</span>
    </span>
  );
}

export function AppShell({ children, data }: { children: ReactNode; data: WorkspaceSnapshot | null }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const isActive = (to: string, exact?: boolean) => (exact ? path === to || path === `${to}/` : path.startsWith(to));
  const journey = data
    ? journeyState({
        hasGroup: Boolean(data.group),
        hasDraftOrOpportunity: Boolean(data.myOpportunity),
        hasSubmitted: Boolean(data.myOpportunity) && data.myOpportunity?.status !== "draft",
        groupStatus: data.group?.status ?? null,
        hasVenture: Boolean(data.venture),
        evidenceCount: data.evidence.length,
        assumptionCount: data.assumptions.length,
        experimentsDone: data.experiments.filter((x) => x.status === "done").length,
      })
    : null;

  return (
    <div className="paper-grain min-h-dvh bg-bg text-ink">
      <header className="sticky top-0 z-40 border-b border-line/70 bg-bg/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
          <Link to="/studio" aria-label="Studio home" className="lg:hidden">
            <Logo />
          </Link>
          <div className="hidden lg:block">
            {data?.group ? <p className="text-sm text-muted">{data.group.groupName} · Group {data.group.groupNumber}</p> : null}
          </div>
          <div className="flex items-center gap-2">
            <ConnectionPill />
            <AccountMenu name={data?.student?.fullName ?? ""} />
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl gap-8 px-4">
        <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-60 shrink-0 flex-col gap-6 py-6 lg:flex">
          <Link to="/studio" aria-label="Studio home">
            <Logo />
          </Link>
          <nav aria-label="Studio" className="flex flex-col gap-1">
            {NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className={cn(
                  "flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-[15px] font-semibold text-ink-soft transition-colors hover:bg-bg-subtle",
                  isActive(n.to, "exact" in n) && "bg-night text-accent-fg hover:bg-night",
                )}
              >
                <n.icon className="size-[18px]" aria-hidden />
                {n.label}
              </Link>
            ))}
            {data?.isLecturer ? (
              <Link to="/teach" className="mt-2 flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-[15px] font-semibold text-ink-soft hover:bg-bg-subtle">
                <GraduationCap className="size-[18px]" aria-hidden /> Teaching
              </Link>
            ) : null}
          </nav>
          {journey ? (
            <div className="rounded-[18px] border border-line bg-bg-elevated p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Your journey</p>
              <ol className="mt-3 space-y-2">
                {JOURNEY_STEPS.map((s) => {
                  const st = journey[s.id];
                  return (
                    <li key={s.id} className="flex items-center gap-2.5 text-sm">
                      <span
                        className={cn("grid size-5 place-items-center rounded-full border-2 text-[10px] font-bold", st === "todo" && "border-line")}
                        style={st !== "todo" ? { borderColor: CHAPTER_COLOR[s.id], background: st === "done" ? CHAPTER_COLOR[s.id] : "transparent", color: st === "done" ? "white" : CHAPTER_COLOR[s.id] } : undefined}
                        aria-hidden
                      >
                        {st === "done" ? "✓" : ""}
                      </span>
                      <span className={cn(st === "todo" ? "text-faint" : "font-semibold", st === "current" && "text-ink")}>{s.label}</span>
                    </li>
                  );
                })}
              </ol>
            </div>
          ) : null}
        </aside>

        <main className="min-w-0 flex-1 pb-28 pt-5 lg:pb-16 lg:pt-8">
          <div className="mx-auto w-full max-w-3xl">{children}</div>
        </main>
      </div>

      <nav aria-label="Studio" className="fixed inset-x-0 bottom-0 z-40 border-t border-line/80 bg-bg-elevated/95 backdrop-blur-md safe-bottom lg:hidden">
        <ul className="mx-auto grid max-w-lg grid-cols-5">
          {NAV.map((n) => {
            const on = isActive(n.to, "exact" in n);
            return (
              <li key={n.to}>
                <Link to={n.to} className={cn("flex flex-col items-center gap-0.5 pb-1 pt-2 text-[11px] font-semibold", on ? "text-ink" : "text-faint")} aria-current={on ? "page" : undefined}>
                  <span className={cn("grid h-7 w-12 place-items-center rounded-full transition-colors", on && "bg-night text-sun")}>
                    <n.icon className="size-[19px]" aria-hidden />
                  </span>
                  {n.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
