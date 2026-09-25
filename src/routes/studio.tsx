import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useWorkspace } from "@/hooks/use-workspace";
import { WorkspaceProvider } from "@/hooks/workspace-context";
import { AppShell } from "@/components/shell/AppShell";
import { getMyRoles } from "@/lib/server/lecturer";

export const Route = createFileRoute("/studio")({ component: StudioLayout });

function StudioLayout() {
  const { user, isPending } = useCurrentUserState();
  const workspace = useWorkspace();
  const { data, loading } = workspace;
  const navigate = useNavigate();

  useEffect(() => {
    if (isPending || loading) return;
    if (user && data && !data.student) {
      // No student profile: a lecturer goes to their cohort, anyone else sets up a profile.
      void getMyRoles()
        .then((r) => navigate({ to: r.isLecturer ? "/teach" : "/onboarding" }))
        .catch(() => navigate({ to: "/onboarding" }));
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
