import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { Activity, BellRing, GraduationCap, LogOut } from "lucide-react";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { signOut } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getLecturerHome, type LecturerHome } from "@/lib/server/lecturers";
import { LecturerProvider } from "@/hooks/lecturer-context";
import { FormMessages, Loading } from "@/components/ui/feedback";
import { LogoMark } from "@/components/ui/sticker";
import { DemoBar } from "@/components/shell/DemoBar";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/lecturer")({ component: LecturerLayout });

const TABS = [
  { to: "/lecturer", label: "Needs you", icon: BellRing, exact: true },
  { to: "/lecturer/activity", label: "Activity", icon: Activity, exact: false },
  { to: "/lecturer/classes", label: "Classes", icon: GraduationCap, exact: false },
] as const;

function LecturerLayout() {
  const { user, isPending } = useCurrentUserState();
  const [home, setHome] = useState<LecturerHome | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setHome(await getLecturerHome());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your classes.");
    }
  }, []);

  // Keyed on the id: the user object is rebuilt on every render, and
  // depending on it re-fetched in a loop.
  const userId = user?.id;
  useEffect(() => {
    if (userId) void refresh();
  }, [userId, refresh]);

  if (isPending) return <div className="min-h-dvh" />;
  if (!user) return <RedirectToSignIn />;

  return (
    <div className="min-h-dvh text-ink">
      <header className="sticky top-0 z-30 bg-bg/90 backdrop-blur-md">
        <DemoBar role="lecturer" />
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2.5">
          <Link to="/lecturer" className="flex min-w-0 items-center gap-2.5">
            <LogoMark />
            <span className="min-w-0 border-l border-line-strong pl-2.5">
              <span className="block text-[11px] font-semibold text-muted">Lecturer</span>
              <span className="block truncate font-display text-[15px] leading-tight font-semibold">
                {home?.fullName ?? "…"}
              </span>
            </span>
          </Link>
          <nav aria-label="Lecturer" className="hidden items-center gap-1 rounded-full bg-bg-subtle p-1 md:flex">
            {TABS.map((t) => (
              <Link
                key={t.to}
                to={t.to}
                activeOptions={{ exact: t.exact }}
                className="flex min-h-10 items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-muted"
                activeProps={{ className: "bg-bg-elevated !text-accent shadow-sm" }}
              >
                <t.icon className="size-4" aria-hidden />
                {t.label}
              </Link>
            ))}
          </nav>
          <button
            type="button"
            onClick={() => void signOut()}
            className="flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-muted hover:bg-bg-subtle"
          >
            <LogOut className="size-4" aria-hidden /> Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 pt-2 pb-24 md:pb-16">
        {error && !home ? (
          <div className="mx-auto max-w-md space-y-4 pt-10">
            <FormMessages error={error} />
            <p className="text-sm text-muted">
              Lecturer accounts are set up with an invite code from the platform owner.
            </p>
            <Link to="/studio" className={cn(buttonVariants({ variant: "secondary" }), "w-full")}>
              Go to the student studio instead
            </Link>
          </div>
        ) : !home ? (
          <Loading />
        ) : (
          <LecturerProvider value={{ home, refresh }}>
            <Outlet />
          </LecturerProvider>
        )}
      </main>

      <nav
        aria-label="Lecturer"
        className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg-elevated pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <ul className="mx-auto grid max-w-sm grid-cols-3">
          {TABS.map((t) => (
            <li key={t.to}>
              <Link
                to={t.to}
                activeOptions={{ exact: t.exact }}
                className="flex min-h-14 flex-col items-center justify-center gap-0.5 text-[12px] font-semibold text-muted"
                activeProps={{ className: "!text-accent" }}
              >
                <t.icon className="size-5" aria-hidden strokeWidth={1.8} />
                {t.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
