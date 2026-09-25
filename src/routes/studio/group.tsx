import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Copy, LogOut, Share2 } from "lucide-react";
import { useStudioWorkspace } from "@/hooks/workspace-context";
import { useAction } from "@/hooks/use-action";
import { createGroup, joinGroup } from "@/lib/server/mutations";
import { leaveGroup } from "@/lib/server/governance";
import { bootstrapDemoCohort } from "@/lib/server/bootstrap";
import { StageHeader } from "@/components/stage/StageHeader";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Card, Eyebrow } from "@/components/ui/badge";
import { Stamp } from "@/components/ui/stamp";
import { FormMessages, Loading } from "@/components/ui/feedback";
import { STAGE_BY_ID } from "@/lib/domain/stages";
import { Emblem } from "@/components/ui/emblem";

export const Route = createFileRoute("/studio/group")({ component: GroupPage });

function GroupPage() {
  const { data, loading, refresh } = useStudioWorkspace();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [leaving, setLeaving] = useState(false);
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
            <div className="rounded-[10px] border-2 border-dashed border-ink px-4 py-2 text-center">
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

        <Card className="space-y-3">
          <h2 className="font-display text-lg font-bold">Leaving the group</h2>
          {!leaving ? (
            <>
              <p className="text-sm text-muted">
                If you are dropping the course or moving groups, leave properly so your team is not
                left waiting on you. Your past work stays on the record.
              </p>
              <Button variant="secondary" size="sm" onClick={() => setLeaving(true)}>
                <LogOut className="size-4" aria-hidden /> Leave this group
              </Button>
            </>
          ) : (
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
      </div>
    );
  }

  const def = STAGE_BY_ID.team;
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-4">
        <span className="flex size-16 shrink-0 items-center justify-center rounded-[12px] border-2 border-ink bg-gold-soft shadow-[3px_3px_0_0_var(--color-ink)]">
          <Emblem emblem={def.emblem} className="size-10" />
        </span>
        <div>
          <Eyebrow>Stop 01 of 11</Eyebrow>
          <h1 className="font-display text-3xl font-extrabold">{def.title}</h1>
          <p className="mt-1 text-sm leading-6 text-muted">{def.mission}</p>
        </div>
      </div>
      <FormMessages error={error} />
      <Card className="space-y-3">
        <h2 className="font-display text-xl font-bold">Join with a code</h2>
        <p className="text-sm text-muted">Someone in your group has a six-letter code. Ask them to share it.</p>
        <Field label="Group code">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="K7M2QX"
            autoCapitalize="characters"
            className="font-mono text-lg tracking-[0.2em] uppercase"
          />
        </Field>
        <Button
          disabled={Boolean(pending) || code.trim().length < 4}
          onClick={() => void go("join", () => joinGroup({ data: { joinCode: code } }))}
        >
          {pending === "join" ? "Joining…" : "Join group"}
        </Button>
      </Card>
      <Card className="space-y-3">
        <h2 className="font-display text-xl font-bold">Start a new group</h2>
        <Field label="Group name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Oguaa Road Crew" />
        </Field>
        <Button
          variant="secondary"
          disabled={Boolean(pending) || !name.trim()}
          onClick={() => void go("create", () => createGroup({ data: { groupName: name } }))}
        >
          {pending === "create" ? "Creating…" : "Create group"}
        </Button>
      </Card>
      <Card className="space-y-3 border-dashed">
        <div className="flex items-center gap-2">
          <Stamp tone="indigo" size="xs">Practice</Stamp>
          <h2 className="font-display text-lg font-bold">Try it with a demonstration group</h2>
        </div>
        <p className="text-sm leading-6 text-muted">
          Walk the whole route alone. Nine demonstration classmates have already submitted real-world
          problems from campus, hostels and markets — hidden until you submit yours.
        </p>
        <Button
          variant="ghost"
          disabled={Boolean(pending)}
          onClick={() => void go("demo", () => bootstrapDemoCohort())}
          className="border-2 border-line-strong"
        >
          {pending === "demo" ? "Preparing…" : "Enter demonstration group"}
        </Button>
      </Card>
    </div>
  );
}
