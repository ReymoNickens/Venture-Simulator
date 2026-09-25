import { useState } from "react";
import { Send, X } from "lucide-react";
import { sendStaffMessage, sendStaffMessageBulk } from "@/lib/server/messages";
import { useAction } from "@/hooks/use-action";
import { Button } from "@/components/ui/button";
import { FormMessages } from "@/components/ui/feedback";

const STARTERS = [
  "How is it going? What is blocking you this week?",
  "Great progress — keep going.",
  "I haven’t seen field work from your group this week. What is your plan?",
  "Come to my office hours this week and bring your evidence.",
];

/** A message composer that opens over the queue — say something in ten seconds. */
export function QuickMessage({
  target,
  onClose,
  onSent,
}: {
  target: { kind: "one"; groupId: string; label: string } | { kind: "many"; offeringId: string; groupIds: string[]; label: string };
  onClose: () => void;
  onSent: () => void;
}) {
  const [body, setBody] = useState("");
  const { pending, error, notice, run } = useAction();
  return (
    <div role="dialog" aria-modal aria-label="Send a message" className="fixed inset-0 z-50 flex items-end justify-center bg-ink/60 p-3 sm:items-center">
      <div className="rise w-full max-w-lg rounded-[14px] ring-1 ring-line bg-bg-elevated p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs font-semibold text-muted">Message</p>
            <p className="font-display text-lg font-extrabold">{target.label}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1.5 hover:bg-bg-subtle">
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {STARTERS.map((s) => (
            <button key={s} type="button" onClick={() => setBody(s)} className="rounded-full border border-line-strong px-2.5 py-1 text-left text-xs hover:border-ink">
              {s}
            </button>
          ))}
        </div>
        <textarea
          aria-label="Message"
          autoFocus
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          className="mt-3 w-full rounded-[18px] border-2 border-line-strong/70 bg-bg px-3 py-2.5 text-[15px] focus-visible:border-accent focus-visible:outline-none"
        />
        <p className="mt-1 text-xs text-muted">Students see it on their Today screen and in their message bell.</p>
        <FormMessages error={error} notice={notice} />
        <div className="mt-3 flex gap-2">
          <Button
            disabled={Boolean(pending) || !body.trim()}
            onClick={() =>
              void run(
                "send",
                async () => {
                  if (target.kind === "one") await sendStaffMessage({ data: { groupId: target.groupId, body } });
                  else await sendStaffMessageBulk({ data: { offeringId: target.offeringId, groupIds: target.groupIds, body } });
                  onSent();
                  onClose();
                },
              )
            }
          >
            <Send className="size-4" aria-hidden /> {pending ? "Sending…" : "Send"}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
