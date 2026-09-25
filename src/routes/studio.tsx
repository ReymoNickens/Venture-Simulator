import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState, type AppUser } from "@/lib/auth/use-current-user";
import { rememberedUser, rememberUser } from "@/lib/auth/offline-user";
import { useWorkspace } from "@/hooks/use-workspace";
import { WorkspaceProvider } from "@/hooks/workspace-context";
import { AppShell } from "@/components/shell/AppShell";

export const Route = createFileRoute("/studio")({ component: StudioLayout });

/**
 * The signed-in account — or, with no network, the account last signed in on
 * this device, so offline students reach their cached work instead of a
 * sign-in page that cannot load.
 */
function useStudioUser(): { user: AppUser | null; isPending: boolean } {
  const { user, isPending } = useCurrentUserState();
  const [offlineUser, setOfflineUser] = useState<AppUser | null>(null);
  useEffect(() => {
    if (user) rememberUser(user);
    else if (!isPending && typeof navigator !== "undefined" && !navigator.onLine) {
      setOfflineUser(rememberedUser());
    }
  }, [user, isPending]);
  if (user) return { user, isPending: false };
  if (isPending) return { user: null, isPending: true };
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { user: offlineUser ?? rememberedUser(), isPending: false };
  }
  return { user: null, isPending: false };
}

function StudioLayout() {
  const { user, isPending } = useStudioUser();
  const workspace = useWorkspace(user?.id ?? null);
  const { data, loading } = workspace;
  const navigate = useNavigate();

  useEffect(() => {
    if (isPending || loading) return;
    if (user && data && !data.student) {
      void navigate({ to: "/onboarding" });
    }
  }, [isPending, loading, user, data, navigate]);

  if (isPending) return <div className="min-h-dvh bg-bg" />;
  if (!user) return <RedirectToSignIn />;

  return (
    <WorkspaceProvider value={workspace}>
      <AppShell data={data}>
        <Outlet />
      </AppShell>
    </WorkspaceProvider>
  );
}
