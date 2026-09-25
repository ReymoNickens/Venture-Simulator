import { useEffect, useRef } from "react";
import { Lock } from "lucide-react";
import { timeAgo } from "@/lib/domain/activity";
import { cn } from "@/lib/utils";

export interface ThreadMessage {
  id: string;
  body: string;
  createdAt: string;
  authorKind: "staff" | "student";
  authorName: string;
  recipientStudentId: string | null;
  recipientName?: string | null;
  mine?: boolean;
}

/** A conversation laid out like a chat — staff on one side, students on the other. */
export function Thread({ messages, viewer }: { messages: ThreadMessage[]; viewer: "staff" | "student" }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);
  if (!messages.length) {
    return <p className="py-6 text-center text-sm text-muted">No messages yet.</p>;
  }
  return (
    <div className="max-h-[55dvh] space-y-3 overflow-y-auto py-2">
      {messages.map((m) => {
        const ownSide = viewer === "staff" ? m.authorKind === "staff" : Boolean(m.mine);
        return (
          <div key={m.id} className={cn("flex", ownSide ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[85%] rounded-[22px] border-2 px-3 py-2 text-sm leading-6",
                m.authorKind === "staff" ? "border-indigo bg-indigo-soft" : ownSide ? "border-ink bg-gold-soft" : "border-line-strong bg-bg-elevated",
                ownSide ? "rounded-br-[3px]" : "rounded-bl-[3px]",
              )}
            >
              <p className="mb-0.5 flex items-center gap-1 text-[11px] font-semibold text-muted">
                {m.recipientStudentId ? <Lock className="size-3" aria-label="private" /> : null}
                {m.authorName}
                {m.recipientStudentId && viewer === "staff" && m.recipientName ? ` → ${m.recipientName} only` : ""}
                <span className="font-normal">· {timeAgo(m.createdAt)}</span>
              </p>
              <p className="whitespace-pre-line">{m.body}</p>
            </div>
          </div>
        );
      })}
      <div ref={end} />
    </div>
  );
}
