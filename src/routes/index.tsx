import { createFileRoute, Link } from "@tanstack/react-router";
import { SignedIn, SignedOut, SignInGate } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { APP_NAME, APP_TAGLINE } from "@/lib/brand";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const { isPending } = useCurrentUserState();
  return (
    <main className="min-h-dvh bg-bg pl-3 text-ink">
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-between px-5 py-8">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted">
          University entrepreneurship studio
        </p>
        <div className="space-y-5">
          <h1 className="font-display text-[2.6rem] leading-[1.05] tracking-[-0.04em] sm:text-5xl">
            {APP_NAME}
          </h1>
          <p className="max-w-[34ch] text-lg leading-7 text-ink-soft">{APP_TAGLINE}</p>
          <p className="max-w-[42ch] text-sm leading-6 text-muted">
            You will investigate a real problem, keep your idea private until the group is ready,
            defend a selection in writing, and log evidence against the assumptions that could
            kill the venture. The advisor challenges. It does not cheer.
          </p>
        </div>
        <div className="space-y-3 pb-[env(safe-area-inset-bottom)]">
          {isPending ? (
            <div className="h-12 w-full animate-pulse rounded-[12px] bg-bg-subtle" />
          ) : (
            <>
              <SignedIn>
                <Link to="/studio">
                  <Button className="w-full" size="lg">
                    Continue to studio
                  </Button>
                </Link>
              </SignedIn>
              <SignedOut>
                <Link to="/login">
                  <Button className="w-full" size="lg">
                    Enter the studio
                  </Button>
                </Link>
              </SignedOut>
            </>
          )}
          <SignInGate fallback={null}>
            <p className="text-center text-xs text-faint">Signed in</p>
          </SignInGate>
        </div>
      </div>
    </main>
  );
}
