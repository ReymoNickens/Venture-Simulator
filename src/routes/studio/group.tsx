import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useStudioWorkspace } from "@/hooks/workspace-context";
import { createGroup, joinGroup } from "@/lib/server/mutations";
import { bootstrapDemoCohort } from "@/lib/server/bootstrap";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Card } from "@/components/ui/badge";

export const Route = createFileRoute("/studio/group")({ component: GroupPage });

function GroupPage() {
  const { data, refresh } = useStudioWorkspace();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  async function run(kind: string, fn: () => Promise<unknown>) {
    setPending(kind);
    setError(null);
    try {
      await fn();
      await refresh();
      await navigate({ to: "/studio" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not work.");
    } finally {
      setPending(null);
    }
  }

  if (data?.group) {
    return (
      <Card className="space-y-3">
        <h1 className="font-display text-2xl">{data.group.groupName}</h1>
        <p className="text-sm text-muted">
          Group {data.group.groupNumber} · Join code{" "}
          <span className="font-mono text-ink">{data.group.joinCode}</span>
        </p>
        <p className="text-sm text-muted">
          {data.members.filter((m) => m.membershipStatus === "active").length} / {data.group.capacity} members.
          The creator is not automatically the academic leader.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-3xl">A group, not a company</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          Default capacity is 10 and is set by the course offering, not hardcoded in the screens.
          Duplicate membership is rejected. Full groups are rejected.
        </p>
      </div>
      <Card className="space-y-3">
        <h2 className="font-display text-xl">Create a group</h2>
        <Field label="Group name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Hall B investigators" />
        </Field>
        <Button
          disabled={Boolean(pending)}
          onClick={() => void run("create", () => createGroup({ data: { groupName: name } }))}
        >
          {pending === "create" ? "Creating…" : "Create group"}
        </Button>
      </Card>
      <Card className="space-y-3">
        <h2 className="font-display text-xl">Join with a code</h2>
        <Field label="Join code">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="K7M2QX"
            className="font-mono uppercase"
          />
        </Field>
        <Button
          variant="secondary"
          disabled={Boolean(pending)}
          onClick={() => void run("join", () => joinGroup({ data: { joinCode: code } }))}
        >
          {pending === "join" ? "Joining…" : "Join group"}
        </Button>
      </Card>
      <Card className="space-y-3">
        <h2 className="font-display text-xl">Demonstration cohort</h2>
        <p className="text-sm leading-6 text-muted">
          Walk the full journey without ten real accounts. Nine demonstration peers will already have
          submitted grounded campus opportunities. Their work stays hidden from you until you submit yours.
        </p>
        <Button
          variant="secondary"
          disabled={Boolean(pending)}
          onClick={() => void run("demo", () => bootstrapDemoCohort())}
        >
          {pending === "demo" ? "Preparing…" : "Enter demonstration cohort"}
        </Button>
      </Card>
      {error ? <p className="text-sm text-bad">{error}</p> : null}
    </div>
  );
}
