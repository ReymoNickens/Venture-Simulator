import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { joinGroup } from "@/lib/server/mutations";
import { getWorkspace } from "@/lib/server/workspace";
import { previewInvite, type InvitePreview } from "@/lib/server/invites";
import { forgetInvite, rememberInvite } from "@/lib/invite/pending";
import type { WorkspaceSnapshot } from "@/lib/domain/types";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card } from "@/components/ui/badge";
import { FormMessages, Loading } from "@/components/ui/feedback";
import { LogoMark } from "@/components/ui/sticker";

export const Route = createFileRoute("/join/$code")({ component: JoinPage });

const message = (err: unknown) => (err instanceof Error ? err.message : "Something went wrong. Try again.");

/**
 * Where a group leader's invite link lands. Shows which group it is, then:
 * signed out → sign in (the code is remembered); no details yet → the
 * details form, which joins afterwards; ready → one tap to join.
 */
function JoinPage() {
  const { code } = Route.useParams();
  const { user, isPending } = useCurrentUserState();
  const navigate = useNavigate();
  const [invite, setInvite] = useState<InvitePreview | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    previewInvite({ data: { code } }).then(setInvite, (err) => setError(message(err)));
  }, [code]);

  const userId = user?.id;
  useEffect(() => {
    if (userId) void getWorkspace().then(setWorkspace, () => setWorkspace(null));
  }, [userId]);

  async function join() {
    if (!invite) return;
    setJoining(true);
    setError(null);
    try {
      await joinGroup({ data: { joinCode: invite.code } });
      forgetInvite();
      await navigate({ to: "/studio" });
    } catch (err) {
      setError(message(err));
      setJoining(false);
    }
  }

  return (
    <main className="min-h-dvh text-ink">
      <div className="mx-auto max-w-md px-5 py-10">
        <LogoMark full />
        {!invite && !error ? (
          <Loading />
        ) : !invite ? (
          <div className="mt-8 space-y-4">
            <h1 className="font-display text-3xl font-extrabold">This link doesn’t work</h1>
            <FormMessages error={error} />
          </div>
        ) : (
          <>
            <p className="mt-8 text-sm font-semibold text-muted">You’re invited to join</p>
            <h1 className="font-display text-4xl font-extrabold">{invite.groupName}</h1>
            <p className="mt-2 text-[15px] leading-6 text-ink-soft">
              Group {invite.groupNumber} in {invite.classLabel}
              {invite.leaderName ? `, led by ${invite.leaderName}` : ""}. {invite.members} of {invite.capacity} places
              taken.
            </p>

            <Card className="mt-6 space-y-3">
              {!invite.open ? (
                <p className="text-[15px] leading-6">
                  This group is closed to new members. Ask your group leader, or start a group of your own.
                </p>
              ) : isPending || (user && !workspace) ? (
                <Loading />
              ) : !user ? (
                <>
                  <p className="text-[15px] leading-6">
                    Sign in with your phone number to join. After that you’ll fill in your details once.
                  </p>
                  <Link
                    to="/login"
                    onClick={() => rememberInvite(invite.code)}
                    className={buttonVariants({ size: "lg", className: "w-full" })}
                  >
                    Sign in to join
                  </Link>
                </>
              ) : workspace?.isLecturer ? (
                <p className="text-[15px] leading-6">You’re signed in as a lecturer. Group links are for students.</p>
              ) : !workspace?.student ? (
                <>
                  <p className="text-[15px] leading-6">Fill in your details, and you’ll be added to this group.</p>
                  <Button
                    size="lg"
                    className="w-full"
                    onClick={() => {
                      rememberInvite(invite.code);
                      void navigate({ to: "/onboarding" });
                    }}
                  >
                    Fill in my details
                  </Button>
                </>
              ) : workspace.group ? (
                <>
                  <p className="text-[15px] leading-6">
                    You’re already in <strong>{workspace.group.groupName}</strong>. Each person can only be in one group.
                  </p>
                  <Link to="/studio" className={buttonVariants({ variant: "secondary", className: "w-full" })}>
                    Go to my group
                  </Link>
                </>
              ) : (
                <Button size="lg" className="w-full" disabled={joining} onClick={() => void join()}>
                  {joining ? "Joining…" : `Join ${invite.groupName}`}
                </Button>
              )}
              <FormMessages error={error} />
            </Card>
          </>
        )}
      </div>
    </main>
  );
}
