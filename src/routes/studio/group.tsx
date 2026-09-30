import { useState, type ReactNode } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronRight, KeyRound, Plus, Sparkles } from "lucide-react";
import { useStudioWorkspace } from "@/hooks/workspace-context";
import { createGroup, joinGroup } from "@/lib/server/mutations";
import { bootstrapDemoCohort } from "@/lib/server/bootstrap";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Card } from "@/components/ui/badge";
import { FormMessages } from "@/components/ui/feedback";
import { StepHeader } from "@/components/shell/StepHeader";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/studio/group")({ component: GroupPage });

type Choice = "join" | "create" | "demo";

function GroupPage() {
  const { data, refresh } = useStudioWorkspace();
  const navigate = useNavigate();
  const [choice, setChoice] = useState<Choice | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Choice | null>(null);

  async function run(kind: Choice, fn: () => Promise<unknown>) {
    setPending(kind);
    setError(null);
    try {
      await fn();
      await refresh();
      await navigate({ to: "/studio" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not work. Check your connection and try again.");
    } finally {
      setPending(null);
    }
  }

  if (data?.group) {
    const active = data.members.filter((m) => m.membershipStatus === "active").length;
    return (
      <div>
        <StepHeader step="group" title={data.group.groupName} lead="You are in. Share the code so the rest of your group can join." />
        <Card className="space-y-2">
          <p className="text-sm text-muted">Group {data.group.groupNumber} · join code</p>
          <p className="font-mono text-3xl font-medium tracking-wider">{data.group.joinCode}</p>
          <p className="text-sm text-muted">
            {active} of {data.group.capacity} places taken. Whoever created the group is not automatically its leader.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <StepHeader
        step="group"
        title="Find your group"
        lead="You will work in a group of up to ten. Pick one."
      />
      <div className="space-y-3">
        <Option
          icon={<KeyRound className="size-5" aria-hidden />}
          tint="bg-gold"
          title="I have a code"
          sub="Someone in your group shared it"
          open={choice === "join"}
          onOpen={() => setChoice(choice === "join" ? null : "join")}
        >
          <Field label="Join code">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="K7M2QX"
              autoCapitalize="characters"
              className="font-mono text-lg tracking-widest uppercase"
            />
          </Field>
          <Button
            size="lg"
            className="w-full"
            disabled={Boolean(pending) || code.trim().length < 4}
            onClick={() => void run("join", () => joinGroup({ data: { joinCode: code } }))}
          >
            {pending === "join" ? "Joining…" : "Join group"}
          </Button>
        </Option>

        <Option
          icon={<Plus className="size-5" aria-hidden />}
          tint="bg-pink"
          title="Start a new group"
          sub="You’ll get a code to share"
          open={choice === "create"}
          onOpen={() => setChoice(choice === "create" ? null : "create")}
        >
          <Field label="Group name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Casford Hall investigators" />
          </Field>
          <Button
            size="lg"
            className="w-full"
            disabled={Boolean(pending) || name.trim().length === 0}
            onClick={() => void run("create", () => createGroup({ data: { groupName: name } }))}
          >
            {pending === "create" ? "Creating…" : "Create group"}
          </Button>
        </Option>

        <Option
          icon={<Sparkles className="size-5" aria-hidden />}
          tint="bg-accent text-white"
          title="Try a practice group"
          sub="Nine practice classmates, so you can walk the whole journey alone"
          open={choice === "demo"}
          onOpen={() => setChoice(choice === "demo" ? null : "demo")}
        >
          <p className="text-sm leading-6 text-muted">
            The practice classmates have already written up problems from around campus. You only see them after you
            submit your own.
          </p>
          <Button
            size="lg"
            className="w-full"
            disabled={Boolean(pending)}
            onClick={() => void run("demo", () => bootstrapDemoCohort())}
          >
            {pending === "demo" ? "Setting it up…" : "Start practice group"}
          </Button>
        </Option>
      </div>
      <div className="mt-4">
        <FormMessages error={error} />
      </div>
    </div>
  );
}

function Option({
  icon,
  tint,
  title,
  sub,
  open,
  onOpen,
  children,
}: {
  icon: ReactNode;
  tint: string;
  title: string;
  sub: string;
  open: boolean;
  onOpen: () => void;
  children: ReactNode;
}) {
  return (
    <div className={cn("rounded-[20px] border bg-bg-elevated transition-colors", open ? "border-ink" : "border-line")}>
      <button
        type="button"
        onClick={onOpen}
        aria-expanded={open}
        className="flex w-full items-center gap-3.5 p-4 text-left"
      >
        <span className={cn("sticker flex size-11 shrink-0 items-center justify-center rounded-full", tint)}>{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-lg leading-tight font-bold">{title}</span>
          <span className="block text-sm text-muted">{sub}</span>
        </span>
        <ChevronRight className={cn("size-5 shrink-0 text-faint transition-transform", open && "rotate-90")} aria-hidden />
      </button>
      {open ? <div className="flow-enter space-y-3 px-4 pb-4">{children}</div> : null}
    </div>
  );
}
