import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Copy, Share2, Sparkles, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { useStudioWorkspace } from "@/hooks/workspace-context";
import { createGroup, joinGroup } from "@/lib/server/mutations";
import { bootstrapDemoCohort } from "@/lib/server/bootstrap";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Badge, Card, SectionTitle } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Bar } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/empty";
import { whatsappInvite } from "@/lib/domain/story";

export const Route = createFileRoute("/studio/group")({
  component: GroupPage,
  validateSearch: (s: Record<string, unknown>): { code?: string } =>
    typeof s.code === "string" ? { code: s.code.toUpperCase().slice(0, 12) } : {},
});

function GroupPage() {
  const { data, loading, refresh } = useStudioWorkspace();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [code, setCode] = useState(search.code ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  async function run(kind: string, fn: () => Promise<unknown>, done: string) {
    setPending(kind);
    setError(null);
    try {
      await fn();
      await refresh();
      toast.success(done);
      await navigate({ to: "/studio" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not work.");
    } finally {
      setPending(null);
    }
  }

  if (loading || !data) return <Skeleton className="h-64" />;
  if (data.group) return <TeamView />;

  return (
    <div className="space-y-5">
      <div className="animate-rise">
        <Badge tone="clay">Chapter 1 · Team</Badge>
        <h1 className="mt-2 font-display text-[2rem] leading-tight">Find your team</h1>
        <p className="mt-2 max-w-[52ch] text-[15px] leading-6 text-muted">
          Ventures here are built by groups of up to {data.offering?.defaultGroupSize ?? 10}. Everyone brings one problem they have seen; the group picks one to build.
        </p>
      </div>

      <Card className="animate-rise space-y-3 border-ch-team/40">
        <SectionTitle kicker="Got a code?" title="Join your group" />
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void run("join", () => joinGroup({ data: { joinCode: code.trim() } }), "You're in. Welcome to the team.");
          }}
        >
          <Field label="Join code" hint="Six letters and numbers, from your lecturer or a classmate's WhatsApp message.">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="K7M2QX"
              autoCapitalize="characters"
              autoComplete="off"
              className="text-center font-mono text-xl tracking-[0.35em] uppercase"
              maxLength={12}
            />
          </Field>
          <Button type="submit" block size="lg" disabled={Boolean(pending) || code.trim().length < 4}>
            <UserPlus className="size-4" /> {pending === "join" ? "Joining…" : "Join group"}
          </Button>
        </form>
      </Card>

      <Card className="animate-rise space-y-3">
        <SectionTitle kicker="First one here?" title="Start a group" />
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void run("create", () => createGroup({ data: { groupName: name.trim() } }), "Group created. Now invite your classmates.");
          }}
        >
          <Field label="Group name" hint="Anything your team will recognise. You get a code to share on WhatsApp.">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Legon Hall problem-hunters" maxLength={80} />
          </Field>
          <Button type="submit" variant="secondary" block disabled={Boolean(pending) || name.trim().length < 2}>
            <Users className="size-4" /> {pending === "create" ? "Creating…" : "Create group"}
          </Button>
        </form>
      </Card>

      <Card className="animate-rise overflow-hidden border-0 bg-night p-0 text-accent-fg">
        <div className="kente h-1.5" />
        <div className="space-y-3 p-5">
          <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-sun">
            <Sparkles className="size-3.5" /> Practice mode
          </p>
          <h2 className="font-display text-xl text-accent-fg">Try the whole journey with a practice team</h2>
          <p className="text-sm leading-6 text-accent-fg/75">
            Nine practice classmates have already sealed campus problems. Theirs stay hidden until you seal yours — just like the real thing. Clearly labelled, never counted as real work.
          </p>
          <Button variant="sun" disabled={Boolean(pending)} onClick={() => void run("demo", () => bootstrapDemoCohort(), "Practice team ready.")}>
            {pending === "demo" ? "Preparing…" : "Join a practice team"}
          </Button>
        </div>
      </Card>

      {error ? <p role="alert" className="rounded-[12px] bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p> : null}
    </div>
  );
}

function TeamView() {
  const { data } = useStudioWorkspace();
  const g = data!.group!;
  const active = data!.members.filter((m) => m.membershipStatus === "active");
  const open = ["forming", "opportunity_collection"].includes(g.status);
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const link = `${origin}/studio/group?code=${g.joinCode}`;

  return (
    <div className="space-y-5">
      <div className="animate-rise">
        <Badge tone="clay">Group {g.groupNumber}</Badge>
        <h1 className="mt-2 font-display text-[2rem] leading-tight">{g.groupName}</h1>
        <p className="mt-1 text-sm text-muted">
          {active.length} of {g.capacity} members{active.some((m) => m.isSynthetic) ? " · includes practice classmates" : ""}
        </p>
        <Bar value={active.length} max={g.capacity} className="mt-3" color="var(--color-ch-team)" />
      </div>

      {open ? (
        <Card className="animate-rise space-y-4">
          <SectionTitle kicker="Invite" title="Bring your classmates in" />
          <div className="rounded-[16px] bg-bg-subtle p-4 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Join code</p>
            <p className="mt-1 font-mono text-3xl font-bold tracking-[0.3em]">{g.joinCode}</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <a href={whatsappInvite(g.groupName, g.joinCode, origin)} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "primary", block: true })}>
              <Share2 className="size-4" /> Share on WhatsApp
            </a>
            <Button
              variant="secondary"
              block
              onClick={() => {
                void navigator.clipboard?.writeText(link).then(
                  () => toast.success("Link copied"),
                  () => toast.error("Couldn't copy — share the code instead"),
                );
              }}
            >
              <Copy className="size-4" /> Copy link
            </Button>
          </div>
          <p className="text-xs leading-5 text-muted">
            New members can join until comparison opens. After that the group is fixed, so nobody joins just to vote.
          </p>
        </Card>
      ) : (
        <Card className="animate-rise text-sm text-muted">The group is fixed now that ideas are being compared.</Card>
      )}

      <Card className="animate-rise">
        <SectionTitle kicker="Members" title="Who's on the team" />
        <ul className="mt-3 divide-y divide-line/70">
          {active.map((m) => {
            const me = m.studentId === data!.student?.id;
            return (
              <li key={m.id} className="flex items-center gap-3 py-3">
                <Avatar name={m.fullName} size={38} ring={me ? "you" : "none"} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">
                    {m.fullName} {me ? <span className="text-muted">(you)</span> : null}
                  </p>
                  <p className="text-xs text-muted">
                    {m.studentId === g.createdByStudentId ? "Started the group · " : ""}
                    {m.isSynthetic ? "Practice classmate" : `Joined ${new Date(m.joinedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`}
                  </p>
                </div>
                {m.hasSubmittedOpportunity ? <Badge tone="accent">Idea sealed</Badge> : <Badge>Writing</Badge>}
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs leading-5 text-muted">Starting the group doesn't make you the leader — every member's idea and vote counts the same.</p>
      </Card>
    </div>
  );
}
