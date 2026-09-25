import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BookOpenCheck } from "lucide-react";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getMyRoles } from "@/lib/server/lecturer";
import { Logo } from "@/components/shell/AppShell";
import { AccountMenu } from "@/components/shell/ConnectionBar";

export const Route = createFileRoute("/teach")({ component: TeachLayout });

/** The lecturer's side: wider, table-friendly, no student bottom nav. */
function TeachLayout() {
  const { user, isPending } = useCurrentUserState();
  const navigate = useNavigate();
  const [roles, setRoles] = useState<Awaited<ReturnType<typeof getMyRoles>> | null>(null);

  useEffect(() => {
    if (!user) return;
    void getMyRoles().then((r) => {
      setRoles(r);
      if (!r.isLecturer) void navigate({ to: "/onboarding", search: { role: "lecturer" } });
    });
  }, [user, navigate]);

  if (isPending) return <div className="min-h-dvh bg-bg" />;
  if (!user) return <RedirectToSignIn />;

  return (
    <div className="paper-grain min-h-dvh bg-bg text-ink">
      <header className="sticky top-0 z-40 border-b border-line/70 bg-bg/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
          <Link to="/teach" className="flex items-center gap-2">
            <Logo />
            <span className="hidden rounded-full bg-night px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-sun sm:inline">Lecturer</span>
          </Link>
          <div className="flex items-center gap-2">
            {roles?.isStudent ? (
              <Link to="/studio" className="hidden items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-sm font-semibold sm:flex">
                <BookOpenCheck className="size-4" /> My studio
              </Link>
            ) : null}
            <AccountMenu name={user.displayName ?? ""} />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-6">{roles?.isLecturer ? <Outlet /> : <div className="h-64 animate-pulse rounded-[22px] bg-bg-subtle" />}</main>
    </div>
  );
}
