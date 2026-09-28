import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronRight, Copy, LogOut, Share2 } from "lucide-react";
import { useStudioWorkspace } from "@/hooks/workspace-context";
import { useAction } from "@/hooks/use-action";
import { createGroup, joinGroup } from "@/lib/server/mutations";
import { leaveGroup } from "@/lib/server/governance";
import { bootstrapDemoCohort } from "@/lib/server/bootstrap";
import { StageHeader } from "@/components/stage/StageHeader";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Card, Eyebrow } from "@/components/ui/badge";
import { FormMessages, Loading } from "@/components/ui/feedback";
import { StopSticker } from "@/components/ui/sticker";

export const Route = createFileRoute("/studio/group")({ component: GroupPage });

function GroupPage() {
  const { data, loading, refresh } = useStudioWorkspace();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [leaving, setLeaving] = useState(false);
  const [path, setPath] = useState<"join" | "create" | null>(null);
  const [reason, setReason] = useState("");
  const { pending, error, notice, run, setNotice } = useAction();

  async function go(kind: string, fn: () => Promise<unknown>) {
    const ok = await run(kind, async () => {
      await fn();
      return true;
    });
    if (ok) {
      await refresh();
      await navigate({ to: "/studio" });
    }
  }

  if (loading || !data) return <Loading />;

  if (data.group) {
    const g = data.group;
    const active = data.members.filter((m) => m.membershipStatus === "active");
    const gone = data.members.filter((m) => m.membershipStatus !== "active");
    const invite = `Join our venture group "${g.groupName}" in ${data.appName}. Group code: ${g.joinCode}`;
    return (
      <div className="space-y-5">
        <StageHeader stage="team" data={data} />
        <Card className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <Eyebrow>Group {g.groupNumber}</Eyebrow>
              <h2 className="font-display text-2xl font-extrabold">{g.groupName}</h2>
              <p className="text-sm text-muted">
                {active.length} of {g.capacity} places taken. The person who created the group is not
                automatically its leader.
              </p>
            </div>
            <div className="rounded-[18px] border-2 border-dashed border-ink px-4 py-2 text-center">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">Join code</p>
              <p className="font-mono text-2xl font-semibold tracking-[0.18em]">{g.joinCode}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href={`https://wa.me/?text=${encodeURIComponent(invite)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-[7px] border-2 border-ink bg-[#25D366]/15 px-3 text-sm font-semibold"
            >
              <Share2 className="size-4" aria-hidden /> Share on WhatsApp
            </a>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                void navigator.clipboard?.writeText(g.joinCode).then(() => setNotice("Code copied."));
              }}
            >
              <Copy className="size-4" aria-hidden /> Copy code
            </Button>
          </div>
          <FormMessages error={null} notice={notice} />
          <ul className="divide-y divide-line border-t border-line">
            {active.map((m) => (
              <li key={m.id} className="flex items-center justify-between py-2 text-sm">
                <span>
                  {m.fullName}
                  {m.studentId === data.student?.id ? <span className="text-faint"> (you)</span> : null}
                  {m.isSynthetic ? <span className="ml-1.5 text-xs text-faint">demo peer</span> : null}
                </span>
                {m.studentId === g.createdByStudentId ? (
                  <span className="text-xs text-muted">set up the group</span>
                ) : null}
              </li>
            ))}
          </ul>
          {gone.length ? (
            <div className="border-t border-line pt-3">
              <p className="text-xs font-semibold text-muted">No longer active</p>
              <ul className="mt-1 space-y-1 text-sm text-muted">
                {gone.map((m) => (
                  <li key={m.id}>
                    {m.fullName} — {m.membershipStatus === "left" ? "left" : "marked inactive by lecturer"}
                    {m.statusReason ? `: ${m.statusReason}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>

        {!leaving ? (
          <button type="button" onClick={() => setLeaving(true)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted">
            <LogOut className="size-4" aria-hidden /> Leaving this group?
          </button>
        ) : (
        <Card className="space-y-3">
          <h2 className="font-display text-lg font-bold">Leave the group</h2>
          <p className="text-sm text-muted">Your team won’t be kept waiting on you. Your past work stays on the record.</p>
          {(
            <>
              <Field label="Why are you leaving? (your group and lecturer will see this)">
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
              </Field>
              <FormMessages error={error} />
              <div className="flex gap-2">
                <Button
                  variant="danger"
                  size="sm"
                  disabled={Boolean(pending)}
                  onClick={() => void go("leave", () => leaveGroup({ data: { reason } }))}
                >
                  {pending === "leave" ? "Leaving…" : "Yes, leave the group"}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setLeaving(false)}>
                  Stay
                </Button>
              </div>
            </>
          )}
        </Card>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="pt-2">
        <StopSticker stage="team" size="lg" />
        <h1 className="mt-4 font-display text-[34px] leading-[1.05] font-extrabold">Find your crew</h1>
        <p className="mt-2 text-[16px] leading-7 text-ink-soft">Join your group with a code, or start one.</p>
      </div>
      <FormMessages error={error} />
      <Choice2
        open={path === "join"}
        onOpen={() => setPath(path === "join" ? null : "join")}
        title="I have a code"
        sub="Someone in your group shared it"
      >
        <Input
          aria-label="Group code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="K7M2QX"
          autoCapitalize="characters"
          className="h-14 text-center font-mono text-2xl tracking-[0.3em] uppercase"
        />
        <Button
          className="w-full"
          size="lg"
          disabled={Boolean(pending) || code.trim().length < 4}
          onClick={() => void go("join", () => joinGroup({ data: { joinCode: code } }))}
        >
          {pending === "join" ? "Joining…" : "Join group"}
        </Button>
      </Choice2>
      <Choice2
        open={path === "create"}
        onOpen={() => setPath(path === "create" ? null : "create")}
        title="Start a new group"
        sub="You’ll get a code to share"
      >
        <Input aria-label="Group name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Group name, e.g. Oguaa Road Crew" className="h-12" />
        <Button
          className="w-full"
          size="lg"
          disabled={Boolean(pending) || !name.trim()}
          onClick={() => void go("create", () => createGroup({ data: { groupName: name } }))}
        >
          {pending === "create" ? "Creating…" : "Create group"}
        </Button>
      </Choice2>
      <p className="pt-2 text-center text-sm text-muted">
        Just exploring?{" "}
        <button
          type="button"
          disabled={Boolean(pending)}
          onClick={() => void go("demo", () => bootstrapDemoCohort())}
          className="font-semibold text-accent underline underline-offset-4"
        >
          {pending === "demo" ? "Preparing…" : "Try a practice group"}
        </button>
      </p>
    </div>
  );
}

function Choice2({
  open,
  onOpen,
  title,
  sub,
  children,
}: {
  open: boolean;
  onOpen: () => void;
  title: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <section className={open ? "rounded-[24px] bg-bg-elevated p-2 ring-2 ring-ink" : "rounded-[24px] bg-bg-elevated p-2 ring-1 ring-line"}>
      <button type="button" onClick={onOpen} aria-expanded={open} className="flex w-full items-center justify-between px-3 py-3 text-left">
        <span>
          <span className="block font-display text-xl font-bold">{title}</span>
          <span className="block text-sm text-muted">{sub}</span>
        </span>
        <ChevronRight className={open ? "size-5 rotate-90 transition-transform" : "size-5 transition-transform"} aria-hidden />
      </button>
      {open ? <div className="rise space-y-3 px-3 pt-1 pb-3">{children}</div> : null}
    </section>
  );
}
