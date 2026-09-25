import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Lock, Send } from "lucide-react";
import { useStudioWorkspace } from "@/hooks/workspace-context";
import { useAction } from "@/hooks/use-action";
import { markMessagesRead, sendMessage } from "@/lib/server/messages";
import { Thread } from "@/components/messages/Thread";
import { Eyebrow, EmptyNote } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormMessages, Loading } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/studio/messages")({ component: MessagesPage });

function MessagesPage() {
  const { data, loading, refresh } = useStudioWorkspace();
  const [body, setBody] = useState("");
  const [privately, setPrivately] = useState(false);
  const { pending, error, run } = useAction();
  const unread = data?.life.unreadMessages ?? 0;

  useEffect(() => {
    if (unread > 0) void markMessagesRead().then(() => refresh());
  }, [unread, refresh]);

  if (loading || !data) return <Loading />;
  if (!data.group) return <EmptyNote>Messages open once you are in a group.</EmptyNote>;
  const me = data.student?.id;
  const messages = data.life.messages.map((m) => ({ ...m, mine: m.authorStudentId === me }));

  return (
    <div className="space-y-4">
      <div>
        <Eyebrow>{data.group.groupName}</Eyebrow>
        <h1 className="mt-1 font-display text-3xl font-extrabold">Messages</h1>
        <p className="mt-1 text-sm text-muted">Your group and your lecturers, in one thread.</p>
      </div>
      <section className="rounded-[22px] ring-1 ring-line bg-bg px-3">
        <Thread messages={messages} viewer="student" />
      </section>
      <div className="space-y-2">
        <textarea
          aria-label="Message"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={privately ? "Only your lecturers will see this…" : "Write to your group and lecturers…"}
          rows={3}
          className="w-full rounded-[18px] border-2 border-line-strong/70 bg-bg-elevated px-3 py-2.5 text-[15px] focus-visible:border-accent focus-visible:outline-none"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            aria-pressed={privately}
            onClick={() => setPrivately((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1 text-xs font-semibold",
              privately ? "border-indigo bg-indigo-soft text-indigo" : "border-line-strong text-muted",
            )}
          >
            <Lock className="size-3" aria-hidden /> {privately ? "Only to lecturers" : "Whole group can see"}
          </button>
          <Button
            disabled={Boolean(pending) || !body.trim()}
            onClick={() =>
              void run("send", async () => {
                await sendMessage({ data: { body, privateToStaff: privately } });
                setBody("");
                await refresh();
              })
            }
          >
            <Send className="size-4" aria-hidden /> {pending ? "Sending…" : "Send"}
          </Button>
        </div>
        <FormMessages error={error} />
      </div>
    </div>
  );
}
