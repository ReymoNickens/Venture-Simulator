import { useState } from "react";
import { Lock } from "lucide-react";
import type { StageId } from "@/lib/domain/stages";
import type { WorkspaceSnapshot } from "@/lib/domain/types";
import { saveReflection } from "@/lib/server/venture-work";
import { useAction } from "@/hooks/use-action";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { FormMessages } from "@/components/ui/feedback";
import { shortDate } from "@/lib/dates";
import { progressFromSnapshot } from "@/lib/domain/stage-input";

/**
 * Private, individual reflection at the end of a stop. Only the student and
 * teaching staff can read it — the group cannot — so it can be honest.
 */
export function Reflect({
  stage,
  data,
  prompt,
  onSaved,
}: {
  stage: StageId;
  data: WorkspaceSnapshot;
  prompt: string;
  onSaved: () => void;
}) {
  const mine = data.life.myReflections.filter((r) => r.stage === stage);
  const [body, setBody] = useState("");
  const { pending, error, notice, run } = useAction();
  const done = progressFromSnapshot(data).find((p) => p.id === stage)?.state === "done";
  // Reflecting on unfinished work is noise — the prompt stays sealed until the
  // stop is done (the final decision stop needs it as part of the work).
  if (!done && stage !== "decide" && !mine.length) {
    return (
      <div className="flex items-center gap-3 rounded-[10px] border-2 border-dashed border-line-strong px-4 py-3 text-sm text-muted">
        <Lock className="size-4 shrink-0" aria-hidden />
        <span>A short private reflection unlocks when this stop is done.</span>
      </div>
    );
  }
  return (
    <section className="notebook rounded-[10px] border-2 border-ink/80 py-4 pr-4 pl-10">
      <p className="flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.16em] text-muted">
        <Lock className="size-3" aria-hidden /> Private reflection
      </p>
      <h2 className="mt-1 font-display text-lg font-bold">{prompt}</h2>
      <p className="mt-1 text-xs leading-5 text-muted">
        Only you and your lecturer can read this. Your group cannot.
      </p>
      {mine.length ? (
        <ul className="mt-3 space-y-2">
          {mine.map((r) => (
            <li key={r.id} className="text-sm leading-7">
              <span className="font-mono text-[11px] text-faint">{shortDate(r.createdAt)} — </span>
              {r.body}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-3 space-y-2">
        <Textarea
          aria-label="Your reflection"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="bg-bg-elevated/80"
          placeholder="What surprised you? What would you do differently?"
        />
        <FormMessages error={error} notice={notice} />
        <Button
          variant="secondary"
          size="sm"
          disabled={Boolean(pending) || body.trim().length < 60}
          onClick={() =>
            void run(
              "save",
              async () => {
                await saveReflection({ data: { stage, body } });
                setBody("");
                onSaved();
              },
              "Reflection saved.",
            )
          }
        >
          {pending ? "Saving…" : body.trim().length < 60 ? `Write a little more (${body.trim().length}/60)` : "Save reflection"}
        </Button>
      </div>
    </section>
  );
}
